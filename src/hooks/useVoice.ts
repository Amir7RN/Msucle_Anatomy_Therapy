/**
 * useVoice.ts
 *
 *   • useVoiceInput   — SpeechRecognition for hands-free conversation
 *   • useVoiceOutput  — SpeechSynthesis with preferred high-quality voice
 *
 * Two new things in this revision:
 *
 *   1. onSpeechDetected: a callback that fires the moment ANY speech is
 *      heard (interim or final) — used by the chat panel to BARGE IN on
 *      the AI's TTS.  This enables ChatGPT-style duplex: user starts
 *      talking, AI shuts up, mic continues capturing the user.
 *
 *   2. Preferred-voice selection in useVoiceOutput.  We pick the highest-
 *      quality English voice the OS / browser exposes (Google US English
 *      → Apple Samantha → Microsoft natural voices → first English voice).
 *      Voice list is loaded asynchronously via the voiceschanged event.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
//  Volume-Activity Detection (VAD)
//
//  Web Audio API analyser running on the mic stream — independent from the
//  Speech Recognition pipeline.  Used to detect when the user starts talking
//  WHILE the AI's TTS is playing, so we can interrupt instantly.
//
//  Why a separate path: Speech Recognition can be fooled by the AI's own
//  voice through speakers (the echo loop bug).  A volume threshold with a
//  short hold window is much harder to fool — a brief TTS bleed will spike
//  for ~50 ms; real human speech sustains energy for 200+ ms.
// ─────────────────────────────────────────────────────────────────────────────

const VOLUME_THRESHOLD = 0.08        // RMS in 0..1 — calibrated to typical mic
const VOLUME_HOLD_MS   = 220         // sustain length to count as "user speaking"

export interface UseVoiceActivityOptions {
  /** When true, the analyser runs and fires onActive when sustained volume crosses the threshold. */
  enabled:     boolean
  /** Called when sustained user-volume is detected. */
  onActive:    () => void
}

export function useVoiceActivity(opts: UseVoiceActivityOptions): void {
  const { enabled, onActive } = opts
  const onActiveRef = useRef(onActive)
  useEffect(() => { onActiveRef.current = onActive }, [onActive])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let raf = 0
    let aboveSinceMs: number | null = null

    async function setup() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        })
      } catch (e) {
        console.warn('[vad] mic unavailable:', e)
        return
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      ctx = new AudioContext()
      analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      const src = ctx.createMediaStreamSource(stream)
      src.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)

      const tick = () => {
        if (cancelled || !analyser) return
        analyser.getFloatTimeDomainData(buf)
        // RMS volume
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const now = performance.now()
        if (rms > VOLUME_THRESHOLD) {
          if (aboveSinceMs === null) aboveSinceMs = now
          if (now - aboveSinceMs >= VOLUME_HOLD_MS) {
            onActiveRef.current?.()
            aboveSinceMs = now + 1_000_000  // suppress further fires for this loud burst
          }
        } else {
          aboveSinceMs = null
        }
        raf = requestAnimationFrame(tick)
      }
      tick()
    }
    void setup()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      try { ctx?.close() } catch {}
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])
}

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
  /** Auto-fire onSilence(finalTranscript) after this many ms of no events. */
  silenceMs?:  number
  /** Called when silence threshold hits AND we have non-empty final text. */
  onSilence?:  (finalText: string) => void
  /**
   * Called the moment the recogniser detects ANY speech (interim or final).
   * Used by the chat panel to barge-in / interrupt TTS the moment the user
   * starts talking, before they've finished a phrase.
   */
  onSpeechDetected?: () => void
}

export interface UseVoiceInputResult {
  supported:         boolean
  listening:         boolean
  finalTranscript:   string
  interimTranscript: string
  fullTranscript:    string
  start:             () => void
  stop:              () => void
  reset:             () => void
  error:             string | null
}

export function useVoiceInput(opts: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const { lang = 'en-US', silenceMs, onSilence, onSpeechDetected } = opts
  const Ctor = getRecognitionCtor()
  const supported = !!Ctor

  const recRef          = useRef<SpeechRecognitionLike | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const finalRef        = useRef<string>('')
  const speechFiredRef  = useRef<boolean>(false)

  const [listening,         setListening]         = useState(false)
  const [finalTranscript,   setFinalTranscript]   = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error,             setError]             = useState<string | null>(null)

  // Stable refs for option callbacks
  const onSilenceRef        = useRef(onSilence)
  const onSpeechDetectedRef = useRef(onSpeechDetected)
  const silenceMsRef        = useRef(silenceMs)
  useEffect(() => { onSilenceRef.current        = onSilence },        [onSilence])
  useEffect(() => { onSpeechDetectedRef.current = onSpeechDetected }, [onSpeechDetected])
  useEffect(() => { silenceMsRef.current        = silenceMs },        [silenceMs])

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
      speechFiredRef.current = false
    }

    rec.onresult = (e) => {
      let newFinal = ''
      let interim  = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) newFinal += r[0].transcript
        else           interim  += r[0].transcript
      }
      // Fire the barge-in callback on the FIRST non-empty event of this session.
      if (!speechFiredRef.current && (newFinal.trim() || interim.trim())) {
        speechFiredRef.current = true
        onSpeechDetectedRef.current?.()
      }
      if (newFinal) {
        finalRef.current = (finalRef.current + ' ' + newFinal.trim()).trim()
        setFinalTranscript(finalRef.current)
      }
      setInterimTranscript(interim.trim())
      armSilenceTimer()
    }

    rec.onerror = (e) => {
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
    speechFiredRef.current = false
    try {
      recRef.current.start()
    } catch (e) {
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
    speechFiredRef.current = false
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
//  Speech Synthesis (TTS) with preferred high-quality voice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Voice priority list — matched against SpeechSynthesisVoice.name with
 * regex.  First match wins.  We prefer named "natural" / cloud voices over
 * stock OS voices because they sound dramatically less robotic.
 */
const VOICE_PRIORITY: RegExp[] = [
  /^Google US English$/i,
  /^Google UK English Female$/i,
  /^Google UK English Male$/i,
  /^Samantha$/i,             // Apple high-quality
  /Microsoft.*Aria.*Online/i,
  /Microsoft.*Jenny.*Online/i,
  /Microsoft.*Guy.*Online/i,
  /^Karen$/i,                // Apple, AU English (natural)
  /^Daniel$/i,               // Apple, UK English (natural)
  /^Moira$/i,                // Apple, IE English
]

function pickPreferredVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  for (const re of VOICE_PRIORITY) {
    const match = voices.find((v) => re.test(v.name))
    if (match) return match
  }
  // Fallbacks: any "natural" voice, then any matching language, then anything.
  return (
    voices.find((v) => /natural|premium|enhanced/i.test(v.name)) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(lang.toLowerCase())) ??
    voices[0] ??
    null
  )
}

export interface UseVoiceOutputResult {
  supported: boolean
  speaking:  boolean
  voice:     SpeechSynthesisVoice | null
  speak:     (text: string, onEnd?: () => void) => void
  cancel:    () => void
}

export function useVoiceOutput(lang = 'en-US'): UseVoiceOutputResult {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const [voice,    setVoice]    = useState<SpeechSynthesisVoice | null>(null)

  // Voices load asynchronously — listen for the voiceschanged event.
  useEffect(() => {
    if (!supported) return
    const refresh = () => setVoice(pickPreferredVoice(lang))
    refresh()
    window.speechSynthesis.addEventListener('voiceschanged', refresh)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refresh)
    }
  }, [supported, lang])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!supported || !text) { onEnd?.(); return }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang  = lang
    utt.rate  = 1.0
    utt.pitch = 1.0
    if (voice) utt.voice = voice
    utt.onstart = () => setSpeaking(true)
    utt.onend   = () => { setSpeaking(false); onEnd?.() }
    utt.onerror = () => { setSpeaking(false); onEnd?.() }
    window.speechSynthesis.speak(utt)
  }, [supported, lang, voice])

  const cancel = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  return { supported, speaking, voice, speak, cancel }
}
