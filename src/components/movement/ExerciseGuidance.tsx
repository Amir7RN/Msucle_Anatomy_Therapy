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

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Camera, Play, CheckCircle, AlertCircle, Info,
  Mic, MicOff, Brain, Send, KeyRound,
} from 'lucide-react'
import { CameraView } from './CameraView'
import type { LandmarkSet } from '../../lib/movement/landmarks'
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
import { getStoredApiKey, setStoredApiKey } from '../../lib/triage/llm'

// ── Smoothing buffer ──────────────────────────────────────────────────────────
const SMOOTH_FRAMES = 8

// ── Anthropic API ─────────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const COACH_MODEL   = 'claude-haiku-4-5-20251001'

interface Props {
  exerciseId:    string | null
  exerciseLabel: string
  videoSrc:      string
  onClose:       () => void
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ExerciseGuidance({ exerciseId, exerciseLabel, videoSrc, onClose }: Props) {
  const biofeedbackKey = exerciseId ? EXERCISE_TO_BIOFEEDBACK[exerciseId] : null
  const def: BiofeedbackDef | null = biofeedbackKey ? BIOFEEDBACK_DEFS[biofeedbackKey] ?? null : null

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [snapshot, setSnapshot]       = useState<FormSnapshot | null>(null)

  // Live landmark ref — updated every camera frame, read by AiCoach's RAF loop
  const lmsRef = useRef<LandmarkSet | null>(null)

  // Frame smoothing
  const frameBuffer = useRef<FormSnapshot[]>([])

  const handleLandmarks = useCallback((lms: LandmarkSet) => {
    // Always update lmsRef so AiCoach step-machine can read it
    lmsRef.current = lms
    if (!def) return
    const snap = evaluateExercise(lms, def)
    frameBuffer.current.push(snap)
    if (frameBuffer.current.length > SMOOTH_FRAMES) frameBuffer.current.shift()
    if (frameBuffer.current.length < SMOOTH_FRAMES) return
    const goodCount = frameBuffer.current.filter((s) => s.good).length
    const smoothed: FormSnapshot = goodCount >= SMOOTH_FRAMES / 2
      ? { cueText: 'Good alignment — hold it.', good: true, details: snap.details }
      : snap
    setSnapshot(smoothed)
  }, [def])

  useEffect(() => { frameBuffer.current = []; setSnapshot(null); lmsRef.current = null }, [exerciseId])

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

      {/* Body: top row (camera + reference video) | bottom scrollable (AI coach) */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* ── TOP ROW: camera (left) + reference video auto-playing (right) ── */}
        <div className="flex flex-row flex-shrink-0 h-[42vh] md:h-[45vh] border-b border-slate-700">

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

            {/* "Your pose" label */}
            <div className="absolute top-1.5 left-1.5 text-[9px] font-semibold text-slate-400 bg-black/60 px-1.5 py-0.5 rounded">
              YOUR POSE
            </div>
          </div>

          {/* Reference video — right half, auto-plays on mount, loops 10× */}
          <div className="flex-1 min-w-0 relative">
            <ReferenceVideo src={videoSrc} label={exerciseLabel} autoPlay loops={10} />
            <div className="absolute top-1.5 left-1.5 text-[9px] font-semibold text-slate-400 bg-black/60 px-1.5 py-0.5 rounded">
              REFERENCE
            </div>
          </div>
        </div>

        {/* ── BOTTOM: AI coach + live angles, scrollable ── */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

        {/* AI coach + angles — scrollable */}
        <div className="w-full md:w-80 flex flex-col bg-slate-900 md:border-l border-slate-700 flex-shrink-0 overflow-y-auto flex-1 md:flex-none">

          {/* AI Coach — replaces static "Setup" text */}
          {def
            ? <AiCoach def={def} snapshot={snapshot} lmsRef={lmsRef} />
            : (
              <div className="p-3 border-b border-slate-700 flex items-start gap-2">
                <Info size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  No angle detection for this exercise yet — use the camera to compare your form with the reference video.
                </p>
              </div>
            )
          }

          {/* Live angle readouts */}
          {def && snapshot && snapshot.details.length > 0 && (
            <div className="p-3 border-b border-slate-700">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Live Angles</div>
              <div className="space-y-2">
                {snapshot.details.map((d) => (
                  <div key={d.label} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 truncate flex-1">{d.label}</span>
                    <span className={[
                      'text-xs tabular-nums font-mono px-1.5 py-0.5 rounded',
                      d.status === 'good' ? 'bg-emerald-800 text-emerald-200' : 'bg-orange-800 text-orange-200',
                    ].join(' ')}>
                      {Math.round(d.deg)}°
                    </span>
                    <span className="text-[10px] text-slate-500 w-8 text-right">
                      {d.status === 'good' ? '✓' : d.status === 'low' ? '↑' : '↓'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        </div>{/* end bottom row */}
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
}: {
  def:     BiofeedbackDef
  snapshot: FormSnapshot | null
  lmsRef:  React.MutableRefObject<LandmarkSet | null>
}) {
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
  const speakQueued = useCallback((text: string, onEnd?: () => void) => {
    if (!text) return
    // If speaking, cancel first so the new cue lands immediately
    if (voiceOutRef.current.speaking) voiceOutRef.current.cancel()
    setTimeout(() => voiceOutRef.current.speak(text, onEnd), 80)
  }, [])

  // ── Announce step instruction on step advance ──────────────────────────
  // Speak first step instruction on mount (once)
  useEffect(() => {
    if (steps.length === 0 || stepSpokenRef.current) return
    stepSpokenRef.current = true
    // Small delay to let the overlay render first
    const t = setTimeout(() => speakQueued(steps[0].instruction), 800)
    return () => clearTimeout(t)
  }, [steps, speakQueued])

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

      // Mid-hold encouragement at ~40%
      if (!midCueFiredRef.current && held >= step.holdMs * 0.4 && step.isTimedHold) {
        midCueFiredRef.current = true
        const secsLeft = Math.ceil((step.holdMs - held) / 1000)
        speakQueued(`Great — keep holding! About ${secsLeft} seconds left.`)
      }

      if (held >= step.holdMs) {
        // ── Advance ──
        holdStartRef.current  = null
        graceStartRef.current = null
        midCueFiredRef.current = false
        setHoldElapsed(0)

        const nextIdx = idx + 1
        if (nextIdx >= steps.length) {
          // All done
          allDoneRef.current = true
          setAllDone(true)
          speakQueued(step.completionText + ' All steps complete — excellent work!')
        } else {
          // Speak completion + next instruction
          speakQueued(step.completionText, () => {
            setTimeout(() => speakQueued(steps[nextIdx].instruction), 200)
          })
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
    const lines = snap.details.map(
      (d) => `  • ${d.label}: ${Math.round(d.deg)}° → ${d.status.toUpperCase()}`,
    )
    return `Overall: ${snap.good ? 'GOOD FORM ✓' : 'NEEDS CORRECTION'}\n${lines.join('\n')}`
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

    const systemPrompt = `You are a warm, expert physical therapist coaching a patient through the "${def.title}" exercise. You have real-time pose-tracking data and step-by-step procedure tracking.

${buildStepContext()}

Current joint angles (live):
${buildFormContext()}

Rules:
• Keep every reply to 1–2 short sentences — it is read aloud during the exercise hold.
• Be encouraging and specific.
• You may answer questions about the exercise, muscles, or sensations.
• Do NOT repeat the step instruction verbatim — they already heard it.
• Do NOT list multiple things at once.`

    const userMsg    = isProactive ? 'Give me a brief motivating cue.' : userText
    const baseHistory: CoachMessage[] = isProactive
      ? messagesRef.current
      : [...messagesRef.current, { role: 'user', content: userText }]

    if (!isProactive) { setMessages(baseHistory); setInput('') }

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method:  'POST',
        headers: {
          'content-type':                              'application/json',
          'x-api-key':                                 apiKey,
          'anthropic-version':                         '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model:      COACH_MODEL,
          max_tokens: 100,
          system:     systemPrompt,
          messages:   [...baseHistory, { role: 'user', content: userMsg }],
        }),
      })
      const data  = await res.json()
      const reply: string = data.content?.[0]?.text ?? ''
      if (reply) {
        const assistantMsg: CoachMessage = { role: 'assistant', content: reply }
        setMessages((m) => [...(isProactive ? m : baseHistory), assistantMsg])
        voiceOut.speak(reply, () => { if (voiceIn.supported) voiceIn.start() })
      }
    } catch (e) {
      console.error('[AiCoach]', e)
    } finally {
      setSending(false)
    }
  }

  // ── Proactive coaching every 15 s during hold step when form needs work ─
  const lastProactiveRef = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      if (!apiKey || sendingRef.current || voiceOutRef.current.speaking) return
      const snap = snapshotRef.current
      const stepDone = allDoneRef.current
      if (!snap || snap.good || stepDone) return
      const now = Date.now()
      if (now - lastProactiveRef.current < 15_000) return
      lastProactiveRef.current = now
      void sendToCoach('', true)
    }, 4_000)
    return () => clearInterval(id)
  }, [apiKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────

  // API key gate
  if (!apiKey) {
    return (
      <div className="p-3 border-b border-slate-700">
        <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold mb-1.5">
          AI Coach
        </div>
        <p className="text-[10px] text-slate-400 mb-2 leading-snug">
          Add your Anthropic API key to enable the live AI physical therapist.
        </p>
        <div className="flex items-center gap-1.5">
          <KeyRound size={11} className="text-slate-500 flex-shrink-0" />
          <input
            type="password"
            placeholder="sk-ant-…"
            className="flex-1 text-[11px] bg-slate-800 text-slate-100 rounded px-2 py-1.5 border border-slate-600 focus:border-cyan-500 focus:outline-none"
            onKeyDown={(e) => {
              const val = (e.target as HTMLInputElement).value.trim()
              if (e.key === 'Enter' && val) { setStoredApiKey(val); setApiKey(val) }
            }}
          />
        </div>
        <p className="mt-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Setup</p>
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
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        className="w-full h-full object-cover block bg-black"
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
