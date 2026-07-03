/**
 * ExerciseGuidance.tsx
 *
 * Full-screen exercise overlay — camera + skeleton + live AI physical therapist.
 *
 * Layout
 * ──────────────────────────────────────────────────────────────────────────
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │  Header: exercise name + Live Form Check badge + close button        │
 *  ├────────────────────────────────┬─────────────────────────────────────┤
 *  │                                │  🎙 AI Coach (live PT conversation) │
 *  │   Camera feed + skeleton       │  Live Angle readouts                │
 *  │   Good/Bad cue banner          │  Reference video                    │
 *  └────────────────────────────────┴─────────────────────────────────────┘
 *
 * AI Coach:
 *   • Replaces the static "Setup" text with a live Claude-powered coach.
 *   • Reads real-time biofeedback (joint angles, pass/fail) as context.
 *   • Proactively speaks coaching cues every 12 s when form is off.
 *   • Voice input (mic always on) — ask it anything while holding the stretch.
 *   • Reuses the Anthropic API key from the Triage chat (localStorage).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Camera, Play, CheckCircle, AlertCircle, Info,
  Mic, MicOff, Brain, Send, KeyRound,
} from 'lucide-react'
import { CameraView } from './CameraView'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { LM } from '../../lib/movement/landmarks'
import {
  BIOFEEDBACK_DEFS,
  EXERCISE_TO_BIOFEEDBACK,
  evaluateExercise,
  EXERCISE_TO_PROCEDURE,
  EXERCISE_PROCEDURES,
  type FormSnapshot,
  type BiofeedbackDef,
  type StepCheck,
} from '../../lib/movement/biofeedback'
import { useVoiceInput, useVoiceOutput } from '../../hooks/useVoice'
import { createRepCounter } from '../../lib/movement/repCounter'
import { getStoredApiKey, setStoredApiKey, anthropicMessages } from '../../lib/triage/llm'
import { completeSentences } from '../../lib/speechText'
import { FormTrendTracker } from '../../lib/movement/coachContext'
import {
  createCueStream,
  pickCueFromJoint,
  type CueStreamState,
  type JointSample,
} from '../../lib/movement/directionalCue'
import { loadROMHistory } from '../../lib/movement/romHistory'
import { computeActivation } from '../../lib/movement/muscleActivation'
import { MuscleActivationViewer } from './MuscleActivationViewer'
import { MuscleTwinModel } from './MuscleTwinModel'
import { LiveActivationEngine, type LiveMuscleActivation } from '../../lib/movement/liveMuscleActivation'
import { MuscleStatusEngine, type MuscleStatusFrame, STATE_META } from '../../lib/movement/muscleStatus'
import { saveSession } from '../../lib/movement/muscleSessionLog'
import { buildPersonalization } from '../../lib/profile/personalization'
import { loadProfile, subscribeProfile } from '../../lib/profile/userProfile'
import { PoseRigEngine, SEGMENT_ORDER, type BoneDirs, type SegmentId } from '../../lib/movement/poseRig'
import { postureForExercise, movingSegmentsForExercise, type Posture } from '../../lib/movement/exercisePose'
import { priorFor } from '../../lib/movement/activationPriors'
import { useAtlasStore } from '../../store/atlasStore'

// ── Smoothing buffer ──────────────────────────────────────────────────────────
const SMOOTH_FRAMES = 8

// ── Anthropic API ─────────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const COACH_MODEL   = 'claude-haiku-4-5-20251001'

interface Props {
  exerciseId:    string | null
  exerciseLabel: string
  videoSrc:      string
  /** Mesh/diagnostic muscle id (e.g. "MUSC_BICEPS_BRACHII_R" or "biceps_brachii").
      Used to pull the user's measured ROM history so the coach can cap cues
      at the user's safe peak instead of a healthy-population target. */
  muscleId?:     string
  onClose:       () => void
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ExerciseGuidance({ exerciseId, exerciseLabel, videoSrc, muscleId, onClose }: Props) {
  // Hide the 3D canvas chrome AND make absolutely sure the AI Coach's
  // speech queue is silenced whenever the user exits this overlay.
  useEffect(() => {
    const { pushModal, popModal } = useAtlasStore.getState()
    pushModal()
    return () => {
      popModal()
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [])

  const biofeedbackKey = exerciseId ? EXERCISE_TO_BIOFEEDBACK[exerciseId] : null
  const def: BiofeedbackDef | null = biofeedbackKey ? BIOFEEDBACK_DEFS[biofeedbackKey] ?? null : null

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [snapshot, setSnapshot]       = useState<FormSnapshot | null>(null)
  // Rep counting — every form-good→form-rest cycle counts as one.
  const [repCount, setRepCount]       = useState(0)
  const repTarget = 10
  const repTrackerRef = useRef(createRepCounter(repTarget))

  // Live landmark ref — updated every camera frame, read by AiCoach's RAF loop
  const lmsRef = useRef<LandmarkSet | null>(null)

  // Frame smoothing
  const frameBuffer = useRef<FormSnapshot[]>([])

  // ── Live performance metrics ──────────────────────────────────────────
  // Rolling 3-second buffer of {wasGood, perJointStatus}.  Drives the
  // PerformanceTracker headline % and per-joint accuracy bars without any
  // per-exercise tuning — every metric is derived from snapshot data the
  // biofeedback engine already produces.
  const PERF_WINDOW = 90   // ~3 s at 30 fps
  const perfHistoryRef = useRef<FormSnapshot[]>([])
  const [formScore, setFormScore]     = useState(0)
  const [jointAccuracy, setJointAccuracy] = useState<Array<{ label: string; pct: number; current: number; status: 'good' | 'low' | 'high' }>>([])
  // Per-rep history: each completed rep's % good frames during the rep window.
  const currentRepStatsRef = useRef({ good: 0, total: 0 })
  const [repScores, setRepScores]     = useState<number[]>([])
  // Best continuous "good form" streak in the session (seconds).
  const currentStreakRef = useRef(0)
  const [bestHoldSec, setBestHoldSec] = useState(0)

  // ── Pose-readiness gate ───────────────────────────────────────────────
  // Single-camera depth + angle estimation collapses when the user's torso
  // anchor (shoulders + hips) is partially out of frame.  This is the
  // dominant accuracy failure mode reported as "the angles are off when I
  // turn" — what's actually happening is one shoulder going invisible and
  // MediaPipe back-filling a guess.  We expose a small badge that turns
  // green only when ALL four torso anchors are seen with confidence > 0.7
  // (well above the 0.5 working threshold so we have headroom).  Smoothed
  // over 5 frames so a single-frame dip doesn't strobe the badge.
  const POSE_OK_VIS  = 0.7
  const POSE_WIN     = 5
  const poseHistRef  = useRef<boolean[]>([])
  const [poseLocked, setPoseLocked] = useState(false)
  const [poseHint,   setPoseHint]   = useState<string>('Step into frame…')

  // ── Live Muscle Twin engine — drives the 3-D model + activation colour ──
  const liveEngineRef = useRef<LiveActivationEngine | null>(null)
  const liveActsRef   = useRef<LiveMuscleActivation[]>([])
  const liveBoneRef   = useRef<BoneDirs>({})
  // Stateful pose rig — smooths + stabilises the twin (vs the old raw stateless
  // directions) and lets us apply the per-exercise kinematic prior below.
  const poseRigRef    = useRef<PoseRigEngine | null>(null)
  // Posture prior — the model adopts the exercise's expected posture (the model
  // favours the known exercise instead of guessing the global posture).
  const posturePriorRef = useRef<Posture | null>(null)
  // Kinematic prior — segments the exercise does NOT move, held steady so the
  // overlay favours the expected motion (biceps curl → only forearms track).
  const holdSegmentsRef = useRef<ReadonlySet<SegmentId> | undefined>(undefined)
  useEffect(() => {
    posturePriorRef.current = postureForExercise(exerciseId)
    const moving = movingSegmentsForExercise(exerciseId)
    holdSegmentsRef.current = moving
      ? new Set(SEGMENT_ORDER.filter((s) => !moving.includes(s)))
      : undefined
    poseRigRef.current?.reset()
  }, [exerciseId])
  useEffect(() => () => { poseRigRef.current?.reset(); poseRigRef.current = null }, [])
  // Throttled list of the muscles actually engaged (for the quantitative readout).
  const [engagedMuscles, setEngagedMuscles] = useState<{ muscleId: string; level: number }[]>([])
  const lastEngagedRef = useRef(0)
  useEffect(() => () => { liveEngineRef.current?.reset(); liveEngineRef.current = null }, [])

  // ── Personalised muscle-status engine (fatigue / work / state) ──────────
  // Same engine the standalone Live Muscle Twin uses, seeded with the user's
  // profile so fatigue reads consistently across the app. Updates live if the
  // profile changes, and persists the session so the weekly trend keeps building.
  const statusEngineRef = useRef<MuscleStatusEngine | null>(null)
  const [muscleStatus, setMuscleStatus] = useState<MuscleStatusFrame | null>(null)
  const lastStatusRef = useRef(0)
  useEffect(() => {
    statusEngineRef.current = new MuscleStatusEngine(buildPersonalization(loadProfile()))
    const unsub = subscribeProfile(() => {
      statusEngineRef.current?.setPersonalization(buildPersonalization(loadProfile()))
    })
    return () => {
      const eng = statusEngineRef.current
      if (eng?.hasMeaningfulSession()) { try { saveSession(eng.summary()) } catch { /* ignore */ } }
      eng?.reset(); statusEngineRef.current = null
      unsub()
    }
  }, [])

  const handleLandmarks = useCallback((lms: LandmarkSet) => {
    // Always update lmsRef so AiCoach step-machine can read it
    lmsRef.current = lms

    // Drive the live muscle twin every frame (runs even with no exercise def
    // so the model mirrors the user and shows real activation).
    if (!liveEngineRef.current) liveEngineRef.current = new LiveActivationEngine()
    const liveNow = performance.now()
    // Exercise-grounded activation prior (literature/MinT pattern) for accuracy.
    const liveFrame = liveEngineRef.current.update(lms, liveNow, undefined, priorFor(exerciseId))
    liveActsRef.current = liveFrame.activations
    if (!poseRigRef.current) poseRigRef.current = new PoseRigEngine()
    liveBoneRef.current = poseRigRef.current.update(lms, liveNow, { holdSegments: holdSegmentsRef.current }).dirs
    // Integrate the personalised fatigue/work model (same engine as the Twin).
    const statusFrame = statusEngineRef.current?.update(liveFrame, liveNow)
    if (statusFrame && liveNow - lastStatusRef.current > 250) {
      lastStatusRef.current = liveNow
      setMuscleStatus(statusFrame)
    }
    // Surface the few muscles actually engaged for THIS exercise (top distinct,
    // above baseline) as a throttled quantitative readout.
    if (liveNow - lastEngagedRef.current > 220) {
      lastEngagedRef.current = liveNow
      const seen = new Set<string>()
      const top: { muscleId: string; level: number }[] = []
      for (const a of liveFrame.activations) {
        if (a.level <= 0.18) break
        if (seen.has(a.muscleId)) continue
        seen.add(a.muscleId)
        top.push({ muscleId: a.muscleId, level: a.level })
        if (top.length >= 5) break
      }
      setEngagedMuscles(top)
    }

    // Torso-anchor readiness check — runs even when there's no biofeedback def
    const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER]
    const lh = lms[LM.L_HIP],      rh = lms[LM.R_HIP]
    const torsoOk =
      (ls?.visibility ?? 0) >= POSE_OK_VIS &&
      (rs?.visibility ?? 0) >= POSE_OK_VIS &&
      (lh?.visibility ?? 0) >= POSE_OK_VIS &&
      (rh?.visibility ?? 0) >= POSE_OK_VIS
    poseHistRef.current.push(torsoOk)
    if (poseHistRef.current.length > POSE_WIN) poseHistRef.current.shift()
    const passing = poseHistRef.current.filter(Boolean).length
    const locked  = passing >= Math.ceil(POSE_WIN * 0.6)
    setPoseLocked(locked)
    if (!locked) {
      // Build a specific repositioning hint based on which anchor is weakest.
      const worst = [
        { v: ls?.visibility ?? 0, msg: 'Left shoulder hidden — step back / center yourself.' },
        { v: rs?.visibility ?? 0, msg: 'Right shoulder hidden — step back / center yourself.' },
        { v: lh?.visibility ?? 0, msg: 'Left hip out of frame — step further back.' },
        { v: rh?.visibility ?? 0, msg: 'Right hip out of frame — step further back.' },
      ].sort((a, b) => a.v - b.v)[0]
      setPoseHint(worst.v < 0.3 ? worst.msg : 'Face the camera so both shoulders + hips are visible.')
    }

    if (!def) return
    const snap = evaluateExercise(lms, def)

    // ── Permissive "visible-good" override ──────────────────────────────
    // The original evaluateExercise sets snap.good only when EVERY check
    // passes — including checks whose landmarks aren't currently visible.
    // That made FormScore + reps stick at 0 even when the visible joint
    // was already 97 % in band.  We now treat the snapshot as "good" if
    // every VISIBLE detail is in band (and at least one detail exists).
    const visibleGood =
      snap.details.length > 0 && snap.details.every((d) => d.status === 'good')
    const snapEff: FormSnapshot = { ...snap, good: visibleGood }

    frameBuffer.current.push(snapEff)
    if (frameBuffer.current.length > SMOOTH_FRAMES) frameBuffer.current.shift()
    if (frameBuffer.current.length < SMOOTH_FRAMES) return
    const goodCount = frameBuffer.current.filter((s) => s.good).length
    const smoothed: FormSnapshot = goodCount >= SMOOTH_FRAMES / 2
      ? { cueText: 'Good alignment — hold it.', good: true, details: snapEff.details }
      : snapEff
    setSnapshot(smoothed)

    // ── Performance metrics ─────────────────────────────────────────────
    perfHistoryRef.current.push(smoothed)
    if (perfHistoryRef.current.length > PERF_WINDOW) perfHistoryRef.current.shift()

    // Headline form score: AVERAGE of per-joint accuracy over the window.
    // This works even when only one joint is being measured (the old %-of-
    // frames-where-snap.good was a binary all-or-nothing that bottomed at
    // 0 whenever any single check failed silently).
    const goodDetails = perfHistoryRef.current.reduce(
      (acc, s) => {
        for (const d of s.details) {
          acc.total += 1
          if (d.status === 'good') acc.good += 1
        }
        return acc
      },
      { good: 0, total: 0 },
    )
    const score = goodDetails.total > 0
      ? Math.round((goodDetails.good / goodDetails.total) * 100)
      : 0
    setFormScore(score)

    // Per-joint accuracy: for each detail label, % of frames where that
    // joint's status was 'good' over the same window.
    const labelSet = new Set<string>()
    for (const s of perfHistoryRef.current) for (const d of s.details) labelSet.add(d.label)
    const perJoint: typeof jointAccuracy = []
    for (const label of labelSet) {
      let total = 0, good = 0
      for (const s of perfHistoryRef.current) {
        const d = s.details.find((dd) => dd.label === label)
        if (!d) continue
        total += 1
        if (d.status === 'good') good += 1
      }
      const cur = smoothed.details.find((d) => d.label === label)
      perJoint.push({
        label,
        pct:     total > 0 ? Math.round((good / total) * 100) : 0,
        current: cur?.deg ?? 0,
        status:  cur?.status ?? 'low',
      })
    }
    setJointAccuracy(perJoint)

    // Best continuous good-form streak (seconds), assuming 30 fps.
    if (smoothed.good) {
      currentStreakRef.current += 1
      const sec = currentStreakRef.current / 30
      setBestHoldSec((prev) => sec > prev ? Math.round(sec * 10) / 10 : prev)
    } else {
      currentStreakRef.current = 0
    }

    // Per-rep tally
    currentRepStatsRef.current.total += 1
    if (smoothed.good) currentRepStatsRef.current.good += 1

    // Rep tracker — drive the state machine off the SMOOTHED form-good signal
    // so a single noisy frame doesn't accidentally tally a half-rep.
    const repState = repTrackerRef.current.update(smoothed.good)
    if (repState.just_completed) {
      setRepCount(repState.count)
      const stats = currentRepStatsRef.current
      const pct = stats.total > 0 ? Math.round((stats.good / stats.total) * 100) : 0
      setRepScores((prev) => [...prev.slice(-9), pct])
      currentRepStatsRef.current = { good: 0, total: 0 }
    }
  }, [def])

  useEffect(() => {
    frameBuffer.current = []
    poseHistRef.current = []
    setPoseLocked(false)
    setPoseHint('Step into frame…')
    perfHistoryRef.current = []
    currentRepStatsRef.current = { good: 0, total: 0 }
    currentStreakRef.current = 0
    poseHistRef.current = []
    setSnapshot(null)
    setFormScore(0)
    setJointAccuracy([])
    setRepScores([])
    setBestHoldSec(0)
    setPoseLocked(false)
    setPoseHint('Step into frame…')
    lmsRef.current = null
    repTrackerRef.current.reset()
    setRepCount(0)
  }, [exerciseId])

  if (!exerciseId) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Camera size={16} className="text-cyan-400 flex-shrink-0" />
          <span className="text-sm font-semibold tracking-wide truncate">{exerciseLabel}</span>
          {def && (
            <span className="hidden md:inline text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded flex-shrink-0">
              Live Form Check
            </span>
          )}
        </div>
        {/* Exit button — larger and labelled on mobile so it's easy to tap */}
        <button
          onClick={() => {
            window.speechSynthesis?.cancel()
            onClose()
          }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-slate-700 hover:bg-red-700 text-slate-200 hover:text-white transition-colors flex-shrink-0 ml-2"
        >
          <X size={16} />
          <span className="text-xs font-semibold">Exit</span>
        </button>
      </header>

      {/* Body: top row (camera + reference video) | bottom fixed metrics grid */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* ── TOP ROW: camera (left) + reference video auto-playing (right) ──
            Taller than before (was 45vh) so the actual analysis surface gets
            most of the screen.  The bottom row holds the PerformanceTracker
            and AI Coach, which previously left a large black gap. */}
        <div className="flex flex-row flex-shrink-0 h-[48vh] md:h-[58vh] border-b border-slate-700">

          {/* Camera — left half */}
          <div className="relative bg-black flex-1 min-w-0 border-r border-slate-700">
            <CameraView
              active
              onLandmarks={handleLandmarks}
              onReady={() => setCameraReady(true)}
              onError={(msg) => setCameraError(msg)}
            />

            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-slate-300 text-sm">
                <div className="text-center space-y-1">
                  <Camera size={24} className="mx-auto text-cyan-400 animate-pulse" />
                  <p className="text-xs">Starting camera…</p>
                </div>
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-3">
                <div className="text-center space-y-2">
                  <AlertCircle size={24} className="mx-auto text-red-400" />
                  <p className="text-xs text-red-300">{cameraError}</p>
                </div>
              </div>
            )}

            {/* Live form banner */}
            {cameraReady && snapshot && (
              <div className={[
                'absolute bottom-0 left-0 right-0 px-2 py-1.5 text-center text-xs font-semibold',
                snapshot.good ? 'bg-emerald-700/80 text-white' : 'bg-orange-600/85 text-white',
              ].join(' ')}>
                {snapshot.good
                  ? <span className="flex items-center justify-center gap-1"><CheckCircle size={11} /> Good!</span>
                  : snapshot.cueText}
              </div>
            )}

            {/* Pose-lock indicator — REPLACES the static "Your pose" label.
                Green = torso anchors all visible above 0.7 confidence over the
                last ~5 frames; angles are trustworthy.  Orange = anchor
                missing; the system tells the user what to do about it instead
                of silently mis-measuring. */}
            {cameraReady && (
              <div
                className={[
                  'absolute top-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur',
                  poseLocked
                    ? 'bg-emerald-700/85 text-emerald-50 ring-1 ring-emerald-400/50'
                    : 'bg-orange-700/85 text-orange-50 ring-1 ring-orange-400/50',
                ].join(' ')}
                title={poseLocked ? 'Anchors locked — angles are accurate' : poseHint}
              >
                <span
                  className={[
                    'inline-block w-1.5 h-1.5 rounded-full',
                    poseLocked ? 'bg-emerald-300' : 'bg-orange-300 animate-pulse',
                  ].join(' ')}
                />
                {poseLocked ? 'POSE LOCKED' : 'POSITION'}
              </div>
            )}

            {/* Reposition hint banner — only when not locked.  Sits above the
                form-cue banner so the user is told "where to stand" before
                "what to fix in your form". */}
            {cameraReady && !poseLocked && (
              <div className="absolute bottom-7 left-0 right-0 px-2 py-1 text-center text-[10px] font-medium bg-orange-900/75 text-orange-100">
                {poseHint}
              </div>
            )}

            {/* Rep counter — top-right of camera feed */}
            {cameraReady && def && (
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 backdrop-blur ring-1 ring-orange-500/40">
                <span className="text-[9px] uppercase tracking-wider text-orange-300">Reps</span>
                <span className="text-sm font-bold tabular-nums text-orange-200">{repCount}</span>
                <span className="text-[10px] text-slate-400">/ {repTarget}</span>
              </div>
            )}
          </div>

          {/* Reference video — right half, auto-plays on mount, loops 10× */}
          <div className="flex-1 min-w-0 relative bg-black">
            <ReferenceVideo src={videoSrc} label={exerciseLabel} autoPlay loops={10} />
            <div className="absolute top-1.5 left-1.5 text-[9px] font-semibold text-slate-400 bg-black/60 px-1.5 py-0.5 rounded">
              REFERENCE
            </div>
          </div>
        </div>

        {/* ── MOBILE METRICS (md:hidden) ─────────────────────────────
            Replaces the desktop bottom row on phones.  No scrolling: two
            equal-height rows of two compact tiles each, plus a rep-history
            bar at the bottom.  AI Coach is OMITTED here on purpose - the
            user is exercising hands-free with the phone propped up.       */}
        <div className="flex md:hidden flex-col flex-1 min-h-0 bg-slate-950/70">
          <div className="flex flex-row flex-1 min-h-0 border-b border-slate-800">
            {/* Form Score - compact gauge, just the dial + reps line */}
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center border-r border-slate-800 p-2">
              <div className="text-[9px] uppercase tracking-wider text-cyan-300 font-semibold mb-1">Form</div>
              {def
                ? <FormScoreGauge score={formScore} />
                : <div className="text-[9px] text-slate-500 italic text-center">No live metric</div>}
              <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-300">
                <span className="rounded bg-slate-800 px-1.5 py-0.5">
                  <span className="text-orange-300 font-bold tabular-nums">{repCount}</span>
                  <span className="text-slate-500">/{repTarget}</span>
                </span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-300 font-bold tabular-nums">
                  {bestHoldSec.toFixed(1)}s
                </span>
              </div>
            </div>
            {/* Muscle Activation - JUST the 3D body, no header/label/target text */}
            <div className="flex-1 min-w-0 relative bg-gradient-to-b from-slate-900 to-black overflow-hidden">
              <MuscleTwinModel activationsRef={liveActsRef} boneDirsRef={liveBoneRef} postureRef={posturePriorRef} />
            </div>
          </div>
          {/* Rep history - compact horizontal bar chart spanning full width */}
          <div className="flex flex-col flex-1 min-h-0 p-2">
            <div className="text-[9px] uppercase tracking-wider text-cyan-300 font-semibold mb-1">Rep History</div>
            {repScores.length === 0 ? (
              <div className="text-[9px] text-slate-500 italic flex-1 flex items-center">
                Complete a rep to start tracking…
              </div>
            ) : (
              <div className="flex items-end gap-1 flex-1 min-h-0">
                {Array.from({ length: 10 }).map((_, i) => {
                  const score = repScores[i]
                  const height = score != null ? Math.max(6, score) : 6
                  const colour =
                    score == null ? '#1e293b'
                    : score >= 75 ? '#34d399'
                    : score >= 50 ? '#fbbf24'
                    :               '#f87171'
                  return (
                    <div key={i} className="flex flex-col items-center justify-end flex-1 h-full">
                      <span className="text-[8px] text-slate-500 mb-0.5 tabular-nums">
                        {score != null ? score : ''}
                      </span>
                      <div
                        className="w-full rounded-sm"
                        style={{ height: `${height}%`, backgroundColor: colour }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── BOTTOM ROW ───────────────────────────────────────────────
            Left:  PerformanceTracker (Form Score · Joint Accuracy · Reps)
            Right: AI Coach panel (chat + step state + voice)
            Previously the left half was empty/black — now it shows live
            quantitative feedback derived from the angle data we already
            compute every frame.                                         */}
        <div className="hidden md:flex md:flex-row md:flex-1 md:min-h-0 md:overflow-hidden">

        {/* Live muscle activation overlay - re-uses the main atlas's
            BodyParts3D GLB; only the target / actively-firing muscles are
            rendered in red, with a pulse keyed to activation intensity.
            The rest of the body is a faint translucent shell so the user
            sees clearly where the load is going. */}
        <ActivationOverlay snapshot={snapshot} hasDef={!!def} targetMuscleId={muscleId} activationsRef={liveActsRef} boneDirsRef={liveBoneRef} postureRef={posturePriorRef} engaged={engagedMuscles} muscleStatus={muscleStatus} />

        {/* Performance tracker — fills the previously-empty area */}
        <PerformanceTracker
          formScore={formScore}
          jointAccuracy={jointAccuracy}
          repScores={repScores}
          bestHoldSec={bestHoldSec}
          repCount={repCount}
          repTarget={repTarget}
          hasDef={!!def}
        />

        {/* AI coach rail.  display:none on mobile (just the chat UI is
            hidden) - the AiCoach React component STAYS MOUNTED so its
            TTS welcome, step heartbeat, live directional cues, and
            rep-milestone callouts all keep firing.  User hears the coach
            speak on mobile while keeping the screen free for the camera +
            metrics. */}
        <div className="hidden md:flex w-full md:w-80 flex-col bg-slate-900 border-l border-slate-700 flex-shrink-0 overflow-y-auto md:flex-none min-h-0 text-xs">
          {def
            ? <AiCoach def={def} snapshot={snapshot} lmsRef={lmsRef} muscleId={muscleId} repCount={repCount} repTarget={repTarget} />
            : (
              <div className="p-3 border-b border-slate-700 flex items-start gap-2">
                <Info size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  No angle detection for this exercise yet - use the camera to compare your form with the reference video.
                </p>
              </div>
            )
          }
        </div>
        </div>{/* end desktop bottom row */}
      </div>{/* end outer flex-col body */}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  AiCoach — step-by-step procedure machine + live AI physical therapist
//
//  Architecture:
//    • A RAF loop reads lmsRef every frame and runs the current step's check().
//    • When check() returns done:true, a hold timer accumulates (500 ms grace).
//    • After holdMs ms of sustained "done", the coach advances to the next step.
//    • Each transition fires a TTS cue (completion → next instruction).
//    • For isTimedHold steps, a circular SVG countdown ring is rendered.
//    • The user can ask free questions at any time via voice or text input.
// ─────────────────────────────────────────────────────────────────────────────

interface CoachMessage {
  role:    'user' | 'assistant'
  content: string
}

// Grace period — how long (ms) the pose can break without resetting the hold
const HOLD_GRACE_MS = 500

// SVG countdown ring for timed holds
function CountdownRing({
  elapsed, total, label,
}: { elapsed: number; total: number; label: string }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const frac = Math.min(elapsed / total, 1)
  const dashOffset = circ * (1 - frac)
  const secsLeft = Math.max(0, Math.ceil((total - elapsed) / 1000))
  return (
    <div className="flex flex-col items-center py-3">
      <svg width={84} height={84} viewBox="0 0 84 84">
        {/* Track */}
        <circle cx={42} cy={42} r={r} fill="none" stroke="#334155" strokeWidth={6} />
        {/* Progress arc — rotated so it starts at 12 o'clock */}
        <circle
          cx={42} cy={42} r={r}
          fill="none"
          stroke={frac >= 1 ? '#34d399' : '#22d3ee'}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 42 42)"
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
        <text x={42} y={46} textAnchor="middle" fontSize={18} fontWeight="bold" fill="white">
          {frac >= 1 ? '✓' : secsLeft}
        </text>
      </svg>
      <p className="text-[10px] text-slate-400 mt-1">{label}</p>
    </div>
  )
}

function AiCoach({
  def,
  snapshot,
  lmsRef,
  muscleId,
  repCount,
  repTarget,
}: {
  def:      BiofeedbackDef
  snapshot: FormSnapshot | null
  lmsRef:   React.MutableRefObject<LandmarkSet | null>
  /** For ROM-calibrated coaching — pulls the user's measured peak from history. */
  muscleId?: string
  /** Drives the rep-milestone TTS callouts. */
  repCount:  number
  repTarget: number
}) {
  /* ── User-specific safe ceilings (from past assessments) ────────────────
     For each joint label we coach (e.g. "Elbow Flexion"), find the user's
     best measured peak from past ROM assessments on this muscle.  The
     directional-cue engine uses these to cap cues at the user's actual
     limit instead of a healthy-population number. */
  const peakLookup = useMemo<(label: string) => number | undefined>(() => {
    if (!muscleId) return () => undefined
    const history = loadROMHistory().filter((r) => r.muscleId === muscleId)
    if (history.length === 0) return () => undefined
    // Best-peak per movementId — most recent record wins on ties.
    const byMovement = new Map<string, number>()
    for (const r of history) {
      const cur = byMovement.get(r.movementId) ?? 0
      if (r.angle > cur) byMovement.set(r.movementId, r.angle)
    }
    return (label: string) => {
      const norm = label.toLowerCase().replace(/[^a-z]+/g, ' ').trim()
      for (const [mvId, peak] of byMovement) {
        const mvNorm = mvId.toLowerCase().replace(/_/g, ' ')
        if (mvNorm.includes(norm) || norm.includes(mvNorm)) return peak
      }
      return undefined
    }
  }, [muscleId])

  /* ── Directional-cue stream — speaks angle-precise local cues. ────────── */
  const cueStreamRef = useRef<CueStreamState>(createCueStream(1200))
  useEffect(() => {
    cueStreamRef.current = createCueStream(1200)
  }, [def.exerciseId])

  const [apiKey, setApiKey]   = useState<string | null>(getStoredApiKey)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput]     = useState('')
  const [sending, setSending] = useState(false)

  // ── Step machine state ──────────────────────────────────────────────────
  const procedureKey = def.exerciseId ? EXERCISE_TO_PROCEDURE[def.exerciseId] : undefined
  const procedure    = procedureKey ? EXERCISE_PROCEDURES[procedureKey] : null
  const steps        = procedure?.steps ?? []

  const [stepIdx,     setStepIdx]     = useState(0)
  const [holdElapsed, setHoldElapsed] = useState(0)      // ms held so far (for ring)
  const [stepCheck,   setStepCheck]   = useState<StepCheck | null>(null)
  const [allDone,     setAllDone]     = useState(false)

  // Refs so the RAF closure always has fresh values
  const stepIdxRef      = useRef(0)
  const holdStartRef    = useRef<number | null>(null)    // when current "done" run started
  const graceStartRef   = useRef<number | null>(null)    // when pose last broke
  const allDoneRef      = useRef(false)
  const midCueFiredRef  = useRef(false)
  const stepSpokenRef   = useRef(false)                  // prevent double-speak on mount

  // Keep refs in sync with state
  useEffect(() => { stepIdxRef.current = stepIdx }, [stepIdx])
  useEffect(() => { allDoneRef.current = allDone },   [allDone])

  // ── Voice I/O ───────────────────────────────────────────────────────────
  const sendingRef   = useRef(sending)
  const messagesRef  = useRef(messages)
  const snapshotRef  = useRef(snapshot)
  useEffect(() => { sendingRef.current  = sending },   [sending])
  useEffect(() => { messagesRef.current = messages },  [messages])
  useEffect(() => { snapshotRef.current = snapshot },  [snapshot])

  // ── Rolling coach context (trends / streaks / moments) ──────────────────
  // Fed every smoothed snapshot; its promptBlock() rides on each Claude call
  // and its suggestedIntervalMs() drives the proactive cadence, so the coach
  // reacts to what the body has been DOING, at a human pace.
  const trendRef = useRef(new FormTrendTracker())
  useEffect(() => {
    if (!snapshot) return
    trendRef.current.push(snapshot, performance.now(), (label) => {
      const check = def.checks.find((c) => c.label === label)
      return check ? check.ideal : null
    })
  }, [snapshot, def.checks])
  // Fresh exercise = fresh context.
  useEffect(() => { trendRef.current.reset() }, [def.exerciseId])

  const handleSilence = useCallback((text: string) => {
    if (text.trim() && !sendingRef.current) void sendToCoach(text)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const voiceIn  = useVoiceInput({ silenceMs: 1400, onSilence: handleSilence })
  const voiceOut = useVoiceOutput()

  const voiceOutRef = useRef(voiceOut)
  useEffect(() => { voiceOutRef.current = voiceOut })

  // Cleanup: stop mic + cancel TTS on unmount
  useEffect(() => {
    return () => {
      voiceIn.stop()
      voiceOut.cancel()
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Barge-in: user speaking while coach talks → cancel TTS
  useEffect(() => {
    if (voiceIn.listening && voiceOut.speaking) voiceOut.cancel()
  }, [voiceIn.listening, voiceOut.speaking, voiceOut])

  // ── Speak helper: queue after current TTS ends ─────────────────────────
  // Queue-friendly speak. Default: if the coach is already speaking, IGNORE
  // the new cue (don't cancel mid-sentence). This fixes the "AI cuts itself
  // off every 3 seconds" experience the user complained about.  Pass
  // {urgent:true} when a safety cue MUST land immediately.
  const speakQueued = useCallback((text: string, onEnd?: () => void, opts?: { urgent?: boolean }) => {
    if (!text) return
    if (voiceOutRef.current.speaking && !opts?.urgent) {
      // Drop the cue rather than cut off the current sentence.
      return
    }
    if (voiceOutRef.current.speaking && opts?.urgent) {
      voiceOutRef.current.cancel()
      setTimeout(() => voiceOutRef.current.speak(text, onEnd), 20)
      return
    }
    voiceOutRef.current.speak(text, onEnd)
  }, [])

  // ── First-cue on mount + step heartbeat ────────────────────────────────
  // 1. On mount, speak a warm intro PLUS the very first procedure step's
  //    instruction so the user knows exactly how to get into position.
  // 2. While the user has NOT yet started moving (no reps recorded, no
  //    directional cue fired in the last 8 seconds), re-narrate the
  //    current step every 12 seconds so the coach is never silently
  //    sitting there. Once reps start counting we stop the heartbeat -
  //    the directional cue engine + rep milestones take over.
  const lastSpokenAtRef = useRef<number>(0)
  // Wrap speakQueued so we also stamp the last-spoken time (used to
  // throttle the heartbeat below).
  const speakAndStamp = useCallback((text: string, onEnd?: () => void) => {
    lastSpokenAtRef.current = performance.now()
    speakQueued(text, onEnd)
  }, [speakQueued])

  useEffect(() => {
    if (stepSpokenRef.current) return
    stepSpokenRef.current = true
    const firstStepText = steps[0]?.instruction ?? `Start moving when you are set.`
    const t = setTimeout(() => {
      speakAndStamp(`Welcome. Let's do the ${def.title}. ${firstStepText}`)
    }, 700)
    return () => clearTimeout(t)
  }, [def.title, steps, speakAndStamp])

  // Heartbeat - re-narrates current step every 12 s while idle so the
  // coach feels alive instead of going silent for 30+ seconds.
  useEffect(() => {
    if (allDone) return
    if (repCount > 0) return     // user is moving - directional cues take over
    const id = window.setInterval(() => {
      // Only speak if we haven't said anything in the last 8 s.
      if (performance.now() - lastSpokenAtRef.current < 8000) return
      // Skip if user is speaking
      if (voiceIn.listening && voiceIn.interimTranscript) return
      const idx  = stepIdxRef.current
      const step = steps[idx]
      if (!step) return
      const hints = [
        step.instruction,
        `Step ${idx + 1} - ${step.instruction}`,
        `Take it slow. ${step.instruction}`,
        `When you are ready: ${step.instruction}`,
      ]
      const choice = hints[Math.floor((performance.now() / 12000) % hints.length)]
      speakAndStamp(choice)
    }, 4000)   // poll every 4 s; speak when the 8-s quiet window passes
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, repCount, steps, speakAndStamp])

  // ── Rep-milestone voice cues ────────────────────────────────────────────
  // Speak progress to the user every couple of reps so the experience feels
  // like a human coach counting along. Throttled to one announcement per
  // milestone-rep so it doesn't talk over directional cues.
  const lastRepCalloutAt = useRef<number>(-1)
  useEffect(() => {
    if (!def) return
    if (repCount <= 0) return
    if (lastRepCalloutAt.current === repCount) return
    const isMilestone = (repCount % 3 === 0) || (repTarget - repCount <= 2)
    if (!isMilestone) return
    lastRepCalloutAt.current = repCount
    let line: string
    if (repCount >= repTarget)        line = `Done. ${repCount} reps - nice work.`
    else if (repCount === 1)          line = `One down. ${repTarget - 1} to go.`
    else if (repCount === repTarget - 1) line = `Last one - finish strong.`
    else if (repCount === Math.floor(repTarget / 2)) line = `Halfway. ${repTarget - repCount} more.`
    else                              line = `${repCount} of ${repTarget}. Keep that form.`
    speakQueued(line)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repCount])

  // ── Live directional cue engine ────────────────────────────────────────
  // For every smoothed FormSnapshot we generate a short, angle-precise cue
  // ("Bend 15 more degrees", "Ease off — you're past target") and speak it
  // through the same TTS channel. Throttled by the cue-stream cooldown
  // (3 s routine, ~1 s for safety overrides) and de-duped against the last
  // spoken key. Doesn't fire while Claude is mid-reply or the user is
  // talking — barge-in / non-interrupt by design.
  useEffect(() => {
    if (!snapshot || snapshot.details.length === 0) return
    if (allDoneRef.current) return
    // We INTENTIONALLY no longer early-return on voiceOut.speaking. The old
    // guard waited for Claude's full reply (often 3-5 s) before any
    // mechanical cue could fire — this was the dominant cause of "the AI
    // coach is 2 seconds behind". speakQueued cancels in-flight TTS so the
    // new fast cue lands immediately, then resumes.
    if (voiceIn.listening && voiceIn.interimTranscript) return  // user is asking

    // Pair each detail with the FormCheck that produced it (for ideal range).
    let worst: JointSample | null = null
    let worstScore = -1
    for (const d of snapshot.details) {
      const check = def.checks.find((c) => c.label === d.label)
      if (!check) continue
      const score = d.status === 'good' ? 0 : 1
      if (score > worstScore) {
        worstScore = score
        worst = {
          label:        d.label,
          current:      d.deg,
          ideal:        check.ideal,
          status:       d.status,
          measuredPeak: peakLookup(d.label),
        }
      }
    }
    if (!worst) return
    const cue = pickCueFromJoint(worst, cueStreamRef.current)
    if (cue) speakQueued(cue.text)
  }, [snapshot, def.checks, peakLookup, voiceIn.listening, voiceIn.interimTranscript, speakQueued])

  // ── RAF loop — step machine ─────────────────────────────────────────────
  useEffect(() => {
    if (steps.length === 0) return
    let rafId = 0

    const tick = (now: number) => {
      if (allDoneRef.current) return

      const idx  = stepIdxRef.current
      if (idx >= steps.length) return

      const step = steps[idx]
      const lms  = lmsRef.current
      if (!lms) { rafId = requestAnimationFrame(tick); return }

      const check = step.check(lms)
      if (check) setStepCheck(check)

      if (!check || !check.done) {
        // Pose broken — start grace period
        if (graceStartRef.current === null) graceStartRef.current = now
        if (now - graceStartRef.current > HOLD_GRACE_MS) {
          // Grace expired — reset hold accumulation
          holdStartRef.current = null
          graceStartRef.current = null
          setHoldElapsed(0)
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      // Pose is satisfied — clear grace, start/continue hold timer
      graceStartRef.current = null
      if (holdStartRef.current === null) holdStartRef.current = now
      const held = now - holdStartRef.current
      setHoldElapsed(held)

      // Mid-hold encouragement — visual only (the directional-cue stream
      // handles the spoken side now, so we don't double up).
      if (!midCueFiredRef.current && held >= step.holdMs * 0.4 && step.isTimedHold) {
        midCueFiredRef.current = true
      }

      if (held >= step.holdMs) {
        // ── Advance ──
        holdStartRef.current  = null
        graceStartRef.current = null
        midCueFiredRef.current = false
        setHoldElapsed(0)

        const nextIdx = idx + 1
        if (nextIdx >= steps.length) {
          // All steps complete — single closing cue from the coach.
          allDoneRef.current = true
          setAllDone(true)
          speakQueued('All steps complete — excellent work.')
        } else {
          // Quiet step advance — the live cue stream guides the next move.
          setStepIdx(nextIdx)
          stepIdxRef.current = nextIdx
          setStepCheck(null)
        }
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [steps, lmsRef, speakQueued]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build live form context for API calls ───────────────────────────────
  function buildFormContext(): string {
    const snap = snapshotRef.current
    if (!snap || snap.details.length === 0) return 'Camera is still detecting your pose…'
    const lines = snap.details.map((d) => {
      const check = def.checks.find((c) => c.label === d.label)
      const target = check ? ` (target ${check.ideal[0]}–${check.ideal[1]}°)` : ''
      const peak = peakLookup(d.label)
      const peakStr = peak !== undefined ? `, user's measured peak ${Math.round(peak)}°` : ''
      return `  • ${d.label}: ${Math.round(d.deg)}° → ${d.status.toUpperCase()}${target}${peakStr}`
    })
    return `Overall: ${snap.good ? 'GOOD FORM ✓' : 'NEEDS CORRECTION'}\n${lines.join('\n')}`
  }

  // ── Build assessment context — summarises the user's measured ROM ───────
  function buildAssessmentContext(): string {
    if (!muscleId) return 'No prior assessment data available.'
    const history = loadROMHistory().filter((r) => r.muscleId === muscleId)
    if (history.length === 0) return 'No prior assessment data for this muscle yet.'
    // Best peak per movement, newest tie-break.
    const byMove = new Map<string, { peak: number; ref: number }>()
    for (const r of history) {
      const cur = byMove.get(r.movementId)
      if (!cur || r.angle > cur.peak) byMove.set(r.movementId, { peak: r.angle, ref: r.reference })
    }
    const lines: string[] = []
    for (const [mv, v] of byMove) {
      const pct = v.ref > 0 ? Math.round((v.peak / v.ref) * 100) : 0
      lines.push(`  • ${mv.replace(/_/g, ' ')}: measured peak ${Math.round(v.peak)}° (healthy ${Math.round(v.ref)}°, ${pct}%)`)
    }
    return `User's measured ROM (from past assessments):\n${lines.join('\n')}`
  }

  function buildStepContext(): string {
    if (steps.length === 0) return ''
    const idx   = stepIdxRef.current
    const step  = steps[idx]
    if (!step) return ''
    return `Current step ${idx + 1} of ${steps.length}: "${step.instruction}"`
  }

  // ── Core API call ───────────────────────────────────────────────────────
  async function sendToCoach(userText: string, isProactive = false) {
    if (!apiKey || sendingRef.current) return
    setSending(true)
    voiceIn.stop()

    const systemPrompt = `You are a warm, expert HUMAN movement coach (think trusted personal trainer) guiding a user through the "${def.title}" exercise. You have real-time pose tracking AND the user's prior ROM assessment.

COACHING STYLE - be human, not robotic:
1. The FIRST time you speak, EXPLAIN HOW TO START THE EXERCISE in plain language - what stance to take, where to put feet/hands, what to feel for. Assume the user has not watched the reference video.
2. Narrate rep progress like a friend at the gym - say things like "3 down, 7 to go", "halfway there", "last 3, finish strong". Not every rep, but every 2-3 reps and at meaningful milestones.
3. Call out HOLDS - if it is a stretch, tell the user "hold here for 3 seconds, then ease off" and count down the hold.
4. When form is GOOD, give specific positive feedback. When form is OFF, give one specific micro-fix.
5. Keep replies to ONE or TWO short sentences max. The user is moving and cannot process paragraphs.

${buildStepContext()}

LIVE JOINT ANGLES (this very moment):
${buildFormContext()}

WHAT THE BODY HAS BEEN DOING (rolling 20s window — coach the TREND, not the frame):
${trendRef.current.promptBlock()}

${buildAssessmentContext()}

How to coach:
• You speak ALONGSIDE a fast local cue engine that already calls out micro-corrections like "bend 10 more degrees" every few seconds. Do NOT duplicate those mechanical cues — your role is the higher-level voice.
• Use the user's measured peak as the safe ceiling. If their peak is below the healthy target, coach them to THEIR peak, never push past it (+5° at most).
• Be encouraging, specific, and motion-aware. Reference what their body is actually doing right now ("you've been holding well", "I see you're easing back, good").
• PREFER the trend over the snapshot: "you've gained 8 degrees in the last stretch — keep that direction" lands far better than restating the current angle. React to MOMENTS (a new session best, form just clicking in) the turn they appear; specific praise earned by the data, never generic.
• Keep every reply to 1–2 short sentences. It's read aloud while they're moving.
• You may answer questions about the exercise, the muscles working, or sensations they describe.
• Never list multiple things at once and never repeat a generic "good job" — earn the praise with a specific observation.`

    const userMsg    = isProactive ? 'Give me a brief motivating cue.' : userText
    const baseHistory: CoachMessage[] = isProactive
      ? messagesRef.current
      : [...messagesRef.current, { role: 'user', content: userText }]

    if (!isProactive) { setMessages(baseHistory); setInput('') }

    try {
      // Routes through the server proxy when configured (no key in the browser),
      // else calls Anthropic directly with the user's own key.
      const res = await anthropicMessages({
        model:      COACH_MODEL,
        // Headroom over the 1–2 sentences the system prompt asks for;
        // completeSentences trims any budget-cut reply to a clean boundary
        // so the spoken cue never ends mid-sentence.
        max_tokens: 160,
        system:     systemPrompt,
        messages:   [...baseHistory, { role: 'user', content: userMsg }],
      }, apiKey)
      const data  = await res.json()
      const reply: string = completeSentences(data.content?.[0]?.text ?? '')
      if (reply) {
        const assistantMsg: CoachMessage = { role: 'assistant', content: reply }
        setMessages((m) => [...(isProactive ? m : baseHistory), assistantMsg])
        // Route Claude's voice through speakQueued so it CANCELS any
        // in-progress local cue first. Prevents the two-voice overlap.
        speakQueued(reply, () => { if (voiceIn.supported) voiceIn.start() })
      }
    } catch (e) {
      console.error('[AiCoach]', e)
    } finally {
      setSending(false)
    }
  }

  // ── Proactive higher-level coaching ────────────────────────────────────
  // The local directional-cue engine handles fast mechanical corrections
  // ("bend 10 more degrees"). Claude's job here is the deeper coaching beats
  // — explaining what muscle is engaging, reinforcing good streaks, motivating
  // through fatigue. The cadence is ADAPTIVE (FormTrendTracker): a fresh
  // moment or degrading form pulls the next message forward to ~18 s; a long
  // good-form groove pushes it out toward 60 s — the coach speaks when a
  // human coach would, not on a metronome.
  const lastProactiveRef = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      if (!apiKey || sendingRef.current || voiceOutRef.current.speaking) return
      const snap = snapshotRef.current
      const stepDone = allDoneRef.current
      if (!snap || stepDone) return
      const now = Date.now()
      if (now - lastProactiveRef.current < trendRef.current.suggestedIntervalMs()) return
      lastProactiveRef.current = now
      void sendToCoach('', true)
    }, 5_000)
    return () => clearInterval(id)
  }, [apiKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────

  // API key gate
  if (!apiKey) {
    // No visitor key is ever requested — in production the server proxy provides
    // the AI to everyone. If it's not reachable, show the exercise intro and a
    // gentle notice instead of blocking.
    return (
      <div className="p-3 border-b border-slate-700">
        <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold mb-1.5">
          AI Coach
        </div>
        <p className="text-[10px] text-slate-400 mb-2 leading-snug">
          The live AI coach is being set up and will be available here shortly.
        </p>
        <p className="mt-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Getting started</p>
        <p className="mt-1 text-xs text-slate-300 leading-relaxed">{def.introCue}</p>
      </div>
    )
  }

  const currentStep = steps[stepIdx]
  const isHoldStep  = currentStep?.isTimedHold && !allDone

  // Phase indicator
  const phase =
    sending             ? 'thinking'
    : voiceOut.speaking ? 'speaking'
    : voiceIn.listening ? 'listening'
    : 'idle'

  const phaseColor =
    phase === 'listening' ? 'text-orange-400 animate-pulse'
    : phase === 'thinking' ? 'text-yellow-400 animate-pulse'
    : phase === 'speaking' ? 'text-cyan-400 animate-pulse'
    : 'text-slate-600'

  const PhaseIcon = phase === 'thinking' ? Brain : voiceIn.listening ? Mic : voiceOut.speaking ? Mic : MicOff

  const lastMsg = messages[messages.length - 1]

  return (
    <div className="border-b border-slate-700 flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-1.5">
          <PhaseIcon size={13} className={phaseColor} />
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">AI Coach</span>
        </div>
        <button
          title={voiceIn.listening ? 'Mute mic' : 'Start mic'}
          onClick={() => voiceIn.listening ? voiceIn.stop() : voiceIn.start()}
          className={`rounded-full p-1 transition-colors ${
            voiceIn.listening
              ? 'bg-orange-500/25 text-orange-300 ring-1 ring-orange-500/50'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {voiceIn.listening ? <Mic size={12} /> : <MicOff size={12} />}
        </button>
      </div>

      {/* ── Step dots ── */}
      {steps.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 pb-1.5">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={`transition-all rounded-full ${
                i < stepIdx || allDone
                  ? 'w-2 h-2 bg-emerald-500'           // completed
                  : i === stepIdx && !allDone
                    ? 'w-2.5 h-2.5 bg-cyan-400 ring-2 ring-cyan-400/40' // active
                    : 'w-2 h-2 bg-slate-600'            // upcoming
              }`}
              title={s.instruction}
            />
          ))}
          <span className="text-[9px] text-slate-500 ml-1">
            {allDone ? 'Done!' : `Step ${stepIdx + 1} / ${steps.length}`}
          </span>
        </div>
      )}

      {/* ── All done banner ── */}
      {allDone && (
        <div className="mx-3 mb-2 rounded bg-emerald-700/40 border border-emerald-600/50 px-3 py-2 text-center">
          <CheckCircle size={14} className="mx-auto text-emerald-400 mb-0.5" />
          <p className="text-[11px] text-emerald-300 font-semibold">Exercise complete!</p>
          <p className="text-[10px] text-slate-400">You can repeat or ask your coach anything.</p>
        </div>
      )}

      {/* ── Timed hold ring ── */}
      {isHoldStep && (
        <CountdownRing
          elapsed={holdElapsed}
          total={currentStep!.holdMs}
          label={currentStep!.holdLabel ?? 'Hold…'}
        />
      )}

      {/* ── Current step instruction + progress bar (non-hold steps) ── */}
      {currentStep && !allDone && (
        <div className="px-3 pb-2">
          <p className="text-xs text-slate-100 leading-snug mb-1.5">
            {currentStep.instruction}
          </p>

          {/* Progress bar for positioning steps */}
          {!isHoldStep && stepCheck && (
            <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${Math.round(stepCheck.progress * 100)}%`,
                  backgroundColor: stepCheck.done ? '#34d399' : '#22d3ee',
                }}
              />
            </div>
          )}

          {/* Hint text when not in position */}
          {stepCheck && !stepCheck.done && stepCheck.hint && (
            <p className="mt-1 text-[10px] text-orange-300 leading-snug">{stepCheck.hint}</p>
          )}
          {stepCheck && stepCheck.done && !isHoldStep && (
            <p className="mt-1 text-[10px] text-emerald-400">
              ✓ Hold position…
            </p>
          )}
        </div>
      )}

      {/* ── AI conversation (last message) ── */}
      <div
        className="px-3 pb-2 cursor-pointer"
        onClick={() => voiceOut.speaking && voiceOut.cancel()}
        title={voiceOut.speaking ? 'Tap to interrupt' : undefined}
      >
        {phase === 'thinking' && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <Brain size={10} className="animate-pulse text-yellow-400" />
            Thinking…
          </div>
        )}
        {phase === 'listening' && voiceIn.interimTranscript && (
          <p className="text-[10px] text-orange-300 italic">"{voiceIn.interimTranscript}"</p>
        )}
        {phase !== 'thinking' && lastMsg && (
          <p className={`text-[11px] leading-snug ${
            lastMsg.role === 'assistant' ? 'text-slate-300' : 'text-slate-500 italic'
          }`}>
            {lastMsg.content}
            {lastMsg.role === 'assistant' && voiceOut.speaking && (
              <span className="ml-1 text-[9px] text-cyan-400 not-italic">tap to skip ▶</span>
            )}
          </p>
        )}
      </div>

      {/* ── Text input ── */}
      <div className="px-3 pb-3 flex items-center gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim() && !sending) void sendToCoach(input)
          }}
          placeholder={voiceIn.listening ? 'Or type here…' : 'Ask your coach…'}
          className="flex-1 text-[11px] bg-slate-800 text-slate-100 rounded px-2 py-1.5 border border-slate-700 focus:border-cyan-500 focus:outline-none placeholder:text-slate-600"
        />
        <button
          disabled={!input.trim() || sending}
          onClick={() => input.trim() && !sending && void sendToCoach(input)}
          className="p-1.5 rounded bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Performance Tracker — three-card horizontal strip filling the previously-
//  empty bottom-left area.  All metrics are derived from the FormSnapshot
//  data the biofeedback engine already produces, so it works for every
//  exercise without per-exercise wiring.
// ─────────────────────────────────────────────────────────────────────────────

interface PerformanceTrackerProps {
  formScore:     number     // 0-100, % of last 3 s where form was good
  jointAccuracy: Array<{ label: string; pct: number; current: number; status: 'good' | 'low' | 'high' }>
  repScores:     number[]   // last 10 reps, each 0-100
  bestHoldSec:   number     // longest continuous good-form streak this session
  repCount:      number
  repTarget:     number
  hasDef:        boolean    // false → exercise has no biofeedback rules; show placeholder
}

function PerformanceTracker({
  formScore, jointAccuracy, repScores, bestHoldSec, repCount, repTarget, hasDef,
}: PerformanceTrackerProps) {
  if (!hasDef) {
    // No angle rules for this exercise — show a placeholder so the area
    // isn't blank.
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-900/40 p-6 text-center min-h-0 md:min-h-0 w-full md:flex-1 col-span-1 overflow-hidden">
        <div className="text-xs text-slate-500 leading-relaxed max-w-sm">
          Live performance metrics aren't available for this exercise yet.
          Match your motion to the reference clip on the right; the AI coach
          will give you cues as you go.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-3 overflow-y-auto bg-slate-950/70 p-3">
      {/* ── CARD 1: Form Score (headline metric) ───────────────────── */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 flex flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">Form Score</div>
        <FormScoreGauge score={formScore} />
        <div className="text-[10px] text-slate-400 mt-1.5 text-center leading-tight">
          {formScore >= 80 ? 'Excellent — keep this groove.'
           : formScore >= 60 ? 'Solid — small corrections to make.'
           : formScore >= 30 ? 'Adjust your alignment.'
           :                   'Match the reference clip.'}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-300">
          <span className="rounded bg-slate-800 px-2 py-0.5">
            <span className="text-orange-300 font-bold tabular-nums">{repCount}</span>
            <span className="text-slate-500"> / {repTarget} reps</span>
          </span>
          <span className="rounded bg-slate-800 px-2 py-0.5">
            best hold <span className="text-emerald-300 font-bold tabular-nums">{bestHoldSec.toFixed(1)} s</span>
          </span>
        </div>
      </div>

      {/* ── CARD 2: Per-joint accuracy bars ────────────────────────── */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
        <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold mb-3">Joint Accuracy (last 3 s)</div>
        {jointAccuracy.length === 0 ? (
          <div className="text-[11px] text-slate-500 italic">Move into position to start measuring…</div>
        ) : (
          <div className="space-y-2.5">
            {jointAccuracy.map((j) => (
              <div key={j.label}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] text-slate-200 truncate flex-1">{j.label}</span>
                  <span className={[
                    'text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded',
                    j.status === 'good' ? 'bg-emerald-900/60 text-emerald-200' : 'bg-orange-900/60 text-orange-200',
                  ].join(' ')}>
                    {Math.round(j.current)}°
                  </span>
                  <span className={[
                    'text-[10px] font-bold tabular-nums w-9 text-right',
                    j.pct >= 75 ? 'text-emerald-300' : j.pct >= 40 ? 'text-amber-300' : 'text-red-300',
                  ].join(' ')}>
                    {j.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${j.pct}%`,
                      backgroundColor: j.pct >= 75 ? '#34d399' : j.pct >= 40 ? '#fbbf24' : '#f87171',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CARD 3: Per-rep history ────────────────────────────────── */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 flex flex-col">
        <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold mb-3">Rep History</div>
        {repScores.length === 0 ? (
          <div className="text-[11px] text-slate-500 italic flex-1">
            Complete a rep to start tracking your scores.
          </div>
        ) : (
          <>
            <div className="flex items-end gap-1 h-20 mb-2">
              {Array.from({ length: 10 }).map((_, i) => {
                const score = repScores[i]
                const height = score != null ? Math.max(6, score) : 6
                const colour =
                  score == null      ? '#1e293b'
                  : score >= 75      ? '#34d399'
                  : score >= 50      ? '#fbbf24'
                  :                    '#f87171'
                return (
                  <div key={i} className="flex flex-col items-center justify-end flex-1 h-full">
                    <span className="text-[8px] text-slate-500 mb-0.5 tabular-nums">
                      {score != null ? score : ''}
                    </span>
                    <div
                      className="w-full rounded-sm transition-all duration-200"
                      style={{ height: `${height}%`, backgroundColor: colour }}
                      title={score != null ? `Rep ${i + 1}: ${score}%` : `Rep ${i + 1} pending`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Average:{' '}
              <span className="text-cyan-300 font-bold tabular-nums">
                {Math.round(repScores.reduce((a, b) => a + b, 0) / repScores.length)}%
              </span>
              {' · '}Best:{' '}
              <span className="text-emerald-300 font-bold tabular-nums">
                {Math.max(...repScores)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Circular gauge for the headline Form Score (0..100). */
function FormScoreGauge({ score }: { score: number }) {
  const SIZE = 110, STROKE = 10
  const r = (SIZE - STROKE) / 2
  const C = 2 * Math.PI * r
  const ratio = Math.max(0, Math.min(1, score / 100))
  const offset = C - C * ratio
  const colour = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : score >= 30 ? '#fb923c' : '#f87171'
  return (
    <div className="relative flex h-[110px] w-[110px] items-center justify-center mt-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke="#1e293b" strokeWidth={STROKE} fill="none" />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={r}
          stroke={colour} strokeWidth={STROKE} fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 200ms linear, stroke 300ms linear' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums" style={{ color: colour }}>{score}</span>
        <span className="text-[9px] uppercase text-slate-500 tracking-wider">% in band</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reference video player
// ─────────────────────────────────────────────────────────────────────────────

function ReferenceVideo({
  src, label,
  autoPlay = false,
  loops = 0,
}: { src: string; label: string; autoPlay?: boolean; loops?: number }) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const loopRef    = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [loopCount, setLoopCount] = useState(0)

  // Auto-play on mount if requested
  useEffect(() => {
    if (autoPlay && videoRef.current) {
      videoRef.current.play().then(() => setPlaying(true)).catch(() => {})
    }
  }, [autoPlay])

  function handleEnded() {
    loopRef.current += 1
    setLoopCount(loopRef.current)
    if (loops === 0 || loopRef.current < loops) {
      // Loop again
      const v = videoRef.current
      if (v) { v.currentTime = 0; v.play().catch(() => {}) }
    } else {
      setPlaying(false)
    }
  }

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { loopRef.current = 0; setLoopCount(0); v.play().then(() => setPlaying(true)).catch(() => {}) }
    else          { v.pause(); setPlaying(false) }
  }

  const maxLoops = loops > 0 ? loops : null
  const loopsLeft = maxLoops ? Math.max(0, maxLoops - loopCount) : null

  return (
    <div
      onClick={toggle}
      className="relative cursor-pointer h-full overflow-hidden bg-black"
    >
      <video style={{ objectFit: "contain" }}
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        muted                              /* always muted — AI coach handles audio */
        /* object-contain keeps the WHOLE reference clip visible regardless of
           container aspect (was object-cover, which cropped the demo badly on
           portrait monitors and mobile). Letterboxing on the side is fine —
           seeing all of the demo matters more than filling the box. */
        className="w-full h-full object-contain block bg-black"
        onEnded={handleEnded}
        onLoadedData={() => {
          if (videoRef.current && videoRef.current.currentTime === 0)
            videoRef.current.currentTime = 0.05
        }}
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
            <Play size={15} className="text-white ml-0.5" fill="white" />
          </div>
        </div>
      )}
      {/* Loop counter badge */}
      {playing && maxLoops && (
        <div className="absolute top-1.5 right-1.5 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
          {loopsLeft}× left
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-[10px] font-medium text-white/80 leading-tight truncate">{label}</p>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
//  ActivationOverlay — body silhouette tinted by per-muscle firing intensity
// ─────────────────────────────────────────────────────────────────────────────

function ActivationOverlay({
  snapshot, hasDef, targetMuscleId, activationsRef, boneDirsRef, postureRef, engaged, muscleStatus,
}: {
  snapshot:        FormSnapshot | null
  hasDef:          boolean
  targetMuscleId?: string
  activationsRef:  React.MutableRefObject<LiveMuscleActivation[]>
  boneDirsRef:     React.MutableRefObject<BoneDirs>
  postureRef:      React.MutableRefObject<Posture | null>
  engaged:         { muscleId: string; level: number }[]
  muscleStatus:    MuscleStatusFrame | null
}) {
  // Render whenever we know at least the target muscle id - even without a
  // biofeedback def we can still pre-glow the targeted muscle so the user
  // sees WHAT they are working before MediaPipe locks in.
  if (!hasDef && !targetMuscleId) return null
  return (
    <div className="w-full md:w-80 flex-shrink-0 flex flex-col border-r border-slate-700 bg-slate-950/60 p-2 md:p-3 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">
          Muscle activation
        </div>
        {targetMuscleId && (
          <div className="text-[9px] uppercase tracking-wider text-orange-400 font-semibold">
            Target: {targetMuscleId.replace(/_/g, ' ')}
          </div>
        )}
      </div>
      {/* 3D anatomical viewer - faded body + pulsing target muscle. Tall and
          contrasty so the pulse reads from across the room. */}
      <div className="flex-1 min-h-0 md:min-h-[360px] rounded-md bg-gradient-to-b from-slate-900 to-black ring-1 ring-orange-500/30 overflow-hidden relative">
        <MuscleTwinModel activationsRef={activationsRef} boneDirsRef={boneDirsRef} postureRef={postureRef} />
        {/* Soft halo pulse around the frame - independent of the WebGL
            canvas so the user notices the activity even before the muscle
            mesh renders. */}
        <div className="pointer-events-none absolute inset-0 ring-2 ring-orange-500/0 animate-pulse"
             style={{ boxShadow: 'inset 0 0 30px rgba(249, 115, 22, 0.18)' }} />
      </div>
      {/* Quantitative readout of the muscles actually engaged for THIS
          exercise (live, from the pose-driven engine). */}
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">Engaged now</span>
          {targetMuscleId && (
            <span className="text-[9px] text-orange-400 font-semibold">target: {targetMuscleId.replace(/_/g, ' ')}</span>
          )}
        </div>
        {engaged.length === 0 ? (
          <div className="text-[10px] text-slate-400 italic">
            {targetMuscleId
              ? `Move into the ${targetMuscleId.replace(/_/g, ' ')} position to engage it.`
              : 'Move into position to engage muscles…'}
          </div>
        ) : (
          <div className="space-y-1">
            {engaged.map((a) => {
              const pct = Math.round(a.level * 100)
              const color = a.level < 0.4 ? '#22d3ee' : a.level < 0.7 ? '#f59e0b' : '#ef4444'
              return (
                <div key={a.muscleId} className="flex items-center gap-2">
                  <span className="w-24 truncate text-[10px] text-slate-300">{a.muscleId.replace(/_/g, ' ')}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="w-9 text-right text-[10px] font-mono tabular-nums text-slate-200">{pct}%</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Live fatigue — same model + colours as the Live Muscle Twin, so the
          fatigue read is consistent across the app. Only worked regions show. */}
      <FatigueStrip status={muscleStatus} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  FatigueStrip — compact per-region fatigue battery for the exercise panel.
//  Mirrors the standalone Twin's MuscleStatusPanel (same STATE_META colours and
//  fatigue-as-a-bar metaphor) so the user sees one consistent fatigue model.
// ─────────────────────────────────────────────────────────────────────────────

function FatigueStrip({ status }: { status: MuscleStatusFrame | null }) {
  const rows = (status?.regions ?? [])
    .filter((r) => r.fatigue > 0.04 || r.work > 0.05 || r.activation > 0.08)
    .sort((a, b) => b.fatigue - a.fatigue || b.work - a.work)
    .slice(0, 5)

  return (
    <div className="mt-3 border-t border-slate-800 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold">Fatigue</span>
        {status && status.maxFatigue > 0.04 && (
          <span className="text-[9px] text-slate-500">peak {Math.round(status.maxFatigue * 100)}%</span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-[10px] text-slate-500 italic">Builds as you work — fresh → working → fatigued.</div>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => {
            const m = STATE_META[r.state]
            return (
              <div key={r.region} className="flex items-center gap-2">
                <span className="w-14 shrink-0 truncate text-[10px] text-slate-300">{r.label}</span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(r.fatigue * 100)}%`, background: m.color }} />
                </div>
                <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-slate-500">{Math.round(r.fatigue * 100)}%</span>
                <span className="rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase" style={{ color: m.color, background: `${m.color}1f` }}>{m.label}</span>
                {r.caution && <span className="text-[8px] font-bold text-amber-400" title="Flagged region — easy does it">⚠</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
