/**
 * deviationEngine.ts
 *
 * Multi-joint kinematic deviation analysis + automatic target-sequence
 * injection. Sits between the Movement Assessment (scoring.ts) and the
 * exercise pipeline (protocol.ts):
 *
 *   1. DEVIATION ANALYSIS — cross-references every ROM-type metric the
 *      assessment captured against the clinician reference schema
 *      (human_joint_rom_reference.json via jointReference.romFor) and reports
 *      the EXACT angular deviation from the normative bound, per joint and
 *      per side — "left shoulder flexion 141° vs 150–180° normal → 9° below
 *      normal", not just a 0-100 score. Compensation-type metrics (valgus,
 *      pelvic drop, trunk shift) are reported against their movement
 *      benchmarks in their native units.
 *
 *   2. TARGET-SEQUENCE INJECTION — turns the ranked deficits into a
 *      persisted workflow queue of exercise sequences, dosed by severity
 *      (a severe deficit gets more sets/time than a mild one), and de-duped
 *      against what's already queued. MovementScreen calls
 *      `enqueueFromAssessment()` when an assessment completes; any view can
 *      read the queue with `loadTargetQueue()` and mark items done.
 *
 * Everything is deterministic and on-device. The queue survives reloads
 * (localStorage) and carries its provenance (which assessment, which metric,
 * how many degrees short) so the UI can always explain WHY an item exists.
 */

import type { AssessmentSummary, MovementResult } from './scoring'
import { romFor } from './jointReference'
import { EXERCISE_LIBRARY, type Exercise } from './protocol'
import { MOVEMENTS } from './movements'

// ─────────────────────────────────────────────────────────────────────────────
//  Deviation analysis
// ─────────────────────────────────────────────────────────────────────────────

export type DeficitBand = 'none' | 'mild' | 'moderate' | 'severe'

export interface KinematicDeviation {
  /** Assessment movement this came from (e.g. 'overhead_reach'). */
  movementId:  string
  /** Metric key inside that movement (e.g. 'L_shoulder_flexion_deg'). */
  metric:      string
  /** Human label for the metric (from the movement's metricLabels). */
  label:       string
  side:        'L' | 'R' | 'C'
  /** Peak value the user measured. */
  measured:    number
  /** Normative target (reference max for ROM metrics, benchmark ideal else). */
  normTarget:  number
  /** Lower bound of "normal" (reference min for ROM metrics, floor else). */
  normFloor:   number
  /**
   * Exact deviation from normal, in the metric's native units (degrees for
   * ROM). Positive = short of normal; 0 = within normal range.
   */
  deviation:   number
  /** deviation / (target − floor), clamped 0..1+. */
  deficitFrac: number
  band:        DeficitBand
  /** Muscles implicated by the movement's own implication rules. */
  muscles:     string[]
  /** True when the deviation was computed against the clinical ROM schema. */
  fromReference: boolean
}

/**
 * Metric → clinical-reference catalog id. Only ROM-type metrics appear here;
 * everything else falls back to the movement's own benchmark bounds.
 */
const METRIC_TO_CATALOG: Record<string, { catalogId: string; side: 'L' | 'R' | 'C' }> = {
  L_shoulder_flexion_deg: { catalogId: 'shoulder_flexion',           side: 'L' },
  R_shoulder_flexion_deg: { catalogId: 'shoulder_flexion',           side: 'R' },
  L_knee_flexion_deg:     { catalogId: 'knee_flexion',               side: 'L' },
  R_knee_flexion_deg:     { catalogId: 'knee_flexion',               side: 'R' },
  L_rotation_deg:         { catalogId: 'cervical_rotation_left',     side: 'L' },
  R_rotation_deg:         { catalogId: 'cervical_rotation_right',    side: 'R' },
  L_hip_flexion_deg:      { catalogId: 'hip_flexion',                side: 'L' },
  R_hip_flexion_deg:      { catalogId: 'hip_flexion',                side: 'R' },
  L_er_deg:               { catalogId: 'shoulder_external_rotation', side: 'L' },
  R_er_deg:               { catalogId: 'shoulder_external_rotation', side: 'R' },
}

function bandFor(frac: number): DeficitBand {
  if (frac <= 0.02) return 'none'
  if (frac <= 0.25) return 'mild'
  if (frac <= 0.55) return 'moderate'
  return 'severe'
}

function sideOfMetric(metric: string): 'L' | 'R' | 'C' {
  if (metric.startsWith('L_')) return 'L'
  if (metric.startsWith('R_')) return 'R'
  return 'C'
}

/** Muscles the movement's implication rules tie to a given metric. */
function musclesForMetric(movementId: string, metric: string): string[] {
  const def = MOVEMENTS.find((m) => m.id === movementId)
  if (!def) return []
  const out = new Set<string>()
  for (const imp of def.implications) {
    if (imp.metric === metric) imp.muscles.forEach((m) => out.add(m))
  }
  return [...out]
}

/**
 * Analyse one completed assessment into exact per-joint deviations.
 * ROM metrics are measured against the clinical reference schema; the rest
 * against the movement's own benchmarks. Sorted worst-first.
 */
export function computeDeviations(results: MovementResult[]): KinematicDeviation[] {
  const out: KinematicDeviation[] = []

  for (const r of results) {
    const def = MOVEMENTS.find((m) => m.id === r.movementId)
    if (!def) continue

    for (const [metric, bench] of Object.entries(def.benchmarks)) {
      const measured = r.peakValues[metric]
      if (measured === undefined || Number.isNaN(measured)) continue
      const label = def.metricLabels[metric] ?? metric

      const refKey = METRIC_TO_CATALOG[metric]
      const ref = refKey ? romFor(refKey.catalogId) : null

      if (ref && bench.higherIsBetter) {
        // ROM metric with a clinical reference: deviation = how far below the
        // normative MIN the user peaked (inside [min,max] = normal = 0).
        const deviation = Math.max(0, ref.min - measured)
        // Deficit as the fraction of the normative span missing.
        const span = Math.max(1e-6, ref.max)
        const deficitFrac = Math.min(1.2, deviation / span)
        out.push({
          movementId: r.movementId, metric, label,
          side: refKey.side,
          measured: round1(measured),
          normTarget: ref.max, normFloor: ref.min,
          deviation: round1(deviation),
          deficitFrac: round3(deficitFrac),
          band: bandFor(deficitFrac),
          muscles: musclesForMetric(r.movementId, metric),
          fromReference: true,
        })
        continue
      }

      // Benchmark-based metric (compensations, symmetry, distances).
      let deviation: number
      let deficitFrac: number
      if (bench.higherIsBetter) {
        deviation = Math.max(0, bench.ideal - measured)
        deficitFrac = deviation / Math.max(1e-6, bench.ideal - bench.floor)
      } else {
        deviation = Math.max(0, measured - bench.ideal)
        deficitFrac = deviation / Math.max(1e-6, bench.floor - bench.ideal)
      }
      // Only flag once past the benchmark floor — inside the floor is "fine".
      const pastFloor = bench.higherIsBetter ? measured < bench.floor : measured > bench.floor
      out.push({
        movementId: r.movementId, metric, label,
        side: sideOfMetric(metric),
        measured: round1(measured),
        normTarget: bench.ideal, normFloor: bench.floor,
        deviation: round1(deviation),
        deficitFrac: round3(Math.min(1.2, deficitFrac)),
        band: pastFloor ? bandFor(Math.min(1.2, deficitFrac)) : 'none',
        muscles: musclesForMetric(r.movementId, metric),
        fromReference: false,
      })
    }
  }

  return out.sort((a, b) => b.deficitFrac - a.deficitFrac)
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round3(n: number): number { return Math.round(n * 1000) / 1000 }

// ─────────────────────────────────────────────────────────────────────────────
//  Target-sequence queue
// ─────────────────────────────────────────────────────────────────────────────

export interface TargetSequenceItem {
  /** Stable id (metric + assessment timestamp) for de-dupe + done-marking. */
  id:          string
  /** e.g. "Left shoulder flexion — 12° below normal". */
  title:       string
  /** Why this sequence exists (surfaced verbatim in the UI). */
  reason:      string
  band:        DeficitBand
  /** Deviation in native units at enqueue time. */
  deviation:   number
  /** Exercises composing the sequence, severity-dosed. */
  exercises:   Array<{ exercise: Exercise; rounds: number }>
  /** Epoch ms enqueued. */
  enqueuedAt:  number
  /** Set true by the UI when the user completes the sequence. */
  done:        boolean
}

const QUEUE_KEY = 'zeva.targetQueue.v1'
const QUEUE_MAX = 12

/** Severity → extra rounds of each exercise in the sequence. */
function roundsFor(band: DeficitBand): number {
  return band === 'severe' ? 3 : band === 'moderate' ? 2 : 1
}

function sideWord(side: 'L' | 'R' | 'C'): string {
  return side === 'L' ? 'Left ' : side === 'R' ? 'Right ' : ''
}

/**
 * Build target sequences from ranked deviations. One sequence per flagged
 * deviation (band ≥ mild), up to `maxSequences`, each composed of the best
 * 1–2 library exercises covering the implicated muscles, dosed by severity.
 */
export function buildTargetSequences(
  deviations: KinematicDeviation[],
  maxSequences = 4,
): TargetSequenceItem[] {
  const now = Date.now()
  const out: TargetSequenceItem[] = []
  const usedExercises = new Set<string>()

  for (const d of deviations) {
    if (out.length >= maxSequences) break
    if (d.band === 'none' || d.muscles.length === 0) continue

    // Best-coverage exercises for this deviation's muscles, not yet used.
    const scored = EXERCISE_LIBRARY
      .filter((e) => !usedExercises.has(e.id))
      .map((e) => ({ e, hits: e.muscles.filter((m) => d.muscles.includes(m)).length }))
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits)
    if (scored.length === 0) continue

    const picks = scored.slice(0, 2).map((s) => s.e)
    picks.forEach((e) => usedExercises.add(e.id))
    const rounds = roundsFor(d.band)

    const unit = d.fromReference ? '°' : ''
    out.push({
      id:        `${d.metric}:${now}`,
      title:     `${sideWord(d.side)}${stripSide(d.label)} — ${d.deviation}${unit} below normal`,
      reason:    d.fromReference
        ? `Measured ${d.measured}° vs a normal range of ${d.normFloor}–${d.normTarget}°.`
        : `Measured ${d.measured} vs target ${d.normTarget} (flag threshold ${d.normFloor}).`,
      band:      d.band,
      deviation: d.deviation,
      exercises: picks.map((exercise) => ({ exercise, rounds })),
      enqueuedAt: now,
      done:      false,
    })
  }

  return out
}

function stripSide(label: string): string {
  return label.replace(/^(Left|Right)\s+/i, '').replace(/\s*\(°\)\s*$/, '')
}

// ── Persistence ──────────────────────────────────────────────────────────────

export function loadTargetQueue(): TargetSequenceItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as TargetSequenceItem[]
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function saveTargetQueue(queue: TargetSequenceItem[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, QUEUE_MAX))) } catch { /* ignore */ }
}

export function markSequenceDone(id: string): void {
  const q = loadTargetQueue()
  const item = q.find((i) => i.id === id)
  if (item) { item.done = true; saveTargetQueue(q) }
}

/**
 * The auto-injection entry point: analyse a finished assessment, build the
 * severity-dosed sequences, and merge them into the persisted queue.
 * Replaces any still-pending sequence for the same metric (fresher data wins);
 * completed items are kept as history until the cap trims them.
 * Returns what was analysed so the results UI can render it immediately.
 */
export function enqueueFromAssessment(summary: AssessmentSummary): {
  deviations: KinematicDeviation[]
  injected:   TargetSequenceItem[]
} {
  const deviations = computeDeviations(summary.results)
  const injected = buildTargetSequences(deviations)

  const metricOf = (id: string) => id.split(':')[0]
  const injectedMetrics = new Set(injected.map((i) => metricOf(i.id)))
  const kept = loadTargetQueue().filter(
    (i) => i.done || !injectedMetrics.has(metricOf(i.id)),
  )
  // Newest first; done history sinks to the back.
  const merged = [...injected, ...kept].sort((a, b) => Number(a.done) - Number(b.done))
  saveTargetQueue(merged)

  return { deviations, injected }
}
