/**
 * MovementScreen.tsx
 *
 * Full-screen Movement Assessment UX.  Three phases:
 *
 *   1. SETUP    — camera permission, "stand back, full body in frame"
 *   2. ASSESS   — walk the 6 movements one by one with countdowns + holds
 *   3. RESULTS  — Movement Score, per-movement breakdown, weakness findings,
 *                 personalised 5-minute daily protocol, save to history
 *
 * On-device only — pose landmarks never leave the browser.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Camera, Play, RefreshCw, ChevronRight, Activity, Award, FileDown, AlertTriangle } from 'lucide-react'
import { CameraView } from './CameraView'
import {
  MOVEMENTS, type MovementDef, type MovementMetrics,
} from '../../lib/movement/movements'
import {
  scoreMovement, summariseAssessment, type AssessmentSummary, type MovementResult,
} from '../../lib/movement/scoring'
import { generateProtocol, type DailyProtocol } from '../../lib/movement/protocol'
import { loadHistory, saveAssessment } from '../../lib/movement/history'
import { useDiagnosticCatalogue } from '../../hooks/useDiagnosticClick'
import { useVoiceOutput } from '../../hooks/useVoice'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { disposeDetector } from '../../lib/movement/poseDetector'

type Phase =
  | 'setup'
  | 'calibrate'      // waiting for full body to enter the frame
  | 'instruction'    // movement title + cue, auto-progresses
  | 'countdown'      // 3-2-1
  | 'hold'           // capture peak metrics
  | 'transition'     // captured, advancing to next
  | 'results'

interface Props {
  open:    boolean
  onClose: () => void
}

const COUNTDOWN_S        = 3
const TRANSITION_MS      = 1500
const INSTRUCTION_MS     = 4500   // auto-advance from instruction → countdown
const POSE_STABLE_FRAMES = 18     // ~0.7 s of full-body visibility to start

export function MovementScreen({ open, onClose }: Props) {
  const [phase,        setPhase]        = useState<Phase>('setup')
  const [active,       setActive]       = useState(false)
  const [cameraReady,  setCameraReady]  = useState(false)
  const [cameraError,  setCameraError]  = useState<string | null>(null)
  const [moveIdx,      setMoveIdx]      = useState(0)
  const [countdown,    setCountdown]    = useState(COUNTDOWN_S)
  const [holdProgress, setHoldProgress] = useState(0)   // 0..1
  const [results,      setResults]      = useState<MovementResult[]>([])
  const [summary,      setSummary]      = useState<AssessmentSummary | null>(null)

  // Mutable accumulator for the current movement's peak metrics.
  const peakRef       = useRef<Record<string, number>>({})
  const compsRef      = useRef<Set<string>>(new Set())
  const holdStartRef  = useRef<number | null>(null)
  const lastFrameRef  = useRef<MovementMetrics | null>(null)

  // Pose-stability detector — counts consecutive frames where the full body
  // is visible.  When count crosses POSE_STABLE_FRAMES we auto-progress out
  // of the calibration phase, no clicking required.
  const poseStableRef = useRef<number>(0)
  const [poseQuality, setPoseQuality] = useState<{ visible: number; total: number }>({ visible: 0, total: 0 })

  // (zoom state removed — camera uses object-fit:contain natively)

  const tts = useVoiceOutput()
  // Stable-identity ref to TTS so timer effects don't re-run every render.
  const ttsRef = useRef(tts)
  useEffect(() => { ttsRef.current = tts }, [tts])

  const currentMovement: MovementDef | undefined = MOVEMENTS[moveIdx]

  // ── Reset everything when panel closes ──────────────────────────────────
  useEffect(() => {
    if (!open) {
      setActive(false)
      setPhase('setup')
      setCameraReady(false)
      setCameraError(null)
      setMoveIdx(0)
      setResults([])
      setSummary(null)
      peakRef.current = {}
      compsRef.current = new Set()
      tts.cancel()
      disposeDetector()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Countdown timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('hold')
      holdStartRef.current = performance.now()
      ttsRef.current?.speak(currentMovement?.holdCue ?? 'Hold.')
      return
    }
    ttsRef.current?.speak(String(countdown))
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => window.clearTimeout(t)
    // tts intentionally omitted — accessing via ref avoids re-running this
    // effect every render (which was the "stuck on 3" bug).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown])

  // ── Hold timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'hold' || !currentMovement) return
    let raf = 0
    const tick = () => {
      const elapsed = performance.now() - (holdStartRef.current ?? 0)
      const p = Math.min(1, elapsed / currentMovement.holdMs)
      setHoldProgress(p)
      if (p >= 1) {
        finishCurrentMovement()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentMovement])

  // ── Auto-advance during transition ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'transition') return
    const t = window.setTimeout(() => {
      const next = moveIdx + 1
      if (next >= MOVEMENTS.length) {
        finishAssessment()
      } else {
        setMoveIdx(next)
        peakRef.current = {}
        compsRef.current = new Set()
        setHoldProgress(0)
        setCountdown(COUNTDOWN_S)
        setPhase('instruction')
      }
    }, TRANSITION_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Per-frame landmark callback from CameraView ────────────────────────
  function handleLandmarks(lms: LandmarkSet) {
    // Pose-quality tracker — count how many of the key landmarks are visible.
    // 12 key points: shoulders, hips, knees, ankles, elbows, wrists.
    const keyIdx = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
    const visibleCount = keyIdx.reduce((n, i) => n + ((lms[i]?.visibility ?? 0) >= 0.5 ? 1 : 0), 0)
    if (visibleCount >= 10) poseStableRef.current += 1
    else                    poseStableRef.current = 0
    setPoseQuality({ visible: visibleCount, total: keyIdx.length })

    // Auto-advance from calibration once we've seen a stable full body.
    if (phase === 'calibrate' && poseStableRef.current >= POSE_STABLE_FRAMES) {
      setPhase('instruction')
    }

    if (!currentMovement) return
    const metrics = currentMovement.analyse(lms)
    lastFrameRef.current = metrics
    if (!metrics.valid) return
    if (phase !== 'hold') return

    // Track peak across the hold.
    for (const [k, v] of Object.entries(metrics.values)) {
      const prev = peakRef.current[k]
      const bench = currentMovement.benchmarks[k]
      if (!bench) { peakRef.current[k] = v; continue }
      if (prev === undefined) { peakRef.current[k] = v; continue }
      // higherIsBetter → keep max; else keep min (worst comp / smallest deficit value)
      peakRef.current[k] = bench.higherIsBetter ? Math.max(prev, v) : Math.min(prev, v)
    }
    metrics.compensations.forEach((c) => compsRef.current.add(c))
  }

  // ── Auto-advance from instruction → countdown after the cue is read ────
  useEffect(() => {
    if (phase !== 'instruction' || !currentMovement) return
    ttsRef.current?.speak(`${currentMovement.title}. ${currentMovement.instruction}`)
    const t = window.setTimeout(() => {
      setCountdown(COUNTDOWN_S)
      setPhase('countdown')
    }, INSTRUCTION_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentMovement])

  function finishCurrentMovement() {
    if (!currentMovement) return
    // Special-case neck rotation asymmetry — both sides come from the same hold.
    if (currentMovement.id === 'neck_rotation') {
      const L = peakRef.current.L_rotation_deg ?? 0
      const R = peakRef.current.R_rotation_deg ?? 0
      peakRef.current.asymmetry = L === 0 || R === 0 ? 0 : 1 - Math.abs(L - R) / Math.max(L, R)
    }
    const result = scoreMovement(currentMovement, { ...peakRef.current }, [...compsRef.current])
    setResults((prev) => [...prev, result])
    setPhase('transition')
  }

  function finishAssessment() {
    const sum = summariseAssessment(MOVEMENTS, results)
    setSummary(sum)
    saveAssessment(sum)
    setPhase('results')
    setActive(false)
    tts.speak(`Assessment complete. Your Movement Score is ${sum.movementScore}.`)
  }

  function startAssessment() {
    setActive(true)
    setPhase('calibrate')           // wait for full body in frame
    setMoveIdx(0)
    setCountdown(COUNTDOWN_S)
    setResults([])
    setSummary(null)
    peakRef.current = {}
    compsRef.current = new Set()
    poseStableRef.current = 0
  }

  function restartAssessment() {
    setSummary(null)
    setResults([])
    startAssessment()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/80 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-orange-400" />
          <span className="text-sm font-semibold tracking-wide">Movement Assessment</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {phase !== 'results' && phase !== 'setup' && (
            <span>{moveIdx + 1} / {MOVEMENTS.length}</span>
          )}
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-800 hover:text-white" title="Close">
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden">
        {phase === 'setup' && (
          <SetupView onStart={startAssessment} error={cameraError} />
        )}

        {phase !== 'setup' && phase !== 'results' && (
          <>
            {/* Camera — object-fit:contain preserves full sensor FOV without cropping */}
            <div className="relative h-full w-full">
              <CameraView
                active={active}
                onLandmarks={handleLandmarks}
                onReady={() => setCameraReady(true)}
                onError={(m) => { setCameraError(m); setActive(false); setPhase('setup') }}
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="text-sm text-slate-300">Initialising pose model…</div>
                </div>
              )}
              {phase === 'calibrate' && cameraReady && (
                <CalibrationOverlay quality={poseQuality} stableFrames={poseStableRef.current} threshold={POSE_STABLE_FRAMES} />
              )}
              <ProgressDots total={MOVEMENTS.length} done={moveIdx} />
            </div>

            {/* Movement HUD overlay */}
            <MovementHUD
              phase={phase}
              movement={currentMovement}
              countdown={countdown}
              holdProgress={holdProgress}
            />
          </>
        )}

        {phase === 'results' && summary && (
          <ResultsView
            summary={summary}
            onRestart={restartAssessment}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

// ── SetupView ────────────────────────────────────────────────────────────────

function SetupView({ onStart, error }: { onStart: () => void; error: string | null }) {
  return (
    <div className="m-auto max-w-md space-y-4 px-6 text-center">
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-orange-500/20 p-4 ring-2 ring-orange-500/40">
          <Camera size={28} className="text-orange-400" />
        </div>
      </div>
      <h2 className="text-xl font-semibold">Movement Assessment</h2>
      <p className="text-sm text-slate-400">
        Six standardized movements, ~3 minutes, fully on-device. We'll measure your range of motion,
        symmetry, and any compensation patterns, then build you a personalized 5-minute daily protocol.
      </p>
      <div className="space-y-1 rounded-md bg-slate-900 p-3 text-left text-xs text-slate-300">
        <div className="font-semibold text-slate-100">Before you start</div>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>Prop your phone or laptop so the camera can see your full body</li>
          <li>Stand 6–8 feet back, in good lighting</li>
          <li>Wear comfortable clothes that don't hide joints</li>
          <li>Stop any movement that causes pain — this is a screen, not a treatment</li>
        </ul>
      </div>
      {error && (
        <div className="rounded border border-red-700 bg-red-950/50 p-2 text-xs text-red-300">
          <AlertTriangle size={12} className="mr-1 inline" /> {error}
        </div>
      )}
      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400"
      >
        <Play size={14} /> Start assessment
      </button>
      <div className="text-[10px] text-slate-500">
        Your video stays on your device — pose landmarks are computed in your browser.
      </div>
    </div>
  )
}

// ── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ total, done }: { total: number; done: number }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-6 rounded-full ${i < done ? 'bg-orange-400' : i === done ? 'bg-orange-300/70 animate-pulse' : 'bg-slate-700'}`}
        />
      ))}
    </div>
  )
}

// ── Calibration overlay ──────────────────────────────────────────────────────
// Big silhouette + status banner.  Auto-advances to instruction once the
// landmark visibility count crosses POSE_STABLE_FRAMES.

function CalibrationOverlay({
  quality, stableFrames, threshold,
}: {
  quality: { visible: number; total: number }
  stableFrames: number
  threshold: number
}) {
  const ready = stableFrames >= threshold
  const progress = Math.min(1, stableFrames / threshold)
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      {/* Body silhouette guide */}
      <svg viewBox="0 0 200 480" className="h-[78%] opacity-60">
        <ellipse cx="100" cy="40"  rx="22" ry="28" fill="none" stroke={ready ? '#10b981' : '#fb923c'} strokeWidth="2.5" strokeDasharray="6 6" />
        <path
          d="M 80 70 L 60 90 L 30 200 M 120 70 L 140 90 L 170 200    M 80 70 L 80 240 L 70 470  M 120 70 L 120 240 L 130 470  M 80 240 L 120 240"
          fill="none" stroke={ready ? '#10b981' : '#fb923c'} strokeWidth="3" strokeDasharray="8 6" strokeLinecap="round"
        />
      </svg>

      <div className="absolute bottom-16 max-w-md rounded-lg bg-black/75 px-4 py-3 text-center backdrop-blur">
        <div className={`text-sm font-semibold ${ready ? 'text-emerald-300' : 'text-orange-300'}`}>
          {ready ? 'Got you — starting the assessment' : 'Stand back so your full body fits the outline'}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Detected {quality.visible} / {quality.total} key landmarks
        </div>
        <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-orange-400 transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Zoom slider ──────────────────────────────────────────────────────────────

function ZoomSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-md bg-black/70 px-2 py-1.5 backdrop-blur">
      <span className="text-[10px] text-slate-300">Zoom</span>
      <input
        type="range"
        min={0.5}
        max={1.6}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 accent-orange-500"
      />
      <span className="w-10 text-right text-[10px] tabular-nums text-slate-300">{value.toFixed(2)}×</span>
    </div>
  )
}

// ── Movement HUD overlay ─────────────────────────────────────────────────────

function MovementHUD({
  phase, movement, countdown, holdProgress,
}: {
  phase: Phase
  movement?: MovementDef
  countdown: number
  holdProgress: number
}) {
  if (!movement) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {(phase === 'instruction' || phase === 'countdown' || phase === 'hold') && (
        <div className="m-3 max-w-sm self-start rounded-lg bg-black/70 p-3 backdrop-blur">
          <div className="text-[10px] uppercase tracking-wider text-orange-400">Movement</div>
          <div className="mt-0.5 text-base font-semibold">{movement.title}</div>
          <p className="mt-1 text-xs text-slate-200">{movement.instruction}</p>
          {phase === 'instruction' && (
            <div className="mt-2 text-[11px] text-emerald-300">Get into position — auto-starting…</div>
          )}
        </div>
      )}

      {phase === 'countdown' && (
        <div className="m-auto flex h-32 w-32 items-center justify-center rounded-full bg-orange-500/20 ring-4 ring-orange-500/60">
          <span className="text-6xl font-bold text-orange-200">{countdown}</span>
        </div>
      )}

      {phase === 'hold' && (
        <div className="mb-6 mt-auto self-center rounded-full bg-black/70 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-orange-200">{movement.holdCue}</div>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-orange-400 transition-all"
                   style={{ width: `${holdProgress * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {phase === 'transition' && (
        <div className="m-auto flex items-center gap-2 rounded-full bg-emerald-500/30 px-4 py-2 ring-2 ring-emerald-500/60">
          <ChevronRight size={18} className="text-emerald-200" />
          <span className="text-sm font-semibold text-emerald-100">Captured — next movement</span>
        </div>
      )}
    </div>
  )
}

// ── Results view ─────────────────────────────────────────────────────────────

function ResultsView({
  summary, onRestart, onClose,
}: {
  summary:   AssessmentSummary
  onRestart: () => void
  onClose:   () => void
}) {
  const catalogue = useDiagnosticCatalogue()
  const protocol = useMemo<DailyProtocol>(() => generateProtocol(summary.findings), [summary.findings])
  const history = useMemo(() => loadHistory(), [])
  const muscleNameOf = (id: string) => {
    const m = catalogue?.find((x) => x.muscle_id === id)
    return m?.common_name ?? id.replace(/_/g, ' ')
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        {/* Score hero */}
        <div className="rounded-lg border border-orange-700/40 bg-gradient-to-br from-orange-900/40 to-slate-900 p-6 text-center">
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-orange-300">
            <Award size={12} /> Movement Score
          </div>
          <div className="text-7xl font-bold text-orange-200 tabular-nums">{summary.movementScore}</div>
          <div className="mt-2 text-xs text-slate-300">{scoreBand(summary.movementScore)}</div>
          <div className="mt-3 text-[10px] text-slate-500">
            Saved to history — {history.length} {history.length === 1 ? 'session' : 'sessions'} total
          </div>
        </div>

        {/* Per-movement breakdown */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-slate-200">Movements</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {summary.results.map((r) => (
              <div key={r.movementId} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-100">{r.title}</div>
                  <div className={`text-sm font-bold tabular-nums ${scoreColor(r.score)}`}>{r.score}</div>
                </div>
                {r.compensations.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[10px] text-amber-300">
                    {r.compensations.map((c, i) => <li key={i}>• {c}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Findings */}
        {summary.findings.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold tracking-wide text-slate-200">What we found</h3>
            <div className="space-y-1.5">
              {summary.findings.slice(0, 6).map((f) => (
                <div key={f.muscle_id} className="rounded-md bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-slate-100">{muscleNameOf(f.muscle_id)}</div>
                    <div className="text-[10px] text-slate-400">severity {Math.round(f.severity * 100)}%</div>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-300">
                    {f.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Protocol */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-slate-200">
            Your daily protocol  <span className="ml-1 text-[10px] font-normal text-slate-500">~{Math.round(protocol.totalSeconds / 60)} min</span>
          </h3>
          <div className="space-y-1.5">
            {protocol.items.map((it) => (
              <div key={it.exercise.id} className="flex gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-2xl">{it.exercise.emoji ?? '•'}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-100">{it.exercise.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      {it.exercise.intent} · {it.exercise.dose}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-300">{it.exercise.cue}</div>
                  {it.rationale && (
                    <div className="mt-1 text-[10px] text-orange-300/70">→ {it.rationale}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trend */}
        {history.length > 1 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold tracking-wide text-slate-200">Score trend</h3>
            <ScoreTrend points={history.map((h) => h.movementScore)} />
          </section>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
          >
            <RefreshCw size={12} /> Run again
          </button>
          <button
            onClick={() => exportSummaryJson(summary)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
          >
            <FileDown size={12} /> Export JSON
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded-md bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-400"
          >
            Done
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          This is an automated screen, not a medical diagnosis. Persistent or worsening symptoms warrant in-person evaluation.
        </p>
      </div>
    </div>
  )
}

// ── ScoreTrend (very simple inline SVG sparkline) ───────────────────────────

function ScoreTrend({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 600, h = 80, pad = 8
  const min = 0, max = 100
  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1))
  const ys = points.map((p) => h - pad - ((p - min) * (h - pad * 2)) / (max - min))
  const d  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <path d={d} fill="none" stroke="#fb923c" strokeWidth="2" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="3" fill="#fb923c" />
      ))}
    </svg>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function scoreBand(s: number): string {
  if (s >= 85) return 'Excellent — keep maintaining.'
  if (s >= 70) return 'Good — small wins available.'
  if (s >= 55) return 'Fair — clear opportunities to improve.'
  return 'Restricted — protocol below should noticeably help in 2–4 weeks.'
}
function scoreColor(s: number): string {
  if (s >= 80) return 'text-emerald-300'
  if (s >= 60) return 'text-orange-300'
  return 'text-red-300'
}

function exportSummaryJson(summary: AssessmentSummary) {
  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `movement-assessment-${summary.completedAt.slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
