/**
 * calibration.ts
 *
 * Per-user NEUTRAL BASELINE capture and correction.
 *
 * The problem it solves
 * ─────────────────────
 * Goniometry defines neutral (anatomical position) as 0°. But a real user's
 * "neutral" measured by a single camera is never exactly 0: posture, body
 * proportions, camera height/tilt, clothing, and MediaPipe's own bias all add
 * a systematic offset. Someone standing relaxed might measure 7° of shoulder
 * flexion at rest. Without correction, every subsequent reading inherits that
 * 7° error, and worse, the error differs per camera setup and per session.
 *
 * The fix is exactly what a clinician does with a goniometer: zero the
 * instrument on the neutral pose first, then measure motion RELATIVE to that
 * zero. We hold the user in the reference neutral pose (the one the
 * neutral_camera JSON prescribes for the movement), sample the measured angle
 * over a short window, take the robust median, and store it as the baseline.
 * Live measurements then subtract the baseline so the user's true neutral
 * reads 0 and the reported ROM is the genuine excursion from it.
 *
 * We also capture a torso scale (shoulder→hip distance, metres) so distance-
 * based metrics can be normalised per user, and the body orientation at
 * calibration so we never apply a standing baseline to a lying measurement.
 *
 * Baselines persist in localStorage keyed by orientation, so a returning user
 * who stands in the same spot doesn't have to re-zero every session — but a
 * stale baseline (> MAX_AGE) or an orientation mismatch is ignored.
 */

import type { LandmarkSet } from './landmarks'
import { LM } from './landmarks'
import { worldVec, sub, magnitude, midpoint } from './anatomicalFrame'
import type { BodyOrientation } from './bodyOrientation'

export interface CalibrationBaseline {
  /** Median measured angle at neutral, keyed by `${catalogId}:${side}`. */
  offsets:     Record<string, number>
  /** Body orientation the baseline was captured in. */
  orientation: BodyOrientation
  /** Shoulder→hip distance in world metres at neutral (per-user scale). */
  torsoScale:  number
  /** Epoch ms when captured. */
  capturedAt:  number
}

export function baselineKey(catalogId: string, side: 'L' | 'R' | 'either'): string {
  return `${catalogId}:${side}`
}

/**
 * Accumulates measured neutral values across a short hold, then produces a
 * robust per-key median baseline. One collector spans the whole calibration
 * window; feed it the per-frame measurement of every joint you intend to
 * baseline.
 */
export class BaselineCollector {
  private samples = new Map<string, number[]>()
  private torsoScales: number[] = []
  private orientationVotes = new Map<BodyOrientation, number>()

  /** Record one measured neutral angle for a key. Ignores null/NaN. */
  addSample(key: string, value: number | null): void {
    if (value === null || Number.isNaN(value)) return
    const arr = this.samples.get(key) ?? []
    arr.push(value)
    this.samples.set(key, arr)
  }

  /** Record the current torso scale + orientation for this frame. */
  addContext(lms: LandmarkSet, orientation: BodyOrientation): void {
    const scale = torsoScale(lms)
    if (scale !== null) this.torsoScales.push(scale)
    this.orientationVotes.set(orientation, (this.orientationVotes.get(orientation) ?? 0) + 1)
  }

  /** Number of frames captured for a key (UI can show progress). */
  count(key: string): number { return this.samples.get(key)?.length ?? 0 }

  /** True once we have enough samples to trust the baseline. */
  ready(minPerKey = 10): boolean {
    if (this.samples.size === 0) return this.torsoScales.length >= minPerKey
    for (const arr of this.samples.values()) if (arr.length < minPerKey) return false
    return true
  }

  finalize(): CalibrationBaseline {
    const offsets: Record<string, number> = {}
    for (const [key, arr] of this.samples) offsets[key] = median(arr)
    let orientation: BodyOrientation = 'unknown'
    let best = -1
    for (const [o, n] of this.orientationVotes) if (n > best) { best = n; orientation = o }
    return {
      offsets,
      orientation,
      torsoScale: this.torsoScales.length ? median(this.torsoScales) : 1,
      capturedAt: Date.now(),
    }
  }

  reset(): void {
    this.samples.clear()
    this.torsoScales = []
    this.orientationVotes.clear()
  }
}

/**
 * Apply a baseline correction to a raw measured angle.
 *
 *   corrected = max(0, raw − offset)
 *
 * Only applied when the live orientation matches the baseline's orientation
 * (an upright baseline must not zero a lying measurement). Returns the raw
 * value unchanged when no baseline exists or orientation differs, so callers
 * degrade gracefully.
 */
export function applyBaseline(
  raw:            number,
  catalogId:      string,
  side:           'L' | 'R' | 'either',
  baseline:       CalibrationBaseline | null,
  liveOrientation?: BodyOrientation,
): number {
  if (!baseline) return raw
  if (liveOrientation && baseline.orientation !== 'unknown' &&
      liveOrientation !== 'unknown' && liveOrientation !== baseline.orientation) {
    return raw
  }
  const off = baseline.offsets[baselineKey(catalogId, side)]
  if (off === undefined) return raw
  return Math.max(0, raw - off)
}

// ── Torso scale ──────────────────────────────────────────────────────────────

/** Shoulder-midpoint → hip-midpoint distance in world metres, or null. */
export function torsoScale(lms: LandmarkSet): number | null {
  const ls = worldVec(lms[LM.L_SHOULDER]), rs = worldVec(lms[LM.R_SHOULDER])
  const lh = worldVec(lms[LM.L_HIP]),      rh = worldVec(lms[LM.R_HIP])
  if (!ls || !rs || !lh || !rh) return null
  const d = magnitude(sub(midpoint(ls, rs), midpoint(lh, rh)))
  return d > 1e-4 ? d : null
}

// ── Persistence ──────────────────────────────────────────────────────────────

const STORE_KEY = 'zeva.calibration.v1'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30   // 30 days

export function saveBaseline(b: CalibrationBaseline): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(b)) } catch { /* ignore */ }
}

/** Load a stored baseline, or null if missing/stale. */
export function loadBaseline(): CalibrationBaseline | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const b = JSON.parse(raw) as CalibrationBaseline
    if (!b || typeof b.capturedAt !== 'number') return null
    if (Date.now() - b.capturedAt > MAX_AGE_MS) return null
    return b
  } catch { return null }
}

export function clearBaseline(): void {
  try { localStorage.removeItem(STORE_KEY) } catch { /* ignore */ }
}

// ── Stats ──────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
