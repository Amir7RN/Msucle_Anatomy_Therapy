/**
 * ExerciseTrainer.tsx — the MoveMate Train workout dashboard.
 *
 * Layout after picking an exercise:
 *   • MAIN  — your digital muscle twin (target muscles glow as you work) + a
 *             muscle-FATIGUE bar plot.
 *   • SIDE  — the exercise demo clip to MIMIC.
 *   • BOTTOM — your live camera with segment/posture overlay, the rep count, a
 *             RoM spider plot (range achieved per rep), and muscle-activation bars.
 *
 * Reps + activation come from the generic on-device tracker reading MediaPipe
 * landmarks; coaching is local-first (free) with an optional, throttled Claude
 * layer. No muscle-structure browser, no chat box.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Activity, Check, RotateCcw, Volume2, VolumeX, Dumbbell, Sparkles, Flame, Gauge, Video } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { MuscleActivationViewer } from '../movement/MuscleActivationViewer'
import { disposeDetector } from '../../lib/movement/poseDetector'
import { useVoiceOutput } from '../../hooks/useVoice'
import { useGymStore } from '../../store/gymStore'
import { exerciseById, muscleGroupById } from '../../lib/gym/exercises'
import { createExerciseTracker, type TrackFrame } from '../../lib/gym/tracker'
import { createGymCoach, gymCoachEnabled } from '../../lib/gym/coach'
import { groupActivations } from '../../lib/gym/muscleModel'
import { ExerciseGlyph } from './ExerciseGlyph'
import { HeartRateWidget } from './HeartRateWidget'
import { CanvasErrorBoundary } from './MuscleMap3D'

const EMPTY: TrackFrame = { valid: false, angle: 0, activation: 0, formGood: false, reps: 0, justRepped: false, peakActivation: 0, romDeg: 0 }

export function ExerciseTrainer() {
  const exerciseId = useGymStore((s) => s.selectedExercise)
  const back       = useGymStore((s) => s.back)
  const logSet     = useGymStore((s) => s.logSet)
  const liveBpm    = useGymStore((s) => s.liveBpm)
  const exercise   = exerciseId ? exerciseById(exerciseId) : undefined
  const group      = exercise ? muscleGroupById(exercise.group) : undefined

  const voice = useVoiceOutput()
  const [voiceOn, setVoiceOn] = useState(true)
  const [active, setActive]   = useState(false)   // camera running
  const [ready, setReady]     = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [ui, setUi]           = useState({ reps: 0, activation: 0, formGood: false, peak: 0, rom: 0 })
  const [currentSet, setSet]  = useState(1)
  const [coachMsg, setCoach]  = useState<string | null>(null)
  const [done, setDone]       = useState(false)
  const [fatigue, setFatigue] = useState<Record<string, number>>({})
  const [repHist, setRepHist] = useState<number[]>([])

  const tracker     = useRef(exercise ? createExerciseTracker(exercise) : null)
  const aiCoach     = useRef(exercise ? createGymCoach(exercise) : null)
  const frameRef    = useRef<TrackFrame>(EMPTY)
  const halfway     = useRef(false)
  const poorStart   = useRef<number | null>(null)
  const lastCue     = useRef(0)
  const cueIdx      = useRef(0)
  const bpmRef      = useRef<number | null>(null)
  const doneRef     = useRef(false)
  const exerciseRef = useRef(exercise)
  const fatigueRef  = useRef<Record<string, number>>({})   // per-muscle fatigue 0..1
  const repPeakRef  = useRef(0)                              // max activation within the current rep
  useEffect(() => { bpmRef.current = liveBpm }, [liveBpm])
  useEffect(() => { exerciseRef.current = exercise }, [exercise])

  const say = useCallback((t: string) => { if (voiceOn) { try { voice.speak(t) } catch { /* ignore */ } } }, [voice, voiceOn])
  const sayRef = useRef(say)
  useEffect(() => { sayRef.current = say }, [say])

  // Reset everything when the exercise changes.
  useEffect(() => {
    if (!exercise) return
    tracker.current = createExerciseTracker(exercise)
    aiCoach.current = createGymCoach(exercise)
    frameRef.current = EMPTY
    halfway.current = false; poorStart.current = null; cueIdx.current = 0; doneRef.current = false
    fatigueRef.current = {}; repPeakRef.current = 0
    setUi({ reps: 0, activation: 0, formGood: false, peak: 0, rom: 0 })
    setSet(1); setDone(false); setCoach(null); setFatigue({}); setRepHist([])
  }, [exercise])

  useEffect(() => () => { disposeDetector(); try { window.speechSynthesis?.cancel() } catch { /* ignore */ } }, [])

  // Stable (reads refs only) so the CameraView frame loop never holds stale state.
  const runCoach = useCallback(async (reason: 'start' | 'halfway' | 'form' | 'done') => {
    const ex = exerciseRef.current
    if (!aiCoach.current || !ex) return
    const f = frameRef.current
    const msg = await aiCoach.current.maybeCue(
      { reps: f.reps, repGoal: ex.repGoal, peakActivation: f.peakActivation, romDeg: f.romDeg, bpm: bpmRef.current },
      reason,
    )
    if (msg) { setCoach(msg); sayRef.current(msg) }
  }, [])

  const onLandmarks = useCallback((lms: import('../../lib/movement/landmarks').LandmarkSet) => {
    const t = tracker.current
    const ex = exerciseRef.current
    if (!t || !ex || doneRef.current) return
    const f = t.update(lms)
    frameRef.current = f
    if (!f.valid) return
    repPeakRef.current = Math.max(repPeakRef.current, f.activation)

    // Rep just completed → log depth, build fatigue, count + coach.
    if (f.justRepped) {
      const depth = repPeakRef.current; repPeakRef.current = 0
      setRepHist((h) => [...h, depth].slice(-8))
      const fat = fatigueRef.current
      for (const m of ex.primary)   fat[m] = Math.min(1, (fat[m] ?? 0) + 0.06 + depth * 0.07)
      for (const m of ex.secondary) fat[m] = Math.min(1, (fat[m] ?? 0) + 0.03 + depth * 0.035)
      setFatigue({ ...fat })
      setUi((u) => ({ ...u, reps: f.reps }))
      if (f.reps <= ex.repGoal) sayRef.current(String(f.reps))
      if (!halfway.current && f.reps >= Math.ceil(ex.repGoal / 2)) { halfway.current = true; void runCoach('halfway') }
      if (f.reps >= ex.repGoal && !doneRef.current) {
        doneRef.current = true; setDone(true); sayRef.current('Set complete. Great work.'); void runCoach('done')
      }
    }

    // Sustained partial range → rotate a local cue (free) + optional AI nudge.
    const now = performance.now()
    if (!f.formGood && f.activation > 0.15) {
      if (poorStart.current == null) poorStart.current = now
      else if (now - poorStart.current > 4000 && now - lastCue.current > 6000) {
        lastCue.current = now
        const cue = ex.cues[cueIdx.current % ex.cues.length]; cueIdx.current++
        sayRef.current(cue); void runCoach('form')
        poorStart.current = now
      }
    } else if (f.formGood) {
      poorStart.current = null
    }
  }, [runCoach])

  // Decouple UI refresh (10 fps) from the camera frame rate + slow fatigue recovery.
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const f = frameRef.current
      setUi((u) => ({ ...u, activation: f.activation, formGood: f.formGood, peak: f.peakActivation, rom: f.romDeg }))
      const fat = fatigueRef.current; let changed = false
      for (const k in fat) { const v = Math.max(0, fat[k] - 0.0015); if (v !== fat[k]) { fat[k] = v; changed = true } }
      if (changed) setFatigue({ ...fat })
    }, 100)
    return () => window.clearInterval(id)
  }, [active])

  const start = useCallback(() => {
    setErr(null); setActive(true)
    say(`${exercise!.name}. ${exercise!.cues[0]}`)
    setTimeout(() => void runCoach('start'), 600)
  }, [exercise, say, runCoach])

  const finishSet = useCallback(() => {
    const f = frameRef.current
    logSet({
      exerciseId: exercise!.id, exerciseName: exercise!.name, group: exercise!.group,
      reps: f.reps, peakActivation: f.peakActivation, romDeg: f.romDeg,
      avgBpm: bpmRef.current ?? undefined, at: Date.now(),
    })
    if (currentSet < exercise!.sets) {
      setSet((n) => n + 1); setDone(false); doneRef.current = false; halfway.current = false; poorStart.current = null
      repPeakRef.current = 0
      tracker.current = createExerciseTracker(exercise!)
      setUi({ reps: 0, activation: 0, formGood: false, peak: 0, rom: 0 }); setRepHist([])
      say(`Set ${currentSet} logged. Rest, then set ${currentSet + 1}.`)
    } else {
      say('All sets done. Nice session.')
      back()
    }
  }, [exercise, currentSet, logSet, back, say])

  if (!exercise || !group) {
    return <div className="flex h-full items-center justify-center text-stone-400">Exercise not found.</div>
  }

  const repPct = Math.min(1, ui.reps / exercise.repGoal)
  const aiOn = gymCoachEnabled()
  const muscles = [...exercise.primary, ...exercise.secondary]
  // Muscles to glow on the twin: brighter at peak. Memoised so the viewer only
  // re-skins on a meaningful change.
  const twinActs = useMemo(() => groupActivations(exercise.group, ui.formGood ? 1.0 : 0.72), [exercise.group, ui.formGood])

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-stone-950 to-black text-stone-100">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-amber-500/15 bg-black/50 px-4 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={back} className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-800"><ArrowLeft size={18} /></button>
          <Dumbbell size={16} className={group.accent.text} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{exercise.name}</div>
            <div className="truncate text-[11px] text-stone-400">{group.name} · {exercise.focus}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-stone-800/70 px-2.5 py-1 text-xs font-semibold text-stone-200 sm:inline">Set {currentSet}/{exercise.sets}</span>
          <HeartRateWidget compact />
          <button onClick={() => setVoiceOn((v) => !v)} className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-800" title={voiceOn ? 'Mute coach' : 'Unmute coach'}>
            {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </header>

      {!active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          {err && <div className="max-w-sm rounded-lg bg-orange-950/50 px-3 py-2 text-sm text-orange-200 ring-1 ring-orange-500/30">{err}</div>}
          <div className={['flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br text-white', group.accent.from, group.accent.to].join(' ')}><Dumbbell size={34} /></div>
          <div>
            <div className="text-lg font-bold">{exercise.name}</div>
            <div className="text-sm text-stone-400">{exercise.sets} sets × {exercise.repGoal} reps · {exercise.equipment}</div>
          </div>
          <button onClick={start} className={['rounded-full bg-gradient-to-r px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110', group.accent.from, group.accent.to].join(' ')}>
            Start tracking
          </button>
          <p className="max-w-xs text-[11px] text-stone-500">Stand back so your whole working side is in view. Everything is tracked on-device.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* TOP — twin + fatigue | demo */}
          <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr]">
            <Panel title="Your muscle twin" icon={<Flame size={12} />}
              right={<span className={['rounded-full px-2 py-0.5 text-[10px] font-semibold', ui.formGood ? 'bg-emerald-600/80 text-white' : 'bg-stone-800 text-amber-200'].join(' ')}>{!ready ? 'Starting…' : ui.formGood ? 'Squeeze!' : 'Full range'}</span>}>
              <div className="relative h-[34vh] min-h-[220px] overflow-hidden rounded-lg bg-black/30">
                <CanvasErrorBoundary fallback={<div className="flex h-full items-center justify-center text-sm text-stone-600">3D twin unavailable</div>}>
                  <MuscleActivationViewer activations={twinActs} />
                </CanvasErrorBoundary>
              </div>
              <div className="mt-2">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Muscle fatigue</div>
                <FatigueBars muscles={muscles} fatigue={fatigue} />
              </div>
            </Panel>

            <Panel title="Mimic this" icon={<Video size={12} />}>
              <div className="h-[34vh] min-h-[220px] overflow-hidden rounded-lg bg-black/40">
                <DemoPanel video={exercise.media.video} glyph={exercise.media.glyph} accent={group.accent.text} />
              </div>
              <ul className="mt-2 space-y-1">
                {exercise.cues.slice(0, 3).map((c) => <li key={c} className="text-[11px] text-stone-400">• {c}</li>)}
              </ul>
            </Panel>
          </div>

          {/* BOTTOM — live cam | reps | RoM spider | activation */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Panel title="You · live overlay" icon={<Activity size={12} />}>
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-black ring-1 ring-amber-400/30">
                <CameraView active onLandmarks={onLandmarks} onReady={() => setReady(true)} onError={(m) => { setErr(m); setActive(false) }} />
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">posture tracked</span>
              </div>
            </Panel>

            <Panel title="Reps" icon={<RotateCcw size={12} />}>
              <div className="flex h-full flex-col items-center justify-center gap-2 py-2">
                <RepRing pct={repPct} reps={ui.reps} goal={exercise.repGoal} accent={group.accent.text} />
                <div className="text-xs text-stone-400">Set {currentSet} of {exercise.sets}</div>
              </div>
            </Panel>

            <Panel title="Range of motion" icon={<Gauge size={12} />} right={<span className="text-[10px] text-stone-400">{ui.rom | 0}°</span>}>
              {repHist.length > 0 ? (
                <>
                  <RoMRadar values={repHist} />
                  <div className="mt-1 text-center text-[10px] text-stone-500">depth per rep (last {repHist.length})</div>
                </>
              ) : (
                <div className="flex h-full min-h-[150px] items-center justify-center px-2 text-center text-[11px] text-stone-500">Your range per rep will plot here as you go.</div>
              )}
            </Panel>

            <Panel title="Muscle activation" icon={<Flame size={12} />} right={<span className="text-[10px] text-stone-400">peak {Math.round(ui.peak * 100)}%</span>}>
              <ActivationBar value={ui.activation} />
              <div className="mt-2 space-y-1.5">
                {exercise.primary.map((m) => <MuscleRow key={m} name={m} value={ui.activation} primary />)}
                {exercise.secondary.map((m) => <MuscleRow key={m} name={m} value={ui.activation * 0.55} primary={false} />)}
              </div>
            </Panel>
          </div>

          {/* Coach + controls */}
          <div className="mt-3 flex flex-col gap-3 lg:flex-row">
            <div className="flex-1 rounded-2xl bg-stone-900/60 p-3 ring-1 ring-stone-700/50">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-300" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Coach</span>
                {!aiOn && <span className="ml-auto text-[9px] text-stone-500">AI off · add key in Triage</span>}
              </div>
              <p className="text-sm text-stone-200">{coachMsg ?? exercise.cues[0]}</p>
            </div>
            <div className="flex items-stretch gap-2">
              <button onClick={back} className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-stone-200 hover:bg-stone-700">Exit</button>
              <button onClick={finishSet}
                className={['flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110', group.accent.from, group.accent.to].join(' ')}>
                <Check size={16} /> {done ? 'Log set' : currentSet < exercise.sets ? 'Finish set' : 'Finish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panels & plots ───────────────────────────────────────────────────────────

function Panel({ title, icon, right, children }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl bg-stone-900/60 ring-1 ring-stone-700/50">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">{icon}{title}</div>
        {right}
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3">{children}</div>
    </section>
  )
}

function DemoPanel({ video, glyph, accent }: { video: string | null; glyph: import('../../lib/gym/exercises').ExerciseMedia['glyph']; accent: string }) {
  if (video) {
    return <video src={`${import.meta.env.BASE_URL}videos/${video}`} autoPlay muted loop playsInline className="h-full w-full object-cover" />
  }
  return (
    <div className={['flex h-full flex-col items-center justify-center gap-2', accent].join(' ')}>
      <ExerciseGlyph glyph={glyph} className="h-24 w-24 opacity-80" />
      <span className="text-[11px] text-stone-500">Follow the cues</span>
    </div>
  )
}

function FatigueBars({ muscles, fatigue }: { muscles: string[]; fatigue: Record<string, number> }) {
  return (
    <div className="space-y-1.5">
      {muscles.map((m) => {
        const v = Math.min(1, fatigue[m] ?? 0)
        const color = v < 0.4 ? 'bg-emerald-400' : v < 0.7 ? 'bg-amber-400' : 'bg-rose-500'
        return (
          <div key={m} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px] text-stone-300">{m}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-800">
              <div className={['h-full rounded-full transition-[width] duration-200', color].join(' ')} style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-stone-400">{Math.round(v * 100)}%</span>
          </div>
        )
      })}
    </div>
  )
}

function RoMRadar({ values }: { values: number[] }) {
  const size = 168, cx = size / 2, cy = size / 2, R = 60
  const n = Math.max(values.length, 3)
  const ang = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i: number, r: number): [number, number] => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r]
  const dataPoly = Array.from({ length: n }, (_, i) => pt(i, R * Math.max(0.04, values[i] ?? 0)).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[190px]">
      {[0.34, 0.67, 1].map((r) => (
        <polygon key={r} points={Array.from({ length: n }, (_, i) => pt(i, R * r).join(',')).join(' ')} fill="none" stroke="rgba(168,162,158,0.16)" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(168,162,158,0.13)" strokeWidth="1" /> })}
      <polygon points={dataPoly} fill="rgba(251,146,60,0.30)" stroke="#f59e0b" strokeWidth="1.5" />
      {values.map((v, i) => { const [x, y] = pt(i, R * Math.max(0.04, v)); return <circle key={i} cx={x} cy={y} r="2.6" fill="#fb923c" /> })}
    </svg>
  )
}

function RepRing({ pct, reps, goal, accent }: { pct: number; reps: number; goal: number; accent: string }) {
  const R = 34, C = 2 * Math.PI * R
  return (
    <svg width="92" height="92" viewBox="0 0 86 86" className="drop-shadow-lg">
      <circle cx="43" cy="43" r={R} fill="rgba(0,0,0,0.45)" stroke="rgba(168,162,158,0.25)" strokeWidth="6" />
      <circle cx="43" cy="43" r={R} fill="none" stroke="currentColor" className={accent} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 43 43)" />
      <text x="43" y="40" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fafaf9">{reps}</text>
      <text x="43" y="56" textAnchor="middle" fontSize="11" fill="#a8a29e">/ {goal}</text>
    </svg>
  )
}

function ActivationBar({ value }: { value: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-stone-800">
      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-[width] duration-100"
        style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
    </div>
  )
}

function MuscleRow({ name, value, primary }: { name: string; value: number; primary: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={['w-1.5 self-stretch rounded-full', primary ? 'bg-amber-400' : 'bg-stone-600'].join(' ')} />
      <span className={['flex-1 truncate text-xs', primary ? 'text-stone-100' : 'text-stone-400'].join(' ')}>{name}</span>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-stone-800">
        <div className="h-full rounded-full bg-amber-400 transition-[width] duration-100" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
      </div>
    </div>
  )
}
