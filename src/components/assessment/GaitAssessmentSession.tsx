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
 *   1. The coach NEVER talks over herself.  Each scripted line is shown as an
 *      on-screen caption AND spoken, and the next line only starts once the
 *      previous one ends.  Live step numbers are spoken ONLY when the synth is
 *      idle (sayIfIdle), so counting never chops a sentence in half.
 *   2. The flow is TIMER-DRIVEN, not dependent on speech callbacks (see
 *      speakStep): if device audio / speech synthesis is muted or blocked, the
 *      captions still show and the assessment still advances instead of getting
 *      stuck. Audio is a best-effort enhancement on top of the visual flow.
 *   3. Geometry: the user props the phone on the floor side-on and walks the
 *      full frame width between two on-screen guide lines (line-to-line, so a
 *      whole ~8-step walk fits even at 173 cm). The camera is forced to its
 *      widest FOV (maxFov). Lock-in only needs the LOWER body — hips, knees and
 *      both ankles — on the start line, knees straight, standing still.
 *   4. During the hold we capture a per-foot NEUTRAL baseline and subtract it,
 *      so live + recorded ankle angles read relative to standing neutral
 *      (≈0° at rest) instead of the raw ~90–110° shank↔foot joint angle.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, X, Footprints, Download, RefreshCw, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { useVoiceOutput } from '../../hooks/useVoice'
import { LM, jointAngleDeg } from '../../lib/movement/landmarks'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { disposeDetector } from '../../lib/movement/poseDetector'
import {
  measureGaitFrame, GaitStepMachine, summariseGait, fillInstantaneousSpeed,
  buildGaitCsv, renderGaitPlot, downloadText, downloadCanvasPng,
  type GaitSample, type GaitSummary,
} from '../../lib/movement/gait'
import {
  saveGaitSession, loadGaitHistory, subscribeGait, getGaitVersion,
  type GaitSessionRecord,
} from '../../lib/movement/gaitHistory'

interface Props {
  open:    boolean
  onClose: () => void
}

type Phase = 'calibrate' | 'walk' | 'result'
type Leg   = 'out' | 'back'

/** Target steps per lap — used only as a fallback cap; a lap really ends when
 *  the walker reaches the far guide line. */
const STEPS_PER_LEG = 8
/** Hard cap so a missed line-crossing still advances the test. */
const STEPS_MAX_PER_LEG = 14
/** Frames of sustained good pose required before lock-in (~0.6 s @ 30 fps). */
const NEUTRAL_FRAMES_REQUIRED = 18
/** Safety cap per leg so an under-count still advances the test. */
const LEG_TIMEOUT_MS = 32000

// Guide lines, in SCREEN space (0 = left edge, 1 = right edge of the mirrored
// video the user sees).  Inset from the edges so the whole body still fits when
// the walker stands on a line.  The walk runs line-to-line, maximising the
// captured distance (≈ a full frame width → ~8 steps when zoomed out).
const SCREEN_L = 0.18
const SCREEN_R = 0.82
const ON_LINE_TOL = 0.13   // how close (screen units) counts as "on the line"
/** Knee straighter than this (hip–knee–ankle angle, deg) passes the neutral
 *  straight-knee check. */
const KNEE_STRAIGHT_MIN = 150

interface PoseCheck { name: string; ok: boolean; hint: string }
interface PoseStatus { ok: boolean; checks: PoseCheck[] }

// ─────────────────────────────────────────────────────────────────────────────
//  Picky natural-pose verification for the walking test
// ─────────────────────────────────────────────────────────────────────────────

/** Hip-centre x in SCREEN space (the mirrored video flips landmark x). */
function screenXOf(lms: LandmarkSet): number {
  const cx = ((lms[LM.L_HIP]?.x ?? 0.5) + (lms[LM.R_HIP]?.x ?? 0.5)) / 2
  return 1 - cx
}

/** Nearest guide line (screen x) to the walker, and which side it is. */
function nearestLine(screenX: number): { x: number; side: 'left' | 'right' } {
  return screenX < 0.5 ? { x: SCREEN_L, side: 'left' } : { x: SCREEN_R, side: 'right' }
}

/** Median of a number array (0 when empty). */
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function verifyGaitPose(lms: LandmarkSet, motion: number): PoseStatus {
  const vis = (i: number) => lms[i]?.visibility ?? 0
  const checks: PoseCheck[] = []

  // Only the LOWER body matters — head / shoulders are NOT required.
  // 1. Lower body present: hips + knees.
  const bodyOk =
    vis(LM.L_HIP) > 0.4 && vis(LM.R_HIP) > 0.4 &&
    vis(LM.L_KNEE) > 0.4 && vis(LM.R_KNEE) > 0.4
  checks.push({
    name: 'Lower body in frame',
    ok: bodyOk,
    hint: 'Make sure your hips and both knees are in view.',
  })

  // 2. Both ankles tracked (side-on, the far one may be partly occluded → lenient).
  const anklesOk = vis(LM.L_ANKLE) > 0.3 && vis(LM.R_ANKLE) > 0.3
  checks.push({
    name: 'Both ankles visible',
    ok: anklesOk,
    hint: 'I need to see both of your feet — adjust so your ankles are in view.',
  })

  // 3. Standing on a start line (all the way to one side, not the middle).
  const sx = screenXOf(lms)
  const line = nearestLine(sx)
  const onLine = Math.abs(sx - line.x) < ON_LINE_TOL
  checks.push({
    name: `On the ${line.side} start line`,
    ok: onLine,
    hint: 'Walk all the way to one end and stand on the glowing line.',
  })

  // 4. Knees straight (neutral) — hip–knee–ankle close to straight.
  const lKnee = jointAngleDeg(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE])
  const rKnee = jointAngleDeg(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE])
  const kneesOk = lKnee > KNEE_STRAIGHT_MIN && rKnee > KNEE_STRAIGHT_MIN
  checks.push({
    name: 'Knees straight',
    ok: kneesOk,
    hint: 'Stand tall with both knees straight so I can read your true neutral.',
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
  // On-screen caption mirroring whatever the coach is saying, so the cues are
  // readable even when device audio / speech synthesis is unavailable.
  const [caption, setCaption] = useState('')
  // Which guide line to glow: the nearest line during calibrate, the target
  // line during the walk.
  const [glowSide, setGlowSide] = useState<'left' | 'right'>('left')

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
  const countdownStarted = useRef(false)  // 3-2-1-GO chain has begun
  const neutralStreak   = useRef(0)
  const calibStartedAt  = useRef<number | null>(null)
  const goAtRef         = useRef<number | null>(null)
  const legStartedAt    = useRef<number>(0)
  const stepsThisLeg    = useRef(0)
  const detector        = useRef(new GaitStepMachine())
  const samples         = useRef<GaitSample[]>([])
  const prevHip         = useRef<{ x: number; y: number } | null>(null)
  const motionEma       = useRef(0)
  const lastSpokenStep  = useRef(0)
  const trackingLostAt  = useRef<number | null>(null)
  const plotCanvasRef   = useRef<HTMLCanvasElement | null>(null)
  const stepCountRef    = useRef(0)

  // Lateral-walk geometry (all in SCREEN space).
  const startSideRef    = useRef<'left' | 'right'>('left')
  const targetScreenX   = useRef(SCREEN_R)   // line the walker is heading to
  const walkDirRef      = useRef(1)          // +1 = screen left→right, −1 = right→left
  // Per-foot NEUTRAL baseline captured during the hold; subtracted from every
  // subsequent angle so the live/recorded angle starts at ~0° (true neutral)
  // instead of the raw ~90–110° shank↔foot joint angle.
  const base            = useRef({
    la: [] as number[], ra: [] as number[], ls: [] as number[], rs: [] as number[],
    LA: 0, RA: 0, LS: 0, RS: 0, ready: false,
  })
  // Sticky last-good raw angles so a 1–2 frame detection dropout (common when
  // the walker is small/far) doesn't punch holes in the trace.
  const stickyL         = useRef<{ a: number | null; s: number | null; t: number }>({ a: null, s: null, t: 0 })
  const stickyR         = useRef<{ a: number | null; s: number | null; t: number }>({ a: null, s: null, t: 0 })

  const CALIB_MS = 2500   // hold the locked pose this long before the countdown
  const STICKY_MS = 400   // reuse last-good angle for up to this long on a dropout

  // Reset everything when (re)opened.
  useEffect(() => {
    if (!open) return
    setPhase('calibrate'); phaseRef.current = 'calibrate'
    setLeg('out'); legRef.current = 'out'
    setStepCount(0); setLiveL(null); setLiveR(null)
    setCalibProgress(0); setCalibStatus({ ok: false, checks: [] })
    setCameraReady(false); setError(null); setTrackingWarn(false); setSummary(null)
    setCaption(''); setGlowSide('left')
    introDoneRef.current = false
    lockSpeechStarted.current = false
    countdownStarted.current = false
    neutralStreak.current = 0
    calibStartedAt.current = null
    goAtRef.current = null
    legStartedAt.current = 0
    stepsThisLeg.current = 0
    stepCountRef.current = 0
    detector.current = new GaitStepMachine()
    samples.current = []
    prevHip.current = null
    motionEma.current = 0
    lastSpokenStep.current = 0
    trackingLostAt.current = null
    startSideRef.current = 'left'
    targetScreenX.current = SCREEN_R
    walkDirRef.current = 1
    base.current = { la: [], ra: [], ls: [], rs: [], LA: 0, RA: 0, LS: 0, RS: 0, ready: false }
    stickyL.current = { a: null, s: null, t: 0 }
    stickyR.current = { a: null, s: null, t: 0 }
  }, [open])

  /** Speak ONLY if the synth is idle — used for live step counts so we never
   *  chop an in-progress sentence (speak() internally cancels). */
  const sayIfIdle = (text: string) => {
    setCaption(text)
    try {
      if (!window.speechSynthesis?.speaking) ttsRef.current.speak(text)
    } catch { /* */ }
  }

  /**
   * Speak a scripted line, show it as a caption, and call `next` exactly once —
   * whichever happens first: the utterance's onEnd OR a duration-based fallback
   * timer.  This is what makes the flow robust: if speech synthesis is muted,
   * blocked, or never fires onEnd (common on some browsers), the assessment
   * still advances on the timer instead of getting stuck.
   */
  const speakStep = (text: string, next?: () => void) => {
    setCaption(text)
    let fired = false
    const fire = () => { if (!fired) { fired = true; next?.() } }
    try { ttsRef.current.speak(text, fire) } catch { /* */ }
    // ~380 ms per word at the 0.85 speaking rate, floor 2.2 s, plus a little
    // breathing room so a real onEnd usually wins the race when audio works.
    const ms = Math.max(2200, text.split(/\s+/).length * 380)
    window.setTimeout(fire, ms)
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
    // Persist for this user so they can revisit it after signing in.
    try { saveGaitSession(s, samples.current) } catch { /* storage */ }
    phaseRef.current = 'result'
    setPhase('result')
    const exc = s.left.excursion != null && s.right.excursion != null
      ? `Left ankle moved through ${s.left.excursion} degrees, right through ${s.right.excursion} degrees.`
      : 'Captured your ankle motion.'
    const msg = `All done. ${exc} You can download the chart and data below.`
    setCaption(msg)
    ttsRef.current.speak(msg)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown then start the walk. Timer-driven (see speakStep) so it always
  // reaches "GO" even with no audio.
  const startCountdownThenWalk = () => {
    const toSide = startSideRef.current === 'left' ? 'right' : 'left'
    speakStep(
      `When I say go, walk to the line at the ${toSide} end of the frame, at your normal pace.`,
      () => {
        speakStep('Ready. Three. Two. One. Go!', () => {
          goAtRef.current = performance.now()
          legStartedAt.current = performance.now()
          stepsThisLeg.current = 0
          legRef.current = 'out'
          setLeg('out')
          // Glow the destination line now that the walk has started.
          setGlowSide(targetScreenX.current === SCREEN_L ? 'left' : 'right')
          phaseRef.current = 'walk'
          setPhase('walk')
          sayIfIdle('Off you go.')
        })
      },
    )
  }

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

      // Glow whichever line the walker is nearest, so they know which way to go.
      const sx = screenXOf(lms)
      setGlowSide(nearestLine(sx).side)

      const status = verifyGaitPose(lms, motionEma.current)
      setCalibStatus(status)
      // Show the neutral-relative live angle while settling (0 once baseline
      // forms); before baseline we just show the raw read so the user sees life.
      setLiveL(m.leftAnkle != null ? Math.round(m.leftAnkle) : null)
      setLiveR(m.rightAnkle != null ? Math.round(m.rightAnkle) : null)

      // Don't begin the lock-in chain until the positioning speech has finished.
      if (!introDoneRef.current) { setCalibProgress(0); return }

      if (status.ok) {
        neutralStreak.current += 1
        if (neutralStreak.current >= NEUTRAL_FRAMES_REQUIRED) {
          // Start the hold timer immediately the first frame the pose is held
          // long enough; narrate once in parallel. Progression is driven by the
          // wall clock, NOT by the speech callback, so it can never get stuck.
          if (calibStartedAt.current === null) {
            calibStartedAt.current = now
            base.current.la = []; base.current.ra = []
            base.current.ls = []; base.current.rs = []
            if (!lockSpeechStarted.current) {
              lockSpeechStarted.current = true
              speakStep('Great — capturing your neutral. Stand still, knees straight.')
            }
          }
          // Collect neutral-pose samples throughout the hold.
          if (m.leftAnkle  != null) base.current.la.push(m.leftAnkle)
          if (m.rightAnkle != null) base.current.ra.push(m.rightAnkle)
          if (m.leftShank  != null) base.current.ls.push(m.leftShank)
          if (m.rightShank != null) base.current.rs.push(m.rightShank)

          const elapsed = now - calibStartedAt.current
          setCalibProgress(Math.min(1, elapsed / CALIB_MS))
          if (elapsed >= CALIB_MS) {
            // Lock the neutral baseline (median is robust to a stray frame).
            base.current.LA = median(base.current.la)
            base.current.RA = median(base.current.ra)
            base.current.LS = median(base.current.ls)
            base.current.RS = median(base.current.rs)
            base.current.ready = true

            // Lock the start side / walking direction from where they stand.
            const startSide = nearestLine(screenXOf(lms)).side
            startSideRef.current = startSide
            const startX  = startSide === 'left' ? SCREEN_L : SCREEN_R
            const finishX = startSide === 'left' ? SCREEN_R : SCREEN_L
            targetScreenX.current = finishX
            walkDirRef.current = finishX > startX ? 1 : -1
            // Keep the START line glowing through the countdown; switch to the
            // destination line at GO (in startCountdownThenWalk).
            setGlowSide(startSide)

            neutralStreak.current = 0
            countdownStarted.current = true
            setCalibProgress(1)
            startCountdownThenWalk()
          }
        }
      } else {
        // Pose broke before lock-in completed — reset so the user re-settles.
        neutralStreak.current = 0
        lockSpeechStarted.current = false
        calibStartedAt.current = null
        setCalibProgress(0)
      }
      return
    }

    // ── WALK ──────────────────────────────────────────────────────────────────
    if (phaseNow === 'walk') {
      if (goAtRef.current === null) return
      const t = (now - goAtRef.current) / 1000

      // Sticky fallback: reuse the last-good raw angle for a short window so a
      // brief detection dropout (small/far subject) doesn't blank the trace.
      let rawLA = m.leftAnkle,  rawLS = m.leftShank
      let rawRA = m.rightAnkle, rawRS = m.rightShank
      if (rawLA != null) { stickyL.current = { a: rawLA, s: rawLS, t: now } }
      else if (now - stickyL.current.t < STICKY_MS) { rawLA = stickyL.current.a; rawLS = stickyL.current.s }
      if (rawRA != null) { stickyR.current = { a: rawRA, s: rawRS, t: now } }
      else if (now - stickyR.current.t < STICKY_MS) { rawRA = stickyR.current.a; rawRS = stickyR.current.s }

      // Subtract the neutral baseline → angle relative to standing neutral.
      const relLA = rawLA != null ? rawLA - base.current.LA : null
      const relRA = rawRA != null ? rawRA - base.current.RA : null
      const relLS = rawLS != null ? rawLS - base.current.LS : null
      const relRS = rawRS != null ? rawRS - base.current.RS : null

      // Record the frame (neutral-relative).
      samples.current.push({
        t,
        leg: legRef.current,
        leftAnkle:  relLA,
        rightAnkle: relRA,
        leftShank:  relLS,
        rightShank: relRS,
        speed: null,
      })
      setLiveL(relLA != null ? Math.round(relLA) : null)
      setLiveR(relRA != null ? Math.round(relRA) : null)

      // Gentle tracking-lost banner (never aborts the walk).
      if (relLA === null && relRA === null) {
        if (trackingLostAt.current === null) trackingLostAt.current = now
        if (now - trackingLostAt.current > 1200) setTrackingWarn(true)
      } else {
        trackingLostAt.current = null
        setTrackingWarn(false)
      }

      // Step detection — per-foot gait finite-state machine. Convert ankle/hip
      // x to SCREEN space (the video is mirrored) so they match walkDir.
      const lxS = m.leftAnkleX  != null ? 1 - m.leftAnkleX  : null
      const rxS = m.rightAnkleX != null ? 1 - m.rightAnkleX : null
      const struck = detector.current.push(
        lxS, rxS, 1 - m.hipX, walkDirRef.current, t, m.legLen, m.stepLenM,
      )
      if (struck) {
        stepsThisLeg.current += 1
        setStepCount((c) => c + 1)
        const n = stepsThisLeg.current
        // Speak the number only if idle, so counting never chops a sentence.
        if (n !== lastSpokenStep.current && n <= STEPS_PER_LEG) {
          lastSpokenStep.current = n
          sayIfIdle(String(n))
        }
      }

      // Lap ends when the walker REACHES the far guide line (primary), with a
      // step-count cap and timeout as fallbacks.
      const sx = screenXOf(lms)
      const reachedLine = walkDirRef.current > 0
        ? sx >= targetScreenX.current - 0.02
        : sx <= targetScreenX.current + 0.02
      const timedOut = now - legStartedAt.current > LEG_TIMEOUT_MS
      const capped   = stepsThisLeg.current >= STEPS_MAX_PER_LEG
      if (reachedLine || timedOut || capped) {
        if (legRef.current === 'out') {
          // → turn and walk back to the start line
          legRef.current = 'back'
          setLeg('back')
          stepsThisLeg.current = 0
          lastSpokenStep.current = 0
          legStartedAt.current = now
          // Reverse direction and target back to the start line. Reset the
          // step machine so the 180° turn isn't mistaken for steps.
          const startX = startSideRef.current === 'left' ? SCREEN_L : SCREEN_R
          targetScreenX.current = startX
          walkDirRef.current = -walkDirRef.current
          detector.current.reset()
          setGlowSide(startSideRef.current)
          speakStep('Great. Now turn around and walk back to your start line.')
        } else {
          goAtRef.current = null   // stop recording
          finish()
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!open) return null

  const legLabel = `Walk to the ${glowSide === 'left' ? 'LEFT' : 'RIGHT'} line`

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
                maxFov={true}
                onLandmarks={handleLandmarks}
                onReady={() => {
                  setCameraReady(true)
                  introDoneRef.current = false
                  // Timer-driven narration (see speakStep): always reaches the
                  // end and unlocks pose detection even with no audio.
                  speakStep(
                    'Welcome to the ankle dynamics walking test.',
                    () => speakStep(
                      'Place your phone on the floor, leaning against a wall, so the camera looks across your walking path. Stand side-on, in profile — I measure your ankle from the side view of your shin and foot, so your body should face along the walking line, not at the camera.',
                      () => speakStep(
                        'You will see two vertical lines. Walk all the way to one end and stand on the glowing line, still in profile, with both feet and ankles in view.',
                        () => speakStep(
                          'Stand tall with your knees straight and hold still for a moment while I read your neutral ankle position.',
                          () => { introDoneRef.current = true },
                        ),
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
              {/* Start / finish guide lines, so the user knows exactly where to
                  stand and which way to walk. The glowing line is the active one
                  (where to stand during calibrate, the target during the walk). */}
              <GuideLine screenX={SCREEN_L} side="left"  active={glowSide === 'left'}  phase={phase} startSide={startSideRef.current} />
              <GuideLine screenX={SCREEN_R} side="right" active={glowSide === 'right'} phase={phase} startSide={startSideRef.current} />

              {/* Coach caption — mirrors the spoken cue so it's readable even
                  with no audio. */}
              {caption && (
                <div className="absolute left-1/2 top-3 z-10 w-[min(560px,94vw)] -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-black/80 px-4 py-2 text-center text-sm text-cyan-100 shadow-lg backdrop-blur">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">Coach</span>
                  {caption}
                </div>
              )}
              {phase === 'calibrate' && (
                <div className="m-auto w-[min(440px,92vw)] rounded-lg bg-black/75 px-5 py-4 text-center backdrop-blur">
                  <div className="text-base font-semibold text-cyan-300">Get into position</div>
                  <div className="mt-1 text-xs text-slate-300">
                    Phone on the floor against a wall, side-on. Stand on the glowing line at one
                    end with knees straight, then hold still.
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
                        Keep your feet in the frame.
                      </div>
                    )}
                  </div>

                  <div className="m-auto flex flex-col items-center">
                    <div className="text-[11px] uppercase tracking-widest text-slate-400">Steps</div>
                    <div className="text-7xl font-bold tabular-nums text-cyan-200">
                      {stepCount}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">keep going until you reach the glowing line</div>
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
              setCaption(''); setGlowSide('left')
              introDoneRef.current = false
              lockSpeechStarted.current = false
              countdownStarted.current = false
              neutralStreak.current = 0
              calibStartedAt.current = null
              goAtRef.current = null
              stepsThisLeg.current = 0
              stepCountRef.current = 0
              detector.current = new GaitStepMachine()
              samples.current = []
              prevHip.current = null
              motionEma.current = 0
              lastSpokenStep.current = 0
              startSideRef.current = 'left'
              targetScreenX.current = SCREEN_R
              walkDirRef.current = 1
              base.current = { la: [], ra: [], ls: [], rs: [], LA: 0, RA: 0, LS: 0, RS: 0, ready: false }
              stickyL.current = { a: null, s: null, t: 0 }
              stickyR.current = { a: null, s: null, t: 0 }
            }}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Guide line — vertical start/finish marker drawn over the camera feed
// ─────────────────────────────────────────────────────────────────────────────

function GuideLine({
  screenX, side, active, phase, startSide,
}: {
  screenX:   number
  side:      'left' | 'right'
  active:    boolean
  phase:     'calibrate' | 'walk' | 'result'
  startSide: 'left' | 'right'
}) {
  const label =
    phase === 'walk'
      ? (active ? 'WALK HERE' : (side === startSide ? 'START' : 'FINISH'))
      : (active ? 'STAND HERE' : '')
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 flex flex-col items-center justify-end pb-10"
      style={{ left: `${screenX * 100}%`, transform: 'translateX(-50%)' }}
    >
      <div
        className={active ? 'h-full w-[3px] bg-cyan-400' : 'h-full w-[2px] bg-slate-500/40'}
        style={active ? { boxShadow: '0 0 14px 3px rgba(34,211,238,0.7)' } : undefined}
      />
      {label && (
        <div
          className={`absolute bottom-3 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            active ? 'bg-cyan-400 text-slate-900' : 'bg-slate-700/80 text-slate-200'
          }`}
        >
          {label}
        </div>
      )}
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

  // Past sessions (this user). saveGaitSession already ran in finish(), so the
  // newest entry is included on mount; subscribe keeps it fresh.
  const [history, setHistory] = useState<GaitSessionRecord[]>(() => loadGaitHistory())
  useEffect(() => {
    const unsub = subscribeGait(() => setHistory(loadGaitHistory()))
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getGaitVersion()])

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
        {stat('Ankle excursion (total ROM)', summary.left.excursion, summary.right.excursion)}
        {stat('Peak dorsiflexion (toe up)', summary.left.max, summary.right.max)}
        {stat('Peak plantarflexion (toe down)', summary.left.min, summary.right.min)}
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

      {/* Past sessions — persisted per signed-in user (guest sessions are kept
          separately on this device). */}
      {history.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
            Your previous sessions
          </div>
          <div className="mt-1 divide-y divide-slate-800 rounded-md border border-slate-800">
            {history.slice(0, 8).map((h, i) => (
              <div key={h.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="w-32 shrink-0 text-slate-300">
                  {new Date(h.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {i === 0 && <span className="ml-1 text-[9px] text-emerald-400">(latest)</span>}
                </span>
                <span className="flex-1 text-slate-400 truncate">
                  excursion <span className="text-orange-300">L {h.summary.left.excursion ?? '—'}°</span>{' '}
                  <span className="text-cyan-300">R {h.summary.right.excursion ?? '—'}°</span>
                  {' · '}{h.summary.steps} steps
                  {h.summary.speedMps != null && <> · {h.summary.speedMps} m/s</>}
                </span>
                <button
                  onClick={() => downloadText(
                    `ankle-dynamics-${new Date(h.ts).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`,
                    buildGaitCsv(h.samples, h.summary),
                  )}
                  className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700"
                >
                  CSV
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
