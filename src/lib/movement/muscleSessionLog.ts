/**
 * muscleSessionLog.ts
 *
 * localStorage-backed log of finished Live-Muscle-Twin sessions, so the twin
 * can answer "how is this muscle trending" — this is the loop the user wanted:
 * each session records per-region work (volume-load proxy), peak fatigue, and
 * left/right balance, and we roll those up by week.
 *
 * Same lightweight, fail-silent pattern as movement/history.ts.
 */

import type { MuscleSessionSummary } from './muscleStatus'

const KEY = 'muscleTwin.sessions.v1'
const MAX_ENTRIES = 120   // ~ several months of sessions

export function loadSessions(): MuscleSessionSummary[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as MuscleSessionSummary[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveSession(summary: MuscleSessionSummary): void {
  try {
    const next = [...loadSessions(), summary].slice(-MAX_ENTRIES)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* localStorage unavailable — silently ignore */
  }
}

export function clearSessions(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export interface RegionTrendPoint {
  region: string
  /** Total work this period vs the previous period (for the % change pitch). */
  thisPeriod: number
  prevPeriod: number
  /** Signed fractional change, e.g. 0.4 = +40 %. null if no prior baseline. */
  change: number | null
}

/** ISO-week key like "2026-W26". */
function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (t.getUTCDay() + 6) % 7          // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3)        // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Per-region work this week vs last week — the "your chest did 40 % more work
 * than last week" trend. Sorted by this-week work descending.
 */
export function weeklyTrend(sessions: MuscleSessionSummary[] = loadSessions()): RegionTrendPoint[] {
  if (sessions.length === 0) return []
  const now = new Date()
  const thisWk = weekKey(now)
  const lastWk = weekKey(new Date(now.getTime() - 7 * 86400000))

  const thisAgg: Record<string, number> = {}
  const prevAgg: Record<string, number> = {}
  for (const s of sessions) {
    const wk = weekKey(new Date(s.at))
    const bucket = wk === thisWk ? thisAgg : wk === lastWk ? prevAgg : null
    if (!bucket) continue
    for (const [region, v] of Object.entries(s.perRegion)) {
      bucket[region] = (bucket[region] ?? 0) + v.work
    }
  }

  const regions = new Set([...Object.keys(thisAgg), ...Object.keys(prevAgg)])
  const out: RegionTrendPoint[] = []
  for (const region of regions) {
    const thisPeriod = round2(thisAgg[region] ?? 0)
    const prevPeriod = round2(prevAgg[region] ?? 0)
    const change = prevPeriod > 0 ? round2((thisPeriod - prevPeriod) / prevPeriod) : null
    out.push({ region, thisPeriod, prevPeriod, change })
  }
  return out.sort((a, b) => b.thisPeriod - a.thisPeriod)
}

/** Count of sessions logged this ISO week — for the weekly-streak pitch. */
export function sessionsThisWeek(sessions: MuscleSessionSummary[] = loadSessions()): number {
  const wk = weekKey(new Date())
  return sessions.filter((s) => weekKey(new Date(s.at)) === wk).length
}

function round2(x: number): number { return Math.round(x * 100) / 100 }
