/**
 * gait.ts
 *
 * Dynamic-ankle (walking) analysis — the engine behind the "Ankle Dynamics"
 * panel.  Unlike the static ROM tests in movements.ts (single peak hold), this
 * captures a *time series* while the user walks toward / away from the camera
 * and derives the metrics that matter for a sagittal-plane ankle exo such as
 * the Dephy device:
 *
 *   • Left + right ankle angle (shank↔foot) over the whole walk
 *   • Min / max / excursion (total sagittal ROM) per foot
 *   • Shank (tibia) inclination from vertical per foot
 *   • Step count + cadence
 *   • An ESTIMATED walking speed (metres / second) derived from world-space
 *     step length × cadence
 *
 * Everything here is pure / DOM-light so it is easy to reason about and test:
 *   - measureGaitFrame(lms)      → per-frame angles (both feet) + step signals
 *   - GaitStepMachine            → per-foot gait finite-state step counter
 *   - summariseGait(samples,…)   → headline metrics
 *   - buildGaitCsv(...)          → CSV string (summary header + per-frame rows)
 *   - renderGaitPlot(canvas,...) → draws the two-panel PNG plot
 *
 * Ankle angle convention  (IMPORTANT — accuracy)
 * ──────────────────────────────────────────────
 * The walking test is filmed SIDE-ON (phone on the floor, person in profile),
 * so the camera's image plane IS the sagittal plane.  That means a plain 2-D
 * image-space angle is the correct ankle angle — and it avoids MediaPipe's
 * very noisy depth (z), which previously made the 3-D angle jump around.
 *
 * We build two lines, exactly as a clinician would with a goniometer:
 *     shank line  =  KNEE → ANKLE
 *     foot  line  =  ANKLE → TOE (foot index)
 * and take the angle between them in the image plane.  We then subtract the
 * neutral standing value captured during calibration, so the reported angle is
 * relative to neutral:  + = DORSIFLEXION (toes up), − = PLANTARFLEXION (toes
 * down / push-off).  Excursion (max − min) is the total sagittal sweep per
 * stride — normally ~25–35°.
 */

import type { LandmarkSet } from './landmarks'
import { LM } from './landmarks'
import { worldVec } from './anatomicalFrame'

// Visibility floor for a foot to count this frame.  Very lenient because at a
// wide FOV with the phone on the floor the subject is small/far and the
// far-side leg is partly occluded — the heavy model still localises the joints
// usefully well below the 0.5 floor used for the close-up still ROM tests.
const FOOT_MIN_VIS = 0.25

export interface GaitFrameMetrics {
  /** Left ankle angle (deg, image-plane shank↔foot) or null when untrackable. */
  leftAnkle:  number | null
  rightAnkle: number | null
  /** Shank inclination from vertical (deg, image plane). */
  leftShank:  number | null
  rightShank: number | null
  /** Normalised ankle-to-ankle separation (image space) — legacy step signal. */
  ankleSep:   number
  /** World-space horizontal ankle separation (metres) — step-length proxy. */
  stepLenM:   number | null
  /** Image-x of each ankle + hip centre, and leg length (image) — feed the
   *  gait step machine. null when that foot isn't trackable. */
  leftAnkleX:  number | null
  rightAnkleX: number | null
  hipX:        number
  legLen:      number
  leftVis:    number
  rightVis:   number
}

/** One recorded frame of the walk. */
export interface GaitSample {
  t:          number          // seconds since "GO"
  leg:        'out' | 'back'  // walking away vs back toward camera
  leftAnkle:  number | null
  rightAnkle: number | null
  leftShank:  number | null
  rightShank: number | null
  speed:      number | null   // instantaneous estimated speed (m/s), filled later
}

export interface GaitSummary {
  left:  AnkleStats
  right: AnkleStats
  steps:        number
  durationSec:  number
  cadenceSpm:   number        // steps per minute
  stepLengthM:  number | null // median world step length
  speedMps:     number | null // estimated walking speed
  symmetryPct:  number | null // L vs R excursion symmetry (100 = identical)
}

export interface AnkleStats {
  min:       number | null
  max:       number | null
  excursion: number | null    // max − min
  mean:      number | null    // mean ankle angle (rel. neutral)
  sd:        number | null    // standard deviation of the ankle angle
  meanShank: number | null
  samples:   number
}

// ─────────────────────────────────────────────────────────────────────────────
//  Per-frame measurement
// ─────────────────────────────────────────────────────────────────────────────

/** Angle (deg, 0..180) between 2-D vectors u and v. */
function angle2D(ux: number, uy: number, vx: number, vy: number): number {
  const du = Math.hypot(ux, uy), dv = Math.hypot(vx, vy)
  if (du < 1e-6 || dv < 1e-6) return 0
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (du * dv)))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Image-plane ankle angle for one leg = angle between the shank line
 * (knee→ankle) and the foot line (ankle→toe).  At neutral standing this is
 * ~70–95°; it INCREASES with dorsiflexion (toe lifts toward shin) and
 * DECREASES with plantarflexion (toe drops, push-off), independent of which
 * way the walker faces.  Returns null if any of the three joints is missing.
 */
function ankleAngle2D(lms: LandmarkSet, knee: number, ankle: number, toe: number): number | null {
  const k = lms[knee], a = lms[ankle], t = lms[toe]
  if (!k || !a || !t) return null
  // shank = knee→ankle, foot = ankle→toe
  return angle2D(a.x - k.x, a.y - k.y, t.x - a.x, t.y - a.y)
}

/** Shank inclination from image-vertical (deg). Sign ignored — magnitude only,
 *  so it doesn't flip between the out/back laps. */
function shankInclination(lms: LandmarkSet, knee: number, ankle: number): number | null {
  const k = lms[knee], a = lms[ankle]
  if (!k || !a) return null
  const dx = a.x - k.x
  const dy = a.y - k.y
  if (Math.abs(dy) < 1e-4 && Math.abs(dx) < 1e-4) return null
  // angle of the shank from straight-down (vertical).
  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI)
}

/**
 * Compute both ankles' angles + the step-detection signals for one frame.
 * Returns nulls for a foot whose landmarks are below the visibility floor.
 */
export function measureGaitFrame(lms: LandmarkSet): GaitFrameMetrics {
  const lVis = Math.min(
    lms[LM.L_KNEE]?.visibility ?? 0,
    lms[LM.L_ANKLE]?.visibility ?? 0,
    lms[LM.L_FOOT_IDX]?.visibility ?? 0,
  )
  const rVis = Math.min(
    lms[LM.R_KNEE]?.visibility ?? 0,
    lms[LM.R_ANKLE]?.visibility ?? 0,
    lms[LM.R_FOOT_IDX]?.visibility ?? 0,
  )

  const leftAnkle  = lVis >= FOOT_MIN_VIS ? ankleAngle2D(lms, LM.L_KNEE, LM.L_ANKLE, LM.L_FOOT_IDX) : null
  const rightAnkle = rVis >= FOOT_MIN_VIS ? ankleAngle2D(lms, LM.R_KNEE, LM.R_ANKLE, LM.R_FOOT_IDX) : null

  const leftShank  = lVis >= FOOT_MIN_VIS ? shankInclination(lms, LM.L_KNEE, LM.L_ANKLE) : null
  const rightShank = rVis >= FOOT_MIN_VIS ? shankInclination(lms, LM.R_KNEE, LM.R_ANKLE) : null

  // Image-space ankle separation — legacy step signal.
  const la = lms[LM.L_ANKLE], ra = lms[LM.R_ANKLE]
  const ankleSep = la && ra ? Math.hypot(la.x - ra.x, la.y - ra.y) : 0

  // World-space horizontal (ground-plane) ankle separation in metres — used
  // as a step-length proxy at peak stride.
  let stepLenM: number | null = null
  const laW = worldVec(la), raW = worldVec(ra)
  if (laW && raW) stepLenM = Math.hypot(laW.x - raW.x, laW.z - raW.z)

  // Step-machine inputs (image space).
  const leftAnkleX  = (la && (la.visibility ?? 0) >= FOOT_MIN_VIS) ? la.x : null
  const rightAnkleX = (ra && (ra.visibility ?? 0) >= FOOT_MIN_VIS) ? ra.x : null
  const lh = lms[LM.L_HIP], rh = lms[LM.R_HIP]
  const hipX = ((lh?.x ?? 0.5) + (rh?.x ?? 0.5)) / 2
  const hipY = ((lh?.y ?? 0.5) + (rh?.y ?? 0.5)) / 2
  const ankY = ((la?.y ?? hipY) + (ra?.y ?? hipY)) / 2
  const legLen = Math.max(0.05, Math.abs(ankY - hipY))

  return {
    leftAnkle, rightAnkle, leftShank, rightShank, ankleSep, stepLenM,
    leftAnkleX, rightAnkleX, hipX, legLen, leftVis: lVis, rightVis: rVis,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Gait step machine — per-foot finite-state step counter
//
//  Models real gait: each foot alternates SWING (moving forward) and STANCE
//  (planted).  We track each foot's FORWARD position relative to the hips,
//  oriented by the walking direction:
//
//      fwd = walkDir · (ankleX − hipX)
//
//  During swing fwd rises (the foot moves ahead of the body); at heel-strike it
//  peaks; during stance it falls (the body advances past the planted foot).  A
//  STEP is one heel-strike, and heel-strikes must ALTERNATE feet — exactly the
//  "one leg swings and lands (1), the other toes-off, swings and lands (2)…"
//  pattern.  A per-foot peak with enough prominence, alternation, and a
//  refractory window makes the count robust to jitter.
// ─────────────────────────────────────────────────────────────────────────────

interface FootState {
  prev:    number
  rising:  boolean
  lastMin: number
  init:    boolean
}

export class GaitStepMachine {
  private L: FootState = { prev: 0, rising: false, lastMin: 0, init: false }
  private R: FootState = { prev: 0, rising: false, lastMin: 0, init: false }
  private lastFoot: 'L' | 'R' | null = null
  private lastT = -Infinity
  private steps = 0
  private stepLens: number[] = []

  /** Minimum seconds between successive heel strikes. */
  static readonly REFRACTORY = 0.30
  /** Peak prominence floor as a fraction of leg length (image), scale-invariant. */
  static readonly PROM_FRACTION = 0.16
  static readonly PROM_FLOOR = 0.012

  reset(): void {
    this.L = { prev: 0, rising: false, lastMin: 0, init: false }
    this.R = { prev: 0, rising: false, lastMin: 0, init: false }
    this.lastFoot = null
    this.lastT = -Infinity
  }

  /** Per-foot peak (heel-strike) detector. Returns the peak value or null. */
  private foot(s: FootState, f: number, prom: number): number | null {
    if (!s.init) { s.prev = f; s.lastMin = f; s.init = true; return null }
    let peak: number | null = null
    if (f > s.prev) {
      s.rising = true
    } else if (f < s.prev && s.rising) {
      s.rising = false
      if (s.prev - s.lastMin >= prom) peak = s.prev   // a prominent local max
      s.lastMin = s.prev                              // start a new descent
    }
    if (f < s.lastMin) s.lastMin = f
    s.prev = f
    return peak
  }

  /**
   * Push one frame. Returns the new step's foot, or null.
   * @param lx,rx   ankle image-x (null if that foot isn't tracked → skipped)
   * @param hipX    hip-centre image-x
   * @param walkDir +1 if walking screen left→right, −1 otherwise
   * @param t       seconds since GO
   * @param legLen  leg length (image) for a scale-invariant prominence floor
   * @param stepLenM world step-length proxy (metres | null)
   */
  push(
    lx: number | null, rx: number | null, hipX: number, walkDir: number,
    t: number, legLen: number, stepLenM: number | null,
  ): 'L' | 'R' | null {
    const prom = Math.max(GaitStepMachine.PROM_FLOOR, GaitStepMachine.PROM_FRACTION * legLen)
    const pL = lx != null ? this.foot(this.L, walkDir * (lx - hipX), prom) : null
    const pR = rx != null ? this.foot(this.R, walkDir * (rx - hipX), prom) : null

    // Resolve heel-strike events with alternation + refractory.
    const candidates: Array<'L' | 'R'> = []
    if (pL != null) candidates.push('L')
    if (pR != null) candidates.push('R')
    for (const foot of candidates) {
      if (t - this.lastT < GaitStepMachine.REFRACTORY) continue
      if (this.lastFoot !== null && foot === this.lastFoot) continue  // must alternate
      this.steps += 1
      this.lastFoot = foot
      this.lastT = t
      if (stepLenM != null && stepLenM > 0) this.stepLens.push(stepLenM)
      return foot
    }
    return null
  }

  count(): number { return this.steps }

  /** Median peak step length (metres) across all detected steps, or null. */
  medianStepLength(): number | null {
    if (this.stepLens.length === 0) return null
    const s = [...this.stepLens].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────────────────────────────────────

function statsFor(vals: Array<number | null>, shanks: Array<number | null>): AnkleStats {
  const a = vals.filter((v): v is number => v != null)
  const sh = shanks.filter((v): v is number => v != null)
  if (a.length === 0) return { min: null, max: null, excursion: null, mean: null, sd: null, meanShank: null, samples: 0 }
  // Trim the most extreme 5% each end so a single bad frame doesn't blow up
  // the excursion.
  const sorted = [...a].sort((x, y) => x - y)
  const lo = sorted[Math.floor(sorted.length * 0.05)]
  const hi = sorted[Math.ceil(sorted.length * 0.95) - 1]
  const mean = a.reduce((s, v) => s + v, 0) / a.length
  const variance = a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / a.length
  const sd = Math.sqrt(variance)
  const meanShank = sh.length ? sh.reduce((s, v) => s + v, 0) / sh.length : null
  return {
    min: Math.round(lo),
    max: Math.round(hi),
    excursion: Math.round(hi - lo),
    mean: Math.round(mean),
    sd: Math.round(sd),
    meanShank: meanShank == null ? null : Math.round(meanShank),
    samples: a.length,
  }
}

export function summariseGait(
  samples: GaitSample[],
  steps: number,
  stepLengthM: number | null,
): GaitSummary {
  const left  = statsFor(samples.map((s) => s.leftAnkle),  samples.map((s) => s.leftShank))
  const right = statsFor(samples.map((s) => s.rightAnkle), samples.map((s) => s.rightShank))

  const durationSec = samples.length ? samples[samples.length - 1].t - samples[0].t : 0
  const cadenceSpm  = durationSec > 0 ? (steps / durationSec) * 60 : 0
  // speed = step length (m) × steps per second.
  const speedMps = stepLengthM != null && durationSec > 0
    ? stepLengthM * (steps / durationSec)
    : null

  let symmetryPct: number | null = null
  if (left.excursion != null && right.excursion != null) {
    const m = Math.max(left.excursion, right.excursion)
    symmetryPct = m > 0 ? Math.round((1 - Math.abs(left.excursion - right.excursion) / m) * 100) : 100
  }

  return {
    left, right, steps,
    durationSec: Math.round(durationSec * 10) / 10,
    cadenceSpm:  Math.round(cadenceSpm),
    stepLengthM: stepLengthM == null ? null : Math.round(stepLengthM * 100) / 100,
    speedMps:    speedMps == null ? null : Math.round(speedMps * 100) / 100,
    symmetryPct,
  }
}

/** Fill each sample's instantaneous speed estimate for the plot. */
export function fillInstantaneousSpeed(samples: GaitSample[], stepLengthM: number | null): void {
  if (stepLengthM == null) return
  // Crude: instantaneous speed ∝ how fast the ankle angle is sweeping — use a
  // short-window angular speed of whichever foot is tracked, scaled so its
  // average matches the global mean. Good enough for a qualitative trace.
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 2)]
    const b = samples[Math.min(samples.length - 1, i + 2)]
    const dt = b.t - a.t
    const ang = (v: GaitSample) => v.leftAnkle ?? v.rightAnkle
    const va = ang(a), vb = ang(b)
    if (va != null && vb != null && dt > 0) {
      samples[i].speed = Math.abs(vb - va) / dt   // deg/s proxy
    } else {
      samples[i].speed = null
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CSV
// ─────────────────────────────────────────────────────────────────────────────

export function buildGaitCsv(samples: GaitSample[], summary: GaitSummary): string {
  const fmt = (v: number | null) => (v == null ? '' : String(Math.round(v * 100) / 100))
  const lines: string[] = []
  lines.push('# Dephy Ankle Dynamics — walking assessment')
  lines.push(`# generated,${new Date().toISOString()}`)
  lines.push('# angles are RELATIVE TO STANDING NEUTRAL (deg): + = dorsiflexion, - = plantarflexion')
  lines.push('#')
  lines.push('# SUMMARY')
  lines.push('# metric,left,right')
  lines.push(`# ankle_min_deg,${fmt(summary.left.min)},${fmt(summary.right.min)}`)
  lines.push(`# ankle_max_deg,${fmt(summary.left.max)},${fmt(summary.right.max)}`)
  lines.push(`# ankle_excursion_deg,${fmt(summary.left.excursion)},${fmt(summary.right.excursion)}`)
  lines.push(`# ankle_mean_deg,${fmt(summary.left.mean)},${fmt(summary.right.mean)}`)
  lines.push(`# ankle_sd_deg,${fmt(summary.left.sd)},${fmt(summary.right.sd)}`)
  lines.push(`# mean_shank_tilt_deg,${fmt(summary.left.meanShank)},${fmt(summary.right.meanShank)}`)
  lines.push(`# steps,${summary.steps}`)
  lines.push(`# duration_s,${summary.durationSec}`)
  lines.push(`# cadence_spm,${summary.cadenceSpm}`)
  lines.push(`# step_length_m,${fmt(summary.stepLengthM)}`)
  lines.push(`# walking_speed_mps,${fmt(summary.speedMps)}`)
  lines.push(`# excursion_symmetry_pct,${summary.symmetryPct ?? ''}`)
  lines.push('#')
  lines.push('time_s,leg,left_ankle_deg,right_ankle_deg,left_shank_deg,right_shank_deg')
  for (const s of samples) {
    lines.push([
      Math.round(s.t * 1000) / 1000,
      s.leg,
      fmt(s.leftAnkle),
      fmt(s.rightAnkle),
      fmt(s.leftShank),
      fmt(s.rightShank),
    ].join(','))
  }
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
//  PNG plot
//
//  Two stacked panels on one canvas:
//   1. Left + right ankle angle vs time (with min/max guide lines)
//   2. Ankle angular speed proxy vs time + a metrics strip
// ─────────────────────────────────────────────────────────────────────────────

const COL = {
  bg:    '#0b1120',
  panel: '#0f172a',
  grid:  '#1e293b',
  axis:  '#64748b',
  text:  '#e2e8f0',
  sub:   '#94a3b8',
  left:  '#fb923c', // orange = left
  right: '#22d3ee', // cyan   = right
  speed: '#a3e635', // lime
}

export function renderGaitPlot(
  canvas: HTMLCanvasElement,
  samples: GaitSample[],
  summary: GaitSummary,
): void {
  const W = 1100, H = 620
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = COL.bg
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.fillStyle = COL.text
  ctx.font = 'bold 26px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('Ankle Dynamics — Walking Assessment', 40, 46)
  ctx.fillStyle = COL.sub
  ctx.font = '14px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(new Date().toLocaleString(), 40, 70)

  const tMin = samples.length ? samples[0].t : 0
  const tMax = samples.length ? samples[samples.length - 1].t : 1
  const tSpan = Math.max(0.001, tMax - tMin)

  // ── Panel 1: ankle angle ──────────────────────────────────────────────────
  const p1 = { x: 60, y: 100, w: W - 120, h: 330 }
  drawPanel(ctx, p1, 'Ankle angle during the walk  (sagittal plane)', 'degrees from standing neutral  ·  + dorsiflexion (toe up) / − plantarflexion (toe down)')

  const angVals = samples.flatMap((s) => [s.leftAnkle, s.rightAnkle]).filter((v): v is number => v != null)
  const aLo = Math.min(-5, angVals.length ? Math.min(...angVals) - 5 : -25)
  const aHi = Math.max(5, angVals.length ? Math.max(...angVals) + 5 : 25)
  drawYTicks(ctx, p1, aLo, aHi, 5)
  drawXTicks(ctx, p1, tMin, tMax)
  drawZeroLine(ctx, p1, aLo, aHi, 'neutral (0°)')
  // Shaded ±1 SD ribbon (rolling) behind each continuous line.
  plotRibbon(ctx, p1, samples, (s) => s.leftAnkle,  tMin, tSpan, aLo, aHi, COL.left)
  plotRibbon(ctx, p1, samples, (s) => s.rightAnkle, tMin, tSpan, aLo, aHi, COL.right)
  plotSeries(ctx, p1, samples, (s) => s.leftAnkle,  tMin, tSpan, aLo, aHi, COL.left)
  plotSeries(ctx, p1, samples, (s) => s.rightAnkle, tMin, tSpan, aLo, aHi, COL.right)
  legend(ctx, p1.x + p1.w - 240, p1.y + 18, [
    ['Left ankle',  COL.left],
    ['Right ankle', COL.right],
    ['Shaded = +/- 1 SD', COL.sub],
  ])

  // Time axis label under the single panel.
  ctx.fillStyle = COL.sub
  ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('Time (seconds)', p1.x + p1.w / 2 - 40, p1.y + p1.h + 8)

  // ── Metrics strip ──────────────────────────────────────────────────────────
  const y0 = 470
  ctx.fillStyle = COL.panel
  roundRect(ctx, 60, y0, W - 120, 96, 10)
  ctx.fill()
  ctx.strokeStyle = COL.grid
  ctx.stroke()

  const cells: Array<[string, string]> = [
    ['Left excursion',  summary.left.excursion  != null ? `${summary.left.excursion}°`  : '—'],
    ['Right excursion', summary.right.excursion != null ? `${summary.right.excursion}°` : '—'],
    ['Symmetry',        summary.symmetryPct != null ? `${summary.symmetryPct}%` : '—'],
    ['Steps',           String(summary.steps)],
    ['Cadence',         `${summary.cadenceSpm}/min`],
    ['Speed (est.)',    summary.speedMps != null ? `${summary.speedMps} m/s` : '—'],
  ]
  const cw = (W - 120) / cells.length
  cells.forEach(([label, val], i) => {
    const cx = 60 + i * cw + 18
    ctx.fillStyle = COL.sub
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(label, cx, y0 + 34)
    ctx.fillStyle = COL.text
    ctx.font = 'bold 24px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(val, cx, y0 + 66)
    if (i > 0) {
      ctx.strokeStyle = COL.grid
      ctx.beginPath(); ctx.moveTo(60 + i * cw, y0 + 14); ctx.lineTo(60 + i * cw, y0 + 82); ctx.stroke()
    }
  })

  ctx.fillStyle = COL.sub
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(
    'Sagittal-plane estimate from a single camera. Excursion = total ankle sweep per stride. Speed is an estimate (step length × cadence).',
    40, H - 14,
  )
}

// ── plot helpers ─────────────────────────────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

function drawPanel(ctx: CanvasRenderingContext2D, r: Rect, title: string, unit: string) {
  ctx.fillStyle = COL.panel
  roundRect(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.fill()
  ctx.strokeStyle = COL.grid
  ctx.stroke()
  ctx.fillStyle = COL.text
  ctx.font = 'bold 16px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(title, r.x + 14, r.y + 24)
  ctx.fillStyle = COL.sub
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(unit, r.x + 14, r.y + 42)
}

function drawYTicks(ctx: CanvasRenderingContext2D, r: Rect, lo: number, hi: number, n: number) {
  const top = r.y + 48, bot = r.y + r.h - 30
  ctx.font = '11px ui-monospace, monospace'
  for (let i = 0; i <= n; i++) {
    const frac = i / n
    const y = bot - frac * (bot - top)
    const val = lo + frac * (hi - lo)
    ctx.strokeStyle = COL.grid
    ctx.beginPath(); ctx.moveTo(r.x + 44, y); ctx.lineTo(r.x + r.w - 14, y); ctx.stroke()
    ctx.fillStyle = COL.axis
    ctx.fillText(String(Math.round(val)), r.x + 14, y + 4)
  }
}

/** Emphasised horizontal line at value 0 (neutral) with a label. */
function drawZeroLine(ctx: CanvasRenderingContext2D, r: Rect, lo: number, hi: number, label: string) {
  if (0 < lo || 0 > hi) return
  const top = r.y + 48, bot = r.y + r.h - 30
  const y = bot - ((0 - lo) / (hi - lo)) * (bot - top)
  ctx.strokeStyle = COL.sub
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 4])
  ctx.beginPath(); ctx.moveTo(r.x + 44, y); ctx.lineTo(r.x + r.w - 14, y); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = COL.sub
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(label, r.x + 48, y - 4)
}

function drawXTicks(ctx: CanvasRenderingContext2D, r: Rect, tMin: number, tMax: number) {
  const left = r.x + 44, right = r.x + r.w - 14, bot = r.y + r.h - 30
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COL.axis
  const n = 6
  for (let i = 0; i <= n; i++) {
    const frac = i / n
    const x = left + frac * (right - left)
    const t = tMin + frac * (tMax - tMin)
    ctx.fillText(`${t.toFixed(1)}s`, x - 10, bot + 18)
  }
}

function plotSeries(
  ctx: CanvasRenderingContext2D, r: Rect, samples: GaitSample[],
  pick: (s: GaitSample) => number | null,
  tMin: number, tSpan: number, lo: number, hi: number, color: string,
) {
  const left = r.x + 44, right = r.x + r.w - 14, top = r.y + 48, bot = r.y + r.h - 30
  const sx = (t: number) => left + ((t - tMin) / tSpan) * (right - left)
  const sy = (v: number) => bot - ((v - lo) / (hi - lo)) * (bot - top)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.beginPath()
  let pen = false
  for (const s of samples) {
    const v = pick(s)
    if (v == null) { pen = false; continue }
    const x = sx(s.t), y = sy(v)
    if (!pen) { ctx.moveTo(x, y); pen = true } else { ctx.lineTo(x, y) }
  }
  ctx.stroke()
}

/**
 * Rolling ±1 SD ribbon for one foot: at each sample, the mean and standard
 * deviation are computed over a short time window, and the band [mean−sd,
 * mean+sd] is filled.  Drawn behind the raw line so you see both the continuous
 * measurement and its variability.
 */
function plotRibbon(
  ctx: CanvasRenderingContext2D, r: Rect, samples: GaitSample[],
  pick: (s: GaitSample) => number | null,
  tMin: number, tSpan: number, lo: number, hi: number, color: string,
  windowSec = 0.5,
) {
  const left = r.x + 44, right = r.x + r.w - 14, top = r.y + 48, bot = r.y + r.h - 30
  const sx = (t: number) => left + ((t - tMin) / tSpan) * (right - left)
  const sy = (v: number) => bot - ((v - lo) / (hi - lo)) * (bot - top)

  // Pre-extract (t, v) for tracked frames.
  const pts: Array<{ t: number; v: number }> = []
  for (const s of samples) { const v = pick(s); if (v != null) pts.push({ t: s.t, v }) }
  if (pts.length < 3) return

  // Rolling mean/SD → band edges, broken into contiguous runs.
  type Band = { x: number; topY: number; botY: number }
  const runs: Band[][] = []
  let run: Band[] = []
  for (let i = 0; i < pts.length; i++) {
    const t0 = pts[i].t
    let sum = 0, sum2 = 0, n = 0
    for (let j = i; j >= 0 && t0 - pts[j].t <= windowSec; j--) { sum += pts[j].v; sum2 += pts[j].v * pts[j].v; n++ }
    for (let j = i + 1; j < pts.length && pts[j].t - t0 <= windowSec; j++) { sum += pts[j].v; sum2 += pts[j].v * pts[j].v; n++ }
    if (n < 2) { if (run.length) { runs.push(run); run = [] } continue }
    const m = sum / n
    const sd = Math.sqrt(Math.max(0, sum2 / n - m * m))
    run.push({ x: sx(t0), topY: sy(m + sd), botY: sy(m - sd) })
  }
  if (run.length) runs.push(run)

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = color
  for (const band of runs) {
    if (band.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(band[0].x, band[0].topY)
    for (let i = 1; i < band.length; i++) ctx.lineTo(band[i].x, band[i].topY)
    for (let i = band.length - 1; i >= 0; i--) ctx.lineTo(band[i].x, band[i].botY)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function legend(ctx: CanvasRenderingContext2D, x: number, y: number, items: Array<[string, string]>) {
  ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
  items.forEach(([label, color], i) => {
    const yy = y + i * 20
    ctx.fillStyle = color
    ctx.fillRect(x, yy - 9, 18, 4)
    ctx.fillStyle = COL.text
    ctx.fillText(label, x + 26, yy)
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

// ─────────────────────────────────────────────────────────────────────────────
//  Download helpers (browser)
// ─────────────────────────────────────────────────────────────────────────────

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadCanvasPng(filename: string, canvas: HTMLCanvasElement) {
  const url = canvas.toDataURL('image/png')
  triggerDownload(url, filename)
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
