/**
 * useVoice.ts
 *
 *   • useVoiceInput   — SpeechRecognition for hands-free pain description
 *   • useVoiceOutput  — SpeechSynthesis  for reading AI replies aloud
 *
 * Browser-only Web Speech APIs.  No external services, no API keys.
 *
 * Transcript model
 *   Two separate buffers are exposed:
 *     finalTranscript    — accumulated finalised speech segments
 *     interimTranscript  — the live in-flight phrase, replaced on every event
 *
 *   The full readable string is `finalTranscript + ' ' + interimTranscript`.
 *   This avoids the duplication bug where appending interim text on every
 *   event ballooned into "Uh from my left shoulder Uh from my left shoulder
 *   blade Uh from my left shoulder blade up …" — interim was being treated
 *   as final on each tick.
 *
 * Silence-driven auto-submit
 *   If `onSilence` is provided, the hook fires it after `silenceMs` ms of no
 *   new speech events.  The chat can use this to push-and-submit hands-free.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
//  Speech Recognition (STT)
// ─────────────────────────────────────────────────────────────────────────────

interface SpeechRecognitionResultLike { 0: { transcript: string }; isFinal: boolean }
interface SpeechRecognitionEventLike {
  results:     ArrayLike<SpeechRecognitionResultLike>
  resultIndex: number
}
interface SpeechRecognitionLike {
  continuous:     boolean
  interimResults: boolean
  lang:           string
  onresult:       ((e: SpeechRecognitionEventLike) => void) | null
  onerror:        ((e: { error: string }) => void) | null
  onend:          (() => void) | null
  onstart:        (() => void) | null
  start: () => void
  stop:  () => void
  abort: () => void
}

function getRecognitionCtor(): { new (): SpeechRecognitionLike } | null {
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike }
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike }
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export interface UseVoiceInputOptions {
  lang?:       string
  /** Auto-fire onSilence(finalTranscript) after this many ms of no new events. */
  silenceMs?:  number
  /** Called when silence threshold is hit and we have a non-empty final. */
  onSilence?:  (finalText: string) => void
}

export interface UseVoiceInputResult {
  supported:         boolean
  listening:         boolean
  finalTranscript:   string
  interimTranscript: string
  /** finalTranscript + interimTranscript, trimmed and space-joined. */
  fullTranscript:    string
  start:             () => void
  stop:              () => void
  reset:             () => void
  error:             string | null
}

export function useVoiceInput(opts: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const { lang = 'en-US', silenceMs, onSilence } = opts
  const Ctor = getRecognitionCtor()
  const supported = !!Ctor

  const recRef          = useRef<SpeechRecognitionLike | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const finalRef        = useRef<string>('')

  const [listening,         setListening]         = useState(false)
  const [finalTranscript,   setFinalTranscript]   = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error,             setError]             = useState<string | null>(null)

  // Stable refs to the silence callback so we don't re-init the recognizer.
  const onSilenceRef = useRef(onSilence)
  const silenceMsRef = useRef(silenceMs)
  useEffect(() => { onSilenceRef.current = onSilence }, [onSilence])
  useEffect(() => { silenceMsRef.current = silenceMs }, [silenceMs])

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }
  const armSilenceTimer = () => {
    clearSilenceTimer()
    if (!silenceMsRef.current) return
    silenceTimerRef.current = window.setTimeout(() => {
      const text = finalRef.current.trim()
      if (text && onSilenceRef.current) onSilenceRef.current(text)
    }, silenceMsRef.current)
  }

  useEffect(() => {
    if (!Ctor) return
    const rec = new Ctor()
    rec.continuous     = true
    rec.interimResults = true
    rec.lang           = lang

    rec.onstart = () => {
      setListening(true)
      setError(null)
    }

    rec.onresult = (e) => {
      let newFinal = ''
      let interim  = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) newFinal += r[0].transcript
        else           interim  += r[0].transcript
      }
      if (newFinal) {
        finalRef.current = (finalRef.current + ' ' + newFinal.trim()).trim()
        setFinalTranscript(finalRef.current)
      }
      setInterimTranscript(interim.trim())
      // Reset silence timer on EVERY recognition event — speech is still flowing.
      armSilenceTimer()
    }

    rec.onerror = (e) => {
      // 'no-speech' is normal in continuous mode — don't surface as a hard error.
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(e.error)
      setListening(false)
    }

    rec.onend = () => {
      setListening(false)
      clearSilenceTimer()
    }

    recRef.current = rec
    return () => {
      try { rec.abort() } catch {}
      clearSilenceTimer()
    }
  }, [Ctor, lang])

  const start = useCallback(() => {
    if (!recRef.current) return
    finalRef.current = ''
    setFinalTranscript('')
    setInterimTranscript('')
    setError(null)
    try {
      recRef.current.start()
    } catch (e) {
      // Already-started errors are benign in continuous mode.
      const msg = (e as Error).message ?? ''
      if (!msg.includes('already started')) setError(msg)
    }
  }, [])

  const stop = useCallback(() => {
    clearSilenceTimer()
    try { recRef.current?.stop() } catch {}
  }, [])

  const reset = useCallback(() => {
    finalRef.current = ''
    setFinalTranscript('')
    setInterimTranscript('')
    setError(null)
    clearSilenceTimer()
  }, [])

  const fullTranscript =
    [finalTranscript, interimTranscript].filter(Boolean).join(' ').trim()

  return {
    supported, listening,
    finalTranscript, interimTranscript, fullTranscript,
    start, stop, reset, error,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Speech Synthesis (TTS)
// ─────────────────────────────────────────────────────────────────────────────

export interface UseVoiceOutputResult {
  supported: boolean
  speaking:  boolean
  speak:     (text: string, onEnd?: () => void) => void
  cancel:    () => void
}

export function useVoiceOutput(lang = 'en-US'): UseVoiceOutputResult {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!supported || !text) { onEnd?.(); return }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang  = lang
    utt.rate  = 1.0
    utt.pitch = 1.0
    utt.onstart = () => setSpeaking(true)
    utt.onend   = () => { setSpeaking(false); onEnd?.() }
    utt.onerror = () => { setSpeaking(false); onEnd?.() }
    window.speechSynthesis.speak(utt)
  }, [supported, lang])

  const cancel = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  return { supported, speaking, speak, cancel }
}
