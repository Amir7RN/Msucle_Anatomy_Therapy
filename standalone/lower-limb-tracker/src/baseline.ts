/**
 * baseline.ts
 *
 * Per-channel neutral-pose baseline capture and correction — the "zero the
 * goniometer" step every clinician does before measuring motion.
 *
 * Adapted from a larger full-body calibration module. Two things are
 * deliberately dropped from that original:
 *
 *   1. Orientation-gating (only apply a "standing" baseline to a "standing"
 *      measurement, etc). An ankle-only tracker has one implicit context —
 *      whatever pose the subject is in when you call `zero()` — not a set of
 *      full-body posture states, so there's nothing to gate against.
 *
 *   2. Clamping the corrected value to >= 0. That's correct for a ROM-style
 *      "degrees of motion from neutral in one cued direction" reading, but
 *      WRONG for gait: dorsiflexion/plantarflexion is a signed delta from
 *      neutral in BOTH directions, and clamping would silently discard every
 *      plantarflexion reading. `zeroSigned` below subtracts without clamping.
 */

/** Accumulates measured neutral values across a short hold, then exposes a
 *  robust per-key median offset. One collector spans one `zero()` call; feed
 *  it every frame's genuine (non-interpolated) reading for each channel you
 *  want to baseline. */
export class BaselineCollector {
  private samples = new Map<string, number[]>()

  /** Record one measured neutral value for a key. Ignores null/NaN. */
  addSample(key: string, value: number | null): void {
    if (value === null || Number.isNaN(value)) return
    const arr = this.samples.get(key) ?? []
    arr.push(value)
    this.samples.set(key, arr)
  }

  /** Number of samples captured for a key so far. */
  count(key: string): number { return this.samples.get(key)?.length ?? 0 }

  /** True once EVERY key that has received at least one sample has reached
   *  minPerKey samples (a key that's never been touched — e.g. a foot that
   *  was occluded the whole time — doesn't block readiness for the others). */
  ready(minPerKey = 3): boolean {
    for (const arr of this.samples.values()) if (arr.length < minPerKey) return false
    return true
  }

  /** Current best-guess offsets (median per key so far). Safe to call
   *  repeatedly while still collecting — it doesn't mutate anything, so
   *  callers can recompute every frame for a continuously-refining "zero on
   *  press" readout and simply stop calling once they're satisfied. */
  currentOffsets(): Record<string, number> {
    const offsets: Record<string, number> = {}
    for (const [key, arr] of this.samples) offsets[key] = median(arr)
    return offsets
  }

  reset(): void { this.samples.clear() }
}

/** raw − offset, WITHOUT clamping to zero — dorsi/plantarflexion (and most
 *  gait signals) are signed deltas from neutral in both directions. */
export function zeroSigned(v: number | null, offsets: Record<string, number> | null, key: string): number | null {
  if (v == null || offsets == null) return v
  const o = offsets[key]
  return o == null ? v : v - o
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
