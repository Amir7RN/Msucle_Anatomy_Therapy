/**
 * BodyScanView.tsx
 *
 * Guided, on-device camera body scan. Walks the user through a front A-pose and
 * a side pose, captures a few seconds of pose landmarks for each, then runs
 * `analyzeBodyScan` to produce an HONEST body-composition estimate (with a
 * range) plus the geometry we trust (symmetry, posture, build ratios).
 *
 * Nothing leaves the device — same single-camera MediaPipe pipeline the rest of
 * the app uses. The results screen is explicit that this is an estimate, not a
 * medical measurement.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X, Scan, Camera, Check, ArrowRight, RefreshCw, Info } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { LM } from '../../lib/movement/landmarks'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { disposeDetector } from '../../lib/movement/poseDetector'
import { analyzeBodyScan, type BodyScanInput, type BodyScanResult } from '../../lib/profile/bodyScan'
import { BUILD_LABEL } from '../../lib/profile/userProfile'

type Phase = 'intro' | 'front' | 'side' | 'analyzing' | 'result' | 'error'

const CAPTURE_MS = 3200          // how long each pose collects frames
const MIN_VIS    = 0.6           // torso-anchor visibility to accept a frame

interface Props {
  open:     boolean
  input:    BodyScanInput
  onClose:  () => void
  onResult: (r: BodyScanResult) => void
}

function torsoVisible(lms: LandmarkSet): boolean {
  const ids = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP]
  return ids.every((i) => (lms[i]?.visibility ?? 0) >= MIN_VIS)
}

export function BodyScanView({ open, input, onClose, onResult }: Props) {
  const [phase, setPhase]       = useState<Phase>('intro')
  const [cameraReady, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [progress, setProgress] = useState(0)      // 0..1 within current capture
  const [seen, setSeen]         = useState(false)  // torso currently visible
  const [result, setResult]     = useState<BodyScanResult | null>(null)
  const [errMsg, setErrMsg]     = useState<string | null>(null)

  const frontFrames = useRef<LandmarkSet[]>([])
  const sideFrames  = useRef<LandmarkSet[]>([])
  const captureRef  = useRef<{ active: boolean; which: 'front' | 'side'; start: number }>({ active: false, which: 'front', start: 0 })

  // Reset everything whenever the modal is (re)opened / closed.
  useEffect(() => {
    if (open) {
      setPhase('intro'); setReady(false); setCapturing(false); setProgress(0)
      setResult(null); setErrMsg(null)
      frontFrames.current = []; sideFrames.current = []
      captureRef.current = { active: false, which: 'front', start: 0 }
    } else {
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
      disposeDetector()
    }
  }, [open])

  const startCapture = useCallback((which: 'front' | 'side') => {
    if (which === 'front') frontFrames.current = []
    else sideFrames.current = []
    captureRef.current = { active: true, which, start: performance.now() }
    setCapturing(true); setProgress(0)
  }, [])

  const finishCapture = useCallback((which: 'front' | 'side') => {
    captureRef.current.active = false
    setCapturing(false); setProgress(1)
    if (which === 'front') {
      setPhase('side')
    } else {
      // Analyze.
      setPhase('analyzing')
      window.setTimeout(() => {
        try {
          const r = analyzeBodyScan(frontFrames.current, sideFrames.current, input)
          if (!r.ok) { setErrMsg(r.note); setPhase('error'); return }
          setResult(r); setPhase('result')
        } catch (e) {
          setErrMsg(e instanceof Error ? e.message : 'Scan failed — please retry.')
          setPhase('error')
        }
      }, 350)
    }
  }, [input])

  const handleLandmarks = useCallback((lms: LandmarkSet) => {
    const vis = torsoVisible(lms)
    setSeen(vis)
    const cap = captureRef.current
    if (!cap.active) return
    if (vis) {
      if (cap.which === 'front') frontFrames.current.push(lms)
      else sideFrames.current.push(lms)
    }
    const t = (performance.now() - cap.start) / CAPTURE_MS
    setProgress(Math.min(1, t))
    if (t >= 1) finishCapture(cap.which)
  }, [finishCapture])

  if (!open) return null

  const cameraActive = phase === 'front' || phase === 'side'

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gradient-to-b from-slate-950 to-black text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/70 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Scan size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">Body Scan</span>
          <span className="ml-1 rounded-full bg-slate-700/40 px-2 py-0.5 text-[10px] text-slate-300">on-device · private</span>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-800" title="Close"><X size={16} /></button>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Camera / illustration column */}
        <div className="relative h-[46vh] w-full shrink-0 bg-black lg:h-auto lg:flex-1">
          {cameraActive ? (
            <>
              <CameraView active onLandmarks={handleLandmarks} onReady={() => setReady(true)} onError={(m) => { setErrMsg(m); setPhase('error') }} />
              {/* capture overlay */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
                <div className={['rounded-full px-3 py-1 text-xs font-semibold backdrop-blur',
                  seen ? 'bg-emerald-600/70 text-white' : 'bg-orange-700/70 text-orange-100'].join(' ')}>
                  {seen ? 'Body in frame' : 'Step back — get your whole body in frame'}
                </div>
                {capturing && (
                  <div className="w-full max-w-xs">
                    <div className="mb-1 text-center text-xs text-cyan-200">Hold still — capturing…</div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center p-6 text-center">
              <PhaseArt phase={phase} />
            </div>
          )}
        </div>

        {/* Instruction / result column */}
        <div className="flex w-full flex-col gap-3 overflow-y-auto p-5 lg:w-[380px] lg:border-l lg:border-slate-800">
          {phase === 'intro' && (
            <Intro onStart={() => setPhase('front')} input={input} />
          )}

          {phase === 'front' && (
            <Step
              n={1} title="Front pose"
              body="Stand facing the camera, feet hip-width, arms a few inches out from your sides (a relaxed A-pose). Get your whole body in frame."
              ready={cameraReady} seen={seen} capturing={capturing}
              onCapture={() => startCapture('front')}
            />
          )}

          {phase === 'side' && (
            <Step
              n={2} title="Side pose"
              body="Turn 90° so your side faces the camera. Stand tall and look straight ahead. Get your whole body in frame."
              ready={cameraReady} seen={seen} capturing={capturing}
              onCapture={() => startCapture('side')}
            />
          )}

          {phase === 'analyzing' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="animate-spin text-cyan-400" size={28} />
              <div className="text-sm text-slate-300">Analyzing your scan…</div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="text-sm text-orange-300">{errMsg ?? 'Something went wrong.'}</div>
              <button onClick={() => setPhase('intro')} className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">Try again</button>
            </div>
          )}

          {phase === 'result' && result && (
            <ResultView result={result} onSave={() => { onResult(result); onClose() }} onRetry={() => setPhase('intro')} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function Intro({ onStart, input }: { onStart: () => void; input: BodyScanInput }) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Scan your body in ~10 seconds</h2>
      <p className="text-sm text-slate-300">
        Two quick poses let the camera read your build, left/right symmetry and posture,
        and pair it with your height and weight for a body-composition estimate.
      </p>
      <ul className="space-y-1.5 text-sm text-slate-300">
        <li className="flex items-center gap-2"><Camera size={14} className="text-cyan-400" /> Front A-pose</li>
        <li className="flex items-center gap-2"><ArrowRight size={14} className="text-cyan-400" /> Side pose</li>
      </ul>
      <div className="rounded-lg bg-slate-900/70 p-2.5 text-[11px] text-slate-400">
        Using height <span className="text-slate-200">{input.heightCm} cm</span>,
        weight <span className="text-slate-200">{input.weightKg} kg</span>
        {input.ageYears != null && <>, age <span className="text-slate-200">{input.ageYears}</span></>}.
        Update these in your profile for a better estimate.
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-amber-950/40 p-2.5 text-[11px] text-amber-200/90 ring-1 ring-amber-700/30">
        <Info size={13} className="mt-0.5 shrink-0" />
        A single camera can't measure body fat the way a clinic can — you'll get an estimate
        with a range, never a medical reading.
      </div>
      <button onClick={onStart} className="mt-auto rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold hover:bg-cyan-500">
        Start scan
      </button>
    </div>
  )
}

function Step({
  n, title, body, ready, seen, capturing, onCapture,
}: {
  n: number; title: string; body: string
  ready: boolean; seen: boolean; capturing: boolean; onCapture: () => void
}) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold">{n}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-slate-300">{body}</p>
      <button
        onClick={onCapture}
        disabled={!ready || !seen || capturing}
        className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold enabled:hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {capturing ? 'Capturing…' : !ready ? 'Starting camera…' : !seen ? 'Step into frame…' : 'Capture'}
      </button>
    </div>
  )
}

function ResultView({ result, onSave, onRetry }: { result: BodyScanResult; onSave: () => void; onRetry: () => void }) {
  const c = result.composition
  const s = result.scan
  const conf = Math.round(c.confidence * 100)
  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Your body read</h2>

      {/* Body fat estimate with range */}
      <div className="rounded-lg bg-slate-900/70 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wider text-cyan-300">Body-fat estimate</span>
          <span className="text-[10px] text-slate-500">{conf}% confidence</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{c.bodyFatPct}%</span>
          <span className="text-xs text-slate-400">range {c.bodyFatLow}–{c.bodyFatHigh}%</span>
        </div>
        {c.build && (
          <div className="mt-1 text-xs text-slate-300">Build: <span className="font-semibold">{BUILD_LABEL[c.build]}</span>
            {c.leanMassKg != null && <> · ~{c.leanMassKg} kg lean mass</>}</div>
        )}
      </div>

      {/* Geometry the camera trusts */}
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Symmetry" value={s.symmetry != null ? `${Math.round(s.symmetry * 100)}%` : '—'}
          hint={s.asymRegion ? `watch: ${s.asymRegion.replace(/_/g, ' ')}` : 'evenly matched'} />
        <Metric label="Shoulder : hip" value={s.shoulderHipRatio != null ? `${s.shoulderHipRatio}` : '—'} hint="V-taper proxy" />
        <Metric label="Posture" value={s.posture?.forwardHead ? 'Forward head' : 'Neutral'} hint="from side pose" />
        <Metric label="Muscularity" value={c.muscleIndex != null ? `${Math.round(c.muscleIndex * 100)}%` : '—'} hint="lean-mass index" />
      </div>

      <p className="text-[11px] text-slate-400">{result.note}</p>

      <div className="mt-auto flex gap-2">
        <button onClick={onRetry} className="flex-1 rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-semibold hover:bg-slate-700">Rescan</button>
        <button onClick={onSave} className="flex flex-[1.5] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold hover:bg-emerald-500">
          <Check size={15} /> Save to profile
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-slate-900/70 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-500">{hint}</div>
    </div>
  )
}

function PhaseArt({ phase }: { phase: Phase }) {
  return (
    <div className="flex flex-col items-center gap-3 text-slate-500">
      <Scan size={56} className="text-slate-700" />
      <div className="text-xs">
        {phase === 'analyzing' ? 'Crunching the numbers…' : 'Camera preview appears here during capture.'}
      </div>
    </div>
  )
}
