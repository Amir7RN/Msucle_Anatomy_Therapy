/**
 * gaitHistory.ts
 *
 * Local, per-user history of Ankle Dynamics (walking) sessions so a signed-in
 * user can come back and see their previous results.
 *
 * Storage model mirrors romHistory: a separate localStorage bucket per user,
 * keyed by the active Supabase user id (or an anon bucket for guests).  We read
 * the active user id live from romHistory.getActiveUserId() so the bucket
 * follows sign-in / sign-out automatically — no extra auth wiring needed.
 *
 * We persist the per-frame samples (downsampled) alongside the summary so a
 * saved session can be re-exported as CSV later.  Capped to the most recent
 * MAX_SESSIONS to keep localStorage small.
 */

import { getActiveUserId } from './romHistory'
import type { GaitSample, GaitSummary } from './gait'

const ANON_KEY     = 'muscleAtlas.gait.v1.anon'
const USER_KEY_PFX = 'muscleAtlas.gait.v1.user.'
const MAX_SESSIONS = 25

export interface GaitSessionRecord {
  id:      string
  ts:      number          // epoch ms
  summary: GaitSummary
  samples: GaitSample[]     // downsampled
}

function activeKey(): string {
  const uid = getActiveUserId()
  return uid ? USER_KEY_PFX + uid : ANON_KEY
}

function read(key: string): GaitSessionRecord[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as GaitSessionRecord[]) : []
  } catch {
    return []
  }
}

function write(key: string, recs: GaitSessionRecord[]): void {
  try { localStorage.setItem(key, JSON.stringify(recs.slice(-MAX_SESSIONS))) } catch { /* quota */ }
}

/** Downsample to ~250 points so a long walk doesn't bloat localStorage. */
function downsample(samples: GaitSample[], target = 250): GaitSample[] {
  if (samples.length <= target) return samples
  const stride = Math.ceil(samples.length / target)
  return samples.filter((_, i) => i % stride === 0)
}

// ── Reactive bump so the UI refreshes when a session is saved ────────────────
let version = 0
const subs = new Set<() => void>()
export function getGaitVersion(): number { return version }
export function subscribeGait(cb: () => void): () => void {
  subs.add(cb)
  return () => { subs.delete(cb) }
}
function bump(): void {
  version += 1
  for (const cb of subs) { try { cb() } catch { /* skip */ } }
}

/** Persist a completed session for the current user. Returns the saved record. */
export function saveGaitSession(summary: GaitSummary, samples: GaitSample[]): GaitSessionRecord {
  const rec: GaitSessionRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    summary,
    samples: downsample(samples),
  }
  const key = activeKey()
  const next = [...read(key), rec]
  write(key, next)
  bump()
  return rec
}

/** All saved sessions for the current user, most recent first. */
export function loadGaitHistory(): GaitSessionRecord[] {
  return [...read(activeKey())].sort((a, b) => b.ts - a.ts)
}

export function clearGaitHistory(): void {
  try { localStorage.removeItem(activeKey()) } catch { /* ignore */ }
  bump()
}
