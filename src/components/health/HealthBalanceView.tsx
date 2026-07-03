/**
 * HealthBalanceView.tsx
 *
 * Renders a health-data training-balance result on the SAME 3D model, camera,
 * lighting and background used by the Live Muscle Twin — MuscleTwinModel is
 * reused unchanged (plus its opt-in orbit controls). The only difference from
 * the live view is the colour source: instead of live joint-angle intensity,
 * each muscle is coloured by its group's ACWR-derived load level.
 *
 * Two modes:
 *   - workouts mode (client's own import): adjustable recent/baseline window
 *     sliders recompute the ratio live (debounced); the default 7/28-day
 *     summary is persisted once. Includes "Share with practitioner".
 *   - fixedResult mode (practitioner viewing a connected client's stored
 *     summary): read-only, never persists, "Check this" is delegated to the
 *     caller so it can launch the remote flow scoped to that client.
 *
 * Groups classified "Needs attention" (low engagement) get a "Check this"
 * button that launches the EXISTING AssessmentView flow, pre-scoped to that
 * group's representative muscle + movement.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Activity, Share2, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { MuscleTwinModel } from '../movement/MuscleTwinModel'
import { AssessmentSession } from '../assessment/AssessmentView'
import { getMovementsForMuscle } from '../../lib/movement/muscleJointMap'
import { getActiveUserId } from '../../lib/movement/romHistory'
import type { BoneDirs } from '../../lib/movement/poseRig'
import type { LiveMuscleActivation } from '../../lib/movement/liveMuscleActivation'
import type { HealthParseResult } from '../../lib/health/appleHealthParser'
import { loadToActivations } from '../../lib/health/muscleLoadRender'
import { ageFromProfile } from '../../lib/health/healthInsights'
import { HealthInsights } from './HealthInsights'
import {
  CLASS_LABEL, DEFAULT_WINDOWS, estimateMuscleLoad, groupDef,
  type LoadClass, type MuscleGroupSummary, type MuscleLoadResult,
} from '../../lib/health/muscleLoadEstimator'
import { saveMuscleLoadSummaries, type SaveOutcome } from '../../lib/health/muscleLoadHealth'
import {
  grantPractitionerAccess, listMyPractitioners, revokePractitionerAccess,
  type PractitionerLink,
} from '../../lib/health/practitionerAccess'

// Legend swatches sampled from the twin model's colour ramp (tan -> amber ->
// red), matching the established convention: cool/neutral = low engagement,
// hot = high load.
const CLASS_SWATCH: Record<LoadClass, string> = {
  low:      '#6b5b4a', // neutral tan
  balanced: '#b9832f', // tan->amber
  elevated: '#f59e0b', // amber
  high:     '#b91c1c', // red
}

// Slider bounds (days). Recent: 1 day .. 12 months; baseline: ~1 month .. 7 years.
const RECENT_MIN = 1
const RECENT_MAX = 365
const BASELINE_MIN = 28
const BASELINE_MAX = 7 * 365

interface Props {
  /** Full parse result (workouts + metrics + profile) — enables the adjustable
   *  comparison windows and the Insights tab. */
  parse?: HealthParseResult
  /** Pre-computed summary (practitioner view of a client's stored rows). */
  fixedResult?: MuscleLoadResult
  /** Persist the default-window summary to Supabase (client mode only). */
  persist?: boolean
  /** Replaces the workouts-based summary sentence (practitioner view). */
  subtitle?: string
  /** When set, "Check this" is delegated instead of opening the local session. */
  onCheckOverride?: (g: MuscleGroupSummary) => void
  onClose: () => void
}

export function HealthBalanceView({
  parse, fixedResult, persist = true, subtitle, onCheckOverride, onClose,
}: Props) {
  const workouts = parse?.workouts
  // Age from the export's DOB personalises the HR-intensity band.
  const ageYears = useMemo(() => ageFromProfile(parse?.profile), [parse?.profile])

  // ── Adjustable windows (workouts mode) ────────────────────────────────────
  const [win, setWin] = useState({ ...DEFAULT_WINDOWS })
  const [tab, setTab] = useState<'balance' | 'insights'>('balance')
  const [computed, setComputed] = useState<MuscleLoadResult | null>(
    () => (workouts ? estimateMuscleLoad(workouts, Date.now(), { ageYears }) : null),
  )

  // Debounced live recompute as the sliders move. estimateMuscleLoad is a
  // single linear pass, but debouncing keeps slider drags smooth on huge
  // exports and avoids re-painting the model on every pixel of movement.
  useEffect(() => {
    if (!workouts) return
    const id = window.setTimeout(
      () => setComputed(estimateMuscleLoad(workouts, Date.now(), { ...win, ageYears })),
      180,
    )
    return () => window.clearTimeout(id)
  }, [workouts, win, ageYears])

  const result = fixedResult ?? computed

  // ── Colour wiring ─────────────────────────────────────────────────────────
  // Assign SYNCHRONOUSLY during render so the twin's frame loop reads the
  // load-derived colours from its very first frame (the old effect-only
  // assignment left the model uniformly baseline).
  const acts = useMemo<LiveMuscleActivation[]>(
    () => (result ? loadToActivations(result) : []),
    [result],
  )
  const activationsRef = useRef<LiveMuscleActivation[]>(acts)
  activationsRef.current = acts
  const boneDirsRef = useRef<BoneDirs>({})

  useEffect(() => {
    if (import.meta.env.DEV && result) {
      // Sanity trace: these values must match the sidebar list 1:1.
      console.debug('[health-balance] per-group levels',
        result.groups.map((g) => `${g.label}: acwr=${g.acwr == null ? 'n/a' : g.acwr.toFixed(2)} class=${g.classification} level=${g.renderLevel.toFixed(2)}`))
    }
  }, [result])

  // ── Persist the DEFAULT-window summary once (client mode, signed in) ──────
  const [saveNote, setSaveNote] = useState<SaveOutcome | null>(null)
  useEffect(() => {
    if (!persist || !workouts) return
    let cancelled = false
    saveMuscleLoadSummaries(estimateMuscleLoad(workouts, Date.now(), { ageYears })).then((o) => {
      if (!cancelled) setSaveNote(o)
    })
    return () => { cancelled = true }
  }, [persist, workouts, ageYears])

  const [checkGroup, setCheckGroup] = useState<MuscleGroupSummary | null>(null)

  // Sort by workload share (heaviest first) — the primary number now.
  const sorted = useMemo(
    () => (result ? [...result.groups].sort((a, b) => b.sharePctRecent - a.sharePctRecent || rank(b.classification) - rank(a.classification)) : []),
    [result],
  )
  const maxShare = useMemo(
    () => Math.max(...sorted.map((g) => g.sharePctRecent), 1),
    [sorted],
  )
  const lowGroups = sorted.filter((g) => g.classification === 'low')

  if (!result) return null

  const baselineClamped = result.effectiveBaselineDays < result.baselineDays
  const recentClamped = result.effectiveRecentDays < result.recentDays

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      {/* 3D model — reused twin component, same camera/lighting/background,
          orbit controls enabled (drag to rotate, pinch/scroll to zoom). */}
      <div className="relative h-[42vh] w-full shrink-0 lg:h-auto lg:flex-1">
        <MuscleTwinModel activationsRef={activationsRef} boneDirsRef={boneDirsRef} orbit />

        {/* Legend — colour now encodes each group's SHARE of total workload. */}
        <div className="absolute left-3 top-3 rounded-lg bg-black/55 px-3 py-2 text-[10px] text-slate-200 backdrop-blur">
          <div className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Workload share</div>
          <div
            className="h-2 w-28 rounded-full"
            style={{ background: 'linear-gradient(90deg, #6b5b4a 0%, #b9832f 40%, #f59e0b 70%, #b91c1c 100%)' }}
          />
          <div className="mt-0.5 flex justify-between text-[9px] text-slate-400">
            <span>0%</span>
            <span>most-worked</span>
          </div>
        </div>
      </div>

      {/* Group breakdown */}
      <aside className="relative flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl lg:w-[26rem] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100">
            {subtitle ? 'Training balance' : 'Your training balance'}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Summary line — reflects whatever windows are currently selected. */}
        {subtitle ? (
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        ) : (
          <p className="text-[11px] text-slate-400">
            Based on {result.workoutsInBaseline} workout{result.workoutsInBaseline === 1 ? '' : 's'} in
            the last {fmtWindow(result.effectiveBaselineDays)}. Each group compares your recent{' '}
            {fmtWindow(result.effectiveRecentDays)} workload to your{' '}
            {fmtWindow(result.effectiveBaselineDays)} average.
            {(baselineClamped || recentClamped) && (
              <span className="text-amber-300/90">
                {' '}Your history covers {fmtWindow(result.availableDays)}, so the comparison uses that
                full available range.
              </span>
            )}
          </p>
        )}

        {/* Window sliders — only when we hold the raw workouts to recompute. */}
        {workouts && (
          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <WindowSlider
              label="Recent window"
              min={RECENT_MIN} max={RECENT_MAX}
              value={win.recentDays}
              display={fmtWindow(win.recentDays)}
              accent="accent-rose-400"
              onChange={(v) => setWin((w) => ({ ...w, recentDays: v }))}
            />
            <WindowSlider
              label="Baseline window"
              min={BASELINE_MIN} max={BASELINE_MAX}
              value={win.baselineDays}
              display={fmtWindow(win.baselineDays)}
              accent="accent-cyan-400"
              onChange={(v) => setWin((w) => ({ ...w, baselineDays: v }))}
            />
          </div>
        )}

        {/* Balance | Insights tabs (insights need the raw parse data) */}
        {parse && (
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
            {(['balance', 'insights'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition-colors ${
                  tab === t ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {parse && tab === 'insights' ? (
          <HealthInsights parse={parse} result={result} />
        ) : (
          <>
            {lowGroups.length > 0 && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-[11px] text-amber-100">
                {lowGroups.length} group{lowGroups.length === 1 ? '' : 's'} carr
                {lowGroups.length === 1 ? 'ies' : 'y'} little of your workload. Run a quick check to
                see where they stand.
              </div>
            )}

            <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
              {sorted.map((g) => (
                <GroupRow
                  key={g.group}
                  g={g}
                  maxShare={maxShare}
                  onCheck={() => (onCheckOverride ? onCheckOverride(g) : setCheckGroup(g))}
                />
              ))}
            </div>

            {saveNote?.reason === 'not-signed-in' && (
              <div className="text-[10px] text-slate-500">
                Sign in to save this summary to your account.
              </div>
            )}

            {/* Client-side sharing — explicit opt-in, read access only. */}
            {workouts && <ShareWithPractitioner />}
          </>
        )}

        <p className="text-[10px] leading-relaxed text-slate-500">
          A training-load estimate from your workout history, in the same spirit as a relative-effort
          or workload tracker. Values are relative, not absolute.
        </p>
      </aside>

      {/* Pre-scoped launch into the EXISTING assessment flow */}
      {checkGroup && (
        <CheckModal group={checkGroup} onClose={() => setCheckGroup(null)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Window slider
// ─────────────────────────────────────────────────────────────────────────────

function WindowSlider({
  label, min, max, value, display, accent, onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  display: string
  accent: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[10px]">
        <span className="font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <span className="tabular-nums text-slate-200">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 w-full cursor-pointer ${accent}`}
      />
    </label>
  )
}

/** "7 days" / "3 months" / "1.5 years" — human label for a window in days. */
function fmtWindow(days: number): string {
  if (days < 31) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 360) {
    const m = days / 30.44
    const r = Math.abs(m - Math.round(m)) < 0.12 ? Math.round(m) : Math.round(m * 10) / 10
    return `${r} month${r === 1 ? '' : 's'}`
  }
  const y = days / 365.25
  const r = Math.abs(y - Math.round(y)) < 0.08 ? Math.round(y) : Math.round(y * 10) / 10
  return `${r} year${r === 1 ? '' : 's'}`
}

function rank(c: LoadClass): number {
  return { high: 3, elevated: 2, balanced: 1, low: 0 }[c]
}

// ─────────────────────────────────────────────────────────────────────────────
//  Group row
// ─────────────────────────────────────────────────────────────────────────────

/** Colour along the model's tan->amber->red ramp for a share fraction 0..1. */
function shareColor(frac: number): string {
  if (frac <= 0.02) return '#6b5b4a'
  if (frac < 0.4) return '#8f6f3d'
  if (frac < 0.65) return '#b9832f'
  if (frac < 0.85) return '#f59e0b'
  return '#b91c1c'
}

function GroupRow({ g, maxShare, onCheck }: { g: MuscleGroupSummary; maxShare: number; onCheck: () => void }) {
  const frac = maxShare > 0 ? g.sharePctRecent / maxShare : 0
  const ratioUp = g.acwr != null && g.acwr > 1.1
  const ratioDown = g.acwr != null && g.acwr < 0.9
  const TrendIcon = ratioUp ? TrendingUp : ratioDown ? TrendingDown : Minus
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">
          {g.label}
          {g.confidence === 'broad' && (
            <span className="ml-1.5 rounded bg-slate-700/60 px-1 py-0.5 align-middle text-[8px] font-semibold uppercase tracking-wider text-slate-300"
              title="This group's recent load comes mostly from composite activity types, so it's a broad estimate.">
              Broad
            </span>
          )}
        </span>
        <span className="text-xs font-bold tabular-nums text-slate-100">
          {g.sharePctRecent.toFixed(g.sharePctRecent < 10 ? 1 : 0)}%
        </span>
        {g.classification === 'low' && (
          <button
            onClick={onCheck}
            className="flex shrink-0 items-center gap-1 rounded-md bg-cyan-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-cyan-500"
          >
            <Activity size={11} /> Check this
          </button>
        )}
      </div>
      {/* Share bar — same ramp as the 3D model */}
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.max(2, frac * 100)}%`, background: shareColor(frac) }}
        />
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 tabular-nums">
        <span>{CLASS_LABEL[g.classification]}</span>
        {g.acwr != null && (
          <span className="flex items-center gap-0.5">
            · ratio {g.acwr.toFixed(2)}
            <TrendIcon size={10} className={ratioUp ? 'text-orange-300' : ratioDown ? 'text-slate-400' : 'text-slate-500'} />
          </span>
        )}
        <span className="ml-auto text-slate-600">baseline {g.sharePctBaseline.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Share with practitioner (client side — explicit opt-in, read access only)
// ─────────────────────────────────────────────────────────────────────────────

function ShareWithPractitioner() {
  const signedIn = !!getActiveUserId()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [links, setLinks] = useState<PractitionerLink[]>([])

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    listMyPractitioners().then((l) => { if (!cancelled) setLinks(l) })
    return () => { cancelled = true }
  }, [signedIn])

  async function share() {
    if (busy) return
    setBusy(true)
    setNote(null)
    const out = await grantPractitionerAccess(email)
    if (out.ok) {
      setNote({ ok: true, text: 'Shared. They can now view your training-balance summary.' })
      setEmail('')
      setLinks(await listMyPractitioners())
    } else {
      setNote({ ok: false, text: out.error ?? 'Could not share.' })
    }
    setBusy(false)
  }

  async function remove(linkId: string) {
    const out = await revokePractitionerAccess(linkId)
    if (out.ok) setLinks((l) => l.filter((x) => x.id !== linkId))
    else setNote({ ok: false, text: out.error ?? 'Could not remove access.' })
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Share2 size={11} /> Share with practitioner
      </div>
      {!signedIn ? (
        <p className="mt-1.5 text-[10px] text-slate-500">
          Sign in to give a practitioner read access to your training-balance summary.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Give a practitioner read access to your training-balance summary and joint-measurement
            history. They sign in with their own account — you can remove access any time.
          </p>
          <div className="mt-2 flex gap-1.5">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void share() }}
              placeholder="practitioner@example.com"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
            <button
              onClick={() => void share()}
              disabled={busy || !email.trim()}
              className="shrink-0 rounded-md bg-cyan-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {busy ? 'Sharing…' : 'Share'}
            </button>
          </div>
          {note && (
            <div className={`mt-1.5 text-[10px] ${note.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {note.text}
            </div>
          )}
          {links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-[10px] text-slate-300">
                  <span className="min-w-0 flex-1 truncate">{l.practitionerLabel ?? 'Connected practitioner'}</span>
                  <button
                    onClick={() => void remove(l.id)}
                    title="Remove access"
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-red-300"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  "Check this" — pre-scoped launch of the existing assessment flow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full-screen launch of the existing AssessmentSession, pre-scoped to the
 * group's representative muscle + its first relevant movement. This is the
 * same session component the Movement Assessment battery drives — no new
 * assessment flow is built here.
 */
function CheckModal({ group, onClose }: { group: MuscleGroupSummary; onClose: () => void }) {
  const def = groupDef(group.group)
  const movements = useMemo(() => getMovementsForMuscle(def.assess.muscleId), [def.assess.muscleId])
  const movement = movements[0]
  const side: 'L' | 'R' = movement?.side === 'L' ? 'L' : 'R'
  const extraMuscleIds = useMemo(() => def.muscleIds.filter((m) => m !== def.assess.muscleId), [def])

  if (!movement) {
    // No ROM-relevant movement for this group — nothing to route into.
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-6">
        <div className="max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 text-center">
          <p className="text-sm text-slate-200">No quick check is available for {def.label} yet.</p>
          <button onClick={onClose} className="mt-4 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700">
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/95">
      <div className="absolute right-3 top-3 z-[96]">
        <button onClick={onClose} className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white">
          <X size={18} />
        </button>
      </div>
      <AssessmentSession
        muscleId={def.assess.muscleId}
        movement={movement}
        side={side}
        extraMuscleIds={extraMuscleIds}
        autoCloseOnDone={true}
        onClose={onClose}
      />
    </div>
  )
}
