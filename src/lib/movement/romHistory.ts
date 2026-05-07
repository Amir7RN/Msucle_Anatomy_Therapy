/**
 * romHistory.ts
 *
 * localStorage-backed history of ROM measurements, keyed per muscle+movement.
 * Used to compute "you improved 12% since last session" trend indicators.
 */

const KEY = 'muscleAtlas.rom.history.v1'
const MAX_RECORDS = 500   // bounded to keep localStorage small

export interface ROMRecord {
  muscleId:   string
  movementId: string
  side:       'L' | 'R'
  /** Measured peak angle in degrees. */
  angle:      number
  /** Reference ideal at the time the record was made. */
  reference:  number
  ts:         number
}

export function loadROMHistory(): ROMRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as ROMRecord[]
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function saveROMRecord(rec: ROMRecord): void {
  try {
    const next = [...loadROMHistory(), rec].slice(-MAX_RECORDS)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* localStorage unavailable — silently fail */ }
}

/** Records for one specific muscle + movement + side, oldest → newest. */
export function getRecordsFor(
  muscleId: string,
  movementId: string,
  side: 'L' | 'R',
): ROMRecord[] {
  return loadROMHistory()
    .filter((r) => r.muscleId === muscleId && r.movementId === movementId && r.side === side)
    .sort((a, b) => a.ts - b.ts)
}

/** Improvement % vs. previous record for the same muscle/movement/side. */
export function computeImprovement(records: ROMRecord[]): number | null {
  if (records.length < 2) return null
  const prev = records[records.length - 2].angle
  const cur  = records[records.length - 1].angle
  if (prev <= 1) return null
  return Math.round(((cur - prev) / prev) * 100)
}

export function clearROMHistory(): void {
  try { localStorage.removeItem(KEY) } catch {}
}
