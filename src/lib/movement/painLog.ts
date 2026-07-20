/**
 * painLog.ts
 *
 * Local log of "this hurts" events raised mid-exercise. Each entry records
 * which exercise hurt and what the user chose to do about it, so future
 * program generation can avoid or de-load the offending movements.
 */

const STORAGE_KEY  = 'muscleAtlas.painLog.v1'
const MAX_ENTRIES  = 200

export interface PainEvent {
  ts:         number
  exerciseId: string
  muscleId?:  string
  action:     'switched' | 'continued' | 'stopped'
  /** Exercise swapped to, when action === 'switched'. */
  switchedTo?: string
}

export function loadPainLog(): PainEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as PainEvent[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function logPain(ev: Omit<PainEvent, 'ts'>): void {
  try {
    const log = loadPainLog()
    log.push({ ...ev, ts: Date.now() })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-MAX_ENTRIES)))
  } catch { /* quota / private mode — ignore */ }
}
