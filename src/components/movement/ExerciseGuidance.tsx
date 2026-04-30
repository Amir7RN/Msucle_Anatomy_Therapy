/**
 * ExerciseGuidance.tsx
 *
 * Full-screen overlay that guides the user through a single exercise using
 * the phone camera + MediaPipe pose tracking.
 *
 * Layout
 * ───────────────────────────────────────────────────────────────
 *  ┌──────────────────────────────────────────────┐
 *  │  Header: exercise name + close              │
 *  ├──────────────────┬───────────────────────────┤
 *  │                  │  Intro cue / live cue      │
 *  │   Camera view    │  Angle readouts            │
 *  │   (skeleton)     │  Reference video           │
 *  │                  │  (tap to play/pause)       │
 *  └──────────────────┴───────────────────────────┘
 *
 * If no BiofeedbackDef exists for the chosen exercise the camera is still
 * shown (skeleton overlay + helpful tip) — the user just won't get angle cues.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X, Camera, Play, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { CameraView } from './CameraView'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import {
  BIOFEEDBACK_DEFS,
  EXERCISE_TO_BIOFEEDBACK,
  evaluateExercise,
  type FormSnapshot,
  type BiofeedbackDef,
} from '../../lib/movement/biofeedback'

// ── Smoothing buffer ──────────────────────────────────────────────────────────
// Average cue over N frames before updating UI so the text doesn't flicker.
const SMOOTH_FRAMES = 8

interface Props {
  /** ExerciseDef.id from MetadataPanel — null means panel is closed */
  exerciseId:   string | null
  /** Human-readable label shown in the header */
  exerciseLabel: string
  /** Full path to the reference video (ExerciseDef.src) */
  videoSrc:     string
  onClose:      () => void
}

export function ExerciseGuidance({ exerciseId, exerciseLabel, videoSrc, onClose }: Props) {
  // All hooks MUST come before any early returns (Rules of Hooks).
  const biofeedbackKey = exerciseId ? EXERCISE_TO_BIOFEEDBACK[exerciseId] : null
  const def: BiofeedbackDef | null = biofeedbackKey ? BIOFEEDBACK_DEFS[biofeedbackKey] ?? null : null

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [snapshot, setSnapshot]       = useState<FormSnapshot | null>(null)
  const [introDone, setIntroDone]     = useState(false)

  // Spoken intro cue on mount (one-shot)
  useEffect(() => {
    if (!def || introDone) return
    if (!('speechSynthesis' in window)) { setIntroDone(true); return }
    const utt = new SpeechSynthesisUtterance(def.introCue)
    utt.rate  = 0.92
    utt.lang  = 'en-US'
    utt.onend = () => setIntroDone(true)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utt)
    return () => { window.speechSynthesis.cancel() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def?.exerciseId])

  // Cue TTS — throttled to avoid chattering (fire at most once per 4 s)
  const lastCueTsRef  = useRef(0)
  const lastCueRef    = useRef('')
  const speakCue = useCallback((text: string) => {
    if (!text || text === lastCueRef.current) return
    const now = Date.now()
    if (now - lastCueTsRef.current < 4000) return
    lastCueTsRef.current = now
    lastCueRef.current   = text
    if (!('speechSynthesis' in window)) return
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate  = 0.92
    utt.lang  = 'en-US'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utt)
  }, [])

  // Frame smoothing: keep the last N snapshots and pick the most-common cue
  const frameBuffer = useRef<FormSnapshot[]>([])

  const handleLandmarks = useCallback((lms: LandmarkSet) => {
    if (!def) return
    const snap = evaluateExercise(lms, def)

    frameBuffer.current.push(snap)
    if (frameBuffer.current.length > SMOOTH_FRAMES) {
      frameBuffer.current.shift()
    }

    // Majority vote: how many frames say "good"?
    const goodCount = frameBuffer.current.filter((s) => s.good).length
    const majority  = frameBuffer.current.length >= SMOOTH_FRAMES
    if (!majority) return

    const smoothed: FormSnapshot = goodCount >= SMOOTH_FRAMES / 2
      ? { cueText: 'Good alignment — hold it.', good: true, details: snap.details }
      : snap   // use latest bad-frame for the cue text

    setSnapshot(smoothed)
    if (!smoothed.good && smoothed.cueText) speakCue(smoothed.cueText)
  }, [def, speakCue])

  // Reset buffer when exercise changes
  useEffect(() => { frameBuffer.current = []; setSnapshot(null) }, [exerciseId])

  // Early return AFTER all hooks
  if (!exerciseId) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">{exerciseLabel}</span>
          {def && (
            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">Live Form Check</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: camera feed */}
        <div className="flex-1 relative bg-black min-w-0">
          <CameraView
            active
            onLandmarks={handleLandmarks}
            onReady={() => setCameraReady(true)}
            onError={(msg) => setCameraError(msg)}
          />

          {/* Camera loading states */}
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
                <p className="text-xs text-slate-400">Allow camera access in your browser settings and reload.</p>
              </div>
            </div>
          )}

          {/* Live form cue overlay — bottom of camera */}
          {cameraReady && snapshot && (
            <div className={[
              'absolute bottom-0 left-0 right-0 px-4 py-3 text-center text-sm font-semibold transition-colors',
              snapshot.good
                ? 'bg-emerald-700/80 text-white'
                : 'bg-orange-600/85 text-white',
            ].join(' ')}>
              {snapshot.good
                ? <span className="flex items-center justify-center gap-2"><CheckCircle size={14} /> Good alignment — hold it.</span>
                : snapshot.cueText}
            </div>
          )}
        </div>

        {/* Right: cue panel + reference video */}
        <div className="w-72 flex flex-col bg-slate-900 border-l border-slate-700 flex-shrink-0 overflow-y-auto">

          {/* Intro cue */}
          {def && (
            <div className="p-3 border-b border-slate-700">
              <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold mb-1">Setup</div>
              <p className="text-xs text-slate-300 leading-relaxed">{def.introCue}</p>
            </div>
          )}

          {!def && (
            <div className="p-3 border-b border-slate-700 flex items-start gap-2">
              <Info size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                No angle detection for this exercise yet — use the camera to compare your form with the reference video.
              </p>
            </div>
          )}

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
                      d.status === 'good' ? 'bg-emerald-800 text-emerald-200'
                      : 'bg-orange-800 text-orange-200',
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

// ── Reference video player ────────────────────────────────────────────────────

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
