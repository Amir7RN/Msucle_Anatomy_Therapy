/**
 * PractitionerClientsView.tsx
 *
 * Practitioner side of health-data sharing: pick a connected client (one who
 * explicitly granted access via "Share with practitioner") and view their
 * stored training-balance summary on the same 3D balance view the client sees.
 *
 * "Check this" on a low-engagement group launches the EXISTING remote
 * assessment flow (RemoteAssessmentCall, host side) — the practitioner shares
 * the link with that client and guides the check live. Nothing is written to
 * the client's account from here: practitioner access is read-only by design
 * (see practitioner_clients RLS in supabase-schema.sql).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { X, Users, ChevronRight, Video, ArrowLeft } from 'lucide-react'
import { HealthBalanceView } from './HealthBalanceView'
import { RemoteAssessmentCall } from '../assessment/RemoteAssessmentCall'
import { randomId } from '../../lib/call/signaling'
import { getMovementsForMuscle } from '../../lib/movement/muscleJointMap'
import { useAtlasStore } from '../../store/atlasStore'
import { getActiveUserId } from '../../lib/movement/romHistory'
import {
  listMyClients, fetchClientLoadSummary, type PractitionerLink,
} from '../../lib/health/practitionerAccess'
import {
  groupDef, type MuscleGroupSummary, type MuscleLoadResult,
} from '../../lib/health/muscleLoadEstimator'

interface Props {
  open: boolean
  onClose: () => void
}

type Phase = 'list' | 'loading' | 'view' | 'error'

export function PractitionerClientsView({ open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('list')
  const [links, setLinks] = useState<PractitionerLink[] | null>(null)
  const [active, setActive] = useState<PractitionerLink | null>(null)
  const [summary, setSummary] = useState<{ result: MuscleLoadResult; computedAt: string } | null>(null)
  const [error, setError] = useState('')
  const [checkGroup, setCheckGroup] = useState<MuscleGroupSummary | null>(null)
  const [callRoom, setCallRoom] = useState('')

  // Same modal chrome convention as the other full-screen views.
  useEffect(() => {
    if (!open) return
    const { pushModal, popModal } = useAtlasStore.getState()
    pushModal()
    return () => popModal()
  }, [open])

  // Load the client list on open; reset on close.
  useEffect(() => {
    if (open) {
      setLinks(null)
      listMyClients().then(setLinks)
    } else {
      setPhase('list')
      setLinks(null)
      setActive(null)
      setSummary(null)
      setError('')
      setCheckGroup(null)
      setCallRoom('')
    }
  }, [open])

  async function openClient(link: PractitionerLink) {
    setActive(link)
    setPhase('loading')
    const res = await fetchClientLoadSummary(link.clientUserId)
    if (!res.result) {
      setError(res.error ?? 'No summary available for this client yet.')
      setPhase('error')
      return
    }
    setSummary({ result: res.result, computedAt: res.computedAt ?? '' })
    setPhase('view')
  }

  if (!open) return null

  const clientName = active?.clientLabel ?? 'this client'

  // ── Balance view for the selected client ────────────────────────────────────
  if (phase === 'view' && summary) {
    const computedDay = summary.computedAt ? summary.computedAt.slice(0, 10) : 'recently'
    return (
      <div className="fixed inset-0 z-[90] flex flex-col bg-[#040609] text-white">
        <header className="relative flex items-center gap-2 border-b border-white/10 bg-black/60 px-4 py-2 backdrop-blur-xl">
          <button
            onClick={() => { setPhase('list'); setSummary(null); setActive(null) }}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Back to client list"
          >
            <ArrowLeft size={15} />
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/10 ring-1 ring-violet-400/30">
            <Users size={14} className="text-violet-300" />
          </span>
          <span className="min-w-0 truncate text-sm font-semibold tracking-wide">{clientName}</span>
          <span className="ml-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-violet-500/30">
            Client view · read only
          </span>
        </header>
        <HealthBalanceView
          fixedResult={summary.result}
          persist={false}
          subtitle={`${clientName}'s stored summary from ${computedDay} — recent 7 days compared to their 28-day baseline. Shared with you by the client; you can view but not change it.`}
          onCheckOverride={(g) => setCheckGroup(g)}
          onClose={onClose}
        />

        {/* Delegated "Check this": run the existing remote flow with the client. */}
        {checkGroup && !callRoom && (
          <CheckWithClientModal
            group={checkGroup}
            clientName={clientName}
            onStart={() => setCallRoom(randomId(6))}
            onClose={() => setCheckGroup(null)}
          />
        )}
        {callRoom && (
          <RemoteAssessmentCall
            open={true}
            role="host"
            roomId={callRoom}
            onClose={() => { setCallRoom(''); setCheckGroup(null) }}
          />
        )}
      </div>
    )
  }

  // ── Client list / loading / error ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/95 text-white">
      <div className="m-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-violet-400" />
            <h2 className="text-base font-semibold">Your clients</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {!getActiveUserId() ? (
          <p className="mt-4 text-xs text-slate-400">
            Sign in to see clients who have shared their training-balance summary with you.
          </p>
        ) : phase === 'loading' ? (
          <p className="mt-4 text-xs text-slate-400">Loading {clientName}&apos;s summary…</p>
        ) : phase === 'error' ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-200">{error}</div>
            <button
              onClick={() => { setPhase('list'); setError('') }}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
            >
              Back to list
            </button>
          </div>
        ) : links === null ? (
          <p className="mt-4 text-xs text-slate-400">Loading your client list…</p>
        ) : links.length === 0 ? (
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            No clients yet. A client connects by opening <span className="font-semibold text-slate-200">Import
            Health Data</span>, viewing their training balance, and entering your account email under{' '}
            <span className="font-semibold text-slate-200">Share with practitioner</span>.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-800 rounded-lg border border-slate-800">
            {links.map((l) => (
              <button
                key={l.id}
                onClick={() => void openClient(l)}
                className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-bold uppercase text-violet-300">
                  {(l.clientLabel ?? '?').slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-100">
                    {l.clientLabel ?? 'Connected client'}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    Shared {l.createdAt ? l.createdAt.slice(0, 10) : ''}
                  </span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-slate-600 group-hover:text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Confirms the delegated "Check this": names the target group and its
 * representative movement, then hands off to the EXISTING RemoteAssessmentCall
 * (host side) so the practitioner runs the check live with the client.
 */
function CheckWithClientModal({
  group, clientName, onStart, onClose,
}: {
  group: MuscleGroupSummary
  clientName: string
  onStart: () => void
  onClose: () => void
}) {
  const def = groupDef(group.group)
  const movement = useMemo(() => getMovementsForMuscle(def.assess.muscleId)[0], [def.assess.muscleId])

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Check {def.label} with {clientName}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={15} />
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          This starts the existing live remote session (you host, they join by link).
          {movement
            ? <> Guide them through <span className="font-semibold text-slate-200">{movement.label}</span> to
                see where this group stands.</>
            : <> Guide them through the movements you want to review for this group.</>}
        </p>
        <button
          onClick={onStart}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
        >
          <Video size={13} /> Start live session
        </button>
      </div>
    </div>
  )
}
