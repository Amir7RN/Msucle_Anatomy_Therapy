/**
 * constraints.ts
 *
 * Biomechanical sanity layer that sits between the raw goniometric measure and
 * the UI. Three jobs:
 *
 *   1. ROM clamping        — reject anatomically impossible angles using the
 *                            normal-ROM bounds from human_joint_rom_reference
 *                            .json. A reading past the hard ceiling is a
 *                            tracking error, not a superhuman joint, so we clip
 *                            it and lower confidence. Readings between the
 *                            normal max and the ceiling are flagged
 *                            "beyondNormal" (genuine hypermobility OR mild
 *                            error) but kept.
 *
 *   2. Temporal plausibility — a joint can't jump 80° between two adjacent
 *                            frames. The per-movement stabilizer rejects such
 *                            jumps (holding the last good value) while still
 *                            tracking sustained fast motion, and emits a
 *                            stability score from the recent variance.
 *
 *   3. Confidence fusion    — combines anatomical-frame quality, landmark
 *                            visibility, depth reliability, and temporal
 *                            stability into one 0..1 number the UI can show
 *                            ("strong reading" vs "reposition for a better
 *                            measurement") and that the assessment uses to
 *                            weight or reject a sample.
 */

import { romFor } from './jointReference'

export interface ClampResult {
  value:        number
  /** True when the raw reading exceeded the hard anatomical ceiling (clipped). */
  clamped:      boolean
  /** True when the reading is above the normal able-bodied max but plausible. */
  beyondNormal: boolean
}

/** Clamp a measured angle to the reference ROM ceiling for its movement. */
export function clampToRom(catalogId: string, raw: number): ClampResult {
  const ref = romFor(catalogId)
  if (!ref) return { value: Math.max(0, raw), clamped: false, beyondNormal: false }
  let value = raw
  let clamped = false
  if (value < 0) { value = 0; clamped = true }
  if (value > ref.ceiling) { value = ref.ceiling; clamped = true }
  const beyondNormal = value > ref.max
  return { value, clamped, beyondNormal }
}

/** How a measured value sits inside the normal range, 0..1 (1 = at/over max). */
export function romFraction(catalogId: string, value: number): number | null {
  const ref = romFor(catalogId)
  if (!ref) return null
  const span = ref.max - ref.min || 1
  return Math.max(0, Math.min(1.2, (value - ref.min) / span))
}

// ── Temporal stabilizer ───────────────────────────────────────────────────────

export interface StabilizerOutput {
  /** The accepted, plausibility-checked angle for this frame. */
  value:      number
  /** 0..1 temporal stability (1 = rock steady, low = noisy/jumpy). */
  stability:  number
  /** True when this frame's raw value was rejected as an implausible jump. */
  rejected:   boolean
}

// Max believable angular velocity for a human joint under camera, deg/second.
// Fast functional movements peak near ~600°/s; we allow well above that and
// only reject single-frame teleports far beyond it.
const MAX_ANGULAR_SPEED = 900
// After this many consecutive rejects, accept the new value (the motion is
// real, not a glitch — e.g. the joint re-entered frame).
const MAX_REJECTS = 3

/**
 * Per-movement temporal gate. Construct one per (movement,side) you track
 * live; call `push(rawAngle, tMs)` each frame.
 */
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

// ── Confidence fusion ─────────────────────────────────────────────────────────

export interface ConfidenceInputs {
  /** Anatomical-frame quality (frame.quality), 0..1. Default 1 when absent. */
  frameQuality?:    number
  /** Min landmark visibility across the measured chain, 0..1. */
  visibility:       number
  /** Depth-channel reliability (anatomicalFrame.depthReliability), 0..1. */
  depthReliability?: number
  /** Temporal stability from the stabilizer, 0..1. */
  stability:        number
  /** True when the raw value got clamped to the ceiling (tracking error). */
  clamped?:         boolean
}

/**
 * Fuse the signals into a single 0..1 measurement confidence. Weighted so
 * visibility and stability dominate (they most directly predict error), with a
 * hard penalty when the value had to be clamped.
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

/** Human-readable band for a confidence value (for the HUD). */
export function confidenceBand(c: number): 'strong' | 'fair' | 'weak' {
  if (c >= 0.7) return 'strong'
  if (c >= 0.45) return 'fair'
  return 'weak'
}
