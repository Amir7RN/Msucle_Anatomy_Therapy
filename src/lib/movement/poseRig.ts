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
/**
 * Explicit vertical-tracking state, exposed so the model and HUD can react to
 * transitions crisply instead of inferring them from rootY:
 *   'calibrating' — planted; waiting for a still, fully-framed user
 *   'grounded'    — feet on the floor plane (standing/seated), rootY → 0
 *   'airborne'    — ballistic jump in progress, rootY tracks the rise
 *   'floor'       — body horizontal (lying/prone/side); hard-anchored to the
 *                   floor plane, jump detection suppressed entirely
 */
export type VerticalState = 'calibrating' | 'grounded' | 'airborne' | 'floor'

export interface PoseRigFrame {
  dirs:    BoneDirs
  yaw:     number
  rootY:   number
  quality: number
  /** True when the feet are on (or assumed on) the floor — the model snaps to
   *  the ground and zeroes any jump velocity. */
  grounded: boolean
  /** Which branch of the vertical state machine produced this frame. */
  verticalState: VerticalState
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function vis(lms: LandmarkSet, i: number, min = 0.4): boolean {
  return (lms[i]?.visibility ?? 0) >= min
}

/** World coord of a landmark, but only if visible enough. */
function wpt(lms: LandmarkSet, i: number, min = 0.4): Vec3 | null {
  return vis(lms, i, min) ? worldVec(lms[i]) : null
}

/** World midpoint of two landmarks, or null if either is missing/occluded. */
function midWorld(lms: LandmarkSet, a: number, b: number): Vec3 | null {
  const va = wpt(lms, a, 0.3), vb = wpt(lms, b, 0.3)
  return va && vb ? midpoint(va, vb) : null
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
  // Full 3-D lateral line (shoulder line + hip line averaged), and its
  // horizontal-only projection. When upright, the lateral axis IS horizontal so
  // the projection is strong; when the user lies on their SIDE (or is filmed
  // side-on) the lateral axis tips toward vertical and its horizontal projection
  // becomes tiny and noise-dominated — the exact case that used to flip the twin.
  const latFull: Vec3 = {
    x: ((rs.x - ls.x) + (rh.x - lh.x)) / 2,
    y: ((rs.y - ls.y) + (rh.y - lh.y)) / 2,
    z: ((rs.z - ls.z) + (rh.z - lh.z)) / 2,
  }
  let right: Vec3 = { x: latFull.x, y: 0, z: latFull.z }
  const horizMag = magnitude(right)
  const horizFrac = horizMag / (magnitude(latFull) || 1)
  // Degeneracy guard: if the lateral axis is mostly vertical (side-lying / side-
  // on), the horizontal projection is unreliable — hold the previous stable axis
  // rather than rebuild it from noise.
  if (horizFrac < 0.35 || horizMag < 1e-3) {
    right = prevRight ? { ...prevRight } : (horizMag < 1e-3 ? { x: 1, y: 0, z: 0 } : normalize(right))
  } else {
    right = normalize(right)
    // Continuity guard: a fresh axis that disagrees strongly with the stable one
    // is a flip/glitch (not a real turn, which passes through gradually) — hold
    // the previous axis instead of flipping. Keeps the twin from mirroring L/R
    // during transitions in and out of the floor.
    if (prevRight && dot(right, prevRight) < 0.2) right = { ...prevRight }
  }
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

  const uAR = proj(ls, le), uAL = proj(rs, re)
  const thR = proj(lh, lk), thL = proj(rh, rk)
  set('upperArmR', uAR); set('upperArmL', uAL)
  // Elbow/knee are HINGES with a noisy distal landmark (wrist/ankle visibility
  // is often < 0.3). When that distal point isn't reliably seen, WELD the child
  // segment collinear with its parent (straight joint) instead of letting a
  // low-confidence point fling the lower limb off into space. It bends only once
  // the wrist/ankle is confidently tracked.
  set('forearmR', proj(le, lw) ?? uAR)
  set('forearmL', proj(re, rw) ?? uAL)
  set('thighR', thR); set('thighL', thL)
  set('shankR', proj(lk, la) ?? thR)
  set('shankL', proj(rk, ra) ?? thL)

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
// Smoothing for a segment the current exercise does NOT expect to move: it's
// held near its last good direction so the overlay stops jittering on limbs that
// shouldn't move for this motion (per-exercise kinematic prior). Low = stiff.
const HOLD_SMOOTH  = 0.12

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
// Horizontal (floor-level) detection: |vertical component| of the world spine
// direction below ENTER ⇒ the body is lying; above EXIT ⇒ upright again. The
// hysteresis gap stops the state chattering when the user is mid-transition
// (getting down to / up from the floor), which is exactly when hip-y jumps
// used to fake "takeoffs" and make the twin hop while lying down.
const HORIZ_ENTER = 0.45
const HORIZ_EXIT  = 0.62
// Predictive landing: at takeoff we know the launch velocity; ballistics says
// air time ≈ 2·v/g. We cap airborne time at that prediction (+ slack) so a
// missed landing frame can never leave the twin floating past physics.
const GRAVITY_TL = 22     // g expressed in torso-lengths/s² (≈9.81 m/s² ÷ ~0.45 m torso)
const AIR_SLACK  = 1.35   // allow 35% over the ballistic prediction

function nlerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return normalize({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
}

export class PoseRigEngine {
  private right: Vec3 | null = null          // smoothed lateral axis (continuity)
  private smoothed: BoneDirs = {}            // smoothed per-segment dirs

  // Vertical state machine: calibrating → grounded ⇄ airborne, with a `floor`
  // branch that hard-anchors a horizontal body to the ground plane.
  private calibrated = false
  private stableS = 0
  private floorBaseY: number | null = null   // resting body-center image-y
  private prevCenterY: number | null = null
  private prevT = 0
  private airborne = false
  private airS = 0
  private maxAirS = MAX_AIR_S                // ballistic prediction per jump
  private horizontal = false                 // hysteresis-latched lying state
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
    this.maxAirS = MAX_AIR_S
    this.horizontal = false
    this.grounded = true
    this.rootY = 0
  }

  /** Current vertical-state-machine branch (for the frame + HUD). */
  private verticalState(): VerticalState {
    if (this.horizontal) return 'floor'
    if (!this.calibrated) return 'calibrating'
    return this.airborne ? 'airborne' : 'grounded'
  }

  update(
    lms: LandmarkSet,
    tMs = performance.now(),
    opts?: { holdSegments?: ReadonlySet<SegmentId> },
  ): PoseRigFrame {
    const f = computeBodyFrame(lms, this.right)
    if (!f) {
      return {
        dirs: this.smoothed, yaw: 0, rootY: this.rootY, quality: 0,
        grounded: this.grounded, verticalState: this.verticalState(),
      }
    }
    // Lightly track the lateral axis so genuine slow turns follow but noise can't.
    this.right = this.right ? normalize({
      x: this.right.x + (f.right.x - this.right.x) * 0.4,
      y: 0,
      z: this.right.z + (f.right.z - this.right.z) * 0.4,
    }) : f.right
    const frame: BodyFrame = { up: f.up, right: this.right, ant: normalize(cross(this.right, f.up)), quality: f.quality }

    // Per-segment directions, smoothed + held when a limb drops out of view.
    // Segments the selected exercise doesn't move are stiffened toward their last
    // good direction (kinematic prior) so the overlay favours the expected motion.
    const hold = opts?.holdSegments
    const target = boneDirsFromBodyFrame(frame, lms)
    for (const seg of SEGMENT_ORDER) {
      const t = target[seg]
      if (!t) continue                       // not visible → keep last good
      const prev = this.smoothed[seg]
      const k = hold && hold.has(seg) ? HOLD_SMOOTH : DIR_SMOOTH
      this.smoothed[seg] = prev ? nlerp(prev, t, k) : t
    }

    this.updateGround(lms, tMs)

    return {
      dirs: this.smoothed, yaw: 0, rootY: this.rootY, quality: f.quality,
      grounded: this.grounded, verticalState: this.verticalState(),
    }
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

    // ── FLOOR branch: horizontal body ⇒ hard-anchor to the ground plane ──
    // World spine verticality with hysteresis. While lying, the hip-centre
    // image-y is meaningless as a jump signal (rolling over spikes it), so the
    // whole ballistic model is suppressed and the root is pinned to the floor.
    const wSh = midWorld(lms, LM.L_SHOULDER, LM.R_SHOULDER)
    const wHip = midWorld(lms, LM.L_HIP, LM.R_HIP)
    if (wSh && wHip) {
      const spine = normalize(sub(wSh, wHip))
      const vert = Math.abs(spine.y)
      if (!this.horizontal && vert < HORIZ_ENTER) this.horizontal = true
      else if (this.horizontal && vert > HORIZ_EXIT) this.horizontal = false
    }
    if (this.horizontal) {
      this.toGround()
      // Re-arm calibration for when the user stands back up: the floor
      // baseline captured while lying would be garbage for a standing jump.
      this.calibrated = false
      this.stableS = 0
      this.prevCenterY = centerY
      return
    }

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
      if (fullBody && vN > VN_TAKEOFF) {
        this.airborne = true
        this.airS = 0
        this.grounded = false
        // Predictive air time from launch velocity (t = 2·v/g), with slack.
        // Bounds the airborne state to real physics — the twin can never keep
        // "flying" longer than the jump it actually saw could last.
        this.maxAirS = Math.min(MAX_AIR_S, ((2 * vN) / GRAVITY_TL) * AIR_SLACK)
      }
    } else {
      this.airS += dt
      const disp = this.floorBaseY !== null ? (this.floorBaseY - centerY) / scale : 0   // torso-lengths risen
      const target = clamp(disp * JUMP_GAIN, 0, ROOT_MAX)
      const k = target > this.rootY ? RISE_SMOOTH : FALL_SMOOTH
      this.rootY += (target - this.rootY) * k
      if ((disp < LAND_DISP && vN < VN_TAKEOFF) || this.airS > this.maxAirS) {
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
