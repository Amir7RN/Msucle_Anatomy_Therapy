/**
 * BodyScanView.tsx  (v2 — auto-capture, voice-coached, AI-assisted)
 *
 * A hands-free, on-device body scan. The user never taps "capture": a spoken
 * coach guides them into frame, and each pose is captured automatically once
 * the WHOLE BODY is in view and held STILL for a couple of seconds. It walks
 * through three poses — front, side, back — then produces an HONEST body read.
 *
 *   • Voice coach (Web Speech) — "step back so I can see your whole body",
 *     "hold still… 3, 2, 1", "now turn to your side", "now show me your back".
 *   • Auto-capture — full-body visibility + low motion for HOLD_MS triggers it.
 *   • AI assist — if the user's stored Anthropic key is present, a still from
 *     each pose is sent to Claude vision for a body-composition read that is
 *     BLENDED with the geometric (BMI + build) estimate. No key → geometry only.
 *
 * Everything stays a private, on-device estimate with a range — never a medical
 * measurement.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X, Scan, Check, RefreshCw, Info, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { LM } from '../../lib/movement/landmarks'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { disposeDetector } from '../../lib/movement/poseDetector'
import { useVoiceOutput } from '../../hooks/useVoice'
import { analyzeBodyScan, type BodyScanInput, type BodyScanResult } from '../../lib/profile/bodyScan'
import {
  grabStillBase64, estimateCompositionVision, blendComposition, bodyVisionEnabled,
} from '../../lib/profile/bodyVision'
import { BUILD_LABEL } from '../../lib/profile/userProfile'

const POSES = ['front', 'side', 'back'] as const
type Pose = typeof POSES[number]
type Phase = 'intro' | Pose | 'analyzing' | 'result' | 'error'

const HOLD_MS         = 2000   // hold still this long (ms) to auto-capture a pose
const STILL_MOTION    = 0.022  // mean normalised joint motion below this = "still" (was 0.014 — too strict; natural sway never settled)
const ALMOST_MOTION   = 0.05   // between STILL_MOTION and this = "almost steady": nudge, don't hard-reset the hold
const VIS_MIN         = 0.5    // per-landmark visibility floor to count as "in frame" (was 0.55)
const AUTO_CAPTURE_MS = 7000   // in frame this long but never perfectly still → capture anyway so the scan ALWAYS finishes
const HINT_EVERY      = 4000   // ms between spoken nudges

const POSE_COPY: Record<Pose, { title: string; enter: string; hint: string; body: string }> = {
  front: {
    title: 'Front', enter: 'Stand facing the camera and step back until your whole body is in view.',
    hint: 'Step back so I can see your whole body.',
    body: 'Face the camera, feet hip-width, arms a few inches from your sides.',
  },
  side: {
    title: 'Side', enter: 'Great. Now turn to your right so your side faces the camera.',
    hint: 'Turn to your side — keep your whole body in view.',
    body: 'Turn 90° to your right. Stand tall, look ahead.',
  },
  back: {
    title: 'Back', enter: 'Now turn all the way around so your back faces the camera.',
    hint: 'Face away from the camera, whole body in view.',
    body: 'Turn around so your back is to the camera.',
  },
}

interface Props {
  open:     boolean
  input:    BodyScanInput
  onClose:  () => void
  onResult: (r: BodyScanResult) => void
}

type FrameMiss = 'none' | 'legs' | 'head' | 'side' | 'center'
interface FrameCheck { ok: boolean; miss: FrameMiss }

/**
 * Is the whole body usefully in frame? Forgiving by design: we need the torso
 * (both shoulders + both hips) plus the lower body via knees OR ankles — so a
 * borderline knee reading no longer dead-ends the scan. When something is
 * missing we report WHAT, so the coach gives a cue the user can act on
 * ("step back, I need your legs") instead of a vague, unactionable "step back".
 */
function frameCheck(lms: LandmarkSet): FrameCheck {
  const vis = (i: number) => (lms[i]?.visibility ?? 0) >= VIS_MIN
  const torso = vis(LM.L_SHOULDER) && vis(LM.R_SHOULDER) && vis(LM.L_HIP) && vis(LM.R_HIP)
  if (!torso) {
    // One side clipped vs. just not far enough back / off-centre?
    const left  = (lms[LM.L_SHOULDER]?.visibility ?? 0) + (lms[LM.L_HIP]?.visibility ?? 0)
    const right = (lms[LM.R_SHOULDER]?.visibility ?? 0) + (lms[LM.R_HIP]?.visibility ?? 0)
    return { ok: false, miss: Math.abs(left - right) > 0.6 ? 'side' : 'center' }
  }
  const lowerBody = (vis(LM.L_KNEE) && vis(LM.R_KNEE)) || (vis(LM.L_ANKLE) && vis(LM.R_ANKLE))
  if (!lowerBody) return { ok: false, miss: 'legs' }
  if (!vis(LM.NOSE)) return { ok: false, miss: 'head' }
  return { ok: true, miss: 'none' }
}

/** Specific, actionable spoken/on-screen cue per missing region. */
const MISS_CUE: Record<FrameMiss, string> = {
  none:   'Hold still…',
  legs:   'Step back so I can see your legs.',
  head:   "I can't see your head — step into view.",
  side:   'Part of you is cut off — center yourself in the frame.',
  center: 'Step back into the middle of the frame.',
}

/** Mean normalised image motion of key joints between two frames. */
function motionOf(prev: LandmarkSet | null, cur: LandmarkSet): number {
  if (!prev) return 1
  const ids = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_WRIST, LM.R_WRIST]
  let sum = 0, n = 0
  for (const i of ids) {
    const a = prev[i], b = cur[i]
    if (!a || !b) continue
    sum += Math.hypot(a.x - b.x, a.y - b.y); n++
  }
  return n ? sum / n : 1
}

export function BodyScanView({ open, input, onClose, onResult }: Props) {
  const [phase, setPhase]       = useState<Phase>('intro')
  const [cameraReady, setReady] = useState(false)
  const [progress, setProgress] = useState(0)     // 0..1 hold progress
  const [inFrame, setInFrame]   = useState(false)
  const [hint, setHint]         = useState('')
  const [result, setResult]     = useState<BodyScanResult | null>(null)
  const [errMsg, setErrMsg]     = useState<string | null>(null)
  const [voiceOn, setVoiceOn]   = useState(true)

  const voice = useVoiceOutput()

  // Per-pose collected frames + captured stills (base64 JPEG).
  const frames = useRef<Record<Pose, LandmarkSet[]>>({ front: [], side: [], back: [] })
  const stills = useRef<Record<Pose, string | null>>({ front: null, side: null, back: null })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const prevLms      = useRef<LandmarkSet | null>(null)
  const holdStart    = useRef<number | null>(null)
  const visibleStart = useRef<number | null>(null)   // when the body first became fully in-frame (for the safety-net auto-capture)
  const progressRef  = useRef(0)                      // mirror of `progress` readable inside the frame callback
  const spokeHold    = useRef(false)
  const lastHint     = useRef(0)
  const phaseRef     = useRef<Phase>('intro')
  const busy         = useRef(false)   // guards the async analyze
  useEffect(() => { phaseRef.current = phase }, [phase])

  const say = useCallback((text: string) => {
    if (!voiceOn) return
    try { voice.speak(text) } catch { /* ignore */ }
  }, [voice, voiceOn])

  // Reset on open/close.
  useEffect(() => {
    if (open) {
      setPhase('intro'); setReady(false); setProgress(0); setInFrame(false)
      setResult(null); setErrMsg(null); setHint('')
      frames.current = { front: [], side: [], back: [] }
      stills.current = { front: null, side: null, back: null }
      prevLms.current = null; holdStart.current = null; visibleStart.current = null
      progressRef.current = 0; spokeHold.current = false
      busy.current = false
    } else {
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
      disposeDetector()
    }
  }, [open])

  // Speak the instruction when entering each pose.
  useEffect(() => {
    if (!open) return
    if (phase === 'front' || phase === 'side' || phase === 'back') {
      holdStart.current = null; visibleStart.current = null; spokeHold.current = false
      progressRef.current = 0; setProgress(0)
      frames.current[phase] = []
      say(POSE_COPY[phase].enter)
    } else if (phase === 'analyzing') {
      say('All done. Analyzing your scan.')
    }
  }, [phase, open, say])

  const finalize = useCallback((pose: Pose) => {
    // Guard: the frame callback can fire again before React flushes the phase
    // change, which would capture the same pose twice. Advancing phaseRef
    // synchronously makes the next callback no-op for this pose.
    if (phaseRef.current !== pose) return
    holdStart.current = null; visibleStart.current = null
    progressRef.current = 1; setProgress(1)
    // Grab a still for the AI vision pass (best-effort).
    if (videoRef.current) stills.current[pose] = grabStillBase64(videoRef.current)
    say('Got it.')
    const idx  = POSES.indexOf(pose)
    const next = idx < POSES.length - 1 ? POSES[idx + 1] : 'analyzing'
    phaseRef.current = next
    setPhase(next)
  }, [say])

  const handleLandmarks = useCallback((lms: LandmarkSet) => {
    const ph = phaseRef.current
    if (ph !== 'front' && ph !== 'side' && ph !== 'back') return
    const motion = motionOf(prevLms.current, lms)
    prevLms.current = lms
    const now = performance.now()

    const fc = frameCheck(lms)
    setInFrame(fc.ok)

    // ── Not (yet) fully in frame → reset the hold and give a SPECIFIC cue ────
    if (!fc.ok) {
      holdStart.current = null
      visibleStart.current = null
      if (progressRef.current !== 0) { progressRef.current = 0; setProgress(0) }
      spokeHold.current = false
      const cue = MISS_CUE[fc.miss]
      setHint(cue)
      if (now - lastHint.current > HINT_EVERY) { lastHint.current = now; say(cue) }
      return
    }

    // ── Fully in frame ──────────────────────────────────────────────────────
    // Always collect frames while visible so analysis and any forced capture
    // have good data (the old code only kept frames during a perfect hold).
    if (visibleStart.current === null) visibleStart.current = now
    frames.current[ph].push(lms)
    if (frames.current[ph].length > 90) frames.current[ph].shift()   // keep ~last 3s

    if (motion < STILL_MOTION) {
      // Steady → accrue hold progress toward auto-capture.
      if (holdStart.current === null) {
        holdStart.current = now
        if (!spokeHold.current) { spokeHold.current = true; say('Perfect — hold still.') }
      }
      const p = Math.min(1, (now - holdStart.current) / HOLD_MS)
      progressRef.current = p; setProgress(p)
      setHint('Hold still…')
      if (p >= 1) { finalize(ph); return }
    } else {
      // Visible but moving. Small motion → keep the hold (forgive a wobble);
      // big motion → reset and encourage. Either way the user sees they're close.
      if (motion > ALMOST_MOTION && holdStart.current !== null) {
        holdStart.current = null
        if (progressRef.current !== 0) { progressRef.current = 0; setProgress(0) }
      }
      setHint(motion > ALMOST_MOTION ? 'Almost — hold steady.' : 'Steady…')
    }

    // ── Safety net ──────────────────────────────────────────────────────────
    // In frame for a long time but never perfectly still → capture anyway, so
    // the scan can NEVER dead-end with no feedback and no way to finish.
    if (visibleStart.current !== null && now - visibleStart.current > AUTO_CAPTURE_MS) {
      finalize(ph)
    }
  }, [finalize, say])

  // Run analysis when we reach the analyzing phase.
  useEffect(() => {
    if (phase !== 'analyzing' || busy.current) return
    busy.current = true
    void (async () => {
      try {
        const geo = analyzeBodyScan(frames.current.front, frames.current.side, input, frames.current.back)
        if (!geo.ok || geo.composition.bodyFatPct == null) {
          setErrMsg(geo.note || 'Could not read your body clearly — please retry in good lighting.')
          setPhase('error'); return
        }
        // Capture before the await (TS narrowing wouldn't survive it).
        const geoBf = geo.composition.bodyFatPct
        const geoConf = geo.composition.confidence
        const geoBuild = geo.composition.build ?? 'average'
        // Optional Claude-vision refinement (uses the stored key; null if none).
        const vision = await estimateCompositionVision(
          { front: stills.current.front, side: stills.current.side, back: stills.current.back },
          input,
        )
        const blended = blendComposition(
          { bodyFatPct: geoBf, confidence: geoConf, build: geoBuild },
          vision,
        )
        const leanMassKg = +(input.weightKg * (1 - blended.bodyFatPct / 100)).toFixed(1)
        const merged: BodyScanResult = {
          ...geo,
          composition: {
            ...geo.composition,
            bodyFatPct: blended.bodyFatPct,
            bodyFatLow: blended.bodyFatLow,
            bodyFatHigh: blended.bodyFatHigh,
            confidence: blended.confidence,
            build: blended.build,
            method: blended.method,
            leanMassKg,
          },
          note: vision
            ? 'Camera + AI estimate (your Anthropic key). Use the range, not the single number — a tape measure or DEXA is more precise.'
            : geo.note,
        }
        setResult(merged)
        setPhase('result')
        say('Here is your body read.')
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : 'Scan failed — please retry.')
        setPhase('error')
      } finally {
        busy.current = false
      }
    })()
  }, [phase, input, say])

  if (!open) return null

  const cameraActive = phase === 'front' || phase === 'side' || phase === 'back'
  const stepNum = cameraActive ? POSES.indexOf(phase as Pose) + 1 : 0

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gradient-to-b from-slate-950 to-black text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/70 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Scan size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">Body Scan</span>
          <span className="ml-1 rounded-full bg-slate-700/40 px-2 py-0.5 text-[10px] text-slate-300">on-device · private</span>
          {bodyVisionEnabled() && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-violet-500/30">AI assist on</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setVoiceOn((v) => !v)} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" title={voiceOn ? 'Mute coach' : 'Unmute coach'}>
            {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-800" title="Close"><X size={16} /></button>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Camera / illustration column */}
        <div className="relative h-[48vh] w-full shrink-0 bg-black lg:h-auto lg:flex-1">
          {cameraActive ? (
            <>
              <CameraView
                active
                onLandmarks={handleLandmarks}
                onReady={() => setReady(true)}
                onError={(m) => { setErrMsg(m); setPhase('error') }}
                onVideoReady={(v) => { videoRef.current = v }}
              />
              {/* Auto-capture overlay */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
                <div className={['rounded-full px-3 py-1 text-xs font-semibold backdrop-blur',
                  inFrame ? 'bg-emerald-600/80 text-white' : 'bg-orange-700/85 text-orange-100'].join(' ')}>
                  {!cameraReady ? 'Starting camera…' : (hint || 'Center your whole body in the frame.')}
                </div>
                {/* Hold ring (centre) */}
                {progress > 0 ? (
                  <div className="flex flex-col items-center gap-1">
                    <HoldRing progress={progress} />
                    <span className="text-xs text-cyan-200">Capturing {POSE_COPY[phase as Pose].title.toLowerCase()}…</span>
                  </div>
                ) : <span aria-hidden />}
                {/* Manual capture — always available so the scan can never get stuck. */}
                <button
                  onClick={() => finalize(phase as Pose)}
                  className={['pointer-events-auto rounded-full px-4 py-2 text-xs font-semibold shadow-lg ring-1 backdrop-blur transition',
                    inFrame
                      ? 'bg-cyan-600 text-white ring-cyan-300/40 hover:bg-cyan-500'
                      : 'bg-slate-800/80 text-slate-200 ring-slate-500/40 hover:bg-slate-700'].join(' ')}
                  title="Capture this pose now"
                >
                  {inFrame ? 'Capture now' : 'Capture anyway'}
                </button>
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
          {phase === 'intro' && <Intro onStart={() => setPhase('front')} input={input} aiOn={bodyVisionEnabled()} />}

          {cameraActive && (
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold">{stepNum}</span>
                <h2 className="text-lg font-semibold">{POSE_COPY[phase as Pose].title} pose</h2>
                <span className="text-[11px] text-slate-500">step {stepNum} of {POSES.length}</span>
              </div>
              <p className="text-sm text-slate-300">{POSE_COPY[phase as Pose].body}</p>
              <div className="rounded-lg bg-slate-900/70 p-2.5 text-[11px] text-slate-400">
                I capture automatically once your whole body is in frame and you hold still — or tap <span className="text-cyan-300 font-medium">Capture now</span> any time.
              </div>
              <div className="mt-auto flex gap-1.5">
                {POSES.map((p, i) => (
                  <div key={p} className={['h-1.5 flex-1 rounded-full',
                    i < stepNum - 1 ? 'bg-emerald-500' : i === stepNum - 1 ? 'bg-cyan-500' : 'bg-slate-700'].join(' ')} />
                ))}
              </div>
            </div>
          )}

          {phase === 'analyzing' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="animate-spin text-cyan-400" size={28} />
              <div className="text-sm text-slate-300">{bodyVisionEnabled() ? 'Analyzing your scan with AI…' : 'Analyzing your scan…'}</div>
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

function Intro({ onStart, input, aiOn }: { onStart: () => void; input: BodyScanInput; aiOn: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold">Hands-free body scan</h2>
      <p className="text-sm text-slate-300">
        A spoken coach guides you through three quick poses. There's nothing to tap — each pose is
        captured automatically when your whole body is in frame and you hold still.
      </p>
      <ol className="space-y-1.5 text-sm text-slate-300">
        <li className="flex items-center gap-2"><Dot n={1} /> Face the camera</li>
        <li className="flex items-center gap-2"><Dot n={2} /> Turn to your side</li>
        <li className="flex items-center gap-2"><Dot n={3} /> Turn to show your back</li>
      </ol>
      <div className={['flex items-start gap-2 rounded-lg p-2.5 text-[11px] ring-1',
        aiOn ? 'bg-violet-950/40 text-violet-200/90 ring-violet-700/30' : 'bg-slate-900/70 text-slate-400 ring-slate-700'].join(' ')}>
        <Sparkles size={13} className="mt-0.5 shrink-0" />
        {aiOn
          ? 'AI assist is on — your scan is refined by Claude vision using the key you already set up.'
          : 'Add your Anthropic key (in the AI Coach / Triage chat) to also get an AI-refined estimate. Works without it too.'}
      </div>
      <div className="rounded-lg bg-slate-900/70 p-2.5 text-[11px] text-slate-400">
        Using height <span className="text-slate-200">{input.heightCm} cm</span>,
        weight <span className="text-slate-200">{input.weightKg} kg</span>
        {input.ageYears != null && <>, age <span className="text-slate-200">{input.ageYears}</span></>}.
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-amber-950/40 p-2.5 text-[11px] text-amber-200/90 ring-1 ring-amber-700/30">
        <Info size={13} className="mt-0.5 shrink-0" />
        A camera can't measure body fat like a clinic — you'll get an estimate with a range, never a medical reading.
      </div>
      <button onClick={onStart} className="mt-auto rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold hover:bg-cyan-500">
        Start scan
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your body read</h2>
        {c.method === 'camera+ai' && (
          <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300"><Sparkles size={10} /> AI-refined</span>
        )}
      </div>

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

function HoldRing({ progress }: { progress: number }) {
  const R = 26, C = 2 * Math.PI * R
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="5" />
      <circle cx="32" cy="32" r={R} fill="none" stroke="#22d3ee" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fill="#e2e8f0" fontWeight="700">{Math.ceil((1 - progress) * (HOLD_MS / 1000))}</text>
    </svg>
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

function Dot({ n }: { n: number }) {
  return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-[10px] font-bold">{n}</span>
}

function PhaseArt({ phase }: { phase: Phase }) {
  return (
    <div className="flex flex-col items-center gap-3 text-slate-500">
      <Scan size={56} className="text-slate-700" />
      <div className="text-xs">{phase === 'analyzing' ? 'Crunching the numbers…' : 'Camera preview appears here during capture.'}</div>
    </div>
  )
}
