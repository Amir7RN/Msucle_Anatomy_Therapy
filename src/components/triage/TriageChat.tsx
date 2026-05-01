/**
 * TriageChat.tsx
 *
 * Conversational AI Symptom Triage — voice-first.
 *
 * Inputs:
 *   • Type    — keyboard, Enter to send.
 *   • Speak   — push-to-talk mic button OR continuous Voice Mode.
 *   • Click   — body click in Diagnostic Mode auto-seeds the conversation.
 *
 * Voice Mode loop (hands-free):
 *   1. Toggle Voice Mode on (or it switches on automatically the first time
 *      the user taps the mic).
 *   2. Mic starts listening; live transcript shows in the input bar.
 *   3. After ~1.6 s of silence with non-empty speech, the message auto-sends.
 *   4. Mic mutes while the LLM thinks.
 *   5. The LLM reply is read aloud (TTS).
 *   6. When TTS finishes, the mic re-opens — back to step 2.
 *
 * Interruption:
 *   • Tap the big mic indicator (or any AI bubble) to cancel the AI's voice
 *     mid-sentence and start listening immediately.
 *   • Tap the mic indicator while listening to abort and clear the buffer.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Mic, MicOff, Send, X, FileDown, Volume2, VolumeX,
  MessageCircle, AlertTriangle, KeyRound, Brain,
} from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import {
  chatTriage,
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  type DifferentialPayload,
  type TriageChatMessage,
} from '../../lib/triage/llm'
import { useDiagnosticCatalogue } from '../../hooks/useDiagnosticClick'
import {
  calculateMuscleContribution,
  type DiagnosticMuscle,
  type MuscleContribution,
} from '../../lib/diagnostic'
import { exportTriagePdf } from '../../lib/triage/pdf'
import { useVoiceInput, useVoiceOutput, useVoiceActivity } from '../../hooks/useVoice'

interface Props {
  open:    boolean
  onClose: () => void
  /** When true the panel renders inline (fills parent) instead of as a fixed overlay */
  inline?: boolean
}

const SILENCE_MS = 1500    // pause length that triggers auto-send — snappier feel

export function TriageChat({ open, onClose, inline = false }: Props) {
  const catalogue = useDiagnosticCatalogue()
  const diagnosticResult = useAtlasStore((s) => s.diagnosticResult)
  const setDiagnostic    = useAtlasStore((s) => s.setDiagnostic)

  const [history, setHistory]      = useState<TriageChatMessage[]>([])
  const [input,   setInput]        = useState('')
  const [sending, setSending]      = useState(false)
  const [differential, setDifferential] = useState<DifferentialPayload | null>(null)
  const [contribs, setContribs]    = useState<MuscleContribution[]>([])
  const [apiKey, setApiKey]        = useState<string | null>(getStoredApiKey())
  const [error,  setError]         = useState<string | null>(null)
  const [voiceMode, setVoiceMode]  = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Refs the silence callback uses (it's stable; we look up live state through these)
  const sendingRef   = useRef(sending)
  const voiceModeRef = useRef(voiceMode)
  useEffect(() => { sendingRef.current   = sending },   [sending])
  useEffect(() => { voiceModeRef.current = voiceMode }, [voiceMode])

  // submitTextRef — always points to the current render's submitText so the
  // stable handleSilence callback never closes over stale history/apiKey/catalogue.
  const submitTextRef = useRef<(text?: string) => void>(() => {})

  // Auto-submit when the user pauses speaking.
  // NOTE: we intentionally do NOT gate on voiceModeRef here — the user can tap
  // the mic indicator without toggling "Voice Mode" and still expect the captured
  // speech to be sent.  The voiceMode toggle only controls the TTS ↔ mic loop.
  const handleSilence = useCallback((finalText: string) => {
    if (sendingRef.current) return
    if (!finalText.trim())  return
    // Call via ref so we always invoke the latest render's submitText,
    // which has current history, apiKey, catalogue, and sendNextTurn.
    submitTextRef.current(finalText.trim())
  }, []) // stable — only reads refs

  // Duplex barge-in: as soon as the user starts speaking, cut off the AI's TTS.
  // Forward declaration — voiceOut is created below; we use a ref for the cancel fn.
  const barginRef = useRef<() => void>(() => {})
  const handleSpeechDetected = useCallback(() => {
    barginRef.current()
  }, [])

  const voiceIn = useVoiceInput({
    silenceMs:        SILENCE_MS,
    onSilence:        handleSilence,
    onSpeechDetected: handleSpeechDetected,
  })
  const voiceOut = useVoiceOutput()
  // Update the barge-in fn now that voiceOut is in scope.
  // DUPLEX FIX: always call window.speechSynthesis.cancel() directly —
  // voiceOut.speaking is React state and may not have flushed yet, so
  // relying on it causes a one-render delay.  Hitting the native API is
  // instant and idempotent (safe to call even when nothing is playing).
  useEffect(() => {
    barginRef.current = () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      voiceOut.cancel()
    }
  }, [voiceOut])

  // Voice mode is OFF by default — user turns it on via the toggle in VoiceStrip.
  // No mic permission is requested until the user explicitly enables it.

  // Volume-based barge-in: while TTS is speaking, sustained user volume
  // above the threshold cancels speech instantly.  This is the hard-fix
  // the user requested — the Web Audio analyser is independent of Web
  // Speech, so it can't be confused by the AI's own audio bleed.
  useVoiceActivity({
    enabled:  voiceMode && voiceOut.speaking,
    onActive: () => {
      // Cancel both the hook's speaking state AND the raw Web Speech queue
      // so there is zero delay even if the hook state update hasn't flushed yet.
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      voiceOut.cancel()
    },
  })

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, differential])

  // Show live transcript in the input bar (final + in-flight interim)
  useEffect(() => {
    if (voiceIn.listening) setInput(voiceIn.fullTranscript)
  }, [voiceIn.fullTranscript, voiceIn.listening])

  // ── Duplex mode ────────────────────────────────────────────────────────
  //  Mic stays ARMED during TTS so the user can barge in.  The first speech
  //  event during TTS triggers handleSpeechDetected → cancels TTS instantly.
  //  Browser echo cancellation (default in getUserMedia) plus the Web Speech
  //  API's noise gate keeps the AI from transcribing its own voice in most
  //  setups.  If a small TTS bleed slips through, the silence timer (1.5 s)
  //  will discard it as a too-short fragment.
  //
  //  When TTS ends, the mic re-arm is handled by the .speak(..., onEnd)
  //  callback in sendNextTurn — see below.

  // ── Body-click seed ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !diagnosticResult) return
    if (history.length > 0) return
    const zones = diagnosticResult.clickedZones.join(', ')
    const seed: TriageChatMessage = {
      role:    'user',
      content: `I clicked on the body around: ${zones}. Help me understand what could be causing pain there.`,
      ts:      Date.now(),
    }
    setHistory([seed])
    setDiagnostic(null)
    void sendNextTurn([seed])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, diagnosticResult])

  async function sendNextTurn(nextHistory: TriageChatMessage[]) {
    if (!catalogue) {
      // Catalogue loads async — tell the user instead of silently dropping the message.
      setError('Still loading muscle data — tap Send again in a moment.')
      return
    }
    if (!apiKey) { setError('Please add your Anthropic API key first.'); return }
    setSending(true); setError(null)
    // Stop the mic while we wait for the LLM so we don't pick up our own speech.
    voiceIn.stop()
    try {
      const result = await chatTriage(nextHistory, catalogue, apiKey)
      const reply: TriageChatMessage = {
        role: 'assistant', content: result.textReply, ts: Date.now(),
      }
      setHistory([...nextHistory, reply])

      if (result.differential) {
        setDifferential(result.differential)
        const contribs = calculateMuscleContribution(result.differential.zones, catalogue as DiagnosticMuscle[])
        setContribs(contribs)
        // Push to schematic overlay on the 3D model — patient-right side by default
        setDiagnostic({
          clickedZones:  result.differential.zones,
          clickPoint:    [-0.01, 0, 0],
          contributions: contribs,
        })
      }

      // Always speak the reply — even if the user only pressed the mic once
      // without toggling Voice Mode.  TTS fires whenever voiceIn was listening
      // (i.e. the user expected a spoken answer) OR if Voice Mode is on.
      if (reply.content) {
        voiceIn.stop()
        voiceIn.reset()
        voiceOut.speak(reply.content, () => {
          // 300ms blanking — let audio buffer drain before re-arming mic.
          window.setTimeout(() => {
            if (voiceModeRef.current) voiceIn.start()
          }, 300)
        })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  function submitText(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || sending) return
    voiceIn.stop()
    voiceIn.reset()
    const next: TriageChatMessage = { role: 'user', content: text, ts: Date.now() }
    const nextHist = [...history, next]
    setHistory(nextHist)
    setInput('')
    void sendNextTurn(nextHist)
  }

  // Keep the ref pointing at the current render's submitText so handleSilence
  // (which is stable / never re-created) always calls the freshest version.
  submitTextRef.current = submitText

  function toggleVoiceMode() {
    const turningOn = !voiceMode
    setVoiceMode(turningOn)
    if (turningOn) {
      voiceOut.cancel()
      voiceIn.start()
    } else {
      voiceIn.stop()
      voiceOut.cancel()
    }
  }

  function tapMicIndicator() {
    // Universal "next" action while in voice mode:
    if (voiceOut.speaking) { voiceOut.cancel(); voiceIn.start(); return }
    if (voiceIn.listening) { voiceIn.stop(); voiceIn.reset(); setInput(''); return }
    voiceIn.start()
  }

  function startNew() {
    setHistory([])
    setDifferential(null)
    setContribs([])
    setError(null)
    setInput('')
    voiceOut.cancel()
    voiceIn.reset()
    setDiagnostic(null)   // clear schematic overlay on the model
  }

  function exportPdf() {
    if (!differential) return
    exportTriagePdf({
      sessionDate:   new Date(),
      history,
      differential,
      contributions: contribs,
    })
  }

  // Cancel everything when the panel closes
  useEffect(() => {
    if (!open) {
      voiceIn.stop()
      voiceOut.cancel()
      setVoiceMode(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const phase: 'idle' | 'listening' | 'thinking' | 'speaking' =
    sending          ? 'thinking'
    : voiceOut.speaking ? 'speaking'
    : voiceIn.listening ? 'listening'
    : 'idle'

  // Inline mode: fill the sidebar slot; fixed-overlay mode: float over the canvas
  const wrapperCls = inline
    ? 'flex flex-col flex-1 min-h-0 bg-slate-900 text-slate-100'
    : 'fixed right-4 top-20 bottom-6 z-30 flex w-[380px] flex-col rounded-lg border border-slate-700 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur'

  return (
    <aside className={wrapperCls}>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-700 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={15} className="text-orange-400" />
          <span className="text-[13px] font-semibold tracking-wide">AI Diagnosis</span>
        </div>
        <div className="flex items-center gap-1">
          {differential && (
            <button onClick={exportPdf} title="Export PDF" className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white">
              <FileDown size={13} />
            </button>
          )}
          <button onClick={startNew} title="New session" className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white">new</button>
          <button onClick={() => { setApiKey(null); clearStoredApiKey() }} title="Clear API key" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <KeyRound size={13} />
          </button>
          {/* Only show close button when floating (not inline) */}
          {!inline && (
            <button onClick={onClose} title="Close" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      {/* API key wall */}
      {!apiKey && (
        <ApiKeyEntry onSave={(k) => { setStoredApiKey(k); setApiKey(k) }} />
      )}

      {/* Voice mode header strip */}
      {apiKey && voiceIn.supported && (
        <VoiceStrip
          enabled={voiceMode}
          phase={phase}
          interim={voiceIn.interimTranscript}
          onToggle={toggleVoiceMode}
          onTapIndicator={tapMicIndicator}
        />
      )}

      {/* Messages — when the AI is speaking, the entire panel becomes a "tap to interrupt" target */}
      {apiKey && (
        <div
          onClick={voiceOut.speaking ? () => { voiceOut.cancel(); if (voiceMode) voiceIn.start() } : undefined}
          className={`flex-1 space-y-3 overflow-y-auto px-3 py-3 ${voiceOut.speaking ? 'cursor-pointer' : ''}`}
        >
          {history.length === 0 && <EmptyState voiceSupported={voiceIn.supported} />}

          {history.map((m, i) => (
            <Bubble
              key={i}
              role={m.role}
              text={m.content}
              onSpeak={voiceOut.supported && m.role === 'assistant'
                ? () => voiceOut.speak(m.content)
                : undefined}
              onTap={m.role === 'assistant' && voiceOut.speaking
                ? () => { voiceOut.cancel(); if (voiceMode) voiceIn.start() }
                : undefined}
            />
          ))}

          {differential && contribs.length > 0 && (
            <ModelResultsHint differential={differential} />
          )}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Brain size={12} className="animate-pulse text-orange-400" />
              thinking…
            </div>
          )}

          {error && (
            <div className="rounded border border-red-700 bg-red-950/50 p-2 text-xs text-red-300">
              <AlertTriangle size={12} className="mr-1 inline" />
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      {apiKey && (
        <div className="border-t border-slate-700 p-2">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText() }
              }}
              placeholder={voiceMode ? 'Listening… or type here.' : 'Describe your pain — type or tap the mic.'}
              rows={2}
              className="flex-1 resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={submitText.bind(null, undefined)}
                disabled={sending || !input.trim()}
                className="rounded-md bg-orange-500 px-2 py-1 text-white hover:bg-orange-400 disabled:bg-slate-700 disabled:text-slate-500"
                title="Send"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] text-slate-500">
            <span>Enter to send · Shift-Enter newline</span>
            <span>Not medical advice</span>
          </div>
        </div>
      )}
    </aside>
  )
}

// ── Voice strip — big visual mic state at the top of the panel ──────────────

function VoiceStrip({
  enabled, phase, interim, onToggle, onTapIndicator,
}: {
  enabled: boolean
  phase:   'idle' | 'listening' | 'thinking' | 'speaking'
  interim: string
  onToggle:        () => void
  onTapIndicator:  () => void
}) {
  const ring =
    phase === 'listening' ? 'ring-orange-500 animate-pulse'
    : phase === 'thinking' ? 'ring-yellow-400 animate-pulse'
    : phase === 'speaking' ? 'ring-cyan-400 animate-pulse'
    : 'ring-slate-700'

  const Icon =
    phase === 'listening' ? Mic
    : phase === 'thinking' ? Brain
    : phase === 'speaking' ? Volume2
    : enabled ? Mic : MicOff

  const subtitle =
    phase === 'listening' ? (interim ? `"${interim}"` : 'Listening — pause 5s to send')
    : phase === 'thinking' ? 'Thinking through what you said…'
    : phase === 'speaking' ? 'Tap the bubble to interrupt and reply'
    : enabled ? 'Voice mode armed — about to listen' : 'Tap to enter Voice Mode'

  return (
    <div className="border-b border-slate-700 px-3 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onTapIndicator}
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 ring-2 transition-all ${ring}`}
          title="Tap to start / stop / interrupt"
        >
          <Icon size={20} className={phase === 'idle' && !enabled ? 'text-slate-500' : 'text-orange-300'} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              className={`text-[11px] font-semibold tracking-wide ${enabled ? 'text-orange-400' : 'text-slate-300'}`}
            >
              Voice mode {enabled ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={onToggle}
              className={`relative h-4 w-7 rounded-full transition-colors ${enabled ? 'bg-orange-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${enabled ? 'left-3.5' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="mt-0.5 truncate text-[10px] text-slate-400">{subtitle}</div>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function EmptyState({ voiceSupported }: { voiceSupported: boolean }) {
  return (
    <div className="space-y-2 rounded-md bg-slate-800/50 p-3 text-xs text-slate-300">
      <div className="font-semibold text-slate-100">AI Diagnosis</div>
      <p className="text-slate-400">
        Describe where it hurts, when it started, and what makes it worse —
        {voiceSupported ? ' type or speak.' : ' write it out.'}
      </p>
      {voiceSupported && (
        <p className="text-slate-500 text-[11px]">
          Tap the mic to talk hands-free. The AI responds aloud and shows likely sources on the 3D model.
        </p>
      )}
      <p className="text-slate-500 text-[11px]">
        Or click the body in Diagnostic Mode and I'll start from that area automatically.
      </p>
    </div>
  )
}

function Bubble({
  role, text, onSpeak, onTap,
}: {
  role:    'user' | 'assistant'
  text:    string
  onSpeak?: () => void
  onTap?:   () => void
}) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        onClick={onTap}
        className={`max-w-[88%] rounded-lg px-3 py-2 text-xs leading-snug ${
          isUser
            ? 'bg-orange-500/85 text-white'
            : 'bg-slate-800 text-slate-100 ' + (onTap ? 'cursor-pointer ring-1 ring-cyan-500/40' : '')
        }`}
      >
        <div className="whitespace-pre-wrap">{text}</div>
        {onSpeak && !onTap && (
          <button
            onClick={(e) => { e.stopPropagation(); onSpeak() }}
            className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
          >
            <Volume2 size={10} /> play
          </button>
        )}
        {onTap && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-cyan-300">
            <VolumeX size={10} /> tap to interrupt
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * ModelResultsHint — replaces the old in-chat differential card.
 * The ranked muscle list is now shown on the 3D anatomy model as a
 * schematic overlay (leader lines + label boxes).  This card just confirms
 * that and surfaces any red-flag warnings.
 */
function ModelResultsHint({ differential }: { differential: DifferentialPayload }) {
  return (
    <div className="space-y-2 rounded-md border border-orange-700/30 bg-orange-900/15 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-400">
        <span>◈</span> Likely sources — shown on model
      </div>
      <p className="text-[10px] leading-snug text-slate-400">
        Muscle candidates with leader lines are displayed on the 3D anatomy model. Click any label box to select the muscle.
      </p>
      {differential.red_flags.length > 0 && (
        <div className="rounded border border-red-700 bg-red-950/40 p-2 text-[10px] text-red-300">
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <AlertTriangle size={10} /> Red flags — seek professional care
          </div>
          <ul className="ml-3 list-disc space-y-0.5">
            {differential.red_flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── API Key gate ─────────────────────────────────────────────────────────────

function ApiKeyEntry({ onSave }: { onSave: (key: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div className="space-y-2 p-4 text-xs text-slate-300">
      <div className="font-semibold text-slate-100">Connect your Claude API key</div>
      <p className="text-slate-400">
        The triage chat runs on Anthropic Claude. Paste your API key (starts with <code>sk-ant-</code>) — it stays
        on this device in localStorage and is sent only to Anthropic's API.
      </p>
      <input
        type="password"
        autoFocus
        placeholder="sk-ant-..."
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) onSave(val.trim()) }}
        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-orange-500 focus:outline-none"
      />
      <button
        disabled={!val.trim()}
        onClick={() => onSave(val.trim())}
        className="w-full rounded bg-orange-500 py-1.5 text-xs text-white hover:bg-orange-400 disabled:bg-slate-700 disabled:text-slate-500"
      >
        Save key
      </button>
      <p className="text-[10px] text-slate-500">
        For commercial release, swap this for a server proxy so end-users don't bring their own key.
      </p>
    </div>
  )
}
   