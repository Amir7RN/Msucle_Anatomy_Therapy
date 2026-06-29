/**
 * GymApp.tsx — root of ZevaMMT, the gym-training platform.
 *
 * A separate, visually distinct surface (warm amber/energetic, card-grid driven)
 * so users immediately read "this is gym training", not the clinical pain map.
 * Reuses the muscle model conceptually but organises everything by training
 * goal: pick a muscle group → choose an exercise → train with live motion
 * tracking, muscle activation, reps and an AI coach.
 */

import React, { useCallback, useRef, useState } from 'react'
import {
  Dumbbell, ArrowLeft, ChevronRight, Flame, Activity, HeartPulse, Upload,
  Camera, Watch, Home, TrendingUp,
} from 'lucide-react'
import { useGymStore } from '../../store/gymStore'
import {
  MUSCLE_GROUPS, exercisesForGroup, muscleGroupById,
  type MuscleGroup, type Exercise,
} from '../../lib/gym/exercises'
import { parseHealthExport } from '../../lib/gym/health'
import { ExerciseGlyph } from './ExerciseGlyph'
import { HeartRateWidget } from './HeartRateWidget'
import { ExerciseTrainer } from './ExerciseTrainer'
import { BodyPartScan } from './BodyPartScan'

export function GymApp() {
  const view = useGymStore((s) => s.view)

  // Full-screen surfaces.
  if (view === 'trainer') return <div className="h-full w-full"><ExerciseTrainer /></div>
  if (view === 'scan')    return <div className="h-full w-full"><BodyPartScan /></div>

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-stone-950 via-stone-950 to-black text-stone-100">
      <GymHeader />
      <div className="flex-1 overflow-y-auto">
        {view === 'group' ? <GroupView /> : <GymHome />}
      </div>
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────────────

function GymHeader() {
  const goHome   = useGymStore((s) => s.goHome)
  const setHealth = useGymStore((s) => s.setHealth)
  const fileRef  = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const summary = await parseHealthExport(file)
      setHealth(summary)
      setMsg('Apple Health imported ✓')
      setTimeout(() => setMsg(null), 3000)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Import failed.')
    } finally { setBusy(false) }
  }, [setHealth])

  return (
    <header className="flex items-center justify-between gap-3 border-b border-amber-500/15 bg-black/40 px-4 py-2.5 backdrop-blur">
      <button onClick={goHome} className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-amber-500/30">
          <Flame size={18} />
        </span>
        <span className="text-sm font-extrabold tracking-tight">Zeva<span className="text-amber-400">MMT</span></span>
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
      {msg && (
        <div className="absolute left-1/2 top-14 z-50 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-1.5 text-xs text-amber-200 shadow-xl ring-1 ring-amber-500/30">{msg}</div>
      )}
    </header>
  )
}

// ── Home: muscle-group selection ─────────────────────────────────────────────

function GymHome() {
  const openGroup = useGymStore((s) => s.openGroup)
  const health    = useGymStore((s) => s.health)
  const setLogs   = useGymStore((s) => s.setLogs)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Train by muscle group</h1>
        <p className="mt-1 text-sm text-stone-400">Pick a group, choose an exercise, and get live motion tracking, muscle activation and rep counting — with an AI coach.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MUSCLE_GROUPS.map((g) => <GroupCard key={g.id} group={g} onClick={() => openGroup(g.id)} />)}
      </div>

      {health && (
        <div className="mt-7">
          <SectionTitle icon={<HeartPulse size={15} className="text-rose-400" />} title="From your Apple Watch / Health" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {health.restingHeartRate != null && <HealthStat label="Resting HR" value={`${health.restingHeartRate}`} unit="bpm" />}
            {health.vo2max != null && <HealthStat label="VO₂ max" value={`${health.vo2max}`} unit="ml/kg" />}
            {health.activeEnergyKcal != null && <HealthStat label="Active energy" value={`${health.activeEnergyKcal}`} unit="kcal·7d" />}
            {health.steps7d != null && <HealthStat label="Steps" value={`${(health.steps7d / 1000).toFixed(1)}k`} unit="7-day" />}
            {health.bodyFatPct != null && <HealthStat label="Body fat" value={`${health.bodyFatPct}`} unit="%" />}
            {health.bodyMassKg != null && <HealthStat label="Body mass" value={`${health.bodyMassKg}`} unit="kg" />}
          </div>
          {health.workouts.length > 0 && (
            <p className="mt-2 text-[11px] text-stone-500">{health.workouts.length} recent workouts imported · most recent {health.workouts[0].type || 'workout'}.</p>
          )}
        </div>
      )}

      {setLogs.length > 0 && (
        <div className="mt-7">
          <SectionTitle icon={<TrendingUp size={15} className="text-amber-300" />} title="Recent sets" />
          <div className="space-y-1.5">
            {setLogs.slice(0, 6).map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-stone-900/60 px-3 py-2 text-sm ring-1 ring-stone-800">
                <span className="font-medium text-stone-200">{s.exerciseName}</span>
                <span className="text-stone-400">{s.reps} reps · peak {Math.round(s.peakActivation * 100)}%{s.avgBpm ? ` · ${s.avgBpm}bpm` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!health && (
        <div className="mt-7 flex items-start gap-3 rounded-2xl bg-stone-900/50 p-4 ring-1 ring-amber-500/15">
          <Watch size={20} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <div className="text-sm font-semibold">Connect your Apple Watch data</div>
            <p className="mt-0.5 text-xs text-stone-400">Tap <span className="text-amber-300">Apple Health</span> above and choose your <span className="font-mono">export.xml</span> (Health app → profile → Export All Health Data). For live heart rate during a set, tap the heart-rate button to pair a Bluetooth sensor.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupCard({ group, onClick }: { group: MuscleGroup; onClick: () => void }) {
  const n = exercisesForGroup(group.id).length
  return (
    <button onClick={onClick}
      className={['group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left text-white shadow-lg transition hover:-translate-y-0.5', group.accent.from, group.accent.to, 'shadow-lg', group.accent.glow].join(' ')}>
      <div className="absolute -right-6 -top-6 opacity-20 transition group-hover:opacity-30">
        <Dumbbell size={86} />
      </div>
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

// ── Group view: exercise library ─────────────────────────────────────────────

function GroupView() {
  const groupId     = useGymStore((s) => s.selectedGroup)
  const openTrainer = useGymStore((s) => s.openTrainer)
  const openScan    = useGymStore((s) => s.openScan)
  const goHome      = useGymStore((s) => s.goHome)
  if (!groupId) return null
  const group = muscleGroupById(groupId)
  const exercises = exercisesForGroup(groupId)

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <button onClick={goHome} className="mb-4 flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-200">
        <ArrowLeft size={16} /> All groups
      </button>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={['text-2xl font-extrabold', group.accent.text].join(' ')}>{group.name}</h1>
          <p className="text-sm text-stone-400">{group.muscles.join(' · ')}</p>
        </div>
        <button onClick={() => openScan(groupId)}
          className="flex items-center gap-2 rounded-xl bg-stone-800/70 px-3 py-2 text-sm font-semibold text-amber-200 ring-1 ring-amber-500/30 hover:bg-stone-700/70">
          <Camera size={16} /> Scan {group.name.toLowerCase()}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exercises.map((ex) => <ExerciseCard key={ex.id} exercise={ex} accentText={group.accent.text} onClick={() => openTrainer(ex.id)} />)}
      </div>
    </div>
  )
}

function ExerciseCard({ exercise, accentText, onClick }: { exercise: Exercise; accentText: string; onClick: () => void }) {
  const [playing, setPlaying] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setPlaying(true)} onMouseLeave={() => setPlaying(false)}
      className="group overflow-hidden rounded-2xl bg-stone-900/70 text-left ring-1 ring-stone-800 transition hover:ring-amber-500/40">
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-stone-800 to-stone-900">
        {exercise.media.video ? (
          <video src={`${import.meta.env.BASE_URL}videos/${exercise.media.video}`} muted loop playsInline
            ref={(v) => { if (v) { if (playing) v.play().catch(() => {}); else { v.pause() } } }}
            className="h-full w-full object-cover opacity-90" />
        ) : (
          <div className={['flex h-full w-full items-center justify-center', accentText].join(' ')}>
            <ExerciseGlyph glyph={exercise.media.glyph} className="h-20 w-20 opacity-80" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium capitalize text-stone-200 backdrop-blur">{exercise.equipment}</span>
        <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium capitalize text-stone-300 backdrop-blur">{exercise.level}</span>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="font-bold">{exercise.name}</div>
          <Activity size={14} className={accentText} />
        </div>
        <div className="text-xs text-stone-400">{exercise.focus}</div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-500">
          <span>{exercise.sets}×{exercise.repGoal}</span>
          <span>·</span>
          <span className="truncate">{exercise.primary[0]}</span>
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
