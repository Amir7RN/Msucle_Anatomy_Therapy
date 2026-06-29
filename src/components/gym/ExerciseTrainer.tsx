/**
 * ExerciseTrainer.tsx — the MoveMate Train workout screen.
 *
 * The MAIN panel is the user's digital muscle twin (the target muscles glow on
 * the shared 3D model as you work), with the live camera + skeleton overlay as a
 * corner picture-in-picture. Focus (per the brief): motion tracking, muscle
 * activation, and required reps — with an optional AI coach. Deliberately NO
 * muscle-structure browser and NO chat box. Reps + activation come from the
 * generic tracker reading MediaPipe landmarks; coaching is local-first (free)
 * with an optional, throttled Claude layer.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Activity, Check, RotateCcw, Volume2, VolumeX, Dumbbell, Sparkles, Target } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { MuscleActivationViewer } from '../movement/MuscleActivationViewer'
import { disposeDetector } from '../../lib/movement/poseDetector'
import { useVoiceOutput } from '../../hooks/useVoice'
import { useGymStore } from '../../store/gymStore'
import { exerciseById, muscleGroupById } from '../../lib/gym/exercises'
import { createExerciseTracker, type TrackFrame } from '../../lib/gym/tracker'
import { createGymCoach, gymCoachEnabled } from '../../lib/gym/coach'
import { groupActivations } from '../../lib/gym/muscleModel'
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

  const tracker   = useRef(exercise ? createExerciseTracker(exercise) : null)
  const aiCoach    = useRef(exercise ? createGymCoach(exercise) : null)
  const frameRef  = useRef<TrackFrame>(EMPTY)
  const halfway   = useRef(false)
  const poorStart = useRef<number | null>(null)
  const lastCue   = useRef(0)
  const cueIdx    = useRef(0)
  const bpmRef    = useRef<number | null>(null)
  const doneRef     = useRef(false)
  const exerciseRef = useRef(exercise)
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
    setUi({ reps: 0, activation: 0, formGood: false, peak: 0, rom: 0 })
    setSet(1); setDone(false); setCoach(null)
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

    // Rep just completed → snappy count + local voice + milestones.
    if (f.justRepped) {
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

  // Decouple UI refresh (10 fps) from the camera frame rate for smooth bars.
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const f = frameRef.current
      setUi((u) => ({ ...u, activation: f.activation, formGood: f.formGood, peak: f.peakActivation, rom: f.romDeg }))
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
      tracker.current = createExerciseTracker(exercise!)
      setUi({ reps: 0, activation: 0, formGood: false, peak: 0, rom: 0 })
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
  // Muscles to glow on the digital twin: brighter at peak contraction. Memoised
  // on [group, formGood] so the viewer only re-skins on a meaningful change.
  const twinActs = useMemo(() => groupActivations(exercise.group, ui.formGood ? 1.0 : 0.72), [exercise.group, ui.formGood])

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-stone-950 to-black text-stone-100">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-amber-500/15 bg-black/50 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={back} className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-800"><ArrowLeft size={18} /></button>
          <Dumbbell size={16} className={group.accent.text} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{exercise.name}</div>
            <div className="truncate text-[11px] text-stone-400">{group.name} · {exercise.focus}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HeartRateWidget compact />
          <button onClick={() => setVoiceOn((v) => !v)} className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-800" title={voiceOn ? 'Mute coach' : 'Unmute coach'}>
            {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Main — digital twin with camera PiP */}
        <div className="relative h-[46vh] shrink-0 bg-gradient-to-b from-stone-900 to-black lg:h-auto lg:flex-1">
          {active ? (
            <>
              {/* Digital muscle twin (main view) */}
              <div className="absolute inset-0">
                <CanvasErrorBoundary fallback={<div className="flex h-full w-full items-center justify-center text-sm text-stone-600">3D twin unavailable on this device</div>}>
                  <MuscleActivationViewer activations={twinActs} />
                </CanvasErrorBoundary>
              </div>
              {/* Status badge */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
                <div className={['rounded-full px-3 py-1 text-xs font-semibold backdrop-blur',
                  ui.formGood ? 'bg-emerald-600/80 text-white' : 'bg-stone-800/80 text-amber-200'].join(' ')}>
                  {!ready ? 'Starting camera…' : ui.formGood ? 'Peak contraction — squeeze!' : 'Move through the full range'}
                </div>
              </div>
              {/* Live camera + skeleton overlay — corner picture-in-picture */}
              <div className="absolute bottom-3 left-3 h-44 w-32 overflow-hidden rounded-xl bg-black shadow-xl ring-2 ring-amber-400/40 sm:h-52 sm:w-40">
                <CameraView active onLandmarks={onLandmarks} onReady={() => setReady(true)}
                  onError={(m) => { setErr(m); setActive(false) }} />
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">You</span>
              </div>
              {/* Rep ring */}
              <div className="pointer-events-none absolute bottom-3 right-3">
                <RepRing pct={repPct} reps={ui.reps} goal={exercise.repGoal} accent={group.accent.text} />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              {err && <div className="max-w-sm rounded-lg bg-orange-950/50 px-3 py-2 text-sm text-orange-200 ring-1 ring-orange-500/30">{err}</div>}
              <div className={['flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br text-white', group.accent.from, group.accent.to].join(' ')}>
                <Dumbbell size={34} />
              </div>
              <div>
                <div className="text-lg font-bold">{exercise.name}</div>
                <div className="text-sm text-stone-400">{exercise.sets} sets × {exercise.repGoal} reps · {exercise.equipment}</div>
              </div>
              <button onClick={start} className={['rounded-full bg-gradient-to-r px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110', group.accent.from, group.accent.to].join(' ')}>
                Start tracking
              </button>
              <p className="max-w-xs text-[11px] text-stone-500">Stand back so your whole working side is in view. Reps and muscle activation are tracked on-device.</p>
            </div>
          )}
        </div>

        {/* Live metrics + coaching */}
        <div className="flex w-full flex-col gap-3 overflow-y-auto border-amber-500/10 p-4 lg:w-[360px] lg:border-l">
          {/* Set + reps */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Set" value={`${currentSet}/${exercise.sets}`} icon={<Target size={13} />} accent={group.accent.text} />
            <Stat label="Reps" value={`${ui.reps}/${exercise.repGoal}`} icon={<RotateCcw size={13} />} accent={group.accent.text} />
            <Stat label="ROM" value={`${ui.rom | 0}°`} icon={<Activity size={13} />} accent={group.accent.text} />
          </div>

          {/* Muscle activation */}
          <div className="rounded-xl bg-stone-900/70 p-3 ring-1 ring-stone-700/50">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Muscle activation</span>
              <span className="text-[10px] text-stone-400">peak {Math.round(ui.peak * 100)}%</span>
            </div>
            <ActivationBar value={ui.activation} />
            <div className="mt-2.5 space-y-1.5">
              {exercise.primary.map((m) => (
                <MuscleRow key={m} name={m} value={ui.activation} primary accent={group.accent} />
              ))}
              {exercise.secondary.map((m) => (
                <MuscleRow key={m} name={m} value={ui.activation * 0.55} primary={false} accent={group.accent} />
              ))}
            </div>
          </div>

          {/* Coach */}
          <div className="rounded-xl bg-stone-900/70 p-3 ring-1 ring-stone-700/50">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-300" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Coach</span>
              {!aiOn && <span className="ml-auto text-[9px] text-stone-500">AI off · add key in Triage</span>}
            </div>
            <p className="text-sm text-stone-200">{coachMsg ?? exercise.cues[0]}</p>
            {!coachMsg && (
              <ul className="mt-2 space-y-1">
                {exercise.cues.slice(1).map((c) => <li key={c} className="text-[11px] text-stone-400">• {c}</li>)}
              </ul>
            )}
          </div>

          <div className="mt-auto flex gap-2">
            <button onClick={back} className="rounded-xl bg-stone-800 px-3 py-2.5 text-sm font-semibold text-stone-200 hover:bg-stone-700">Exit</button>
            <button onClick={finishSet} disabled={!active}
              className={['flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-3 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50', group.accent.from, group.accent.to].join(' ')}>
              <Check size={16} /> {done ? 'Log set' : currentSet < exercise.sets ? 'Finish set' : 'Finish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RepRing({ pct, reps, goal, accent }: { pct: number; reps: number; goal: number; accent: string }) {
  const R = 34, C = 2 * Math.PI * R
  return (
    <svg width="86" height="86" viewBox="0 0 86 86" className="drop-shadow-lg">
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

function MuscleRow({ name, value, primary, accent }: { name: string; value: number; primary: boolean; accent: { text: string } }) {
  return (
    <div className="flex items-center gap-2">
      <span className={['w-1.5 self-stretch rounded-full', primary ? 'bg-amber-400' : 'bg-stone-600'].join(' ')} />
      <span className={['flex-1 text-xs', primary ? 'text-stone-100' : 'text-stone-400'].join(' ')}>{name}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-800">
        <div className="h-full rounded-full bg-amber-400 transition-[width] duration-100" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
      </div>
    </div>
  )
}

function Stat({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-xl bg-stone-900/70 p-2.5 ring-1 ring-stone-700/50">
      <div className={['flex items-center gap-1 text-[10px] uppercase tracking-wider', accent].join(' ')}>{icon}{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}
