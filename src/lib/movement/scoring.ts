/**
 * scoring.ts
 *
 * Turns per-movement peak metrics into a 0-100 Movement Score and a list
 * of muscle-level findings the protocol generator can act on.
 *
 * Scoring logic per metric:
 *   if higherIsBetter:  score = clamp01((value - floor) / (ideal - floor))
 *   else:               score = clamp01((floor - value) / (floor - ideal))
 * Each movement averages its metric scores, with a small penalty for
 * compensations (-5 points each, capped).
 *
 * Movement Score (overall) = average of the per-movement scores, rounded.
 */

import type { MovementDef, MovementImplication } from './movements'

export interface MovementResult {
  movementId:   string
  title:        string
  /** Peak values across the hold window, keyed by metric name. */
  peakValues:   Record<string, number>
  /** Compensations observed during the movement (deduplicated). */
  compensations: string[]
  /** 0-100 score for this movement. */
  score:        number
  /** Per-metric subscores (0-1) for transparency. */
  subscores:    Record<string, number>
}

export interface AssessmentSummary {
  /** ISO timestamp when the assessment was completed. */
  completedAt:   string
  /** Per-movement results in the order they were performed. */
  results:       MovementResult[]
  /** 0-100 overall Movement Score. */
  movementScore: number
  /** Muscles flagged across the assessment, with rationales. */
  findings:      MuscleFinding[]
}

export interface MuscleFinding {
  muscle_id: string
  /** How many times this muscle was flagged across movements. */
  hitCount:  number
  /** Combined severity (0-1) — average of the offending metric's deficit. */
  severity:  number
  /** Rationales aggregated from the implication rules that triggered. */
  reasons:   string[]
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export function scoreMovement(def: MovementDef, peak: Record<string, number>, compensations: string[]): MovementResult {
  const subscores: Record<string, number> = {}
  let total = 0
  let count = 0

  for (const [metric, bench] of Object.entries(def.benchmarks)) {
    const v = peak[metric]
    if (v === undefined || Number.isNaN(v)) continue
    let s: number
    if (bench.higherIsBetter) {
      s = clamp01((v - bench.floor) / (bench.ideal - bench.floor + 1e-6))
    } else {
      s = clamp01((bench.floor - v) / (bench.floor - bench.ideal + 1e-6))
    }
    subscores[metric] = s
    total += s
    count += 1
  }

  let score = count > 0 ? (total / count) * 100 : 0
  // Compensation penalty: -5 per unique compensation, capped at -15.
  const penalty = Math.min(compensations.length, 3) * 5
  score = Math.max(0, score - penalty)

  return {
    movementId:    def.id,
    title:         def.title,
    peakValues:    peak,
    compensations,
    score:         Math.round(score),
    subscores,
  }
}

export function summariseAssessment(defs: MovementDef[], results: MovementResult[]): AssessmentSummary {
  const movementScore = Math.round(
    results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length),
  )
  const findings = aggregateFindings(defs, results)
  return {
    completedAt:   new Date().toISOString(),
    results,
    movementScore,
    findings,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Findings aggregation — walk every implication rule against the peak metrics
// ─────────────────────────────────────────────────────────────────────────────

function aggregateFindings(defs: MovementDef[], results: MovementResult[]): MuscleFinding[] {
  const map = new Map<string, MuscleFinding>()

  for (const r of results) {
    const def = defs.find((d) => d.id === r.movementId)
    if (!def) continue
    for (const imp of def.implications) {
      const triggered = checkImplication(imp, def, r)
      if (!triggered) continue
      for (const muscleId of imp.muscles) {
        const cur = map.get(muscleId) ?? { muscle_id: muscleId, hitCount: 0, severity: 0, reasons: [] }
        cur.hitCount += 1
        cur.severity = Math.max(cur.severity, triggered.severity)
        if (!cur.reasons.includes(imp.rationale)) cur.reasons.push(imp.rationale)
        map.set(muscleId, cur)
      }
    }
  }

  // Sort: most severe first, then most-hit, then alphabetical for stability.
  return [...map.values()].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount
    return a.muscle_id.localeCompare(b.muscle_id)
  })
}

function checkImplication(
  imp:    MovementImplication,
  def:    MovementDef,
  r:      MovementResult,
): { severity: number } | null {
  const v     = r.peakValues[imp.metric]
  const bench = def.benchmarks[imp.metric]
  if (v === undefined || !bench) return null

  if (imp.direction === 'low') {
    if (!bench.higherIsBetter) return null
    if (v >= bench.floor)      return null
    const range = bench.ideal - bench.floor + 1e-6
    return { severity: clamp01((bench.floor - v) / range) }
  }
  if (imp.direction === 'high') {
    if (bench.higherIsBetter) return null
    if (v <= bench.floor)     return null
    const range = bench.floor - bench.ideal + 1e-6
    return { severity: clamp01((v - bench.floor) / range) }
  }
  // 'asymmetric' — treat as low when symmetry score below floor.
  if (v >= bench.floor) return null
  return { severity: clamp01((bench.floor - v) / (bench.floor - 0 + 1e-6)) }
}
