/**
 * poseRig.ts
 *
 * Pure-logic half of the segment-rigged Muscle Twin. The GLB has 52 separate
 * muscle meshes but NO skeleton/skin, so we can't do vertex skinning. Instead
 * we group the meshes into rigid body SEGMENTS and rotate each segment at its
 * joint from the live pose — an articulated (if rigid) avatar built from the
 * existing asset.
 *
 * This module owns:
 *   • SEGMENTS          — which mesh names belong to which body segment
 *   • the rig hierarchy — parent/child + which joint each segment pivots about
 *   • poseBoneDirections() — the live target direction of each segment's bone,
 *                            read from MediaPipe WORLD landmarks
 *
 * The Three.js wiring (reparenting, pivots, per-frame quaternions, colouring)
 * lives in components/movement/MuscleTwinModel.tsx and consumes this.
 */

import type { LandmarkSet } from './landmarks'
import { LM } from './landmarks'
import { worldVec, sub, midpoint, normalize, type Vec3 } from './anatomicalFrame'

export type SegmentId =
  | 'torso' | 'neck' | 'head'
  | 'upperArmL' | 'forearmL' | 'upperArmR' | 'forearmR'
  | 'thighL' | 'shankL' | 'thighR' | 'shankR'

/** UPPERCASE mesh-name substrings that belong to each segment. */
export const SEGMENT_MESHES: Record<SegmentId, string[]> = {
  // Pelvis + trunk move as the root. Glutes attach to the pelvis, so they
  // stay with the trunk (they shouldn't swing with the thigh).
  torso: [
    'PECTORALIS_MAJOR', 'RECTUS_ABDOMINIS', 'EXTERNAL_OBLIQUE', 'SERRATUS_ANTERIOR',
    'TRAPEZIUS', 'LATISSIMUS_DORSI', 'ERECTOR_SPINAE', 'GLUTEUS_MAXIMUS', 'GLUTEUS_MEDIUS',
  ],
  neck:  ['STERNOCLEIDOMASTOID'],
  head:  ['MASSETER', 'TEMPORALIS'],
  upperArmR: ['BICEPS_BRACHII_R', 'TRICEPS_BRACHII_R', 'DELTOID_R', 'BRACHIALIS_R', 'CORACOBRACHIALIS_R', 'INFRASPINATUS_R'],
  forearmR:  ['BRACHIORADIALIS_R'],
  upperArmL: ['BICEPS_BRACHII_L', 'TRICEPS_BRACHII_L', 'DELTOID_L', 'BRACHIALIS_L', 'CORACOBRACHIALIS_L', 'INFRASPINATUS_L'],
  forearmL:  ['BRACHIORADIALIS_L'],
  thighR: ['RECTUS_FEMORIS_R', 'VASTUS_LATERALIS_R', 'VASTUS_MEDIALIS_R', 'BICEPS_FEMORIS_R', 'SARTORIUS_R'],
  shankR: ['GASTROCNEMIUS_R', 'SOLEUS_R', 'TIBIALIS_ANTERIOR_R'],
  thighL: ['RECTUS_FEMORIS_L', 'VASTUS_LATERALIS_L', 'VASTUS_MEDIALIS_L', 'BICEPS_FEMORIS_L', 'SARTORIUS_L'],
  shankL: ['GASTROCNEMIUS_L', 'SOLEUS_L', 'TIBIALIS_ANTERIOR_L'],
}

/** Parent of each segment in the kinematic chain (null = attached to root). */
export const SEGMENT_PARENT: Record<SegmentId, SegmentId | null> = {
  torso: null,
  neck: 'torso',  head: 'neck',
  upperArmR: 'torso', forearmR: 'upperArmR',
  upperArmL: 'torso', forearmL: 'upperArmL',
  thighR: 'torso',    shankR: 'thighR',
  thighL: 'torso',    shankL: 'thighL',
}

/** Top-down order so parents are solved before children each frame. */
export const SEGMENT_ORDER: SegmentId[] = [
  'torso', 'neck', 'head',
  'upperArmR', 'forearmR', 'upperArmL', 'forearmL',
  'thighR', 'shankR', 'thighL', 'shankL',
]

export function segmentForMesh(meshName: string): SegmentId | null {
  const u = meshName.toUpperCase()
  // Most-specific (side-tagged) groups first so e.g. BICEPS_BRACHII_R doesn't
  // accidentally match a generic substring.
  for (const seg of SEGMENT_ORDER) {
    for (const frag of SEGMENT_MESHES[seg]) {
      if (u.includes(frag)) return seg
    }
  }
  return null
}

/** A target bone direction (unit-ish) in MediaPipe world space, +y up. */
export type BoneDirs = Partial<Record<SegmentId, Vec3>>

function vis(lms: LandmarkSet, i: number, min = 0.3): boolean {
  return (lms[i]?.visibility ?? 0) >= min
}

function dir(a: Vec3 | null, b: Vec3 | null): Vec3 | null {
  if (!a || !b) return null
  const d = sub(b, a)
  const v = normalize(d)
  return (v.x === 0 && v.y === 0 && v.z === 0) ? null : v
}

/**
 * Live target direction of each segment's bone, from MediaPipe WORLD landmarks
 * (+y up). Each is the proximal→distal vector of that segment:
 *   upperArm = shoulder→elbow, forearm = elbow→wrist, thigh = hip→knee,
 *   shank = knee→ankle, torso = midHip→midShoulder (spine up),
 *   neck = midShoulder→nose, head = neck→nose.
 * Missing/low-visibility segments are omitted (the model holds their last pose).
 */
export function poseBoneDirections(lms: LandmarkSet): BoneDirs {
  const w = (i: number) => (vis(lms, i) ? worldVec(lms[i]) : null)
  const ls = w(LM.L_SHOULDER), rs = w(LM.R_SHOULDER)
  const lh = w(LM.L_HIP),      rh = w(LM.R_HIP)
  const midSh = ls && rs ? midpoint(ls, rs) : null
  const midHp = lh && rh ? midpoint(lh, rh) : null
  const nose  = w(LM.NOSE)

  const out: BoneDirs = {}
  const set = (seg: SegmentId, d: Vec3 | null) => { if (d) out[seg] = d }

  set('torso', dir(midHp, midSh))
  set('neck',  dir(midSh, nose))
  set('head',  dir(midSh, nose))   // head follows the head vector too (approx)

  set('upperArmR', dir(rs, w(LM.R_ELBOW)))
  set('forearmR',  dir(w(LM.R_ELBOW), w(LM.R_WRIST)))
  set('upperArmL', dir(ls, w(LM.L_ELBOW)))
  set('forearmL',  dir(w(LM.L_ELBOW), w(LM.L_WRIST)))

  set('thighR', dir(rh, w(LM.R_KNEE)))
  set('shankR', dir(w(LM.R_KNEE), w(LM.R_ANKLE)))
  set('thighL', dir(lh, w(LM.L_KNEE)))
  set('shankL', dir(w(LM.L_KNEE), w(LM.L_ANKLE)))

  return out
}
