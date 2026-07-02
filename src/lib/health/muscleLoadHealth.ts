/**
 * muscleLoadHealth.ts
 *
 * Persistence for the Import Health Data feature. Writes the computed per-muscle
 * training-workload summary to Supabase (table: muscle_load_health), scoped to
 * the signed-in user via the same RLS pattern as rom_history — explicit user_id
 * on insert, auth.uid() scoping in the policy, no cross-user access.
 *
 * Only the final computed summary leaves the browser. The Apple Health export
 * itself is parsed on-device and never uploaded.
 */

import { supabase } from '../supabase'
import { getActiveUserId } from '../movement/romHistory'
import type { MuscleLoadResult } from './muscleLoadEstimator'

export interface SaveOutcome {
  saved: boolean
  reason?: 'not-signed-in' | 'error'
  error?: string
}

/**
 * Insert one row per muscle group for the current user. Mirrors romHistory's
 * pushToSupabase: user_id is sent explicitly so inserts work whether or not the
 * optional DB default-trigger is installed; RLS still scopes by auth.uid().
 *
 * Returns an outcome instead of throwing so the UI can show a soft note when the
 * user is browsing as a guest.
 */
export async function saveMuscleLoadSummaries(result: MuscleLoadResult): Promise<SaveOutcome> {
  const userId = getActiveUserId()
  if (!userId) return { saved: false, reason: 'not-signed-in' }

  // The stored summary always uses the DEFAULT 7/28-day windows (callers pass
  // the default-window result), so rows stay comparable across imports no
  // matter what exploratory windows the user selects in the UI.
  const rows = result.groups.map((g) => ({
    user_id:        userId,
    muscle_group:   g.group,
    load_7day:      round(g.loadRecent),
    load_28day:     round(g.loadBaseline),
    acwr:           g.acwr == null ? null : round(g.acwr),
    classification: g.classification,
  }))

  try {
    const { error } = await supabase.from('muscle_load_health').insert(rows)
    if (error) {
      console.error('[muscleLoadHealth] Supabase insert FAILED:', error,
        '\nFix: run the muscle_load_health migration in supabase-schema.sql.')
      return { saved: false, reason: 'error', error: error.message }
    }
    return { saved: true }
  } catch (err) {
    return { saved: false, reason: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
