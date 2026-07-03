/**
 * healthInsights.ts
 *
 * Window-aware series + tips for the Import Health Data insights panel.
 * Everything derives from the SELECTED comparison windows so the charts
 * re-shape live as the sliders move.
 */

import type { BodyMetricKey, HealthProfile, MetricPoint, ParsedWorkout } from './appleHealthParser'
import {
  computeWorkoutLoads, isLowShare, MUSCLE_GROUPS,
  type MuscleLoadResult,
} from './muscleLoadEstimator'

const DAY_MS = 86_400_000

export function ageFromProfile(profile: HealthProfile | undefined | null): number | null {
  const dob = profile?.dateOfBirth
  if (!dob) return null
  const t = new Date(dob).getTime()
  if (!Number.isFinite(t)) return null
  const age = (Date.now() - t) / (365.25 * DAY_MS)
  return age >= 10 && age <= 100 ? Math.floor(age) : null
}

// ── Weekly training-load series (drives the trend chart) ─────────────────────

export interface WeekLoadPoint {
  /** Week start day, YYYY-MM-DD. */
  d: string
  /** Total load (duration_min * intensity) that week. */
  v: number
  /** True when the bucket falls inside the selected recent window. */
  inRecent: boolean
}

/** Total load per 7-day bucket across the effective baseline window. */
export function weeklyLoadSeries(
  workouts: ParsedWorkout[],
  result: MuscleLoadResult,
  ageYears?: number | null,
): WeekLoadPoint[] {
  const refEnd = new Date(result.referenceDate + 'T23:59:59Z').getTime()
  const days = result.effectiveBaselineDays
  const weeks = Math.max(1, Math.ceil(days / 7))
  const start = refEnd - weeks * 7 * DAY_MS
  const recentStart = refEnd - result.effectiveRecentDays * DAY_MS

  const buckets = new Array<number>(weeks).fill(0)
  for (const wl of computeWorkoutLoads(workouts, ageYears)) {
    const t = new Date(wl.workout.startDate).getTime()
    if (t <= start || t > refEnd) continue
    const idx = Math.min(weeks - 1, Math.floor((t - start) / (7 * DAY_MS)))
    buckets[idx] += wl.loadW
  }
  return buckets.map((v, i) => {
    const bucketStart = start + i * 7 * DAY_MS
    return {
      d: new Date(bucketStart).toISOString().slice(0, 10),
      v: Math.round(v),
      inRecent: bucketStart + 7 * DAY_MS > recentStart,
    }
  })
}

// ── Metric series, resampled to the selected window ──────────────────────────

export interface TrendSeries {
  points: MetricPoint[]        // bucket means, oldest -> newest
  /** Mean over the first / last thirds — a robust trend read. */
  firstMean: number | null
  lastMean: number | null
  /** (last - first) / first, when both exist. */
  changeFrac: number | null
}

/**
 * Filter a daily-mean series to the selected baseline window and re-bucket it
 * (~40 buckets max) so long windows stay readable. Means per bucket.
 */
export function windowTrend(points: MetricPoint[], result: MuscleLoadResult): TrendSeries {
  const refEnd = new Date(result.referenceDate + 'T23:59:59Z').getTime()
  const start = refEnd - result.effectiveBaselineDays * DAY_MS
  const inWin = points.filter((p) => {
    const t = new Date(p.d + 'T12:00:00Z').getTime()
    return t > start && t <= refEnd
  })
  if (inWin.length === 0) return { points: [], firstMean: null, lastMean: null, changeFrac: null }

  const bucketDays = Math.max(1, Math.ceil(result.effectiveBaselineDays / 40))
  const buckets = new Map<number, { s: number; n: number }>()
  for (const p of inWin) {
    const t = new Date(p.d + 'T12:00:00Z').getTime()
    const idx = Math.floor((t - start) / (bucketDays * DAY_MS))
    const acc = buckets.get(idx)
    if (acc) { acc.s += p.v; acc.n++ } else buckets.set(idx, { s: p.v, n: 1 })
  }
  const out: MetricPoint[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, acc]) => ({
      d: new Date(start + idx * bucketDays * DAY_MS).toISOString().slice(0, 10),
      v: Math.round((acc.s / acc.n) * 100) / 100,
    }))

  const third = Math.max(1, Math.floor(out.length / 3))
  const mean = (arr: MetricPoint[]) => arr.reduce((s, p) => s + p.v, 0) / arr.length
  const firstMean = mean(out.slice(0, third))
  const lastMean = mean(out.slice(-third))
  const changeFrac = firstMean !== 0 ? (lastMean - firstMean) / Math.abs(firstMean) : null
  return { points: out, firstMean, lastMean, changeFrac }
}

// ── Tips (short, visual-first captions; training vocabulary only) ────────────

export interface InsightTip {
  tone: 'focus' | 'good' | 'watch'
  text: string
}

export function buildTips(
  result: MuscleLoadResult,
  trends: Partial<Record<BodyMetricKey, TrendSeries>>,
): InsightTip[] {
  const tips: InsightTip[] = []

  // 1. Training balance: name the under-worked groups (volume-based).
  const low = result.groups.filter((g) =>
    isLowShare(Math.max(g.sharePctRecent, g.sharePctBaseline), MUSCLE_GROUPS.length))
  if (low.length > 0 && low.length < result.groups.length) {
    const names = low.slice(0, 4).map((g) => g.label).join(', ')
    tips.push({ tone: 'focus', text: `${names} carry little of your workload — add targeted strength sessions.` })
  }

  // 2. Spike risk: ratio-elevated groups.
  const spiking = result.groups.filter((g) => g.classification === 'high' || g.classification === 'elevated')
  if (spiking.length > 0) {
    tips.push({ tone: 'watch', text: `${spiking.map((g) => g.label).join(', ')}: load rising fast vs baseline — build up gradually.` })
  }

  // 3. Gait symmetry (very on-scope for the platform).
  const asym = trends.walkingAsymmetryPct
  if (asym && asym.changeFrac != null && asym.points.length >= 4) {
    if (asym.changeFrac > 0.25) {
      tips.push({ tone: 'watch', text: 'Walking asymmetry is trending up — run a Symmetry Report to see left vs right.' })
    } else if (asym.changeFrac < -0.2) {
      tips.push({ tone: 'good', text: 'Walking asymmetry is trending down — your gait is getting more even.' })
    }
  }

  // 4. Recovery signals.
  const rhr = trends.restingHeartRate
  if (rhr && rhr.changeFrac != null && rhr.points.length >= 4) {
    if (rhr.changeFrac < -0.05) tips.push({ tone: 'good', text: 'Resting heart rate is trending down — aerobic base is improving.' })
    else if (rhr.changeFrac > 0.08) tips.push({ tone: 'watch', text: 'Resting heart rate is trending up — consider more easy days.' })
  }
  const hrv = trends.hrvSdnn
  if (hrv && hrv.changeFrac != null && hrv.points.length >= 4 && hrv.changeFrac < -0.15) {
    tips.push({ tone: 'watch', text: 'HRV is trending down — recovery may be lagging your workload.' })
  }

  return tips.slice(0, 4)
}
