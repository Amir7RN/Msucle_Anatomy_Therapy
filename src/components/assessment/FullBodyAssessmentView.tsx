/**
 * FullBodyAssessmentView.tsx
 *
 * Full-screen, AI-coach-led whole-segment range-of-motion battery.
 *
 * Flow
 * ────
 *   1. CHOOSE     — user picks segments (Upper: Neck/Shoulders/Arms/Trunk,
 *                   Lower: Hips/Knees/Ankles).  Estimated time shown.
 *   2. RUNNING    — sequential per-movement AssessmentSession instances.
 *                   The same TTS coach drives calibration → "GO" cue →
 *                   peak capture.  Mirror-writes results under every
 *                   related muscle id so the right-panel per-muscle trend
 *                   chart picks them up.
 *   3. SUMMARY    — per-segment grouped result list with %-of-normal bars
 *                   and "Generate program from these results" CTA that
 *                   opens the existing PersonalProgramView.
 *
 * Designed so the existing AssessmentView per-muscle history is the single
 * source of truth — this view is just a sequencer.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { X, Play, ChevronRight, Sparkles, RotateCcw, Activity, CheckCircle2, Footprints, Video } from 'lucide-react'
import { AssessmentSession } from './AssessmentView'
import { GaitAssessmentSession } from './GaitAssessmentSession'
import { RemoteAssessmentCall } from './RemoteAssessmentCall'
import { randomId } from '../../lib/call/signaling'
import {
  SEGMENTS, buildBattery, estimateBatteryMinutes,
  type SegmentId, type BatteryItem,
} from '../../lib/assessment/battery'
import { JOINT_MOVEMENTS } from '../../lib/movement/muscleJointMap'
import { getRecordsFor } from '../../lib/movement/romHistory'
import { useROMVersion } from '../../hooks/useROMVersion'
import { PersonalProgramView } from '../insights/PersonalProgramView'
import { useAtlasStore } from '../../store/atlasStore'

interface Props {
  open:    boolean
  onClose: () => void
  /** Open straight into the Remote Assessment call (host side), skipping the
   *  segment chooser — used by the sidebar's dedicated Remote card. */
  startInCall?: boolean
}

type Phase = 'choose' | 'running' | 'summary' | 'gait' | 'call'

export function FullBodyAssessmentView({ open, onClose, startInCall }: Props) {
  const [phase, setPhase]       = useState<Phase>('choose')
  const [selected, setSelected] = useState<Set<SegmentId>>(new Set(['shoulders', 'hips']))
  const [items, setItems]       = useState<BatteryItem[]>([])
  const [cursor, setCursor]     = useState(0)
  const [progOpen, setProgOpen] = useState(false)
  const [callRoom, setCallRoom] = useState('')
  // 'full' for the sidebar's direct Remote card (every joint, the main
  // analyzer); 'lowerLimb' for the chooser's "Remote Assessment (Live Call)"
  // option, whose own copy ("watch their live pose & ankle angles") promises
  // an ankle-focused view specifically.
  const [callFocus, setCallFocus] = useState<'full' | 'lowerLimb'>('full')

  // Hide the 3D canvas chrome while this modal is open.
  useEffect(() => {
    if (!open) return
    const { pushModal, popModal } = useAtlasStore.getState()
    pushModal()
    return () => popModal()
  }, [open])

  // Reset when re-opened.
  useEffect(() => {
    if (!open) {
      setPhase('choose')
      setItems([])
      setCursor(0)
      setProgOpen(false)
    }
  }, [open])

  // Direct remote-call launch (sidebar Remote card) — skip the chooser.
  // This entry point is the full, every-joint analyzer.
  useEffect(() => {
    if (open && startInCall) {
      setCallFocus('full')
      setCallRoom(randomId(6))
      setPhase('call')
    }
  }, [open, startInCall])

  function toggleSegment(id: SegmentId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function startBattery() {
    const list = buildBattery(Array.from(selected))
    if (list.length === 0) return
    setItems(list)
    setCursor(0)
    setPhase('running')
  }

  function nextItem() {
    if (cursor + 1 >= items.length) {
      setPhase('summary')
    } else {
      setCursor((c) => c + 1)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/95 text-white">

      {phase === 'choose' && (
        <ChoosePhase
          selected={selected}
          onToggle={toggleSegment}
          onClose={onClose}
          onStart={startBattery}
          onStartGait={() => setPhase('gait')}
          onStartCall={() => { setCallFocus('lowerLimb'); setCallRoom(randomId(6)); setPhase('call') }}
        />
      )}

      {phase === 'gait' && (
        <GaitAssessmentSession
          open={true}
          onClose={() => setPhase('choose')}
        />
      )}

      {phase === 'call' && callRoom && (
        <RemoteAssessmentCall
          open={true}
          role="host"
          roomId={callRoom}
          focus={callFocus}
          // When launched directly from the Remote card, closing the call
          // closes the whole modal instead of dropping into the chooser.
          onClose={() => { if (startInCall) onClose(); else setPhase('choose') }}
        />
      )}

      {phase === 'running' && items.length > 0 && (
        <RunningPhase
          items={items}
          cursor={cursor}
          onClose={() => { setPhase('choose'); onClose() }}
          onAdvance={nextItem}
        />
      )}

      {phase === 'summary' && (
        <SummaryPhase
          items={items}
          onRetake={() => { setPhase('choose') }}
          onClose={onClose}
          onGenerateProgram={() => setProgOpen(true)}
        />
      )}

      <PersonalProgramView open={progOpen} onClose={() => setProgOpen(false)} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Phase 1 — Choose segments
// ─────────────────────────────────────────────────────────────────────────────

function ChoosePhase({
  selected, onToggle, onClose, onStart, onStartGait, onStartCall,
}: {
  selected: Set<SegmentId>
  onToggle: (id: SegmentId) => void
  onClose:  () => void
  onStart:  () => void
  onStartGait: () => void
  onStartCall: () => void
}) {
  const allIds = SEGMENTS.map((s) => s.id)
  const allSelected = allIds.every((i) => selected.has(i))
  const items = useMemo(() => buildBattery(Array.from(selected)), [selected])
  const minutes = estimateBatteryMinutes(items)

  const renderGroup = (region: 'upper' | 'lower', title: string) => (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SEGMENTS.filter((s) => s.region === region).map((s) => {
          const on = selected.has(s.id)
          return (
            <button
              key={s.id}
              onClick={() => onToggle(s.id)}
              className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors ${
                on
                  ? 'border-orange-400 bg-orange-500/15 text-orange-100'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-orange-500/40'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {on && <CheckCircle2 size={12} className="text-orange-400" />}
                <span className="text-sm font-semibold">{s.label}</span>
              </span>
              <span className="text-[10px] text-slate-400">
                {s.movements.length} test{s.movements.length === 1 ? '' : 's'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="m-auto w-full max-w-2xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-orange-400" />
          <h2 className="text-base font-semibold">Full-Body Movement Assessment</h2>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Pick the segments you want to assess.  The AI coach will guide you through each test —
        you stand in neutral, hear the explanation, then perform the motion on cue.  Each result
        is saved to that joint's progress history and used to tailor your program.
      </p>

      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            // Toggle all on/off.
            if (allSelected) for (const i of allIds) if (selected.has(i)) onToggle(i)
            else for (const i of allIds) if (!selected.has(i)) onToggle(i)
          }}
          className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
        >
          {allSelected ? 'Clear all' : 'Select all (whole body)'}
        </button>
        <span className="text-[10px] text-slate-500">
          {items.length} test{items.length === 1 ? '' : 's'} · ~{minutes} min
        </span>
      </div>

      {renderGroup('upper', 'Upper limb')}
      {renderGroup('lower', 'Lower limb')}

      {/* Dynamic / walking ankle test — distinct from the static ROM battery
          above. Launches its own AI-coached out-and-back walk and produces a
          downloadable CSV + plot. Built for the Dephy sagittal-ankle use-case. */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
          Dynamic gait
        </div>
        <button
          onClick={onStartGait}
          className="group flex w-full items-center gap-3 rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3 text-left transition-colors hover:border-cyan-400 hover:bg-cyan-500/10"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-300">
            <Footprints size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-cyan-100">Ankle Dynamics</span>
              <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">New</span>
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-400">
              Walk 8 steps out &amp; back · measures both ankle angles + speed · exports CSV &amp; plot
            </span>
          </span>
          <ChevronRight size={16} className="flex-shrink-0 text-cyan-400/70 group-hover:text-cyan-300" />
        </button>

        {/* Practitioner-guided live call — you monitor a remote person's pose
            from your screen and guide them by voice. They just open a link. */}
        <button
          onClick={onStartCall}
          className="group flex w-full items-center gap-3 rounded-lg border border-violet-500/40 bg-violet-500/5 p-3 text-left transition-colors hover:border-violet-400 hover:bg-violet-500/10"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-300">
            <Video size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-violet-100">Remote Assessment (Live Call)</span>
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">New</span>
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-400">
              Share a link · watch their live pose &amp; ankle angles · guide them by voice · record the walk
            </span>
          </span>
          <ChevronRight size={16} className="flex-shrink-0 text-violet-400/70 group-hover:text-violet-300" />
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-700 pt-3">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={onStart}
          disabled={items.length === 0}
          className="flex items-center gap-1.5 rounded-md bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-400 disabled:bg-slate-700 disabled:text-slate-500"
        >
          <Play size={12} />
          Start assessment
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Phase 2 — Running each item in sequence
// ─────────────────────────────────────────────────────────────────────────────

function RunningPhase({
  items, cursor, onClose, onAdvance,
}: {
  items:     BatteryItem[]
  cursor:    number
  onClose:   () => void
  onAdvance: () => void
}) {
  const item = items[cursor]
  if (!item) return null

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Battery progress strip overlays the top of the per-item modal so
          the user always knows where they are. */}
      <div className="absolute top-0 left-0 right-0 z-[70] flex items-center gap-3 border-b border-slate-800 bg-black/90 px-4 py-2 text-xs">
        <span className="font-semibold text-orange-300">
          Test {cursor + 1} / {items.length}
        </span>
        <span className="text-slate-400 truncate">
          {item.movement.label} · {item.side === 'L' ? 'Left' : 'Right'} side
        </span>
        <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-orange-400 transition-all"
            style={{ width: `${(cursor / items.length) * 100}%` }}
          />
        </div>
        <button
          onClick={onAdvance}
          className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
          title="Skip this test"
        >
          Skip
        </button>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Re-key the session on each item so its internal refs reset cleanly
          between movements. */}
      <AssessmentSession
        key={`${item.movement.id}__${item.side}__${cursor}`}
        muscleId={item.muscleId}
        movement={item.movement}
        side={item.side}
        extraMuscleIds={item.extraMuscleIds}
        autoCloseOnDone={true}
        briefMode={item.brief}
        onSaved={() => { /* result already saved; UI advance happens via onClose */ }}
        onClose={onAdvance}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Phase 3 — Summary
// ─────────────────────────────────────────────────────────────────────────────

function SummaryPhase({
  items, onRetake, onClose, onGenerateProgram,
}: {
  items:    BatteryItem[]
  onRetake: () => void
  onClose:  () => void
  onGenerateProgram: () => void
}) {
  // Re-read from history so we show the freshly saved values.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _v = useROMVersion()

  // Group items by segment for the summary panels.
  const grouped = useMemo(() => {
    const out = new Map<string, BatteryItem[]>()
    for (const it of items) {
      const arr = out.get(it.segmentId) ?? []
      arr.push(it)
      out.set(it.segmentId, arr)
    }
    return out
    // _v dep — recompute when ROM history bumps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, _v])

  const rows = useMemo(() => {
    const list: Array<{ segId: string; item: BatteryItem; angle: number | null; pct: number }> = []
    for (const [segId, segItems] of grouped) {
      for (const it of segItems) {
        const recs = getRecordsFor(it.muscleId, it.movement.id, it.side)
        const last = recs[recs.length - 1]
        const angle = last ? last.angle : null
        const pct = last
          ? Math.round((last.angle / (it.movement.reference.ideal || 1)) * 100)
          : 0
        list.push({ segId, item: it, angle, pct })
      }
    }
    return list
  }, [grouped])

  const segmentLabel = (id: string) => SEGMENTS.find((s) => s.id === id)?.label ?? id

  // Weakest 3 — drive the "what we found" callout.
  const weakest = [...rows].filter((r) => r.angle !== null).sort((a, b) => a.pct - b.pct).slice(0, 3)

  return (
    <div className="m-auto w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <h2 className="text-base font-semibold">Assessment complete</h2>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Results saved to your progress history.  They will appear under each related muscle when
        you open it in the right panel.
      </p>

      {weakest.length > 0 && (
        <div className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-300">
            Focus areas
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-slate-200">
            {weakest.map((r) => (
              <li key={`${r.item.movement.id}_${r.item.side}`}>
                <span className="font-semibold">{r.item.movement.label}</span>
                <span className="text-slate-500"> · {r.item.side === 'L' ? 'Left' : 'Right'}</span>
                <span className="ml-2 text-orange-300 tabular-nums">{r.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {Array.from(grouped.keys()).map((segId) => {
          const segRows = rows.filter((r) => r.segId === segId)
          return (
            <section key={segId}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                {segmentLabel(segId)}
              </div>
              <div className="mt-1 divide-y divide-slate-800 rounded-md border border-slate-800">
                {segRows.map((r) => {
                  const ref = r.item.movement.reference.ideal
                  return (
                    <div key={`${r.item.movement.id}_${r.item.side}`} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-100 truncate">
                          {r.item.movement.label}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.item.side === 'L' ? 'Left' : 'Right'} · target {ref}°
                        </div>
                      </div>
                      <div className="text-xs text-slate-300 tabular-nums w-12 text-right">
                        {r.angle === null ? '—' : `${Math.round(r.angle)}°`}
                      </div>
                      <div className="h-1.5 w-24 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${r.pct >= 80 ? 'bg-emerald-400' : r.pct >= 55 ? 'bg-orange-400' : 'bg-red-400'}`}
                          style={{ width: `${Math.min(100, r.pct)}%` }}
                        />
                      </div>
                      <div className={`text-[11px] font-semibold w-10 text-right ${
                        r.pct >= 80 ? 'text-emerald-300' : r.pct >= 55 ? 'text-orange-300' : 'text-red-300'
                      }`}>
                        {r.angle === null ? '—' : `${r.pct}%`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-700 pt-3">
        <button
          onClick={onRetake}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
        >
          <RotateCcw size={12} /> Re-do assessment
        </button>
        <button
          onClick={onGenerateProgram}
          className="flex items-center gap-1.5 rounded-md bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-400"
        >
          <Sparkles size={12} /> Generate program
          <ChevronRight size={12} />
        </button>
      </div>

      {/* JOINT_MOVEMENTS imported just to keep the import alive for future
          per-movement metadata in the row (e.g. cue tooltip). */}
      <span className="hidden">{Object.keys(JOINT_MOVEMENTS).length}</span>
    </div>
  )
}
