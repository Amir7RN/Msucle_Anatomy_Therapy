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
  computeAnatomicalFrame, worldVec, sub, midpoint, normalize, dot, cross,
  type Vec3, type AnatomicalFrame,
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

/**
 * Globals the digital twin needs that a per-segment direction can't carry:
 *   • `yaw`    — the user's facing azimuth (rad). 0 ≈ how they started; turning
 *                to a side rotates this so the model turns WITH them (sagittal).
 *   • `rootY`  — vertical body offset (model units). Rises on a jump, dips on a
 *                squat — the model's gravity/jump reaction.
 *   • `quality`— 0..1 trust in this frame (visibility × depth sanity).
 *   • `dirs`   — the per-segment anatomical directions (as before).
 */
export interface PoseRigFrame {
  dirs:    BoneDirs
  yaw:     number
  rootY:   number
  quality: number
}

function vis(lms: LandmarkSet, i: number, min = 0.4): boolean {
  return (lms[i]?.visibility ?? 0) >= min
}

const LEAN_GAIN = 1.3
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/**
 * Build the per-segment anatomical directions from a (possibly stabilised)
 * frame. Pure: same input → same output. The stateful smoothing/gating lives in
 * `PoseRigEngine`; this is shared by it and the back-compat helper below.
 */
function boneDirsFromFrame(frame: AnatomicalFrame, lms: LandmarkSet): BoneDirs {
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

/**
 * Stateless target directions (back-compat for callers that don't need the
 * stabilised globals — e.g. guided exercises, where the posture is known and
 * the user faces the camera). Live single-camera use should prefer
 * `PoseRigEngine`, which removes the L/R / forward-back flips and adds yaw +
 * jump.
 */
export function poseBoneDirections(lms: LandmarkSet): BoneDirs {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return {}
  return boneDirsFromFrame(frame, lms)
}

// ─────────────────────────────────────────────────────────────────────────────
//  PoseRigEngine — stateful, the robust path for the live twin
//
//  Fixes (from video review):
//   1. SEGMENT / SIDE SWITCHING and FORWARD-BACK REVERSAL as the user moves
//      toward/away from the camera. MediaPipe's depth is noisy at range, which
//      lets the lateral (x) and anterior (z) axes flip sign frame-to-frame —
//      flipping abduction↔adduction and front↔back. We enforce TEMPORAL SIGN
//      CONTINUITY on the lateral axis (the spine `y` is reliable, so we anchor
//      to it and only resolve the x sign by continuity), then rebuild z from it.
//      A genuine slow turn moves the axis a few degrees per frame and is tracked;
//      a one-frame 180° flip is rejected.
//   2. THE TWIN NEVER TURNED. We derive a facing `yaw` from the now-continuous
//      anterior axis, zero it to the user's starting orientation, rate-limit and
//      smooth it, so turning to the side turns the model to the side.
//   3. NO JUMP / GRAVITY REACTION. World coords are hip-centred (origin at the
//      pelvis) so they can't see global rise/fall; we read the pelvis height from
//      the IMAGE against a slow baseline and translate the model up on a jump,
//      down on a squat.
//   4. LIMBS FLINGING OFF. Per-limb visibility gating + direction smoothing here,
//      plus tighter clamps/slew in the model, keep segments connected.
// ─────────────────────────────────────────────────────────────────────────────

const YAW_MAX_RATE   = 0.20   // rad/frame ceiling on facing change (~11°/frame)
const YAW_SMOOTH     = 0.18   // EMA toward the (rate-limited) raw yaw
const YAW_MIN_QUAL   = 0.45   // don't trust yaw below this frame quality
const DIR_SMOOTH     = 0.45   // nlerp factor for per-segment direction smoothing
const JUMP_GAIN      = 5.0    // image-Δ (frac of frame height) → model units
const JUMP_SMOOTH    = 0.40
const ROOT_MIN       = -0.55  // deepest squat dip (model units)
const ROOT_MAX       = 1.30   // highest jump
const BASE_ALPHA     = 0.012  // slow drift of the resting-height baseline

function nlerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return normalize({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
}

export class PoseRigEngine {
  private prevX: Vec3 | null = null          // last stabilised lateral axis (world)
  private smoothed: BoneDirs = {}            // smoothed per-segment dirs
  private yaw = 0
  private yawOffset: number | null = null    // captured on first good frame → start ≈ 0
  private baseHipY: number | null = null     // resting pelvis image-y
  private rootY = 0

  reset(): void {
    this.prevX = null
    this.smoothed = {}
    this.yaw = 0
    this.yawOffset = null
    this.baseHipY = null
    this.rootY = 0
  }

  update(lms: LandmarkSet): PoseRigFrame {
    const raw = computeAnatomicalFrame(lms)
    if (!raw) return { dirs: this.smoothed, yaw: this.yaw, rootY: this.rootY, quality: 0 }

    // 1. Sign-stabilise the lateral axis against the previous frame, then
    //    rebuild a right-handed frame around the reliable spine axis. This is
    //    the core fix for L/R switching and front/back reversal.
    const frame = this.stabilise(raw)

    // 2. Per-segment directions, smoothed + gated (held when a limb drops out).
    const target = boneDirsFromFrame(frame, lms)
    for (const seg of SEGMENT_ORDER) {
      const t = target[seg]
      if (!t) continue                       // limb not visible → hold last good
      const prev = this.smoothed[seg]
      this.smoothed[seg] = prev ? nlerp(prev, t, DIR_SMOOTH) : t
    }

    // 3. Facing yaw from the (continuous) anterior axis, zeroed to the start.
    this.updateYaw(frame, raw.quality ?? 0)

    // 4. Vertical body offset (jump / squat) from the pelvis image-height.
    this.updateRootY(lms)

    return { dirs: this.smoothed, yaw: this.yaw, rootY: this.rootY, quality: raw.quality ?? 0 }
  }

  /** Lock the lateral axis sign by continuity, rebuild z = x×y right-handed. */
  private stabilise(f: AnatomicalFrame): AnatomicalFrame {
    let x = { ...f.xAxis }
    if (this.prevX && dot(x, this.prevX) < 0) { x = { x: -x.x, y: -x.y, z: -x.z } }
    // Re-orthonormalise against the (reliable) spine axis and rebuild anterior.
    const y = f.yAxis
    x = normalize(sub(x, { x: y.x * dot(x, y), y: y.y * dot(x, y), z: y.z * dot(x, y) }))
    const z = normalize(cross(x, y))         // x×y → anterior (right-handed)
    // Track the chosen axis (lightly) so genuine turns are followed but noise
    // doesn't drag it.
    this.prevX = this.prevX ? nlerp(this.prevX, x, 0.5) : x
    return { ...f, xAxis: x, zAxis: z }
  }

  private updateYaw(frame: AnatomicalFrame, quality: number): void {
    // Need enough horizontal torso spread for a meaningful azimuth, else hold.
    const horiz = Math.hypot(frame.zAxis.x, frame.zAxis.z)
    if (quality < YAW_MIN_QUAL || horiz < 0.15) return
    const rawYaw = Math.atan2(frame.zAxis.x, frame.zAxis.z)
    if (this.yawOffset === null) { this.yawOffset = rawYaw; this.yaw = 0; return }
    // Deviation from the start, unwrapped to (-π, π].
    let d = rawYaw - this.yawOffset
    while (d >  Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    // Rate-limit, then EMA — no teleport on a flip we didn't catch.
    const step = clamp(d - this.yaw, -YAW_MAX_RATE, YAW_MAX_RATE)
    this.yaw += YAW_SMOOTH * step
  }

  private updateRootY(lms: LandmarkSet): void {
    const lh = lms[LM.L_HIP], rh = lms[LM.R_HIP]
    if (!lh || !rh || (lh.visibility ?? 0) < 0.4 || (rh.visibility ?? 0) < 0.4) return
    const hipY = (lh.y + rh.y) / 2            // image-y, 0 top → 1 bottom
    if (this.baseHipY === null) { this.baseHipY = hipY; this.rootY = 0; return }
    // Rising in the image (smaller y) = jumping up → positive offset.
    const target = clamp((this.baseHipY - hipY) * JUMP_GAIN, ROOT_MIN, ROOT_MAX)
    this.rootY += JUMP_SMOOTH * (target - this.rootY)
    // Slowly re-centre the baseline so walking closer/farther doesn't bias it,
    // but a fast jump/squat (large deviation) barely moves it.
    this.baseHipY += BASE_ALPHA * (hipY - this.baseHipY)
  }
}
