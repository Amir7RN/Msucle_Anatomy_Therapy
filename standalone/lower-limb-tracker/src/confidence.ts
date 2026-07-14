/**
 * confidence.ts
 *
 * Small, dependency-free confidence utilities, extracted from a larger
 * biomechanical-constraints module. Deliberately does NOT bring over that
 * module's ROM-clamping helpers (`clampToRom`/`romFraction`) — those depend
 * on a full-body reference-ROM data file that has no bearing on an
 * ankle-only tracker.
 */

export interface ConfidenceInputs {
  /** Anatomical-frame/overall frame quality, 0..1. Default 1 when absent. */
  frameQuality?:     number
  /** Min landmark visibility across the measured chain, 0..1. */
  visibility:        number
  /** Depth-channel reliability (see anatomicalFrame.ts's depthReliability), 0..1. */
  depthReliability?: number
  /** Temporal stability, 0..1 (e.g. from MeasurementStabilizer, or a simple
   *  proxy such as "was this frame gap-filled/interpolated?"). */
  stability:         number
  /** True when the raw value had to be clamped/rejected — a strong signal
   *  of a tracking error, penalised heavily. */
  clamped?:          boolean
}

/**
 * Fuse the signals into a single 0..1 measurement confidence. Weighted so
 * visibility and stability dominate (they most directly predict error), with
 * a hard penalty when the value had to be clamped/rejected.
 */
export function measurementConfidence(inp: ConfidenceInputs): number {
  const fq = inp.frameQuality ?? 1
  const dr = inp.depthReliability ?? 0.6     // neutral when unknown
  const base =
    0.40 * inp.visibility +
    0.30 * inp.stability +
    0.20 * fq +
    0.10 * dr
  const penalty = inp.clamped ? 0.4 : 0
  return Math.max(0, Math.min(1, base - penalty))
}

/** Human-readable band for a confidence value (for a HUD/badge). */
export function confidenceBand(c: number): 'strong' | 'fair' | 'weak' {
  if (c >= 0.7) return 'strong'
  if (c >= 0.45) return 'fair'
  return 'weak'
}

// ── Temporal stabilizer (optional) ───────────────────────────────────────────
//
// Not wired into this package's default pipeline — GaitGapFiller (gait.ts)
// plus the One-Euro landmark filter (signalFilter.ts) already cover missing
// frames and per-landmark noise for the reference integration. This is a
// smaller, complementary safety net some integrators may still want: an
// ANGLE-level (not landmark-level) single-frame jump rejector. Construct one
// per (side, channel) you track live.

export interface StabilizerOutput {
  /** The accepted, plausibility-checked angle for this frame. */
  value:      number
  /** 0..1 temporal stability (1 = rock steady, low = noisy/jumpy). */
  stability:  number
  /** True when this frame's raw value was rejected as an implausible jump. */
  rejected:   boolean
}

// Max believable angular velocity for a human joint under camera, deg/second.
// Fast functional movements peak near ~600°/s; this allows well above that
// and only rejects single-frame teleports far beyond it.
const MAX_ANGULAR_SPEED = 900
// After this many consecutive rejects, accept the new value (the motion is
// real, not a glitch — e.g. the joint re-entered frame).
const MAX_REJECTS = 3

export class MeasurementStabilizer {
  private last: number | null = null
  private lastT: number | null = null
  private rejects = 0
  private recent: number[] = []      // recent accepted values for variance

  push(raw: number, tMs: number): StabilizerOutput {
    if (this.last === null || this.lastT === null) {
      this.last = raw; this.lastT = tMs; this.recent = [raw]
      return { value: raw, stability: 0.5, rejected: false }
    }
    const dt = Math.max(1e-3, (tMs - this.lastT) / 1000)
    const speed = Math.abs(raw - this.last) / dt

    let value = raw
    let rejected = false
    if (speed > MAX_ANGULAR_SPEED && this.rejects < MAX_REJECTS) {
      value = this.last         // hold last good value
      rejected = true
      this.rejects += 1
    } else {
      this.rejects = 0
    }

    this.last = value
    this.lastT = tMs
    this.recent.push(value)
    if (this.recent.length > 12) this.recent.shift()

    return { value, stability: this.stabilityScore(), rejected }
  }

  /** Stability from the std-dev of recent values (low variance = stable). */
  private stabilityScore(): number {
    if (this.recent.length < 3) return 0.5
    const m = this.recent.reduce((a, b) => a + b, 0) / this.recent.length
    const v = this.recent.reduce((a, b) => a + (b - m) ** 2, 0) / this.recent.length
    const sd = Math.sqrt(v)
    // 0° sd → 1.0 ; 12° sd → ~0. Holds are usually < 2° sd.
    return Math.max(0, Math.min(1, 1 - sd / 12))
  }

  reset(): void { this.last = null; this.lastT = null; this.rejects = 0; this.recent = [] }
}
