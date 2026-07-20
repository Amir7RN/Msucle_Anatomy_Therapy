/**
 * deficits.ts
 *
 * Turns the user's measured ROM history into a one-line "why this exercise"
 * statement for a given target muscle — e.g.
 *
 *   "Targets your right shoulder external rotation deficit — 18° below
 *    target (measured 72° / 90°)."
 *
 * Returns null when the user has no history for the muscle or their worst
 * movement is already ≥95% of the reference (no meaningful deficit).
 */

import { loadROMHistory, type ROMRecord } from '../movement/romHistory'
import { JOINT_MOVEMENTS } from '../movement/muscleJointMap'

export interface DeficitInfo {
  /** Human sentence for the exercise card. */
  line: string
  /** Worst movement's % of reference (0–100). */
  pct:  number
}

export function worstDeficitFor(muscleId: string | undefined | null): DeficitInfo | null {
  if (!muscleId) return null
  const all = loadROMHistory()
  // Exact muscle match first; fall back to a loose contains match so
  // "deltoid" still finds "deltoid_posterior" records and vice versa.
  let records = all.filter((r) => r.muscleId === muscleId)
  if (records.length === 0) {
    records = all.filter((r) => r.muscleId.includes(muscleId) || muscleId.includes(r.muscleId))
  }
  if (records.length === 0) return null

  // Best peak per (movement, side) — the user's demonstrated capacity.
  const best = new Map<string, ROMRecord>()
  for (const r of records) {
    const k = `${r.movementId}__${r.side}`
    const cur = best.get(k)
    if (!cur || r.angle > cur.angle) best.set(k, r)
  }

  // Lowest %-of-reference movement is the deficit worth naming.
  let worst: { rec: ROMRecord; ideal: number; ratio: number; label: string } | null = null
  for (const r of best.values()) {
    const mv = JOINT_MOVEMENTS[r.movementId]
    const ideal = mv?.reference.ideal ?? r.reference
    if (!ideal || ideal <= 0) continue
    const ratio = r.angle / ideal
    if (!worst || ratio < worst.ratio) {
      worst = { rec: r, ideal, ratio, label: mv?.label ?? r.movementId.replace(/_/g, ' ') }
    }
  }
  if (!worst || worst.ratio >= 0.95) return null

  const missing = Math.round(worst.ideal - worst.rec.angle)
  const side = worst.rec.side === 'L' ? 'left' : 'right'
  return {
    pct:  Math.round(worst.ratio * 100),
    line: `Targets your ${side} ${worst.label.toLowerCase()} deficit — ${missing}° below target (measured ${Math.round(worst.rec.angle)}° / ${Math.round(worst.ideal)}°).`,
  }
}
