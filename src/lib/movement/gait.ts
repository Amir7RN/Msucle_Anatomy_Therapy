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
 *   - measureGaitFrame(lms)      → per-frame angles (both feet)
 *   - StepDetector               → online step counter over the ankle-sep signal
 *   - summariseGait(samples,…)   → headline metrics
 *   - buildGaitCsv(...)          → CSV string (summary header + per-frame rows)
 *   - renderGaitPlot(canvas,...) → draws the two-panel PNG plot
 *
 * Ankle angle convention
 * ──────────────────────
 * We report the 3-D joint angle KNEE–ANKLE–FOOT_INDEX (rotation-invariant via
 * MediaPipe world landmarks).  Standing neutral ≈ 90–100°.  It DROPS toward
 * dorsiflexion (toes pulled up, swing phase) and RISES toward plantarflexion
 * (push-off).  The headline clinical number is the EXCURSION (max − min), the
 * total sagittal sweep the ankle goes through each stride — normally ~25–35°.
 */

import type { LandmarkSet } from './landmarks'
import { LM, jointAngleDeg } from './landmarks'
import {
  computeAnatomicalFrame, worldVec, sub, scale, signedAngleInPlane,
} from './anatomicalFrame'

// Visibility floor for a foot to count this frame.  Lenient (0.35) because the
// subject is far from the camera at the end of the walk — the heavy model still
// localises the joints well below the 0.5 floor used for the still ROM tests.
const FOOT_MIN_VIS = 0.35

export interface GaitFrameMetrics {
  /** Left ankle joint angle (deg) or null when the foot isn't trackable. */
  leftAnkle:  number | null
  rightAnkle: number | null
  /** Shank inclination from vertical (deg, + = ankle ahead of knee). */
  leftShank:  number | null
  rightShank: number | null
  /** Normalised ankle-to-ankle separation (image space) — drives step detect. */
  ankleSep:   number
  /** World-space horizontal ankle separation (metres) — step-length proxy. */
  stepLenM:   number | null
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
  meanShank: number | null
  samples:   number
}

// ─────────────────────────────────────────────────────────────────────────────
//  Per-frame measurement
// ─────────────────────────────────────────────────────────────────────────────

function shankInclination(lms: LandmarkSet, knee: number, ankle: number): number | null {
  const frame = computeAnatomicalFrame(lms, 0.3)
  const kn = worldVec(lms[knee])
  const an = worldVec(lms[ankle])
  if (frame && frame.is3D && kn && an) {
    // Shank vector knee→ankle (points roughly down). Signed tilt from the
    // body's "down" axis, in the sagittal plane (normal = lateral xAxis).
    const shank = sub(an, kn)
    const down  = scale(frame.yAxis, -1)
    return signedAngleInPlane(shank, down, frame.xAxis)
  }
  // 2-D fallback: tilt of the shank from image-vertical.
  const k = lms[knee], a = lms[ankle]
  if (!k || !a) return null
  const dx = a.x - k.x
  const dy = a.y - k.y // image y grows down → shank points down (dy>0)
  if (Math.abs(dy) < 1e-4) return null
  return (Math.atan2(dx, dy) * 180) / Math.PI
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

  const leftAnkle = lVis >= FOOT_MIN_VIS
    ? jointAngleDeg(lms[LM.L_KNEE], lms[LM.L_ANKLE], lms[LM.L_FOOT_IDX])
    : null
  const rightAnkle = rVis >= FOOT_MIN_VIS
    ? jointAngleDeg(lms[LM.R_KNEE], lms[LM.R_ANKLE], lms[LM.R_FOOT_IDX])
    : null

  const leftShank  = lVis >= FOOT_MIN_VIS ? shankInclination(lms, LM.L_KNEE, LM.L_ANKLE) : null
  const rightShank = rVis >= FOOT_MIN_VIS ? shankInclination(lms, LM.R_KNEE, LM.R_ANKLE) : null

  // Image-space ankle separation — robust step signal for both lateral and
  // toward/away walking (feet are together at midstance, apart at toe-off).
  const la = lms[LM.L_ANKLE], ra = lms[LM.R_ANKLE]
  const ankleSep = la && ra ? Math.hypot(la.x - ra.x, la.y - ra.y) : 0

  // World-space horizontal (ground-plane) ankle separation in metres — used
  // as a step-length proxy at peak stride.
  let stepLenM: number | null = null
  const laW = worldVec(la), raW = worldVec(ra)
  if (laW && raW) stepLenM = Math.hypot(laW.x - raW.x, laW.z - raW.z)

  return { leftAnkle, rightAnkle, leftShank, rightShank, ankleSep, stepLenM, leftVis: lVis, rightVis: rVis }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Online step detector
//
//  Peak-picks the ankle-separation signal: each local maximum above a dynamic
//  threshold (running mean + k·deviation), with a refractory window so a single
//  noisy frame can't double-count.  One peak ≈ one step.
// ─────────────────────────────────────────────────────────────────────────────

export class StepDetector {
  private mean = 0
  private dev  = 0
  private prev = 0
  private rising = false
  private lastStepT = -Infinity
  private peakStepLens: number[] = []
  private warm = 0

  /** Minimum seconds between steps (≈ 250 ms → max ~4 steps/s). */
  static readonly REFRACTORY = 0.28
  /** EMA smoothing for the adaptive baseline. */
  static readonly ALPHA = 0.05
  /** Peak must exceed mean by this × the running deviation. */
  static readonly K = 0.6

  /**
   * Push one frame. Returns true on the frame a new step is confirmed.
   * @param sep      ankle separation (image space)
   * @param t        seconds since GO
   * @param stepLenM world step-length proxy this frame (metres | null)
   */
  push(sep: number, t: number, stepLenM: number | null): boolean {
    // Update adaptive baseline.
    const d = Math.abs(sep - this.mean)
    this.mean += StepDetector.ALPHA * (sep - this.mean)
    this.dev  += StepDetector.ALPHA * (d - this.dev)
    this.warm += 1

    const threshold = this.mean + StepDetector.K * this.dev
    let detected = false

    // Local-maximum detection: was rising, now falling, above threshold.
    if (sep > this.prev) {
      this.rising = true
    } else if (sep < this.prev && this.rising) {
      this.rising = false
      // `this.prev` was the peak value.
      if (
        this.warm > 8 &&                         // let the baseline settle
        this.prev > threshold &&
        t - this.lastStepT >= StepDetector.REFRACTORY
      ) {
        detected = true
        this.lastStepT = t
        if (stepLenM != null && stepLenM > 0) this.peakStepLens.push(stepLenM)
      }
    }
    this.prev = sep
    return detected
  }

  /** Median peak step length (metres) across all detected steps, or null. */
  medianStepLength(): number | null {
    if (this.peakStepLens.length === 0) return null
    const s = [...this.peakStepLens].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────────────────────────────────────

function statsFor(vals: Array<number | null>, shanks: Array<number | null>): AnkleStats {
  const a = vals.filter((v): v is number => v != null)
  const sh = shanks.filter((v): v is number => v != null)
  if (a.length === 0) return { min: null, max: null, excursion: null, meanShank: null, samples: 0 }
  // Trim the most extreme 5% each end so a single bad frame doesn't blow up
  // the excursion.
  const sorted = [...a].sort((x, y) => x - y)
  const lo = sorted[Math.floor(sorted.length * 0.05)]
  const hi = sorted[Math.ceil(sorted.length * 0.95) - 1]
  const meanShank = sh.length ? sh.reduce((s, v) => s + v, 0) / sh.length : null
  return {
    min: Math.round(lo),
    max: Math.round(hi),
    excursion: Math.round(hi - lo),
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
  lines.push('#')
  lines.push('# SUMMARY')
  lines.push('# metric,left,right')
  lines.push(`# ankle_min_deg,${fmt(summary.left.min)},${fmt(summary.right.min)}`)
  lines.push(`# ankle_max_deg,${fmt(summary.left.max)},${fmt(summary.right.max)}`)
  lines.push(`# ankle_excursion_deg,${fmt(summary.left.excursion)},${fmt(summary.right.excursion)}`)
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
  const W = 1100, H = 760
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
  const p1 = { x: 60, y: 100, w: W - 120, h: 280 }
  drawPanel(ctx, p1, 'Ankle angle (shank ↔ foot)', '°')

  const angVals = samples.flatMap((s) => [s.leftAnkle, s.rightAnkle]).filter((v): v is number => v != null)
  const aLo = angVals.length ? Math.min(...angVals) - 5 : 60
  const aHi = angVals.length ? Math.max(...angVals) + 5 : 140
  drawYTicks(ctx, p1, aLo, aHi, 5)
  drawXTicks(ctx, p1, tMin, tMax)
  plotSeries(ctx, p1, samples, (s) => s.leftAnkle,  tMin, tSpan, aLo, aHi, COL.left)
  plotSeries(ctx, p1, samples, (s) => s.rightAnkle, tMin, tSpan, aLo, aHi, COL.right)
  legend(ctx, p1.x + p1.w - 230, p1.y + 18, [
    ['Left ankle',  COL.left],
    ['Right ankle', COL.right],
  ])

  // ── Panel 2: angular speed proxy ───────────────────────────────────────────
  const p2 = { x: 60, y: 420, w: W - 120, h: 180 }
  drawPanel(ctx, p2, 'Ankle angular speed (movement intensity)', '°/s')
  const spVals = samples.map((s) => s.speed).filter((v): v is number => v != null)
  const sHi = spVals.length ? Math.max(...spVals) * 1.15 + 1 : 100
  drawYTicks(ctx, p2, 0, sHi, 4)
  drawXTicks(ctx, p2, tMin, tMax)
  plotSeries(ctx, p2, samples, (s) => s.speed, tMin, tSpan, 0, sHi, COL.speed)

  // ── Metrics strip ──────────────────────────────────────────────────────────
  const y0 = 640
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
