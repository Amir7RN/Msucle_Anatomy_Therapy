/**
 * poseRig.ts
 *
 * Pure-logic half of the segment-rigged Muscle Twin. The GLB has 52 separate
 * muscle meshes but NO skeleton/skin, so we group meshes into rigid body
 * SEGMENTS and rotate each at its joint from the live pose.
 *
 * Direction convention — ANATOMICAL, not camera/world axes (v2 fix)
 * ─────────────────────────────────────────────────────────────────
 * The first version mapped raw MediaPipe world axes into the model with guessed
 * signs, which flipped left/right and made motions go the wrong way. We now
 * express every segment's bone direction in the USER'S OWN anatomical frame:
 *     x = toward the user's RIGHT, y = up the spine, z = anterior (out the chest)
 * These three are returned per segment. The model then rebuilds the target using
 * the MODEL'S anatomical axes (derived from its geometry), so left stays left,
 * abduction stays abduction, and it all works even if the user is turned or
 * tilted relative to the camera. No magic sign constants.
 *
 * The Three.js wiring lives in components/movement/MuscleTwinModel.tsx.
 */

import type { LandmarkSet } from './landmarks'
import { LM } from './landmarks'
import {
  computeAnatomicalFrame, worldVec, sub, midpoint, normalize, dot, type Vec3,
} from './anatomicalFrame'

export type SegmentId =
  | 'torso' | 'neck' | 'head'
  | 'upperArmL' | 'forearmL' | 'upperArmR' | 'forearmR'
  | 'thighL' | 'shankL' | 'thighR' | 'shankR'

/** UPPERCASE mesh-name substrings that belong to each segment. */
export const SEGMENT_MESHES: Record<SegmentId, string[]> = {
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

/** Parent of each segment (null = attached to root). */
export const SEGMENT_PARENT: Record<SegmentId, SegmentId | null> = {
  torso: null,
  neck: 'torso',  head: 'neck',
  upperArmR: 'torso', forearmR: 'upperArmR',
  upperArmL: 'torso', forearmL: 'upperArmL',
  thighR: 'torso',    shankR: 'thighR',
  thighL: 'torso',    shankL: 'thighL',
}

/** Top-down order so parents resolve before children. */
export const SEGMENT_ORDER: SegmentId[] = [
  'torso', 'neck', 'head',
  'upperArmR', 'forearmR', 'upperArmL', 'forearmL',
  'thighR', 'shankR', 'thighL', 'shankL',
]

export function segmentForMesh(meshName: string): SegmentId | null {
  const u = meshName.toUpperCase()
  for (const seg of SEGMENT_ORDER) {
    for (const frag of SEGMENT_MESHES[seg]) {
      if (u.includes(frag)) return seg
    }
  }
  return null
}

/** Bone direction in the user's anatomical frame: x=right, y=up, z=anterior. */
export type BoneDirs = Partial<Record<SegmentId, Vec3>>

function vis(lms: LandmarkSet, i: number, min = 0.4): boolean {
  return (lms[i]?.visibility ?? 0) >= min
}

/**
 * Live target bone directions, expressed in the user's anatomical frame.
 * Each is proximal→distal (upperArm = shoulder→elbow, forearm = elbow→wrist,
 * thigh = hip→knee, shank = knee→ankle, neck/head = shoulder→nose).
 *
 * Gating: a segment is omitted (model holds its last pose) unless its defining
 * landmarks are visible — in particular the FOREARM requires the wrist, which
 * stops the elbow joint from flailing when the hand leaves frame.
 */
export function poseBoneDirections(lms: LandmarkSet): BoneDirs {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return {}

  // Project a world-space bone vector onto the anatomical axes.
  const project = (a: Vec3 | null, b: Vec3 | null): Vec3 | null => {
    if (!a || !b) return null
    const d = sub(b, a)
    if (d.x === 0 && d.y === 0 && d.z === 0) return null
    const v: Vec3 = { x: dot(d, frame.xAxis), y: dot(d, frame.yAxis), z: dot(d, frame.zAxis) }
    return normalize(v)
  }
  const w = (i: number, min = 0.4) => (vis(lms, i, min) ? worldVec(lms[i]) : null)

  const ls = w(LM.L_SHOULDER), rs = w(LM.R_SHOULDER)
  const midSh = ls && rs ? midpoint(ls, rs) : null
  const nose  = w(LM.NOSE, 0.3)

  const out: BoneDirs = {}
  const set = (seg: SegmentId, d: Vec3 | null) => { if (d) out[seg] = d }

  // Torso is locked upright in the model, so we don't drive it from pose.
  set('neck',  project(midSh, nose))
  set('head',  project(midSh, nose))

  set('upperArmR', project(rs, w(LM.R_ELBOW)))
  set('upperArmL', project(ls, w(LM.L_ELBOW)))
  // Forearm only when the wrist is genuinely visible (avoids flailing).
  set('forearmR',  project(w(LM.R_ELBOW), w(LM.R_WRIST, 0.5)))
  set('forearmL',  project(w(LM.L_ELBOW), w(LM.L_WRIST, 0.5)))

  set('thighR', project(w(LM.R_HIP), w(LM.R_KNEE)))
  set('thighL', project(w(LM.L_HIP), w(LM.L_KNEE)))
  set('shankR', project(w(LM.R_KNEE), w(LM.R_ANKLE)))
  set('shankL', project(w(LM.L_KNEE), w(LM.L_ANKLE)))

  return out
}
