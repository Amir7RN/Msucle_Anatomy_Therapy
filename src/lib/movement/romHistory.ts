/**
 * romHistory.ts
 *
 * Per-user ROM history.
 *
 * Public API is sync (same shape as the original localStorage-only version)
 * so callers in ExerciseGuidance / MetadataPanel / AssessmentView keep
 * working unchanged:
 *
 *   loadROMHistory()                     -> ROMRecord[]
 *   saveROMRecord(rec)                   -> void   (also fires async Supabase insert)
 *   getRecordsFor(muscle, mv, side)      -> ROMRecord[]
 *   computeImprovement(records)          -> number | null
 *   clearROMHistory()                    -> void
 *
 * Per-user isolation
 * ──────────────────
 * Under the hood we keep TWO completely separate localStorage buckets:
 *   - "rom.v1.anon"        — only the current guest session
 *   - "rom.v1.user.<uid>"  — namespaced per signed-in user
 *
 * On sign-in we swap the active bucket to the user's key and hydrate that
 * bucket from Supabase (replacing anything stale).  On sign-out we swap
 * back to the anon bucket, which we have ALREADY wiped, so the next guest
 * session starts fresh and the next signed-in user can never see anyone
 * else's data.
 *
 * No automatic local→cloud migration.  Each account is its own world.
 */

import { supabase } from '../supabase'

const ANON_KEY      = 'muscleAtlas.rom.v1.anon'
const USER_KEY_PFX  = 'muscleAtlas.rom.v1.user.'
const MAX_RECORDS   = 500

export interface ROMRecord {
  muscleId:   string
  movementId: string
  side:       'L' | 'R'
  angle:      number
  reference:  number
  ts:         number
  /** Set when the record was fetched from Supabase. */
  id?:        string
}

// ─── State ───────────────────────────────────────────────────────────────────
let currentUserId: string | null = null
let activeStorageKey: string = ANON_KEY
let cache: ROMRecord[] = readFromStorage(ANON_KEY)

// ─── Reactive layer ──────────────────────────────────────────────────────────
// Components (e.g. MetadataPanel) need to re-rank exercises when a new ROM
// record is saved or the cache is replaced after sign-in. Plain mutation of
// the module-level cache doesn't trigger React renders, so we publish a
// monotonic version counter on every change. Components subscribe via the
// useROMVersion hook below and add the returned number to their useMemo
// deps — re-running the severity computation when it ticks.
let romVersion = 0
const romSubscribers = new Set<() => void>()
function bumpVersion(): void {
  romVersion += 1
  for (const cb of romSubscribers) {
    try { cb() } catch { /* subscriber error - skip */ }
  }
}
export function getROMVersion(): number { return romVersion }
export function subscribeROM(cb: () => void): () => void {
  romSubscribers.add(cb)
  return () => { romSubscribers.delete(cb) }
}

function readFromStorage(key: string): ROMRecord[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw) as ROMRecord[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeToStorage(key: string, records: ROMRecord[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(records.slice(-MAX_RECORDS)))
  } catch { /* quota / private-mode — ignore */ }
}

// ─── Auth-state transitions (called by authContext) ─────────────────────────

/**
 * Replace the in-memory cache with the user's cloud rows.  Called by
 * authContext on SIGNED_IN.  We:
 *   1. Switch the active localStorage key to user-scoped.
 *   2. Wipe the anon bucket so a future guest session never inherits it.
 *   3. Replace `cache` with what Supabase returns (no merge — strict isolation).
 *   4. Persist the cloud rows under the user's key as an offline cache.
 */
export async function hydrateFromSupabase(userId: string): Promise<void> {
  currentUserId    = userId
  activeStorageKey = USER_KEY_PFX + userId

  // Wipe the anon bucket so a future guest can't see the previous guest's data.
  try { localStorage.removeItem(ANON_KEY) } catch {}

  // Start from an empty cache while we wait for the cloud read.
  cache = []

  try {
    const { data, error } = await supabase
      .from('rom_history')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(MAX_RECORDS)
    if (error || !data) return
    cache = data.map((row: any) => ({
      muscleId:   row.muscle_id,
      movementId: row.movement_id,
      side:       row.side,
      angle:      row.angle,
      reference:  row.reference,
      ts:         new Date(row.created_at).getTime(),
      id:         row.id,
    }))
    writeToStorage(activeStorageKey, cache)
  } catch (err) {
    console.warn('[romHistory] hydrateFromSupabase failed:', err)
  }
  bumpVersion()
}

/**
 * Called by authContext on SIGNED_OUT. Wipes the in-memory cache and every
 * persisted bucket (anon + the user's own) so the next user starts fresh.
 */
export function clearSupabaseUser(): void {
  // Wipe the user's local bucket — RLS would scope cloud reads anyway, but the
  // localStorage cache is shared across users on the same browser session.
  if (currentUserId) {
    try { localStorage.removeItem(USER_KEY_PFX + currentUserId) } catch {}
  }
  // Also wipe the anon bucket so a fresh guest starts empty.
  try { localStorage.removeItem(ANON_KEY) } catch {}
  currentUserId    = null
  activeStorageKey = ANON_KEY
  cache            = []
  bumpVersion()
}

// ─── Background Supabase write ───────────────────────────────────────────────

function pushToSupabase(rec: ROMRecord): void {
  if (!currentUserId) return
  // user_id is sent EXPLICITLY (not relying on the optional DB trigger).
  // This makes inserts succeed whether the user's Supabase project has
  // the trigger installed or not. RLS still scopes rows by auth.uid().
  supabase.from('rom_history').insert({
    user_id:     currentUserId,
    muscle_id:   rec.muscleId,
    movement_id: rec.movementId,
    side:        rec.side,
    angle:       rec.angle,
    reference:   rec.reference,
  }).then(({ error }) => {
    if (error) {
      // Loud error so a misconfigured DB / missing table / RLS issue is
      // obvious in DevTools. Common causes:
      //  - 42P01 / "relation does not exist" -> user hasn't run supabase-schema.sql
      //  - 42501 / "permission denied" -> RLS policy missing or wrong
      //  - 23502 / "null value in column" -> user_id wasn't set; check schema
      console.error('[romHistory] Supabase insert FAILED:', error,
        '\nRecord:', { muscle_id: rec.muscleId, movement_id: rec.movementId, side: rec.side, angle: rec.angle },
        '\nFix: run docs/supabase-schema.sql in your Supabase project SQL editor.',
      )
    }
  })
}

// ─── Public sync API ─────────────────────────────────────────────────────────

export function loadROMHistory(): ROMRecord[] {
  return cache
}

export function saveROMRecord(rec: ROMRecord): void {
  cache.push(rec)
  if (cache.length > MAX_RECORDS) cache = cache.slice(-MAX_RECORDS)
  writeToStorage(activeStorageKey, cache)
  pushToSupabase(rec)
  bumpVersion()
}

export function getRecordsFor(
  muscleId: string,
  movementId: string,
  side: 'L' | 'R',
): ROMRecord[] {
  return cache
    .filter((r) => r.muscleId === muscleId && r.movementId === movementId && r.side === side)
    .sort((a, b) => a.ts - b.ts)
}

/** Improvement % vs. the previous record for the same muscle/movement/side. */
export function computeImprovement(records: ROMRecord[]): number | null {
  if (records.length < 2) return null
  const prev = records[records.length - 2].angle
  const cur  = records[records.length - 1].angle
  if (prev <= 1) return null
  return Math.round(((cur - prev) / prev) * 100)
}

export function clearROMHistory(): void {
  cache = []
  try { localStorage.removeItem(activeStorageKey) } catch {}
  bumpVersion()
}

// ─── Compatibility shim ──────────────────────────────────────────────────────
// authContext used to call migrateLocalStorageToSupabase to push anon data
// into a new account.  We now favour strict per-user isolation (the user
// explicitly asked for "fresh per account") so this is a no-op kept only so
// the import in authContext doesn't break on partial rebuilds.
export async function migrateLocalStorageToSupabase(_userId: string): Promise<number> {
  return 0
}
