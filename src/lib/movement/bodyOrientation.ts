/**
 * bodyOrientation.ts
 *
 * Classifies the user's GLOBAL body posture each frame — standing, seated,
 * supine (on back), prone (on front), or side-lying (left/right).
 *
 * Why this is the single most important fix for single-camera accuracy
 * ────────────────────────────────────────────────────────────────────
 * Every goniometric measurement projects a limb segment into an anatomical
 * plane (sagittal / frontal / transverse). Those planes are defined relative
 * to the BODY, but the old anatomical frame silently assumed the body was
 * upright: it used (mid-hip → mid-shoulder) as "up" and the pelvic frame
 * hard-coded world-up = (0,1,0). The moment the user sits back or lies down,
 * the spine is no longer vertical and that assumption rotates every plane by
 * up to 90° — which is exactly the "model gets distorted when sitting or
 * lying" failure the user reported.
 *
 * Knowing the orientation lets anatomicalFrame.ts build the body axes
 * correctly for ANY posture, lets the calibration step accept the right
 * neutral pose, and lets the coach give posture-appropriate cues.
 *
 * Signals (all from MediaPipe WORLD landmarks, gravity-aligned, +y up here)
 * ───────────────────────────────────────────────────────────────────────
 *   • trunkTilt   — angle between the spine vector and world-up.
 *                   ~0° standing/sitting tall, ~90° lying flat.
 *   • thighDown   — how vertically the thigh hangs (1 = straight down).
 *                   Separates standing (legs down) from seated (thighs flat).
 *   • lateralVert — how vertical the shoulder line is (1 = stacked).
 *                   High only when side-lying (shoulders stacked vertically).
 *
 * Temporal hysteresis prevents the label from flickering between adjacent
 * categories during a transition (e.g. lowering into a bridge).
 */

import type { LandmarkSet } from './landmarks'
import { LM } from './landmarks'
import { worldVec, sub, midpoint, magnitude, normalize, dot, type Vec3 } from './anatomicalFrame'

export type BodyOrientation =
  | 'standing'
  | 'seated'
  | 'supine'        // lying on back, face up
  | 'prone'         // lying on front, face down
  | 'side_lying'    // on a side
  | 'unknown'

export interface OrientationEstimate {
  orientation: BodyOrientation
  /** For side_lying: which side is DOWN (against the floor). */
  downSide?:   'L' | 'R'
  /** 0..1 confidence in the classification. */
  confidence:  number
  /** Trunk inclination from vertical (deg). 0 = upright, 90 = flat. */
  trunkTilt:   number
  /** True when world coords were available (classification is 3-D, reliable). */
  is3D:        boolean
  /** Unit vector pointing along the user's spine, hip→shoulder (+y up world). */
  spineUp:     Vec3
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 }

function angleToVertical(v: Vec3): number {
  const m = magnitude(v)
  if (m < 1e-6) return 90
  const c = Math.max(-1, Math.min(1, dot(v, WORLD_UP) / m))
  return (Math.acos(c) * 180) / Math.PI
}

/**
 * Single-frame raw classification (no smoothing). Prefer the stateful
 * `OrientationTracker` in live use — it adds hysteresis.
 */
export function classifyOrientation(lms: LandmarkSet): OrientationEstimate {
  const fallback: OrientationEstimate = {
    orientation: 'unknown', confidence: 0, trunkTilt: 0, is3D: false, spineUp: WORLD_UP,
  }

  const ls = worldVec(lms[LM.L_SHOULDER]), rs = worldVec(lms[LM.R_SHOULDER])
  const lh = worldVec(lms[LM.L_HIP]),      rh = worldVec(lms[LM.R_HIP])
  if (!ls || !rs || !lh || !rh) return fallback   // need world coords for a real call

  const midSh = midpoint(ls, rs)
  const midHp = midpoint(lh, rh)
  const spine = sub(midSh, midHp)              // hip → shoulder
  const spineUp = normalize(spine)
  const trunkTilt = angleToVertical(spine)

  // Shoulder line verticality — only high when shoulders are stacked (side-lying).
  const shoulderLine = sub(rs, ls)
  const slMag = magnitude(shoulderLine) + 1e-9
  const lateralVert = Math.abs(shoulderLine.y) / slMag

  // Thigh verticality (average of both legs when knees are visible).
  const lk = worldVec(lms[LM.L_KNEE]), rk = worldVec(lms[LM.R_KNEE])
  let thighDown = 0
  let haveThigh = false
  {
    const parts: number[] = []
    if (lk) parts.push(-normalize(sub(lk, lh)).y)   // -y because down = -up
    if (rk) parts.push(-normalize(sub(rk, rh)).y)
    if (parts.length) { thighDown = parts.reduce((a, b) => a + b, 0) / parts.length; haveThigh = true }
  }

  let orientation: BodyOrientation
  let downSide: 'L' | 'R' | undefined
  let confidence: number

  if (trunkTilt < 38) {
    // Upright trunk → standing or seated. Distinguish by the thighs:
    // standing thighs hang down (thighDown ≈ 1); seated thighs are flat
    // (thighDown ≈ 0) with the knee roughly level with the hip.
    if (haveThigh && thighDown < 0.45) {
      orientation = 'seated'
      confidence  = 0.6 + 0.4 * (1 - thighDown)
    } else {
      orientation = 'standing'
      confidence  = 0.7 + 0.3 * Math.min(1, thighDown)
    }
  } else if (trunkTilt > 55) {
    // Lying down. Side-lying when the shoulders are stacked vertically.
    if (lateralVert > 0.55) {
      orientation = 'side_lying'
      // The lower (more negative y) shoulder is the one against the floor.
      downSide = ls.y < rs.y ? 'L' : 'R'
      confidence = 0.5 + 0.5 * lateralVert
    } else {
      // Supine vs prone: use the chest-normal (anterior axis) sign.
      // anterior = spine × shoulderLine; if it points up (+y) the chest
      // faces up → supine, else prone. Depth (z) is noisy so confidence
      // is modest, but supine/prone share the same plane geometry anyway.
      const anterior = normalize({
        x: spineUp.y * normalize(shoulderLine).z - spineUp.z * normalize(shoulderLine).y,
        y: spineUp.z * normalize(shoulderLine).x - spineUp.x * normalize(shoulderLine).z,
        z: spineUp.x * normalize(shoulderLine).y - spineUp.y * normalize(shoulderLine).x,
      })
      orientation = anterior.y >= 0 ? 'supine' : 'prone'
      confidence  = 0.45
    }
  } else {
    // Transition / reclined zone — ambiguous; let the tracker hold the
    // previous label. Report seated as the neutral middle guess.
    orientation = 'seated'
    confidence  = 0.3
  }

  return { orientation, downSide, confidence, trunkTilt, is3D: true, spineUp }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stateful tracker with hysteresis
//
//  A new orientation must be observed on STABLE_FRAMES consecutive frames
//  before it replaces the current one. This stops the label oscillating while
//  the user transitions (e.g. sitting down, rolling onto their side).
// ─────────────────────────────────────────────────────────────────────────────

const STABLE_FRAMES = 8

export class OrientationTracker {
  private current: OrientationEstimate = {
    orientation: 'unknown', confidence: 0, trunkTilt: 0, is3D: false, spineUp: WORLD_UP,
  }
  private candidate: BodyOrientation = 'unknown'
  private candidateCount = 0

  update(lms: LandmarkSet): OrientationEstimate {
    const raw = classifyOrientation(lms)
    if (!raw.is3D) return this.current   // keep last good estimate on bad frames

    if (raw.orientation === this.current.orientation) {
      this.candidateCount = 0
      this.current = raw                 // refresh metrics, keep label
      return this.current
    }
    if (raw.orientation === this.candidate) {
      this.candidateCount += 1
    } else {
      this.candidate = raw.orientation
      this.candidateCount = 1
    }
    // Switch faster when confidence is high; require full dwell otherwise.
    const needed = raw.confidence > 0.75 ? Math.ceil(STABLE_FRAMES / 2) : STABLE_FRAMES
    if (this.candidateCount >= needed || this.current.orientation === 'unknown') {
      this.current = raw
      this.candidateCount = 0
    } else {
      // Hold previous label but keep live metrics (tilt, spine) fresh.
      this.current = { ...this.current, trunkTilt: raw.trunkTilt, spineUp: raw.spineUp }
    }
    return this.current
  }

  get(): OrientationEstimate { return this.current }
  reset(): void {
    this.current = { orientation: 'unknown', confidence: 0, trunkTilt: 0, is3D: false, spineUp: WORLD_UP }
    this.candidate = 'unknown'
    this.candidateCount = 0
  }
}

/** True when the trunk is upright enough to treat the spine as "up". */
export function isUpright(o: BodyOrientation): boolean {
  return o === 'standing' || o === 'seated'
}
