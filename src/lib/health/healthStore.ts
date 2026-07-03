/**
 * healthStore.ts
 *
 * Local persistence for an imported Apple Health export. Parsing a multi-hundred-
 * megabyte zip is slow and the file lives only on the user's device, so once we
 * have the *parsed* result (a compact JSON summary — workouts + daily-mean metric
 * series) we cache it in localStorage. On the next visit the Import view loads it
 * automatically and offers a one-tap "import a new file" to replace it.
 *
 * Only the already-processed summary is stored — never the raw zip or export.xml.
 */

import type { HealthParseResult } from './appleHealthParser'

const KEY = 'mm.health.import.v1'

export interface StoredHealthImport {
  /** When the export was imported (epoch ms). */
  savedAt: number
  result: HealthParseResult
}

/** Persist the parsed result. Returns false if storage is full/unavailable. */
export function saveHealthResult(result: HealthParseResult): boolean {
  try {
    const payload: StoredHealthImport = { savedAt: Date.now(), result }
    localStorage.setItem(KEY, JSON.stringify(payload))
    return true
  } catch {
    // Quota exceeded or storage blocked — the import still works this session,
    // it just won't be remembered next time.
    return false
  }
}

/** Load a previously imported result, or null if none is stored / it's corrupt. */
export function loadHealthResult(): StoredHealthImport | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredHealthImport
    if (!parsed || !parsed.result || !Array.isArray(parsed.result.workouts)) return null
    return parsed
  } catch {
    return null
  }
}

/** Forget the stored import (used when the user wants a clean slate). */
export function clearHealthResult(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
