/**
 * bodyScan.ts
 *
 * Turns a few seconds of webcam pose into an HONEST body read. A single camera
 * cannot measure body fat the way a DEXA scan does, and we never pretend it
 * can — every composition number ships with an explicit range and a confidence
 * score, and the geometry we trust most (segment symmetry, posture, build
 * ratios) comes straight from the pose landmarks, not a guess.
 *
 * Pipeline
 * ────────
 *   1. The UI captures ~20 frames in a front A-pose and ~20 in a side pose.
 *   2. We take the MEDIAN landmark position per joint (kills jitter/outliers).
 *   3. Front pose  → shoulder/hip widths, L/R segment symmetry, lateral tilt.
 *      Side  pose  → forward-head posture.
 *   4. Composition → BMI drives a population body-fat estimate (Deurenberg
 *      1991), which the camera's build read then nudges (muscular V-tapers
 *      carry more BMI as muscle, not fat), yielding an estimate + range.
 *
 * The output is exactly the `BodyComposition` + `BodyScanMetrics` the profile
 * stores, so saving is a straight assignment.
 */

import { LM } from '../movement/landmarks'
import type { LandmarkSet, Landmark } from '../movement/landmarks'
import type { Sex } from '../movement/bodySegments'
import type {
  BodyComposition, BodyScanMetrics, BuildClass,
} from './userProfile'
import type { SymmetryRegion } from '../insights/symmetry'

export interface BodyScanInput {
  heightCm: number
  weightKg: number
  sex:      Sex
  ageYears: number | null
}

export interface BodyScanResult {
  composition: BodyComposition
  scan:        BodyScanMetrics
  /** True if there were enough good frames to produce a usable read. */
  ok:          boolean
  /** Plain-language note shown under the result (always sets expectations). */
  note:        string
}

// ── Landmark math ────────────────────────────────────────────────────────────

function median(xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Median landmark position (x,y,z,visibility) across frames, per index. */
function medianPose(frames: LandmarkSet[]): LandmarkSet {
  const out: LandmarkSet = []
  const n = frames[0]?.length ?? 33
  for (let i = 0; i < n; i++) {
    const xs: number[] = [], ys: number[] = [], zs: number[] = [], vs: number[] = []
    for (const f of frames) {
      const p = f[i]
      if (!p) continue
      xs.push(p.x); ys.push(p.y); zs.push(p.z); vs.push(p.visibility ?? 0)
    }
    out[i] = { x: median(xs), y: median(ys), z: median(zs), visibility: median(vs) }
  }
  return out
}

function dist2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function vis(p?: Landmark): number { return p?.visibility ?? 0 }

// ── Composition heuristics ───────────────────────────────────────────────────

/** Deurenberg (1991) population body-fat estimate from BMI/age/sex. */
function deurenbergBF(bmi: number, age: number, sexMale: boolean): number {
  return 1.20 * bmi + 0.23 * age - 10.8 * (sexMale ? 1 : 0) - 5.4
}

function classifyBuild(bmi: number, shoulderHipRatio: number | null, sexMale: boolean): BuildClass {
  const vTaper = shoulderHipRatio != null && shoulderHipRatio >= (sexMale ? 1.38 : 1.18)
  if (bmi < 19) return 'lean'
  if (bmi < 25) return vTaper ? 'athletic' : 'average'
  if (bmi < 30) return vTaper ? 'solid' : 'average'
  return 'heavy'
}

/** Map fat-free-mass index to a 0..1 muscularity proxy (natural ~16..25). */
function muscleIndexFromFFMI(ffmi: number): number {
  return Math.max(0, Math.min(1, (ffmi - 16) / 9))
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function analyzeBodyScan(
  frontFrames: LandmarkSet[],
  sideFrames: LandmarkSet[],
  input: BodyScanInput,
): BodyScanResult {
  const blankComp: BodyComposition = {
    bodyFatPct: null, bodyFatLow: null, bodyFatHigh: null,
    leanMassKg: null, muscleIndex: null, build: null, confidence: 0, method: null,
  }
  const blankScan: BodyScanMetrics = {
    shoulderHipRatio: null, torsoHeightRatio: null,
    symmetry: null, asymRegion: null, posture: null, capturedAt: Date.now(),
  }

  if (frontFrames.length < 5) {
    return { composition: blankComp, scan: blankScan, ok: false,
      note: 'Not enough clear frames — make sure your whole body is in frame and try again.' }
  }

  const front = medianPose(frontFrames)
  const ls = front[LM.L_SHOULDER], rs = front[LM.R_SHOULDER]
  const lh = front[LM.L_HIP],      rh = front[LM.R_HIP]

  // ── Front-pose geometry ─────────────────────────────────────────────────
  const shoulderW = dist2D(ls, rs)
  const hipW      = dist2D(lh, rh)
  const midSh     = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: 0, visibility: 1 }
  const midHip    = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: 0, visibility: 1 }
  const torsoH    = Math.max(1e-4, dist2D(midSh, midHip))

  const shoulderHipRatio = hipW > 1e-4 ? shoulderW / hipW : null
  // Apparent torso width (shoulder) vs the full standing span (shoulder→ankle)
  // — a centroid-of-mass / stockiness proxy.
  const la = front[LM.L_ANKLE], ra = front[LM.R_ANKLE]
  const ankleY = (vis(la) > 0.3 && vis(ra) > 0.3) ? (la.y + ra.y) / 2 : null
  const standSpan = ankleY != null ? Math.max(1e-4, ankleY - midSh.y) : null
  const torsoHeightRatio = standSpan ? shoulderW / standSpan : null

  // ── Left/right segment symmetry ─────────────────────────────────────────
  const segLen = (a?: Landmark, b?: Landmark): number | null =>
    (a && b && vis(a) > 0.4 && vis(b) > 0.4) ? dist2D(a, b) : null
  const pairs: Array<{ region: SymmetryRegion; l: number | null; r: number | null }> = [
    { region: 'left_elbow',  l: segLen(front[LM.L_SHOULDER], front[LM.L_ELBOW]), r: segLen(front[LM.R_SHOULDER], front[LM.R_ELBOW]) },
    { region: 'left_elbow',  l: segLen(front[LM.L_ELBOW], front[LM.L_WRIST]),    r: segLen(front[LM.R_ELBOW], front[LM.R_WRIST]) },
    { region: 'left_knee',   l: segLen(front[LM.L_HIP], front[LM.L_KNEE]),       r: segLen(front[LM.R_HIP], front[LM.R_KNEE]) },
    { region: 'left_knee',   l: segLen(front[LM.L_KNEE], front[LM.L_ANKLE]),     r: segLen(front[LM.R_KNEE], front[LM.R_ANKLE]) },
  ]
  let asymSum = 0, asymCount = 0, worstAsym = 0
  let asymRegion: SymmetryRegion | null = null
  for (const p of pairs) {
    if (p.l == null || p.r == null) continue
    const m = Math.max(p.l, p.r, 1e-4)
    const d = Math.abs(p.l - p.r) / m
    asymSum += d; asymCount += 1
    if (d > worstAsym) { worstAsym = d; asymRegion = p.region }
  }
  const symmetry = asymCount ? Math.max(0, 1 - asymSum / asymCount) : null
  // Only surface an asymmetric region if it's beyond noise (~6%).
  if (worstAsym < 0.06) asymRegion = null

  // Lateral tilt (front pose): L vs R height, as a fraction of torso height.
  const shoulderTilt = Math.abs(ls.y - rs.y) / torsoH
  const hipTilt      = Math.abs(lh.y - rh.y) / torsoH

  // ── Side-pose posture (forward head) ────────────────────────────────────
  let forwardHead = false
  if (sideFrames.length >= 5) {
    const side = medianPose(sideFrames)
    // Use whichever ear/shoulder is most visible (the camera-facing side).
    const earL = side[LM.L_EAR], earR = side[LM.R_EAR]
    const shL = side[LM.L_SHOULDER], shR = side[LM.R_SHOULDER]
    const useL = vis(earL) + vis(shL) >= vis(earR) + vis(shR)
    const ear = useL ? earL : earR
    const sh  = useL ? shL : shR
    const hip = useL ? side[LM.L_HIP] : side[LM.R_HIP]
    if (vis(ear) > 0.3 && vis(sh) > 0.3 && vis(hip) > 0.3) {
      const sideTorso = Math.max(1e-4, Math.abs(sh.y - hip.y))
      // Ear horizontally ahead of the shoulder by >12% of torso height reads
      // as a forward-head carriage.
      forwardHead = Math.abs(ear.x - sh.x) / sideTorso > 0.12
    }
  }

  // ── Composition ─────────────────────────────────────────────────────────
  const hM = input.heightCm / 100
  const bmi = input.weightKg / Math.max(0.25, hM * hM)
  const ageForBF = input.ageYears ?? 35
  const sexMale = input.sex === 'male'
  const build = classifyBuild(bmi, shoulderHipRatio, sexMale)

  let bf = deurenbergBF(bmi, ageForBF, sexMale)
  // Camera build correction: a muscular V-taper means BMI overstates fat.
  if (build === 'athletic') bf -= 3.5
  else if (build === 'solid') bf -= 1.5
  else if (build === 'lean') bf -= 0.5
  bf = Math.max(4, Math.min(55, bf))

  // Confidence: camera-only is modest; age input and a clean side pose help.
  let confidence = 0.42
  if (input.ageYears != null) confidence += 0.10
  if (sideFrames.length >= 5) confidence += 0.05
  if (symmetry != null) confidence += 0.03
  confidence = Math.min(0.62, confidence)

  // Range widens as confidence falls (±4% best case … ±8% weak).
  const half = 4 + (1 - confidence) * 8
  const bodyFatLow  = Math.max(3, bf - half)
  const bodyFatHigh = Math.min(60, bf + half)

  const leanMassKg = input.weightKg * (1 - bf / 100)
  const ffmi = leanMassKg / Math.max(0.25, hM * hM)
  const muscleIndex = muscleIndexFromFFMI(ffmi)

  const composition: BodyComposition = {
    bodyFatPct: +bf.toFixed(1),
    bodyFatLow: +bodyFatLow.toFixed(1),
    bodyFatHigh: +bodyFatHigh.toFixed(1),
    leanMassKg: +leanMassKg.toFixed(1),
    muscleIndex: +muscleIndex.toFixed(2),
    build,
    confidence: +confidence.toFixed(2),
    method: 'camera',
  }

  const scan: BodyScanMetrics = {
    shoulderHipRatio: shoulderHipRatio != null ? +shoulderHipRatio.toFixed(2) : null,
    torsoHeightRatio: torsoHeightRatio != null ? +torsoHeightRatio.toFixed(3) : null,
    symmetry: symmetry != null ? +symmetry.toFixed(2) : null,
    asymRegion,
    posture: {
      forwardHead,
      shoulderTilt: +shoulderTilt.toFixed(3),
      hipTilt: +hipTilt.toFixed(3),
    },
    capturedAt: Date.now(),
  }

  return {
    composition, scan, ok: true,
    note: 'This is a camera estimate, not a medical measurement — use the range, not the single number. A tape measure or DEXA scan is more precise.',
  }
}
