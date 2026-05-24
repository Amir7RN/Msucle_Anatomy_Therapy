/**
 * symmetry.ts
 *
 * Compute left vs right asymmetry per joint movement from the user's ROM
 * history. Each movement gets a SymmetryScore with a 0-100% asymmetry value
 * and a clinical band (good / watch / risk).
 *
 * A 15 % side-to-side gap is the typical clinical threshold for "watch";
 * 20 %+ is "risk" territory for sport medicine (NSCA / Sahrmann conventions).
 */

import { loadROMHistory, type ROMRecord } from '../movement/romHistory'
import { JOINT_MOVEMENTS } from '../movement/muscleJointMap'

export type SymmetryBand = 'good' | 'watch' | 'risk' | 'incomplete'

export interface SymmetryScore {
  movementId: string
  label:      string         // human-readable movement name
  joint:      string         // 'shoulder' | 'hip' | etc.
  leftAngle:  number | null  // best peak for L (null if no L data)
  rightAngle: number | null  // best peak for R (null if no R data)
  reference:  number         // healthy reference (ideal) ROM
  asymmetryPct: number | null   // |L - R| / max(L, R) * 100 — null if either side missing
  band:       SymmetryBand
  /** Body region for the heatmap colouring. */
  region:     SymmetryRegion
}

/** Body regions mapped onto the SVG body silhouette. */
export type SymmetryRegion =
  | 'left_shoulder'  | 'right_shoulder'
  | 'left_elbow'     | 'right_elbow'
  | 'left_hip'       | 'right_hip'
  | 'left_knee'      | 'right_knee'
  | 'left_ankle'     | 'right_ankle'
  | 'neck'           | 'trunk'

const REGION_FOR_JOINT: Record<string, [SymmetryRegion, SymmetryRegion]> = {
  shoulder: ['left_shoulder', 'right_shoulder'],
  elbow:    ['left_elbow',    'right_elbow'],
  hip:      ['left_hip',      'right_hip'],
  knee:     ['left_knee',     'right_knee'],
  ankle:    ['left_ankle',    'right_ankle'],
  cervical: ['neck',          'neck'],
  trunk:    ['trunk',         'trunk'],
}

const BAND_THRESHOLDS = {
  good:  10,   // < 10 % asymmetry = green
  watch: 20,   // 10..20 = amber
  // > 20 = red (risk)
}

/** Best (highest) angle for one muscle/movement/side. */
function bestAnglePerSide(records: ROMRecord[], movementId: string, side: 'L' | 'R'): number | null {
  let best: number | null = null
  for (const r of records) {
    if (r.movementId !== movementId || r.side !== side) continue
    if (best === null || r.angle > best) best = r.angle
  }
  return best
}

function bandFor(asym: number | null): SymmetryBand {
  if (asym === null) return 'incomplete'
  if (asym < BAND_THRESHOLDS.good)  return 'good'
  if (asym < BAND_THRESHOLDS.watch) return 'watch'
  return 'risk'
}

/** Hex color for the SVG fill. */
export function colorForBand(band: SymmetryBand): string {
  switch (band) {
    case 'good':       return '#34d399'   // emerald
    case 'watch':      return '#fbbf24'   // amber
    case 'risk':       return '#ef4444'   // red
    case 'incomplete': return '#475569'   // slate (no data)
  }
}

/**
 * Build SymmetryScore for every movement that has been assessed. Returns
 * one entry per JOINT_MOVEMENTS id with either-side support so the report
 * can show "Shoulder Flexion: 165° L vs 175° R, 5.7% — green".
 */
export function computeAllSymmetry(): SymmetryScore[] {
  const records = loadROMHistory()
  const out: SymmetryScore[] = []

  for (const mv of Object.values(JOINT_MOVEMENTS)) {
    if (mv.side !== 'either') continue   // L/R-only tests (e.g. cervical_rotation_left) don't symmetry-compare
    const leftAngle  = bestAnglePerSide(records, mv.id, 'L')
    const rightAngle = bestAnglePerSide(records, mv.id, 'R')
    let asymmetryPct: number | null = null
    if (leftAngle !== null && rightAngle !== null && Math.max(leftAngle, rightAngle) > 1) {
      asymmetryPct = (Math.abs(leftAngle - rightAngle) / Math.max(leftAngle, rightAngle)) * 100
    }
    const [leftRegion, rightRegion] = REGION_FOR_JOINT[mv.joint] ?? ['trunk', 'trunk']
    // For paired-side joints we report two records (one per region) so the
    // body diagram can colour each side appropriately based on which side
    // is the weaker one.
    out.push({
      movementId:   mv.id,
      label:        mv.label,
      joint:        mv.joint,
      leftAngle,
      rightAngle,
      reference:    mv.reference.ideal,
      asymmetryPct,
      band:         bandFor(asymmetryPct),
      // Use the WEAKER side's region as the "hotspot" so the diagram glows
      // on the side actually limited. Tie -> right.
      region:       (leftAngle !== null && rightAngle !== null && leftAngle < rightAngle)
                      ? leftRegion : rightRegion,
    })
  }

  // Sort: risk -> watch -> good -> incomplete; then by asymmetry desc.
  const rank: Record<SymmetryBand, number> = { risk: 0, watch: 1, good: 2, incomplete: 3 }
  out.sort((a, b) => {
    if (rank[a.band] !== rank[b.band]) return rank[a.band] - rank[b.band]
    return (b.asymmetryPct ?? -1) - (a.asymmetryPct ?? -1)
  })
  return out
}

/**
 * Aggregate the worst band per body region — used by the SVG body
 * silhouette to color each region by its weakest movement.
 */
export function regionColors(scores: SymmetryScore[]): Record<SymmetryRegion, string> {
  const result: Record<string, SymmetryBand> = {}
  for (const s of scores) {
    if (s.band === 'incomplete') continue
    const cur = result[s.region]
    if (!cur || (cur === 'good' && s.band !== 'good') || (cur === 'watch' && s.band === 'risk')) {
      result[s.region] = s.band
    }
  }
  const colors: Partial<Record<SymmetryRegion, string>> = {}
  for (const [region, band] of Object.entries(result)) {
    colors[region as SymmetryRegion] = colorForBand(band as SymmetryBand)
  }
  return colors as Record<SymmetryRegion, string>
}

/** Overall summary stats for the report header. */
export function summarize(scores: SymmetryScore[]): {
  totalMeasured: number
  riskCount:     number
  watchCount:    number
  goodCount:     number
  overallScore:  number   // 0..100, higher = more symmetric overall
} {
  const measured = scores.filter((s) => s.band !== 'incomplete')
  const risk  = measured.filter((s) => s.band === 'risk').length
  const watch = measured.filter((s) => s.band === 'watch').length
  const good  = measured.filter((s) => s.band === 'good').length
  // Score: weighted average of (100 - asymmetryPct), capped at 0.
  const score = measured.length === 0 ? 0
    : Math.round(
        measured.reduce((acc, s) => acc + Math.max(0, 100 - (s.asymmetryPct ?? 0)), 0) /
        measured.length,
      )
  return {
    totalMeasured: measured.length,
    riskCount: risk,
    watchCount: watch,
    goodCount: good,
    overallScore: score,
  }
}
