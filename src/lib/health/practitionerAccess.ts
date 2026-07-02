/**
 * practitionerAccess.ts
 *
 * Client <-> practitioner sharing for the Import Health Data feature.
 *
 * Permissions model (see supabase-schema.sql, practitioner_clients section):
 *   - A client explicitly grants a practitioner READ access by email via the
 *     grant_practitioner_access() SECURITY DEFINER function — only the client
 *     can create the link (RLS insert is client-scoped too).
 *   - Additive SELECT policies on muscle_load_health and rom_history let an
 *     approved practitioner read that client's rows. Nothing else changes:
 *     writes stay strictly per-user, and either side can end the link.
 *
 * All calls follow the same soft-fail pattern as muscleLoadHealth.ts so the UI
 * can render friendly notes instead of throwing.
 */

import { supabase } from '../supabase'
import { getActiveUserId } from '../movement/romHistory'
import {
  MUSCLE_GROUPS, renderLevelFor, type LoadClass, type MuscleGroupId,
  type MuscleGroupSummary, type MuscleLoadResult,
} from './muscleLoadEstimator'

export interface PractitionerLink {
  id: string
  practitionerUserId: string
  clientUserId: string
  /** Email the client typed when granting (shown in the client's list). */
  practitionerLabel: string | null
  /** Client's email captured at grant time (shown in the practitioner's list). */
  clientLabel: string | null
  status: 'approved' | 'revoked'
  createdAt: string
}

export interface AccessOutcome {
  ok: boolean
  error?: string
}

function mapRow(r: Record<string, unknown>): PractitionerLink {
  return {
    id: String(r.id),
    practitionerUserId: String(r.practitioner_user_id),
    clientUserId: String(r.client_user_id),
    practitionerLabel: (r.practitioner_label as string | null) ?? null,
    clientLabel: (r.client_label as string | null) ?? null,
    status: (r.status as 'approved' | 'revoked') ?? 'approved',
    createdAt: String(r.created_at ?? ''),
  }
}

/** CLIENT action: grant a practitioner (by account email) read access to my
 *  training-balance summary and joint-measurement history. */
export async function grantPractitionerAccess(practitionerEmail: string): Promise<AccessOutcome> {
  if (!getActiveUserId()) return { ok: false, error: 'Sign in to share your summary.' }
  const email = practitionerEmail.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' }
  try {
    const { data, error } = await supabase.rpc('grant_practitioner_access', { practitioner_email: email })
    if (error) return { ok: false, error: error.message }
    const res = data as { ok?: boolean; error?: string } | null
    if (res && res.ok === false) return { ok: false, error: res.error ?? 'Could not share.' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not share.' }
  }
}

/** CLIENT: list the practitioners I have granted access to. */
export async function listMyPractitioners(): Promise<PractitionerLink[]> {
  const me = getActiveUserId()
  if (!me) return []
  const { data, error } = await supabase
    .from('practitioner_clients')
    .select('*')
    .eq('client_user_id', me)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(mapRow)
}

/** CLIENT (or practitioner): end a sharing link. RLS lets either side delete. */
export async function revokePractitionerAccess(linkId: string): Promise<AccessOutcome> {
  try {
    const { error } = await supabase.from('practitioner_clients').delete().eq('id', linkId)
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not remove access.' }
  }
}

/** PRACTITIONER: list clients who granted me access. */
export async function listMyClients(): Promise<PractitionerLink[]> {
  const me = getActiveUserId()
  if (!me) return []
  const { data, error } = await supabase
    .from('practitioner_clients')
    .select('*')
    .eq('practitioner_user_id', me)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(mapRow)
}

export interface ClientSummaryFetch {
  result: MuscleLoadResult | null
  computedAt: string | null
  error?: string
}

/**
 * PRACTITIONER: fetch a connected client's most recent stored training-balance
 * summary (the latest computed_at batch in muscle_load_health) and rebuild the
 * MuscleLoadResult the balance view renders. Stored summaries always use the
 * default 7/28-day windows (see muscleLoadHealth.ts).
 */
export async function fetchClientLoadSummary(clientUserId: string): Promise<ClientSummaryFetch> {
  const { data, error } = await supabase
    .from('muscle_load_health')
    .select('muscle_group, load_7day, load_28day, acwr, classification, computed_at')
    .eq('user_id', clientUserId)
    .order('computed_at', { ascending: false })
    .limit(60)
  if (error) return { result: null, computedAt: null, error: error.message }
  if (!data || data.length === 0) {
    return { result: null, computedAt: null, error: 'This client has not imported health data yet.' }
  }

  // Keep only the newest batch (rows written by the same import share computed_at).
  const newest = String(data[0].computed_at)
  const batch = data.filter((r) => String(r.computed_at) === newest)

  const byGroup = new Map(batch.map((r) => [String(r.muscle_group), r]))
  const groups: MuscleGroupSummary[] = MUSCLE_GROUPS.map((def) => {
    const row = byGroup.get(def.id)
    const acwr = row && row.acwr != null ? Number(row.acwr) : null
    const classification = (row?.classification as LoadClass | undefined) ?? 'low'
    return {
      group: def.id as MuscleGroupId,
      label: def.label,
      loadRecent: row?.load_7day != null ? Number(row.load_7day) : 0,
      loadBaseline: row?.load_28day != null ? Number(row.load_28day) : 0,
      acwr,
      classification,
      confidence: 'estimated',
      renderLevel: renderLevelFor(classification, acwr),
    }
  })

  return {
    computedAt: newest,
    result: {
      referenceDate: newest.slice(0, 10),
      groups,
      recentDays: 7,
      baselineDays: 28,
      effectiveRecentDays: 7,
      effectiveBaselineDays: 28,
      availableDays: 28,
      workoutsInBaseline: 0,
      workoutsInRecent: 0,
    },
  }
}
