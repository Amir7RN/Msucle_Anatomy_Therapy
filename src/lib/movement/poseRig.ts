/**
 * poseRig.ts  (v4 — realism rewrite)
 *
 * Pure-logic half of the segment-rigged Muscle Twin: it turns a frame of
 * MediaPipe pose landmarks into a set of per-segment bone DIRECTIONS that the
 * 3-D model rebuilds on its own rig.
 *
 * Why this was rewritten
 * ──────────────────────
 * The v3 rig derived a body frame whose "up" was the spine and then guessed
 * sign-continuity for the lateral/anterior axes and re-derived a facing yaw.
 * Those heuristics flipped under noise, which is what produced the symptoms in
 * the user's recording: limbs splayed/drooping at rest, legs crossing, the
 * trunk diving 90° forward, and segments appearing to detach. It also folded
 * the forearm into the upper arm, so the elbow could never bend.
 *
 * v4 fixes the root cause by building ONE gravity-referenced, de-yawed body
 * frame straight from MediaPipe's WORLD landmarks (which are already
 * gravity-aligned and roughly rotation-invariant):
 *
 *     up    = world vertical (0,1,0)
 *     right = the user's shoulder+hip line, flattened to horizontal
 *     ant   = right × up        (out through the chest)
 *
 * Every bone direction is just (distal − proximal) expressed in that frame, so:
 *   • a hanging arm is (0,−1,0) — it can't splay at rest;
 *   • left and right legs get their true small lateral angle — they can't cross;
 *   • the trunk lean is the spine's real tilt from vertical, hard-clamped so it
 *     can never dive;
 *   • there are no sign-continuity or yaw heuristics left to flip.
 *
 * The FOREARM is its own segment (elbow → wrist), so the elbow bends. The model
 * keeps the arm connected because the forearm is a child of the upper arm.
 *
 * Convention: each direction is ANATOMICAL — x = the user's right, y = up,
 * z = anterior — and MIRRORED (the twin is a mirror you face), so the user's
 * left limb drives the model's right segment and the lateral sign is flipped.
 * MuscleTwinModel mirrors the activation side to match.
 */

import type { LandmarkSet } from './landmarks'
import { LM } from './landmarks'
import {
  worldVec, sub, midpoint, normalize, dot, cross, magnitude,
  type Vec3,
} from './anatomicalFrame'

export type SegmentId =
  | 'pelvis' | 'trunk' | 'neck' | 'head'
  | 'upperArmL' | 'upperArmR'
  | 'forearmL' | 'forearmR'
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
  // Upper arm: shoulder/elbow crossing muscles. (brachioradialis lives on the
  // forearm now so the elbow can flex.)
  upperArmR: ['BICEPS_BRACHII_R', 'TRICEPS_BRACHII_R', 'DELTOID_R', 'BRACHIALIS_R', 'CORACOBRACHIALIS_R', 'INFRASPINATUS_R'],
  upperArmL: ['BICEPS_BRACHII_L', 'TRICEPS_BRACHII_L', 'DELTOID_L', 'BRACHIALIS_L', 'CORACOBRACHIALIS_L', 'INFRASPINATUS_L'],
  // Forearm — the brachioradialis sliver spans the elbow, so rotating it about
  // the elbow reads as forearm flexion and keeps the arm one connected chain.
  forearmR: ['BRACHIORADIALIS_R'],
  forearmL: ['BRACHIORADIALIS_L'],
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
  forearmR: 'upperArmR', forearmL: 'upperArmL',
  thighR: 'pelvis', shankR: 'thighR',
  thighL: 'pelvis', shankL: 'thighL',
}

/** Top-down order so parents resolve before children. */
export const SEGMENT_ORDER: SegmentId[] = [
  'pelvis', 'trunk', 'neck', 'head',
  'upperArmR', 'forearmR', 'upperArmL', 'forearmL',
  'thighR', 'shankR', 'thighL', 'shankL',
]

/** Upper-body segments (kept for back-compat with older callers). */
export const UPPER_SEGMENTS = new Set<SegmentId>([
  'neck', 'head', 'upperArmR', 'upperArmL', 'forearmR', 'forearmL',
])

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
 *   • `yaw`    — facing azimuth (rad). Kept at 0 in v4: the twin is a stable
 *                front-facing mirror, which is what biofeedback wants and what
 *                removes the spinning/instability the yaw heuristic caused.
 *   • `rootY`  — vertical JUMP offset (model units), ≥ 0. Rises when the user's
 *                feet leave the ground and snaps back to 0 on landing. Squats
 *                are handled by the model's grounding (feet stay planted), not
 *                here, so this never goes negative and can't drift.
 *   • `quality`— 0..1 trust in this frame (torso-anchor visibility).
 *   • `dirs`   — the per-segment anatomical directions.
 */
export interface PoseRigFrame {
  dirs:    BoneDirs
  yaw:     number
  rootY:   number
  quality: number
  /** True when the feet are on (or assumed on) the floor — the model snaps to
   *  the ground and zeroes any jump velocity. */
  grounded: boolean
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function vis(lms: LandmarkSet, i: number, min = 0.4): boolean {
  return (lms[i]?.visibility ?? 0) >= min
}

/** World coord of a landmark, but only if visible enough. */
function wpt(lms: LandmarkSet, i: number, min = 0.4): Vec3 | null {
  return vis(lms, i, min) ? worldVec(lms[i]) : null
}

// Largest tilt of the trunk from vertical we will ever show (degrees). Stops
// the "90° forward dive" — a real forward bend at the hips still reads, but the
// rigid trunk segment never folds past a believable lean.
const MAX_TRUNK_LEAN_DEG = 40
const MAX_TRUNK_SIN = Math.sin((MAX_TRUNK_LEAN_DEG * Math.PI) / 180)

/**
 * The gravity-referenced, de-yawed body frame for this pose, plus a quality
 * score. `right` is smoothed/continued by the caller; here it is computed fresh.
 */
export interface BodyFrame {
  up: Vec3; right: Vec3; ant: Vec3
  quality: number
}

/** Build the gravity body frame from the four torso anchors. */
export function computeBodyFrame(lms: LandmarkSet, prevRight?: Vec3 | null): BodyFrame | null {
  const ls = wpt(lms, LM.L_SHOULDER, 0.3), rs = wpt(lms, LM.R_SHOULDER, 0.3)
  const lh = wpt(lms, LM.L_HIP, 0.3),       rh = wpt(lms, LM.R_HIP, 0.3)
  if (!ls || !rs || !lh || !rh) return null

  const up: Vec3 = { x: 0, y: 1, z: 0 }   // worldVec already flips +y to up
  // User's right = shoulder line + hip line, flattened to horizontal so torso
  // pitch/roll doesn't leak into the lateral axis.
  let right: Vec3 = {
    x: ((rs.x - ls.x) + (rh.x - lh.x)) / 2,
    y: 0,
    z: ((rs.z - ls.z) + (rh.z - lh.z)) / 2,
  }
  if (magnitude(right) < 1e-4) {
    // Degenerate (user perfectly side-on) — keep the previous right if we have
    // one, else fall back to world +x.
    right = prevRight ? { ...prevRight } : { x: 1, y: 0, z: 0 }
  }
  right = normalize(right)
  // Continuity guard: don't let the lateral axis flip 180° on a noisy frame.
  if (prevRight && dot(right, prevRight) < 0) right = { x: -right.x, y: -right.y, z: -right.z }
  const ant = normalize(cross(right, up))   // out through the chest

  const visQ = Math.min(
    lms[LM.L_SHOULDER]?.visibility ?? 0, lms[LM.R_SHOULDER]?.visibility ?? 0,
    lms[LM.L_HIP]?.visibility ?? 0,      lms[LM.R_HIP]?.visibility ?? 0,
  )
  return { up, right, ant, quality: clamp(visQ, 0, 1) }
}

/**
 * Per-segment anatomical directions for one frame, in the gravity body frame,
 * MIRRORED. Pure: same input → same output. Shared by the stateless helper and
 * the stateful engine.
 */
function boneDirsFromBodyFrame(f: BodyFrame, lms: LandmarkSet): BoneDirs {
  // Express a world vector (a→b) in the body frame, then mirror (negate x).
  const proj = (a: Vec3 | null, b: Vec3 | null): Vec3 | null => {
    if (!a || !b) return null
    const d = sub(b, a)
    if (magnitude(d) < 1e-6) return null
    const v = normalize({ x: dot(d, f.right), y: dot(d, f.up), z: dot(d, f.ant) })
    return { x: -v.x, y: v.y, z: v.z }   // mirror
  }
  const out: BoneDirs = {}
  const set = (seg: SegmentId, d: Vec3 | null) => { if (d) out[seg] = d }

  const ls = wpt(lms, LM.L_SHOULDER), rs = wpt(lms, LM.R_SHOULDER)
  const lh = wpt(lms, LM.L_HIP),       rh = wpt(lms, LM.R_HIP)
  const midSh = ls && rs ? midpoint(ls, rs) : null
  const midHip = lh && rh ? midpoint(lh, rh) : null
  const nose = wpt(lms, LM.NOSE, 0.3)

  // Trunk: the spine's real tilt from vertical, hard-clamped so it never dives.
  if (midSh && midHip) {
    const spine = normalize(sub(midSh, midHip))
    let side = dot(spine, f.right)
    let fwd  = dot(spine, f.ant)
    // Clamp the horizontal tilt to a believable lean.
    const horiz = Math.hypot(side, fwd)
    if (horiz > MAX_TRUNK_SIN && horiz > 1e-6) {
      const s = MAX_TRUNK_SIN / horiz
      side *= s; fwd *= s
    }
    const vert = Math.sqrt(Math.max(0, 1 - side * side - fwd * fwd))
    out['trunk'] = normalize({ x: -side, y: vert, z: fwd })   // -side = mirror
  }

  // Head / neck from the shoulders→nose line.
  set('neck', proj(midSh, nose))
  set('head', proj(midSh, nose))

  // Limbs — user LEFT drives model RIGHT (mirror). proj() already negates x.
  const le = wpt(lms, LM.L_ELBOW), re = wpt(lms, LM.R_ELBOW)
  const lw = wpt(lms, LM.L_WRIST), rw = wpt(lms, LM.R_WRIST)
  const lk = wpt(lms, LM.L_KNEE),  rk = wpt(lms, LM.R_KNEE)
  const la = wpt(lms, LM.L_ANKLE), ra = wpt(lms, LM.R_ANKLE)

  set('upperArmR', proj(ls, le)); set('upperArmL', proj(rs, re))
  set('forearmR',  proj(le, lw)); set('forearmL',  proj(re, rw))
  set('thighR', proj(lh, lk));    set('thighL', proj(rh, rk))
  set('shankR', proj(lk, la));    set('shankL', proj(rk, ra))

  return out
}

/**
 * Stateless target directions (back-compat for callers that don't need the
 * stabilised globals — e.g. guided exercises, where the posture is known and
 * the user faces the camera). Live single-camera use should prefer
 * `PoseRigEngine`, which adds smoothing + the jump offset.
 */
export function poseBoneDirections(lms: LandmarkSet): BoneDirs {
  const f = computeBodyFrame(lms)
  if (!f) return {}
  return boneDirsFromBodyFrame(f, lms)
}

// ─────────────────────────────────────────────────────────────────────────────
//  PoseRigEngine — stateful, the robust path for the live twin
// ─────────────────────────────────────────────────────────────────────────────

const DIR_SMOOTH   = 0.5     // nlerp factor toward each fresh segment direction

// Vertical (jump) model — operates in IMAGE space, since MediaPipe world coords
// are hip-centred and can't see global rise. The metric is the body-center
// vertical velocity NORMALISED by torso size (shoulder↔hip image distance), so
// it reads the same whether the user is near or far. This is what rejects
// "stepping back": that's a slow, scale-changing move and never trips the
// ballistic takeoff threshold. A neutral-pose CALIBRATION gate must pass first
// (still + fully in frame), and an airborne TIMEOUT guarantees the model always
// returns to the ground — no flying at the start, no floating landings.
const CALIB_STABLE_S = 0.6    // hold still + fully in frame this long to calibrate
const STILL_VN       = 0.5    // |normalised vY| below this counts as "still"
const VN_TAKEOFF     = 1.8    // normalised upward velocity (torso-lengths/s) ⇒ jump
const JUMP_GAIN      = 1.25   // normalised rise (torso-lengths) → model units
const ROOT_MAX       = 1.4    // tallest jump we render (model units)
const MAX_AIR_S      = 1.0    // hard cap on airborne time ⇒ never float
const LAND_DISP      = 0.04   // back within this (torso-lengths) of rest ⇒ landed
const BASE_ALPHA     = 0.05   // grounded baseline tracking (absorbs slow drift)
const RISE_SMOOTH    = 0.55   // follow the rise quickly
const FALL_SMOOTH    = 0.4    // ease down, then snap on contact

function nlerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return normalize({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
}

export class PoseRigEngine {
  private right: Vec3 | null = null          // smoothed lateral axis (continuity)
  private smoothed: BoneDirs = {}            // smoothed per-segment dirs

  // Vertical state: neutral-pose calibration + ballistic jump with ground contact.
  private calibrated = false
  private stableS = 0
  private floorBaseY: number | null = null   // resting body-center image-y
  private prevCenterY: number | null = null
  private prevT = 0
  private airborne = false
  private airS = 0
  private grounded = true
  private rootY = 0

  reset(): void {
    this.right = null
    this.smoothed = {}
    this.calibrated = false
    this.stableS = 0
    this.floorBaseY = null
    this.prevCenterY = null
    this.prevT = 0
    this.airborne = false
    this.airS = 0
    this.grounded = true
    this.rootY = 0
  }

  update(lms: LandmarkSet, tMs = performance.now()): PoseRigFrame {
    const f = computeBodyFrame(lms, this.right)
    if (!f) return { dirs: this.smoothed, yaw: 0, rootY: this.rootY, quality: 0, grounded: this.grounded }
    // Lightly track the lateral axis so genuine slow turns follow but noise can't.
    this.right = this.right ? normalize({
      x: this.right.x + (f.right.x - this.right.x) * 0.4,
      y: 0,
      z: this.right.z + (f.right.z - this.right.z) * 0.4,
    }) : f.right
    const frame: BodyFrame = { up: f.up, right: this.right, ant: normalize(cross(this.right, f.up)), quality: f.quality }

    // Per-segment directions, smoothed + held when a limb drops out of view.
    const target = boneDirsFromBodyFrame(frame, lms)
    for (const seg of SEGMENT_ORDER) {
      const t = target[seg]
      if (!t) continue                       // not visible → keep last good
      const prev = this.smoothed[seg]
      this.smoothed[seg] = prev ? nlerp(prev, t, DIR_SMOOTH) : t
    }

    this.updateGround(lms, tMs)

    return { dirs: this.smoothed, yaw: 0, rootY: this.rootY, quality: f.quality, grounded: this.grounded }
  }

  /**
   * Ground-truth vertical model.
   *
   *  • CALIBRATION: nothing leaves the ground until the user has stood still and
   *    fully in frame for `CALIB_STABLE_S`. This is why the twin no longer flies
   *    at the very start while the user is close to the camera and only partly
   *    visible — until it's calibrated, the model is simply planted.
   *  • GROUND TRUTH: a jump is a brief BALLISTIC spike in the body-center
   *    vertical velocity, normalised by torso size so it's range-invariant.
   *    Stepping toward/away from the camera is slow and never trips it, and a
   *    jump is only allowed while the FEET are actually in frame.
   *  • CONTACT: airborne ends the moment the body returns to its resting height
   *    OR a hard timeout — so the model lands exactly when the user does and can
   *    never drift or "keep landing".
   */
  private updateGround(lms: LandmarkSet, tMs: number): void {
    const dt = this.prevT ? Math.max(1e-3, Math.min(0.1, (tMs - this.prevT) / 1000)) : 1 / 30
    this.prevT = tMs

    const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER]
    const lh = lms[LM.L_HIP], rh = lms[LM.R_HIP]
    const la = lms[LM.L_ANKLE], ra = lms[LM.R_ANKLE]
    const okTorso = !!ls && !!rs && !!lh && !!rh &&
      Math.min(ls.visibility ?? 0, rs.visibility ?? 0, lh.visibility ?? 0, rh.visibility ?? 0) > 0.4
    if (!okTorso) { this.toGround(); return }

    const centerY = (lh!.y + rh!.y) / 2
    const midShY  = (ls!.y + rs!.y) / 2
    const scale = Math.max(0.05, Math.abs(centerY - midShY))    // torso length in image
    const anklesVisible = !!la && !!ra && (la.visibility ?? 0) > 0.5 && (ra.visibility ?? 0) > 0.5
    const fullBody = anklesVisible && (lms[LM.NOSE]?.visibility ?? 0) > 0.4

    // Normalised vertical velocity (torso-lengths/s, + = rising).
    let vN = 0
    if (this.prevCenterY !== null) vN = (this.prevCenterY - centerY) / (dt * scale)
    this.prevCenterY = centerY

    if (!this.calibrated) {
      this.toGround()
      if (fullBody && Math.abs(vN) < STILL_VN) {
        this.stableS += dt
        if (this.stableS >= CALIB_STABLE_S) { this.calibrated = true; this.floorBaseY = centerY }
      } else {
        this.stableS = 0
      }
      return
    }

    if (!this.airborne) {
      this.grounded = true
      this.rootY += (0 - this.rootY) * FALL_SMOOTH
      this.floorBaseY = this.floorBaseY === null ? centerY : this.floorBaseY + BASE_ALPHA * (centerY - this.floorBaseY)
      // Only a real, ballistic rise with the feet in frame counts as a jump.
      if (fullBody && vN > VN_TAKEOFF) { this.airborne = true; this.airS = 0; this.grounded = false }
    } else {
      this.airS += dt
      const disp = this.floorBaseY !== null ? (this.floorBaseY - centerY) / scale : 0   // torso-lengths risen
      const target = clamp(disp * JUMP_GAIN, 0, ROOT_MAX)
      const k = target > this.rootY ? RISE_SMOOTH : FALL_SMOOTH
      this.rootY += (target - this.rootY) * k
      if ((disp < LAND_DISP && vN < VN_TAKEOFF) || this.airS > MAX_AIR_S) {
        this.airborne = false
        this.grounded = true
        this.floorBaseY = centerY        // re-lock — kills any post-landing drift
      }
    }
    if (this.rootY < 0) this.rootY = 0
  }

  /** Force the planted state and ease any residual jump back to the floor. */
  private toGround(): void {
    this.grounded = true
    this.airborne = false
    this.rootY += (0 - this.rootY) * FALL_SMOOTH
  }
}
