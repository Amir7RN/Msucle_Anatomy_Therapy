/**
 * history.ts
 *
 * localStorage-backed history of Movement Assessments.
 * Used for weekly tracking + the "score over time" chart on the results screen.
 */

import type { AssessmentSummary } from './scoring'

const KEY = 'muscleAtlas.movement.history.v1'
const MAX_ENTRIES = 60   // keep ~6 months of weekly data

export function loadHistory(): AssessmentSummary[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as AssessmentSummary[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveAssessment(summary: AssessmentSummary): void {
  try {
    const existing = loadHistory()
    const next = [...existing, summary].slice(-MAX_ENTRIES)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* localStorage unavailable — silently fail */
  }
}

export function clearHistory(): void {
  try { localStorage.removeItem(KEY) } catch {}
}

/** "this week" = same ISO week as today.  Used for the weekly-DAU pitch. */
export function inSameWeek(a: Date, b: Date): boolean {
  const aw = startOfWeek(a).getTime()
  const bw = startOfWeek(b).getTime()
  return aw === bw
}
function startOfWeek(d: Date): Date {
  const out = new Date(d)
  const dow = out.getDay()
  out.setDate(out.getDate() - dow)
  out.setHours(0, 0, 0, 0)
  return out
}
