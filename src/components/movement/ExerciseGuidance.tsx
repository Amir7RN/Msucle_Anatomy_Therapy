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
  type FormSnapshot,
  type BiofeedbackDef,
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

  // Frame smoothing
  const frameBuffer = useRef<FormSnapshot[]>([])

  const handleLandmarks = useCallback((lms: LandmarkSet) => {
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

  useEffect(() => { frameBuffer.current = []; setSnapshot(null) }, [exerciseId])

  if (!exerciseId) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">{exerciseLabel}</span>
          {def && (
            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              Live Form Check
            </span>
          )}
        </div>
        <button
          onClick={() => {
            // Cancel TTS synchronously BEFORE React unmounts AiCoach —
            // relying on the cleanup effect alone is too slow (one render late).
            window.speechSynthesis?.cancel()
            onClose()
          }}
          className="rounded-full p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left — camera */}
        <div className="flex-1 relative bg-black min-w-0">
          <CameraView
            active
            onLandmarks={handleLandmarks}
            onReady={() => setCameraReady(true)}
            onError={(msg) => setCameraError(msg)}
          />

          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-slate-300 text-sm">
              <div className="text-center space-y-2">
                <Camera size={32} className="mx-auto text-cyan-400 animate-pulse" />
                <p>Starting camera…</p>
              </div>
            </div>
          )}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
              <div className="text-center space-y-3 max-w-xs">
                <AlertCircle size={32} className="mx-auto text-red-400" />
                <p className="text-sm text-red-300">{cameraError}</p>
                <p className="text-xs text-slate-400">Allow camera access and reload.</p>
              </div>
            </div>
          )}

          {/* Live form banner */}
          {cameraReady && snapshot && (
            <div className={[
              'absolute bottom-0 left-0 right-0 px-4 py-3 text-center text-sm font-semibold',
              snapshot.good ? 'bg-emerald-700/80 text-white' : 'bg-orange-600/85 text-white',
            ].join(' ')}>
              {snapshot.good
                ? <span className="flex items-center justify-center gap-2"><CheckCircle size={14} /> Good alignment — hold it.</span>
                : snapshot.cueText}
            </div>
          )}
        </div>

        {/* Right — AI coach + angles + video */}
        <div className="w-80 flex flex-col bg-slate-900 border-l border-slate-700 flex-shrink-0 overflow-y-auto">

          {/* AI Coach — replaces static "Setup" text */}
          {def
            ? <AiCoach def={def} snapshot={snapshot} />
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

          {/* Reference video */}
          <div className="p-3 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Reference</div>
            <ReferenceVideo src={videoSrc} label={exerciseLabel} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  AiCoach — interactive Claude-powered physical therapist
//
//  Receives live biofeedback and uses it as context for every API call.
//  Voice is always on (auto-starts on mount); proactive cues fire every 12 s
//  when form needs correction.  The user can also speak or type questions.
// ─────────────────────────────────────────────────────────────────────────────

interface CoachMessage {
  role:    'user' | 'assistant'
  content: string
}

function AiCoach({ def, snapshot }: { def: BiofeedbackDef; snapshot: FormSnapshot | null }) {
  const [apiKey, setApiKey]   = useState<string | null>(getStoredApiKey)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput]     = useState('')
  const [sending, setSending] = useState(false)

  const snapshotRef  = useRef(snapshot)
  const sendingRef   = useRef(sending)
  const messagesRef  = useRef(messages)
  useEffect(() => { snapshotRef.current  = snapshot },  [snapshot])
  useEffect(() => { sendingRef.current   = sending },   [sending])
  useEffect(() => { messagesRef.current  = messages },  [messages])

  // ── Voice I/O ───────────────────────────────────────────────────────────
  const handleSilence = useCallback((text: string) => {
    if (text.trim() && !sendingRef.current) void sendToCoach(text)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const voiceIn  = useVoiceInput({ silenceMs: 1400, onSilence: handleSilence })
  const voiceOut = useVoiceOutput()

  // Cleanup: stop mic + cancel TTS when the overlay is closed / unmounted
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

  // ── Build live form context for every API call ──────────────────────────
  function buildFormContext(): string {
    const snap = snapshotRef.current
    if (!snap || snap.details.length === 0) return 'Camera is still detecting your pose…'
    const lines = snap.details.map(
      (d) => `  • ${d.label}: ${Math.round(d.deg)}° → ${d.status.toUpperCase()}`,
    )
    return `Overall: ${snap.good ? 'GOOD FORM ✓' : 'NEEDS CORRECTION'}\n${lines.join('\n')}`
  }

  // ── Core API call ───────────────────────────────────────────────────────
  async function sendToCoach(userText: string, isProactive = false) {
    if (!apiKey || sendingRef.current) return
    setSending(true)
    voiceIn.stop()

    const systemPrompt = `You are a warm, expert physical therapist coaching a patient through the "${def.title}" exercise. You have real-time pose-tracking data from a camera.

Current joint angles (live):
${buildFormContext()}

Rules:
• Keep every reply to 1–2 short sentences — it is read aloud during the exercise hold.
• Be encouraging and specific.
• When form is GOOD: affirm it and offer one tip to deepen the benefit.
• When form needs correction: give ONE clear, actionable adjustment.
• You may answer questions about the exercise, muscles involved, or sensations felt.
• Do NOT list multiple things at once — one cue per turn.`

    const userMsg    = isProactive ? 'Give me a coaching cue based on my current form.' : userText
    const baseHistory: CoachMessage[] = isProactive ? messagesRef.current : [...messagesRef.current, { role: 'user', content: userText }]

    if (!isProactive) {
      setMessages(baseHistory)
      setInput('')
    }

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
          max_tokens: 120,
          system:     systemPrompt,
          messages:   [...baseHistory, { role: 'user', content: userMsg }],
        }),
      })
      const data = await res.json()
      const reply: string = data.content?.[0]?.text ?? ''
      if (reply) {
        const assistantMsg: CoachMessage = { role: 'assistant', content: reply }
        setMessages((m) => [...(isProactive ? m : baseHistory), assistantMsg])
        voiceOut.speak(reply, () => {
          // Re-arm mic after TTS finishes
          if (voiceIn.supported) voiceIn.start()
        })
      }
    } catch (e) {
      console.error('[AiCoach]', e)
    } finally {
      setSending(false)
    }
  }

  // ── Proactive coaching every 12 s when form is off ──────────────────────
  const lastProactiveRef = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      if (!apiKey || sendingRef.current || voiceOut.speaking) return
      const snap = snapshotRef.current
      if (!snap || snap.good) return           // only coach when form needs work
      const now = Date.now()
      if (now - lastProactiveRef.current < 12_000) return
      lastProactiveRef.current = now
      void sendToCoach('', true)
    }, 3_000)
    return () => clearInterval(id)
  }, [apiKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────

  // API key gate — if no key, show a compact entry prompt
  if (!apiKey) {
    return (
      <div className="p-3 border-b border-slate-700">
        <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold mb-1.5">
          AI Coach
        </div>
        <p className="text-[10px] text-slate-400 mb-2 leading-snug">
          Add your Anthropic API key to enable the live AI physical therapist.
          (If you've already added it in the Triage chat, reload the page.)
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
        {/* Fallback: show intro cue text when coach isn't available */}
        <p className="mt-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Setup</p>
        <p className="mt-1 text-xs text-slate-300 leading-relaxed">{def.introCue}</p>
      </div>
    )
  }

  const lastMsg = messages[messages.length - 1]

  // Phase indicator
  const phase =
    sending        ? 'thinking'
    : voiceOut.speaking ? 'speaking'
    : voiceIn.listening ? 'listening'
    : 'idle'

  const phaseColor =
    phase === 'listening' ? 'text-orange-400 animate-pulse'
    : phase === 'thinking' ? 'text-yellow-400 animate-pulse'
    : phase === 'speaking' ? 'text-cyan-400 animate-pulse'
    : 'text-slate-600'

  const PhaseIcon =
    phase === 'thinking' ? Brain
    : voiceIn.listening  ? Mic
    : voiceOut.speaking  ? Mic
    : MicOff

  return (
    <div className="border-b border-slate-700 flex flex-col">

      {/* Coach header strip */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-1.5">
          <PhaseIcon size={13} className={phaseColor} />
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">
            AI Coach
          </span>
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

      {/* Coach message area — last AI + user turn visible */}
      <div
        className="px-3 pb-2 min-h-[60px] cursor-pointer"
        onClick={() => voiceOut.speaking && voiceOut.cancel()}
        title={voiceOut.speaking ? 'Tap to interrupt' : undefined}
      >
        {phase === 'thinking' && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <Brain size={10} className="animate-pulse text-yellow-400" />
            Analyzing your form…
          </div>
        )}

        {/* Interim transcript while listening */}
        {phase === 'listening' && voiceIn.interimTranscript && (
          <p className="text-[10px] text-orange-300 italic">
            "{voiceIn.interimTranscript}"
          </p>
        )}

        {/* Show last message */}
        {phase !== 'thinking' && lastMsg && (
          <p className={`text-xs leading-snug ${
            lastMsg.role === 'assistant' ? 'text-slate-100' : 'text-slate-400 italic'
          }`}>
            {lastMsg.content}
            {lastMsg.role === 'assistant' && voiceOut.speaking && (
              <span className="ml-1.5 text-[9px] text-cyan-400 not-italic">tap to skip ▶</span>
            )}
          </p>
        )}

        {/* Initial state — show a trimmed intro cue until first coach response */}
        {!lastMsg && phase === 'idle' && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {def.introCue.length > 120 ? def.introCue.slice(0, 120) + '…' : def.introCue}
            <br />
            <span className="text-slate-600 not-italic mt-0.5 block">
              Tap the mic to start voice, or type a question below.
            </span>
          </p>
        )}
      </div>

      {/* Text input — optional backup for voice */}
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

function ReferenceVideo({ src, label }: { src: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else          { v.pause(); setPlaying(false) }
  }

  return (
    <div
      onClick={toggle}
      className="relative cursor-pointer rounded-lg overflow-hidden border border-slate-700 hover:border-slate-500 transition-colors"
    >
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        loop
        className="w-full block bg-black"
        onEnded={() => setPlaying(false)}
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
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-[11px] font-medium text-white leading-tight">{label}</p>
      </div>
    </div>
  )
}
