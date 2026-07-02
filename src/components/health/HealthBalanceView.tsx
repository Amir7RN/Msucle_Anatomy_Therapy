/**
 * HealthBalanceView.tsx
 *
 * Renders the health-data training-balance result on the SAME 3D model, camera,
 * lighting and background used by the Live Muscle Twin — MuscleTwinModel is
 * reused unchanged. The only difference from the live view is the colour
 * source: instead of live joint-angle intensity, each muscle is coloured by its
 * group's ACWR-derived load level (muscleLoadRender.loadToActivations).
 *
 * Because there is no live camera here, boneDirsRef stays empty and the model
 * holds a neutral standing pose while the colour ramp shows the load map.
 *
 * Groups classified "Needs attention" (low engagement) get a "Check this"
 * button that launches the EXISTING AssessmentView flow, pre-scoped to that
 * group's representative muscle + movement.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Activity } from 'lucide-react'
import { MuscleTwinModel } from '../movement/MuscleTwinModel'
import { AssessmentSession } from '../assessment/AssessmentView'
import { getMovementsForMuscle } from '../../lib/movement/muscleJointMap'
import type { BoneDirs } from '../../lib/movement/poseRig'
import type { LiveMuscleActivation } from '../../lib/movement/liveMuscleActivation'
import { loadToActivations } from '../../lib/health/muscleLoadRender'
import {
  CLASS_LABEL, type LoadClass, type MuscleGroupSummary, type MuscleLoadResult,
  groupDef,
} from '../../lib/health/muscleLoadEstimator'
import { saveMuscleLoadSummaries, type SaveOutcome } from '../../lib/health/muscleLoadHealth'

// Legend swatches sampled from the twin model's colour ramp (tan -> amber ->
// red), matching the established convention: cool/neutral = low engagement,
// hot = high load.
const CLASS_SWATCH: Record<LoadClass, string> = {
  low:      '#6b5b4a', // neutral tan
  balanced: '#b9832f', // tan->amber
  elevated: '#f59e0b', // amber
  high:     '#b91c1c', // red
}

const CLASS_TEXT: Record<LoadClass, string> = {
  low:      'text-amber-200',
  balanced: 'text-emerald-300',
  elevated: 'text-orange-300',
  high:     'text-red-300',
}

interface Props {
  result: MuscleLoadResult
  onClose: () => void
}

export function HealthBalanceView({ result, onClose }: Props) {
  const activationsRef = useRef<LiveMuscleActivation[]>([])
  const boneDirsRef = useRef<BoneDirs>({})
  const [saveNote, setSaveNote] = useState<SaveOutcome | null>(null)
  const [checkGroup, setCheckGroup] = useState<MuscleGroupSummary | null>(null)

  // Feed the load-derived colours into the model (read every frame via the ref).
  useEffect(() => {
    activationsRef.current = loadToActivations(result)
  }, [result])

  // Persist the computed summary once (per-user; soft-fails for guests).
  useEffect(() => {
    let cancelled = false
    saveMuscleLoadSummaries(result).then((o) => { if (!cancelled) setSaveNote(o) })
    return () => { cancelled = true }
  }, [result])

  const sorted = useMemo(
    () => [...result.groups].sort((a, b) => rank(b.classification) - rank(a.classification)),
    [result.groups],
  )
  const lowGroups = sorted.filter((g) => g.classification === 'low')

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      {/* 3D model — reused twin component, same camera/lighting/background */}
      <div className="relative h-[42vh] w-full shrink-0 lg:h-auto lg:flex-1">
        <MuscleTwinModel activationsRef={activationsRef} boneDirsRef={boneDirsRef} />

        {/* Legend */}
        <div className="absolute left-3 top-3 rounded-lg bg-black/55 px-3 py-2 text-[10px] text-slate-200 backdrop-blur">
          <div className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Training balance</div>
          <div className="flex flex-col gap-1">
            {(['low', 'balanced', 'elevated', 'high'] as LoadClass[]).map((c) => (
              <span key={c} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_SWATCH[c] }} />
                {CLASS_LABEL[c]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Group breakdown */}
      <aside className="relative flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl lg:w-[26rem] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100">Your training balance</div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          Based on {result.workoutsInWindow} workout{result.workoutsInWindow === 1 ? '' : 's'} in the
          last 28 days. Each group compares your recent 7-day workload to your 28-day average.
        </p>

        {lowGroups.length > 0 && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-[11px] text-amber-100">
            {lowGroups.length} group{lowGroups.length === 1 ? '' : 's'} could use more attention. Run a
            quick check to see where they stand.
          </div>
        )}

        <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {sorted.map((g) => (
            <GroupRow key={g.group} g={g} onCheck={() => setCheckGroup(g)} />
          ))}
        </div>

        {saveNote?.reason === 'not-signed-in' && (
          <div className="text-[10px] text-slate-500">
            Sign in to save this summary to your account.
          </div>
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

function rank(c: LoadClass): number {
  return { high: 3, elevated: 2, balanced: 1, low: 0 }[c]
}

function GroupRow({ g, onCheck }: { g: MuscleGroupSummary; onCheck: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: CLASS_SWATCH[g.classification] }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-100">{g.label}</span>
          {g.confidence === 'broad' && (
            <span className="rounded bg-slate-700/60 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-300"
              title="This group's recent load comes mostly from composite activity types, so it's a broad estimate.">
              Broad estimate
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 tabular-nums">
          {CLASS_LABEL[g.classification]}
          {g.acwr != null && <span> · ratio {g.acwr.toFixed(2)}</span>}
        </div>
      </div>
      {g.classification === 'low' && (
        <button
          onClick={onCheck}
          className="flex shrink-0 items-center gap-1 rounded-md bg-cyan-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-cyan-500"
        >
          <Activity size={11} /> Check this
        </button>
      )}
    </div>
  )
}

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
