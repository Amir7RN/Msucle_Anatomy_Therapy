/**
 * poseRig.ts  (v3)
 *
 * Pure-logic half of the segment-rigged Muscle Twin.
 *
 * v3 changes (realism pass)
 * ─────────────────────────
 *   • PELVIS is the fixed root. The TRUNK leans on top of it and the LEGS hang
 *     from it, so leaning/twisting the trunk no longer drags the legs — the
 *     feet stay grounded — and the body never yaw-spins (the trunk lean is
 *     derived from the spine vs gravity, which has no azimuth ambiguity).
 *   • The FOREARM is folded into the upper arm (the GLB's only forearm muscle
 *     is a short brachioradialis sliver that can't hold an elbow joint on its
 *     own), so the arm is one connected segment that can never detach.
 *
 * Direction convention stays ANATOMICAL: each limb's bone direction is the
 * proximal→distal vector expressed in the user's own frame (x=right, y=up,
 * z=anterior). The model rebuilds it in its own anatomical frame, so left=left
 * and the motion is robust to the user being turned to the camera.
 *
 * The trunk entry is special: it carries the desired "up" direction for the
 * trunk (a tilt of the spine), so the same model code path handles it.
 */

import type { LandmarkSet } from './landmarks'
import { LM } from './landmarks'
import {
  computeAnatomicalFrame, worldVec, sub, midpoint, normalize, dot, type Vec3,
} from './anatomicalFrame'

export type SegmentId =
  | 'pelvis' | 'trunk' | 'neck' | 'head'
  | 'upperArmL' | 'upperArmR'
  | 'thighL' | 'shankL' | 'thighR' | 'shankR'

/** UPPERCASE mesh-name substrings per segment. */
export const SEGMENT_MESHES: Record<SegmentId, string[]> = {
  // Pelvis (root) — glutes attach here and stay grounded with the legs.
  pelvis: ['GLUTEUS_MAXIMUS', 'GLUTEUS_MEDIUS'],
  // Trunk leans on top of the pelvis.
  trunk: [
    'PECTORALIS_MAJOR', 'RECTUS_ABDOMINIS', 'EXTERNAL_OBLIQUE', 'SERRATUS_ANTERIOR',
    'TRAPEZIUS', 'LATISSIMUS_DORSI', 'ERECTOR_SPINAE',
  ],
  neck:  ['STERNOCLEIDOMASTOID'],
  head:  ['MASSETER', 'TEMPORALIS'],
  // Forearm (brachioradialis) folded into the arm so it can't disconnect.
  upperArmR: ['BICEPS_BRACHII_R', 'TRICEPS_BRACHII_R', 'DELTOID_R', 'BRACHIALIS_R', 'CORACOBRACHIALIS_R', 'INFRASPINATUS_R', 'BRACHIORADIALIS_R'],
  upperArmL: ['BICEPS_BRACHII_L', 'TRICEPS_BRACHII_L', 'DELTOID_L', 'BRACHIALIS_L', 'CORACOBRACHIALIS_L', 'INFRASPINATUS_L', 'BRACHIORADIALIS_L'],
  thighR: ['RECTUS_FEMORIS_R', 'VASTUS_LATERALIS_R', 'VASTUS_MEDIALIS_R', 'BICEPS_FEMORIS_R', 'SARTORIUS_R'],
  shankR: ['GASTROCNEMIUS_R', 'SOLEUS_R', 'TIBIALIS_ANTERIOR_R'],
  thighL: ['RECTUS_FEMORIS_L', 'VASTUS_LATERALIS_L', 'VASTUS_MEDIALIS_L', 'BICEPS_FEMORIS_L', 'SARTORIUS_L'],
  shankL: ['GASTROCNEMIUS_L', 'SOLEUS_L', 'TIBIALIS_ANTERIOR_L'],
}

/** Parent of each segment (null = root). */
export const SEGMENT_PARENT: Record<SegmentId, SegmentId | null> = {
  pelvis: null,
  trunk: 'pelvis', neck: 'trunk', head: 'neck',
  upperArmR: 'trunk', upperArmL: 'trunk',
  thighR: 'pelvis', shankR: 'thighR',
  thighL: 'pelvis', shankL: 'thighL',
}

/** Top-down order so parents resolve before children. */
export const SEGMENT_ORDER: SegmentId[] = [
  'pelvis', 'trunk', 'neck', 'head',
  'upperArmR', 'upperArmL',
  'thighR', 'shankR', 'thighL', 'shankL',
]

/** Upper-body segments (other than the trunk itself) lean WITH the trunk. */
export const UPPER_SEGMENTS = new Set<SegmentId>(['neck', 'head', 'upperArmR', 'upperArmL'])

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

const LEAN_GAIN = 1.3
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/**
 * Live target directions in the user's anatomical frame.
 *   upperArm = shoulder→elbow, thigh = hip→knee, shank = knee→ankle,
 *   neck/head = shoulder→nose.
 * `trunk` is the desired spine "up" tilt (derived from the spine vs gravity),
 * so the trunk bends forward/back/side without spinning. Legs are NOT driven
 * by the trunk, so they stay grounded.
 */
export function poseBoneDirections(lms: LandmarkSet): BoneDirs {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return {}

  const project = (a: Vec3 | null, b: Vec3 | null): Vec3 | null => {
    if (!a || !b) return null
    const d = sub(b, a)
    if (d.x === 0 && d.y === 0 && d.z === 0) return null
    return normalize({ x: dot(d, frame.xAxis), y: dot(d, frame.yAxis), z: dot(d, frame.zAxis) })
  }
  const w = (i: number, min = 0.4) => (vis(lms, i, min) ? worldVec(lms[i]) : null)

  const ls = w(LM.L_SHOULDER), rs = w(LM.R_SHOULDER)
  const midSh = ls && rs ? midpoint(ls, rs) : null
  const nose  = w(LM.NOSE, 0.3)

  const out: BoneDirs = {}
  // MIRROR: the model faces the user like a mirror — the user's LEFT limb drives
  // the model's RIGHT segment, and the lateral (x) component is negated so
  // abduction stays abduction. `set` applies the x-negation; the limb sources
  // below are swapped L↔R. (MuscleTwinModel mirrors the activation side to match.)
  const mir = (d: Vec3 | null): Vec3 | null => (d ? { x: -d.x, y: d.y, z: d.z } : null)
  const set = (seg: SegmentId, d: Vec3 | null) => { const m = mir(d); if (m) out[seg] = m }

  // Trunk lean: how far the spine tilts from vertical, in forward/side terms.
  // frame.zAxis.y < 0 when bent forward; frame.xAxis.y < 0 when side-bent right.
  // Gate by uprightness: when the user is lying (spine horizontal) the gravity-
  // lean is meaningless and would bend the trunk wildly — the model's global
  // posture handles lying instead, so we keep the trunk straight.
  const upright   = Math.abs(frame.yAxis.y)            // 1 = vertical spine, ~0 = lying
  const leanScale = upright < 0.5 ? 0 : 1
  const leanFwd  = clamp(-frame.zAxis.y * LEAN_GAIN, -0.9, 0.9) * leanScale
  const leanSide = clamp(-frame.xAxis.y * LEAN_GAIN, -0.9, 0.9) * leanScale
  out['trunk'] = normalize({ x: -leanSide, y: 1, z: leanFwd })   // -leanSide = mirror

  set('neck', project(midSh, nose))
  set('head', project(midSh, nose))

  // Limb sources swapped L↔R for the mirror (user left → model right).
  set('upperArmR', project(ls, w(LM.L_ELBOW)))
  set('upperArmL', project(rs, w(LM.R_ELBOW)))

  set('thighR', project(w(LM.L_HIP), w(LM.L_KNEE)))
  set('thighL', project(w(LM.R_HIP), w(LM.R_KNEE)))
  set('shankR', project(w(LM.L_KNEE), w(LM.L_ANKLE)))
  set('shankL', project(w(LM.R_KNEE), w(LM.R_ANKLE)))

  return out
}
