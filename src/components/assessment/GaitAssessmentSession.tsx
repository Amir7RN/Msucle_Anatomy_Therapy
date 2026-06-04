/**
 * GaitAssessmentSession.tsx
 *
 * "Ankle Dynamics" — a dynamic, walking ankle assessment built for the Dephy
 * sagittal-plane ankle exo use-case.  Instead of a single static ROM hold, the
 * AI coach guides the user through a short out-and-back walk in front of a
 * (stationary) phone camera, measures BOTH ankles' sagittal angle every frame,
 * counts steps, and produces:
 *
 *   • a live HUD (step counter, leg, live ankle angles)
 *   • a results panel with per-foot min / max / excursion, cadence and an
 *     estimated walking speed
 *   • a downloadable CSV (per-frame time series + summary) and PNG plot
 *
 * Coaching design (the bit the brief cares about most)
 * ────────────────────────────────────────────────────
 *   1. The coach NEVER talks over herself.  Every scripted line is chained
 *      through the previous utterance's onEnd callback, so "natural pose
 *      detected" → instructions → "three, two, one, GO" play in full sequence.
 *      Live step numbers are spoken ONLY when the synth is idle (sayIfIdle), so
 *      counting never chops a sentence in half.
 *   2. Natural-pose detection is deliberately PICKY: it requires the whole
 *      body — and specifically BOTH ankles — in frame with margin above the
 *      head and below the feet, the user centred and standing still for ~0.6 s.
 *      Until then it gives a specific, single fix ("step back so I can see your
 *      feet", "move to the centre", "hold still").
 *   3. Only after the pose is locked AND the lock-in speech has finished does
 *      the 3-2-1-GO countdown run and recording begin.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, X, Footprints, Download, RefreshCw, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { useVoiceOutput } from '../../hooks/useVoice'
import { LM } from '../../lib/movement/landmarks'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { disposeDetector } from '../../lib/movement/poseDetector'
import {
  measureGaitFrame, StepDetector, summariseGait, fillInstantaneousSpeed,
  buildGaitCsv, renderGaitPlot, downloadText, downloadCanvasPng,
  type GaitSample, type GaitSummary,
} from '../../lib/movement/gait'

interface Props {
  open:    boolean
  onClose: () => void
}

type Phase = 'calibrate' | 'walk' | 'result'
type Leg   = 'out' | 'back'

/** Steps to take in each direction. 8 keeps a typical room walk inside the
 *  frame of a stationary phone. */
const STEPS_PER_LEG = 8
/** Frames of sustained good pose required before lock-in (~0.6 s @ 30 fps). */
const NEUTRAL_FRAMES_REQUIRED = 18
/** Safety cap per leg so an under-count still advances the test. */
const LEG_TIMEOUT_MS = 32000

interface PoseCheck { name: string; ok: boolean; hint: string }
interface PoseStatus { ok: boolean; checks: PoseCheck[] }

// ─────────────────────────────────────────────────────────────────────────────
//  Picky natural-pose verification for the walking test
// ─────────────────────────────────────────────────────────────────────────────

function verifyGaitPose(lms: LandmarkSet, motion: number): PoseStatus {
  const vis = (i: number) => lms[i]?.visibility ?? 0
  const checks: PoseCheck[] = []

  // 1. Whole body present.
  const bodyOk =
    vis(LM.NOSE) > 0.5 &&
    vis(LM.L_SHOULDER) > 0.6 && vis(LM.R_SHOULDER) > 0.6 &&
    vis(LM.L_HIP) > 0.5 && vis(LM.R_HIP) > 0.5 &&
    vis(LM.L_KNEE) > 0.45 && vis(LM.R_KNEE) > 0.45
  checks.push({
    name: 'Whole body in frame',
    ok: bodyOk,
    hint: 'Step back until your head, hips and knees are all visible.',
  })

  // 2. BOTH ankles clearly visible — the headline requirement.
  const anklesOk = vis(LM.L_ANKLE) > 0.45 && vis(LM.R_ANKLE) > 0.45
  checks.push({
    name: 'Both ankles visible',
    ok: anklesOk,
    hint: 'I need to see BOTH of your feet — step back so your ankles are in view.',
  })

  // Vertical extent of the body in the frame.
  const headY = lms[LM.NOSE]?.y ?? 0
  const footCandidates = [LM.L_ANKLE, LM.R_ANKLE, LM.L_FOOT_IDX, LM.R_FOOT_IDX]
    .map((i) => (vis(i) > 0.4 ? lms[i].y : null))
    .filter((v): v is number => v != null)
  const footY = footCandidates.length ? Math.max(...footCandidates) : 1

  // 3. Margin above head AND below feet → far enough back that the walk stays
  //    in frame (the "step backward from mid-frame" requirement).
  const marginOk = headY > 0.10 && footY < 0.90
  const tooClose = footY >= 0.90 || headY <= 0.10
  checks.push({
    name: 'Far enough back',
    ok: marginOk,
    hint: tooClose
      ? 'Step backward — I need space above your head and below your feet.'
      : 'Step backward so your whole body has room in the frame.',
  })

  // 4. Centred horizontally.
  const cx = ((lms[LM.L_HIP]?.x ?? 0.5) + (lms[LM.R_HIP]?.x ?? 0.5)) / 2
  const centeredOk = cx > 0.3 && cx < 0.7
  checks.push({
    name: 'Centred in frame',
    ok: centeredOk,
    hint: cx <= 0.3 ? 'Move to your left to centre yourself.' : 'Move to your right to centre yourself.',
  })

  // 5. Standing still.
  const stillOk = motion < 0.012
  checks.push({
    name: 'Standing still',
    ok: stillOk,
    hint: 'Hold still in a relaxed standing pose.',
  })

  return { ok: checks.every((c) => c.ok), checks }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────────────────────────────────────

export function GaitAssessmentSession({ open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('calibrate')
  const [leg, setLeg]     = useState<Leg>('out')
  const [stepCount, setStepCount] = useState(0)
  const [liveL, setLiveL] = useState<number | null>(null)
  const [liveR, setLiveR] = useState<number | null>(null)
  const [calibProgress, setCalibProgress] = useState(0)
  const [calibStatus, setCalibStatus] = useState<PoseStatus>({ ok: false, checks: [] })
  const [cameraReady, setCameraReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trackingWarn, setTrackingWarn] = useState(false)
  const [summary, setSummary] = useState<GaitSummary | null>(null)

  const tts = useVoiceOutput()
  const ttsRef = useRef(tts)
  useEffect(() => { ttsRef.current = tts }, [tts])

  // Stop any speech the moment the overlay unmounts.
  useEffect(() => () => { try { window.speechSynthesis?.cancel() } catch { /* */ } }, [])

  // ── Refs (read inside the stable landmark callback) ─────────────────────────
  const phaseRef   = useRef<Phase>('calibrate')
  const legRef     = useRef<Leg>('out')
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { legRef.current = leg }, [leg])

  const introDoneRef    = useRef(false)   // positioning speech finished
  const lockSpeechStarted = useRef(false) // "natural pose detected" cue fired
  const holdReady       = useRef(false)   // that cue has finished → start hold
  const countdownStarted = useRef(false)  // 3-2-1-GO chain has begun
  const neutralStreak   = useRef(0)
  const calibStartedAt  = useRef<number | null>(null)
  const goAtRef         = useRef<number | null>(null)
  const legStartedAt    = useRef<number>(0)
  const stepsThisLeg    = useRef(0)
  const detector        = useRef(new StepDetector())
  const samples         = useRef<GaitSample[]>([])
  const prevHip         = useRef<{ x: number; y: number } | null>(null)
  const motionEma       = useRef(0)
  const lastSpokenStep  = useRef(0)
  const trackingLostAt  = useRef<number | null>(null)
  const plotCanvasRef   = useRef<HTMLCanvasElement | null>(null)
  const stepCountRef    = useRef(0)

  const CALIB_MS = 1500   // hold the locked pose this long before the countdown

  // Reset everything when (re)opened.
  useEffect(() => {
    if (!open) return
    setPhase('calibrate'); phaseRef.current = 'calibrate'
    setLeg('out'); legRef.current = 'out'
    setStepCount(0); setLiveL(null); setLiveR(null)
    setCalibProgress(0); setCalibStatus({ ok: false, checks: [] })
    setCameraReady(false); setError(null); setTrackingWarn(false); setSummary(null)
    introDoneRef.current = false
    lockSpeechStarted.current = false
    holdReady.current = false
    countdownStarted.current = false
    neutralStreak.current = 0
    calibStartedAt.current = null
    goAtRef.current = null
    legStartedAt.current = 0
    stepsThisLeg.current = 0
    stepCountRef.current = 0
    detector.current = new StepDetector()
    samples.current = []
    prevHip.current = null
    motionEma.current = 0
    lastSpokenStep.current = 0
    trackingLostAt.current = null
  }, [open])

  /** Speak ONLY if the synth is idle — used for live step counts so we never
   *  chop an in-progress sentence (speak() internally cancels). */
  const sayIfIdle = (text: string) => {
    try {
      if (!window.speechSynthesis?.speaking) ttsRef.current.speak(text)
    } catch { /* */ }
  }

  // Keep a ref of the live step total for finish().
  useEffect(() => { stepCountRef.current = stepCount }, [stepCount])

  // ── Finish + compute results ────────────────────────────────────────────────
  const finish = useCallback(() => {
    if (phaseRef.current === 'result') return
    goAtRef.current = null
    const total = stepCountRef.current
    const stepLen = detector.current.medianStepLength()
    fillInstantaneousSpeed(samples.current, stepLen)
    const s = summariseGait(samples.current, total, stepLen)
    setSummary(s)
    phaseRef.current = 'result'
    setPhase('result')
    const exc = s.left.excursion != null && s.right.excursion != null
      ? `Left ankle moved through ${s.left.excursion} degrees, right through ${s.right.excursion} degrees.`
      : 'Captured your ankle motion.'
    ttsRef.current.speak(`All done. ${exc} You can download the chart and data below.`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown then start the walk.
  const startCountdownThenWalk = useCallback(() => {
    ttsRef.current.speak(
      'When I say go, walk straight forward, away from the camera, for eight steps.',
      () => {
        ttsRef.current.speak('Ready. Three. Two. One. Go!', () => {
          goAtRef.current = performance.now()
          legStartedAt.current = performance.now()
          stepsThisLeg.current = 0
          legRef.current = 'out'
          setLeg('out')
          phaseRef.current = 'walk'
          setPhase('walk')
          sayIfIdle('Off you go.')
        })
      },
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Stable per-frame landmark handler ───────────────────────────────────────
  const handleLandmarks = useCallback((lms: LandmarkSet) => {
    const now = performance.now()
    const phaseNow = phaseRef.current

    // Track body motion (hip-centre displacement, EMA) for the "still" check.
    const hx = ((lms[LM.L_HIP]?.x ?? 0.5) + (lms[LM.R_HIP]?.x ?? 0.5)) / 2
    const hy = ((lms[LM.L_HIP]?.y ?? 0.5) + (lms[LM.R_HIP]?.y ?? 0.5)) / 2
    if (prevHip.current) {
      const d = Math.hypot(hx - prevHip.current.x, hy - prevHip.current.y)
      motionEma.current = 0.4 * d + 0.6 * motionEma.current
    }
    prevHip.current = { x: hx, y: hy }

    const m = measureGaitFrame(lms)

    // ── CALIBRATE ─────────────────────────────────────────────────────────────
    if (phaseNow === 'calibrate') {
      // Once the countdown chain is running, freeze calibration logic so the
      // pose checks can't re-fire the lock-in cue over the "three-two-one-GO".
      if (countdownStarted.current) { setCalibProgress(1); return }

      const status = verifyGaitPose(lms, motionEma.current)
      setCalibStatus(status)
      setLiveL(m.leftAnkle != null ? Math.round(m.leftAnkle) : null)
      setLiveR(m.rightAnkle != null ? Math.round(m.rightAnkle) : null)

      // Don't begin the lock-in chain until the positioning speech has finished.
      if (!introDoneRef.current) { setCalibProgress(0); return }

      if (status.ok) {
        neutralStreak.current += 1
        if (neutralStreak.current >= NEUTRAL_FRAMES_REQUIRED) {
          // Fire the lock-in cue exactly once; the hold timer starts only when
          // that utterance has finished (holdReady set in its onEnd).
          if (!lockSpeechStarted.current) {
            lockSpeechStarted.current = true
            holdReady.current = false
            ttsRef.current.speak('Great — natural pose detected. Hold still.', () => {
              holdReady.current = true
            })
          }
          if (holdReady.current) {
            if (calibStartedAt.current === null) calibStartedAt.current = now
            const elapsed = now - calibStartedAt.current
            setCalibProgress(Math.min(1, elapsed / CALIB_MS))
            if (elapsed >= CALIB_MS) {
              neutralStreak.current = 0
              countdownStarted.current = true
              setCalibProgress(1)
              startCountdownThenWalk()
            }
          } else {
            setCalibProgress(0)
          }
        }
      } else {
        // Pose broke before lock-in completed — reset the whole chain so the
        // user must re-settle from scratch.
        neutralStreak.current = 0
        lockSpeechStarted.current = false
        holdReady.current = false
        calibStartedAt.current = null
        setCalibProgress(0)
      }
      return
    }

    // ── WALK ──────────────────────────────────────────────────────────────────
    if (phaseNow === 'walk') {
      if (goAtRef.current === null) return
      const t = (now - goAtRef.current) / 1000

      // Record the frame.
      samples.current.push({
        t,
        leg: legRef.current,
        leftAnkle:  m.leftAnkle,
        rightAnkle: m.rightAnkle,
        leftShank:  m.leftShank,
        rightShank: m.rightShank,
        speed: null,
      })
      setLiveL(m.leftAnkle != null ? Math.round(m.leftAnkle) : null)
      setLiveR(m.rightAnkle != null ? Math.round(m.rightAnkle) : null)

      // Gentle tracking-lost banner (never aborts the walk).
      if (m.leftAnkle === null && m.rightAnkle === null) {
        if (trackingLostAt.current === null) trackingLostAt.current = now
        if (now - trackingLostAt.current > 1200) setTrackingWarn(true)
      } else {
        trackingLostAt.current = null
        setTrackingWarn(false)
      }

      // Step detection.
      if (detector.current.push(m.ankleSep, t, m.stepLenM)) {
        stepsThisLeg.current += 1
        setStepCount((c) => c + 1)
        const n = stepsThisLeg.current
        // Speak the number only if idle, so counting never chops a sentence.
        if (n !== lastSpokenStep.current && n <= STEPS_PER_LEG) {
          lastSpokenStep.current = n
          sayIfIdle(String(n))
        }
      }

      // Leg / test progression.
      const timedOut = now - legStartedAt.current > LEG_TIMEOUT_MS
      if (stepsThisLeg.current >= STEPS_PER_LEG || timedOut) {
        if (legRef.current === 'out') {
          // → turn and walk back
          legRef.current = 'back'
          setLeg('back')
          stepsThisLeg.current = 0
          lastSpokenStep.current = 0
          legStartedAt.current = now
          ttsRef.current.speak(
            'Great. Now turn around and walk back toward the camera. Eight steps.',
          )
        } else {
          goAtRef.current = null   // stop recording
          finish()
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!open) return null

  const legLabel = leg === 'out' ? 'Walk AWAY from the camera' : 'Walk BACK toward the camera'

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/80 px-4 py-2">
        <div className="flex items-center gap-2">
          <Footprints size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">Ankle Dynamics — Walking Test</span>
          <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">Dephy demo</span>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-800"><X size={16} /></button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {phase !== 'result' && (
          <>
            <div className="relative h-full w-full">
              <CameraView
                active={true}
                onLandmarks={handleLandmarks}
                onReady={() => {
                  setCameraReady(true)
                  introDoneRef.current = false
                  ttsRef.current.speak(
                    'Welcome to the ankle dynamics walking test.',
                    () => ttsRef.current.speak(
                      'Prop your phone up against something stable, around knee height, with the camera facing your walking path. You can use the front or back camera, as long as your whole body stays inside the frame.',
                      () => ttsRef.current.speak(
                        'Now stand in the middle of the frame, then take a few steps backward, until I can see your whole body, from your head all the way down to both of your feet, with a little space above and below.',
                        () => { introDoneRef.current = true },
                      ),
                    ),
                  )
                }}
                onError={(msg) => setError(msg)}
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-slate-300">
                  Initialising camera and pose model…
                </div>
              )}
              {error && (
                <div className="absolute bottom-4 left-4 right-4 rounded border border-red-700 bg-red-950/70 p-2 text-xs text-red-200">
                  <AlertCircle size={12} className="mr-1 inline" /> {error}
                </div>
              )}
            </div>

            {/* HUD */}
            <div className="pointer-events-none absolute inset-0 flex flex-col">
              {phase === 'calibrate' && (
                <div className="m-auto w-[min(440px,92vw)] rounded-lg bg-black/75 px-5 py-4 text-center backdrop-blur">
                  <div className="text-base font-semibold text-cyan-300">Get into position</div>
                  <div className="mt-1 text-xs text-slate-300">
                    Stand back so your whole body — and both ankles — are in frame, then hold still.
                  </div>
                  {calibStatus.checks.length > 0 && (
                    <ul className="mt-3 space-y-1 text-left">
                      {calibStatus.checks.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px]">
                          <span className={c.ok ? 'text-emerald-400' : 'text-amber-300'}>{c.ok ? '✓' : '○'}</span>
                          <span className={c.ok ? 'text-emerald-200' : 'text-amber-100'}>{c.ok ? c.name : c.hint}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full transition-all ${calibStatus.ok ? 'bg-emerald-400' : 'bg-amber-400/60'}`}
                         style={{ width: `${calibProgress * 100}%` }} />
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400">
                    {calibStatus.ok ? 'Hold it…' : 'Follow the cues above to lock in'}
                  </div>
                </div>
              )}

              {phase === 'walk' && (
                <>
                  <div className="m-3 self-start rounded-lg bg-black/70 px-4 py-3 backdrop-blur">
                    <div className="text-[10px] uppercase tracking-wider text-cyan-400">
                      {leg === 'out' ? 'Lap 1 of 2' : 'Lap 2 of 2'}
                    </div>
                    <div className="mt-0.5 text-lg font-bold">{legLabel}</div>
                    {trackingWarn && (
                      <div className="mt-1 text-[11px] text-amber-300">
                        Keep your whole body in the frame.
                      </div>
                    )}
                  </div>

                  <div className="m-auto flex flex-col items-center">
                    <div className="text-[11px] uppercase tracking-widest text-slate-400">Steps</div>
                    <div className="text-7xl font-bold tabular-nums text-cyan-200">
                      {Math.min(stepsThisLeg.current, STEPS_PER_LEG)}
                      <span className="text-3xl text-slate-500"> / {STEPS_PER_LEG}</span>
                    </div>
                    <div className="mt-4 flex gap-6 text-sm">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase text-orange-300">Left ankle</span>
                        <span className="text-xl font-semibold tabular-nums text-orange-200">
                          {liveL === null ? '—' : `${liveL}°`}
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase text-cyan-300">Right ankle</span>
                        <span className="text-xl font-semibold tabular-nums text-cyan-200">
                          {liveR === null ? '—' : `${liveR}°`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Manual finish escape hatch */}
                  <button
                    onClick={finish}
                    className="pointer-events-auto absolute bottom-4 right-4 rounded-md bg-slate-800/90 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    Finish now
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {phase === 'result' && summary && (
          <GaitResultView
            summary={summary}
            samples={samples.current}
            canvasRef={plotCanvasRef}
            onRetake={() => {
              // Full reset back to calibration.
              setPhase('calibrate'); phaseRef.current = 'calibrate'
              setLeg('out'); legRef.current = 'out'
              setStepCount(0); setLiveL(null); setLiveR(null)
              setCalibProgress(0); setCalibStatus({ ok: false, checks: [] })
              setTrackingWarn(false); setSummary(null)
              introDoneRef.current = false
              lockSpeechStarted.current = false
              holdReady.current = false
              countdownStarted.current = false
              neutralStreak.current = 0
              calibStartedAt.current = null
              goAtRef.current = null
              stepsThisLeg.current = 0
              stepCountRef.current = 0
              detector.current = new StepDetector()
              samples.current = []
              prevHip.current = null
              motionEma.current = 0
              lastSpokenStep.current = 0
            }}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Result view — inline plot + downloads
// ─────────────────────────────────────────────────────────────────────────────

function GaitResultView({
  summary, samples, canvasRef, onRetake, onClose,
}: {
  summary:   GaitSummary
  samples:   GaitSample[]
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  onRetake:  () => void
  onClose:   () => void
}) {
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const stamp = useMemo(() => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'), [])

  // Render the plot once on mount.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderGaitPlot(canvas, samples, summary)
    try { setPngUrl(canvas.toDataURL('image/png')) } catch { /* */ }
    return () => disposeDetector()  // free the pose model when leaving
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stat = (label: string, l: number | null, r: number | null, unit = '°') => (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-orange-300">L <span className="tabular-nums font-semibold">{l == null ? '—' : `${l}${unit}`}</span></span>
        <span className="text-cyan-300">R <span className="tabular-nums font-semibold">{r == null ? '—' : `${r}${unit}`}</span></span>
      </div>
    </div>
  )

  return (
    <div className="m-auto w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <h2 className="text-base font-semibold">Ankle Dynamics — results</h2>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={16} /></button>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {stat('Ankle excursion', summary.left.excursion, summary.right.excursion)}
        {stat('Min angle', summary.left.min, summary.right.min)}
        {stat('Max angle', summary.left.max, summary.right.max)}
        {stat('Mean shank tilt', summary.left.meanShank, summary.right.meanShank)}
        <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Steps · cadence</div>
          <div className="mt-1 text-sm tabular-nums text-slate-100">
            {summary.steps} steps · {summary.cadenceSpm}/min
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Walking speed (est.)</div>
          <div className="mt-1 text-sm tabular-nums text-slate-100">
            {summary.speedMps == null ? '—' : `${summary.speedMps} m/s`}
            {summary.symmetryPct != null && (
              <span className="ml-2 text-[11px] text-slate-400">· {summary.symmetryPct}% L/R symmetry</span>
            )}
          </div>
        </div>
      </div>

      {/* Inline plot */}
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
        <canvas ref={canvasRef} className="block w-full" />
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Sagittal-plane estimate from a single camera, intended as a quick screen — not a clinical goniometer.
        Walking speed is estimated from step length × cadence. All processing happened on this device.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-700 pt-3">
        <button
          onClick={() => downloadText(`ankle-dynamics-${stamp}.csv`, buildGaitCsv(samples, summary))}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
        >
          <Download size={12} /> Download CSV
        </button>
        <button
          onClick={() => { const c = canvasRef.current; if (c) downloadCanvasPng(`ankle-dynamics-${stamp}.png`, c) }}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
        >
          <Download size={12} /> Download plot (PNG)
        </button>
        <button
          onClick={onRetake}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
        >
          <RefreshCw size={12} /> Retake
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400"
        >
          Done <ChevronRight size={12} />
        </button>
      </div>

      {/* pngUrl kept for potential share/preview; referenced to satisfy lint. */}
      <span className="hidden">{pngUrl ? '1' : '0'}</span>
    </div>
  )
}
