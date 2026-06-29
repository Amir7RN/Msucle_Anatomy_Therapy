/**
 * GymApp.tsx — root of MoveMate Train, the gym-training platform.
 *
 * The home is an interactive ANATOMY EXPLORER: the shared 3D muscular model in
 * the centre with arrow-callouts to each muscle group. Hovering a callout glows
 * that group on the model; selecting it lists the group's exercises on the right
 * (thumbnail rows). Picking an exercise opens the trainer (digital twin + live
 * camera). Visually distinct (warm amber) from the clinical pain platform.
 */

import React, { useCallback, useRef, useState } from 'react'
import {
  Dumbbell, ArrowRight, ArrowLeft, ChevronRight, Flame, Activity, HeartPulse,
  Camera, Watch, Home, TrendingUp, MousePointerClick, Play,
} from 'lucide-react'
import { useGymStore } from '../../store/gymStore'
import {
  MUSCLE_GROUPS, exercisesForGroup, muscleGroupById,
  type MuscleGroup, type MuscleGroupId, type Exercise,
} from '../../lib/gym/exercises'
import { parseHealthExport } from '../../lib/gym/health'
import { ExerciseGlyph } from './ExerciseGlyph'
import { HeartRateWidget } from './HeartRateWidget'
import { ExerciseTrainer } from './ExerciseTrainer'
import { BodyPartScan } from './BodyPartScan'
import { MuscleModelCanvas, CanvasErrorBoundary } from './MuscleMap3D'

export function GymApp() {
  const view = useGymStore((s) => s.view)
  if (view === 'trainer') return <div className="h-full w-full"><ExerciseTrainer /></div>
  if (view === 'scan')    return <div className="h-full w-full"><BodyPartScan /></div>

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-stone-950 via-stone-950 to-black text-stone-100">
      <GymHeader />
      <div className="min-h-0 flex-1">
        <Explore />
      </div>
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────────────

function GymHeader() {
  const goHome    = useGymStore((s) => s.goHome)
  const setHealth = useGymStore((s) => s.setHealth)
  const fileRef   = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState<string | null>(null)

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      setHealth(await parseHealthExport(file))
      setMsg('Apple Health imported ✓'); setTimeout(() => setMsg(null), 3000)
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Import failed.') }
    finally { setBusy(false) }
  }, [setHealth])

  return (
    <header className="relative flex items-center justify-between gap-3 border-b border-amber-500/15 bg-black/40 px-4 py-2.5 backdrop-blur">
      <button onClick={goHome} className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-amber-500/30">
          <Flame size={18} />
        </span>
        <span className="text-sm font-extrabold tracking-tight">MoveMate <span className="text-amber-400">Train</span></span>
      </button>
      <div className="flex items-center gap-2">
        <HeartRateWidget compact />
        <input ref={fileRef} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={onFile} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex items-center gap-1.5 rounded-xl bg-stone-800/70 px-2.5 py-1.5 text-xs font-semibold text-stone-200 ring-1 ring-stone-700/60 hover:bg-stone-700/70 disabled:opacity-60"
          title="Import Apple Health export.xml">
          <Watch size={14} className="text-amber-300" />
          <span className="hidden sm:inline">{busy ? 'Importing…' : 'Apple Health'}</span>
        </button>
        <a href={import.meta.env.BASE_URL} className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs text-stone-400 hover:text-stone-200" title="Back to home">
          <Home size={15} />
        </a>
      </div>
      {msg && <div className="absolute left-1/2 top-14 z-50 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-1.5 text-xs text-amber-200 shadow-xl ring-1 ring-amber-500/30">{msg}</div>}
    </header>
  )
}

// ── Explore: 3D model + callouts + exercise list ─────────────────────────────

interface CalloutDef { group: MuscleGroupId; side: 'l' | 'r'; style: React.CSSProperties }
const CALLOUTS: CalloutDef[] = [
  { group: 'shoulders', side: 'l', style: { top: '12%', left: '3%' } },
  { group: 'chest',     side: 'l', style: { top: '30%', left: '1%' } },
  { group: 'arms',      side: 'l', style: { top: '50%', left: '3%' } },
  { group: 'back',      side: 'r', style: { top: '12%', right: '3%' } },
  { group: 'core',      side: 'r', style: { top: '39%', right: '1%' } },
  { group: 'legs',      side: 'r', style: { top: '66%', right: '4%' } },
]

function Explore() {
  const selectedGroup = useGymStore((s) => s.selectedGroup)
  const setGroup      = useGymStore((s) => s.setGroup)
  const openTrainer   = useGymStore((s) => s.openTrainer)
  const openScan      = useGymStore((s) => s.openScan)
  const [hover, setHover] = useState<MuscleGroupId | null>(null)
  const highlight = hover ?? selectedGroup
  const group = selectedGroup ? muscleGroupById(selectedGroup) : null

  return (
    <div className="flex h-full min-h-0">
      {/* Left — interactive model (desktop) */}
      <div className="relative hidden min-h-0 flex-1 lg:block">
        <div className="absolute left-5 top-4 z-20 max-w-xs">
          <h1 className="text-xl font-extrabold tracking-tight">Train by muscle group</h1>
          <p className="mt-1 text-xs text-stone-400">Hover the model, tap a group, then pick an exercise for live tracking & coaching.</p>
        </div>
        <CanvasErrorBoundary fallback={<div className="flex h-full items-center justify-center p-8"><GroupGrid selected={selectedGroup} onSelect={setGroup} /></div>}>
          <MuscleModelCanvas highlight={highlight} />
        </CanvasErrorBoundary>
        {CALLOUTS.map((c) => (
          <Callout key={c.group} def={c}
            active={highlight === c.group}
            onHover={setHover}
            onSelect={() => setGroup(c.group)} />
        ))}
      </div>

      {/* Mobile — group cards + list stacked */}
      <div className="flex w-full flex-col gap-4 overflow-y-auto p-4 lg:hidden">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Train by muscle group</h1>
          <p className="mt-1 text-xs text-stone-400">Pick a group, then choose an exercise.</p>
        </div>
        <GroupGrid selected={selectedGroup} onSelect={setGroup} />
        {group && <ExerciseList group={group} onPick={openTrainer} onScan={() => openScan(group.id)} />}
      </div>

      {/* Right — exercise list (desktop) */}
      <aside className="hidden w-[380px] shrink-0 overflow-y-auto border-l border-amber-500/10 bg-black/20 p-4 lg:block">
        {group ? <ExerciseList group={group} onPick={openTrainer} onScan={() => openScan(group.id)} /> : <ExploreHint />}
      </aside>
    </div>
  )
}

function Callout({ def, active, onHover, onSelect }: { def: CalloutDef; active: boolean; onHover: (g: MuscleGroupId | null) => void; onSelect: () => void }) {
  const g = muscleGroupById(def.group)
  const n = exercisesForGroup(def.group).length
  return (
    <button
      style={def.style}
      onMouseEnter={() => onHover(def.group)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
      className={[
        'absolute z-20 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur transition',
        active
          ? 'border-amber-300 bg-amber-400/20 text-amber-100 shadow-[0_0_24px_rgba(251,146,60,0.4)]'
          : 'border-stone-600/60 bg-stone-900/70 text-stone-200 hover:border-amber-400/60 hover:text-amber-100',
      ].join(' ')}
    >
      {def.side === 'r' && <ArrowLeft size={13} className="text-amber-300" />}
      <span>{g.name}</span>
      <span className="rounded-full bg-black/30 px-1.5 text-[10px] text-stone-400">{n}</span>
      {def.side === 'l' && <ArrowRight size={13} className="text-amber-300" />}
    </button>
  )
}

function ExploreHint() {
  const health  = useGymStore((s) => s.health)
  const setLogs = useGymStore((s) => s.setLogs)
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-2 rounded-2xl bg-stone-900/60 p-4 ring-1 ring-amber-500/15">
        <MousePointerClick size={18} className="mt-0.5 shrink-0 text-amber-300" />
        <div>
          <div className="text-sm font-semibold">Pick a muscle group</div>
          <p className="mt-0.5 text-xs text-stone-400">Tap a labelled group on the model to see its exercises here.</p>
        </div>
      </div>

      {health ? (
        <div>
          <SectionTitle icon={<HeartPulse size={15} className="text-rose-400" />} title="From Apple Health" />
          <div className="grid grid-cols-2 gap-2">
            {health.restingHeartRate != null && <HealthStat label="Resting HR" value={`${health.restingHeartRate}`} unit="bpm" />}
            {health.vo2max != null && <HealthStat label="VO₂ max" value={`${health.vo2max}`} unit="ml/kg" />}
            {health.activeEnergyKcal != null && <HealthStat label="Active energy" value={`${health.activeEnergyKcal}`} unit="kcal·7d" />}
            {health.bodyFatPct != null && <HealthStat label="Body fat" value={`${health.bodyFatPct}`} unit="%" />}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-2xl bg-stone-900/50 p-3 ring-1 ring-stone-700/40">
          <Watch size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <p className="text-[11px] text-stone-400">Tap <span className="text-amber-300">Apple Health</span> above to import your <span className="font-mono">export.xml</span>, or pair a Bluetooth heart-rate sensor for live BPM.</p>
        </div>
      )}

      {setLogs.length > 0 && (
        <div>
          <SectionTitle icon={<TrendingUp size={15} className="text-amber-300" />} title="Recent sets" />
          <div className="space-y-1.5">
            {setLogs.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-stone-900/60 px-3 py-2 text-xs ring-1 ring-stone-800">
                <span className="font-medium text-stone-200">{s.exerciseName}</span>
                <span className="text-stone-400">{s.reps} reps · {Math.round(s.peakActivation * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Exercise list (right panel / mobile) ─────────────────────────────────────

function ExerciseList({ group, onPick, onScan }: { group: MuscleGroup; onPick: (id: string) => void; onScan: () => void }) {
  const exercises = exercisesForGroup(group.id)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={['text-lg font-extrabold', group.accent.text].join(' ')}>{group.name}</h2>
          <p className="text-[11px] text-stone-400">{group.muscles.join(' · ')}</p>
        </div>
        <button onClick={onScan} title={`Scan ${group.name}`}
          className="flex items-center gap-1.5 rounded-xl bg-stone-800/70 px-2.5 py-1.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/30 hover:bg-stone-700/70">
          <Camera size={14} /> Scan
        </button>
      </div>
      <div className="space-y-2">
        {exercises.map((ex) => <ExerciseRow key={ex.id} exercise={ex} accentText={group.accent.text} onPick={() => onPick(ex.id)} />)}
      </div>
    </div>
  )
}

function ExerciseRow({ exercise, accentText, onPick }: { exercise: Exercise; accentText: string; onPick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onPick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="group flex w-full items-center gap-3 overflow-hidden rounded-xl bg-stone-900/70 p-2 text-left ring-1 ring-stone-800 transition hover:ring-amber-500/40">
      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-stone-800 to-stone-900">
        {exercise.media.video ? (
          <video src={`${import.meta.env.BASE_URL}videos/${exercise.media.video}`} muted loop playsInline
            ref={(v) => { if (v) { if (hover) v.play().catch(() => {}); else v.pause() } }}
            className="h-full w-full object-cover opacity-90" />
        ) : (
          <div className={['flex h-full w-full items-center justify-center', accentText].join(' ')}>
            <ExerciseGlyph glyph={exercise.media.glyph} className="h-9 w-9 opacity-80" />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
          <Play size={18} className="text-white opacity-0 transition group-hover:opacity-100" fill="currentColor" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{exercise.name}</div>
        <div className="truncate text-[11px] text-stone-400">{exercise.focus}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-stone-500">
          <span>{exercise.sets}×{exercise.repGoal}</span><span>·</span>
          <span className="capitalize">{exercise.equipment}</span>
        </div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-amber-300" />
    </button>
  )
}

// ── Group grid (mobile + WebGL fallback) ─────────────────────────────────────

function GroupGrid({ selected, onSelect }: { selected: MuscleGroupId | null; onSelect: (g: MuscleGroupId) => void }) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
      {MUSCLE_GROUPS.map((g) => <GroupCard key={g.id} group={g} active={selected === g.id} onClick={() => onSelect(g.id)} />)}
    </div>
  )
}

function GroupCard({ group, active, onClick }: { group: MuscleGroup; active: boolean; onClick: () => void }) {
  const n = exercisesForGroup(group.id).length
  return (
    <button onClick={onClick}
      className={['group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left text-white shadow-lg transition hover:-translate-y-0.5',
        group.accent.from, group.accent.to, group.accent.glow, active ? 'ring-2 ring-white/70' : ''].join(' ')}>
      <div className="absolute -right-6 -top-6 opacity-20 transition group-hover:opacity-30"><Dumbbell size={86} /></div>
      <div className="relative">
        <div className="text-lg font-extrabold">{group.name}</div>
        <div className="text-xs font-medium text-white/80">{group.tagline}</div>
        <div className="mt-6 flex items-center justify-between">
          <span className="text-[11px] text-white/75">{n} exercises</span>
          <ChevronRight size={18} className="transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  )
}

// ── small bits ───────────────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-stone-200">{icon}{title}</div>
}

function HealthStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-stone-900/60 p-3 ring-1 ring-stone-800">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value} <span className="text-[10px] font-normal text-stone-500">{unit}</span></div>
    </div>
  )
}
