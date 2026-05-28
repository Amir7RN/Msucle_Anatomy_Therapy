/**
 * AssessmentView.tsx
 *
 * "Progress Assessment" — context-aware ROM measurement that bridges
 * Diagnosis → Therapy.  Shown as a compact card in the right panel between
 * Muscle Name and Exercises.  When the user clicks "Start Assessment", the
 * camera opens full-screen, MediaPipe runs ONLY for the assessment duration
 * (saving CPU/GPU), the AI coach guides the movement, peak angle is captured,
 * compared to the able-bodied reference, saved to localStorage, and shown
 * with a trend sparkline ("ROM improved 12% since last session").
 *
 * Pipeline
 *   1. Idle      — list of relevant movements + sparklines for prior results
 *   2. Calibrate — 3-second hold of a TRUE neutral standing pose, verified
 *                  by per-segment pose checks (arms by sides, legs straight,
 *                  head facing camera).  Calibration is ONE-TIME — pose
 *                  drift during measurement does not bounce the user back.
 *   3. Measure   — voice cue, capture peak angle over a 5-second hold
 *                  with sticky-landmark fallback (transient dropouts don't
 *                  break the dial).  The dial shows live + peak angles.
 *                  Safety net: if MORE than 3 tracked landmarks fall below
 *                  visibility 0.10 for over 1 s, we fall back to
 *                  calibration with a "tracking lost" banner.
 *   4. Result    — capability bar + trend, "Save" persists to history
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, X, Play, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { useVoiceOutput } from '../../hooks/useVoice'
import {
  getMovementsForMuscle,
  verifyNeutralPose,
  type JointMovement,
} from '../../lib/movement/muscleJointMap'
import { LM } from '../../lib/movement/landmarks'
import {
  saveROMRecord,
  getRecordsFor,
  computeImprovement,
  type ROMRecord,
} from '../../lib/movement/romHistory'
import { useROMVersion } from '../../hooks/useROMVersion'
import type { LandmarkSet } from '../../lib/movement/landmarks'

function calibrationCopy(seg: 'upper_body' | 'lower_body' | 'trunk' | 'neck'): string {
  return seg === 'upper_body' ? 'Stand still — neutral pose'
       : seg === 'lower_body' ? 'Stand tall — feet under hips'
       : seg === 'neck'       ? 'Centre your head — face the camera'
       :                        'Stand tall — shoulders over hips'
}
function calibrationHint(seg: 'upper_body' | 'lower_body' | 'trunk' | 'neck'): string {
  return seg === 'upper_body' ? 'Arms hanging beside you, palms touching your thighs. Hold for 3 seconds.'
       : seg === 'lower_body' ? 'Knees straight, feet shoulder-width. Both hips and knees in frame. Hold for 3 seconds.'
       : seg === 'neck'       ? 'Look straight ahead with both ears visible. Hold for 3 seconds.'
       :                        'Stand back so shoulders to hips are visible. Hold for 3 seconds.'
}
import { disposeDetector } from '../../lib/movement/poseDetector'

interface Props {
  muscleId:   string | null
  muscleName: string | null
}

type Phase = 'idle' | 'calibrate' | 'measure' | 'result'

// 8-second measurement window. The user hears the plain-language howTo
// (~3-4 s) and then has 4-5 s to actually perform + peak-hold the motion.
// Previously this was 5 s and the spoken instructions overlapped with the
// measurement window — the user was confused about whether to listen or
// move. Peak is captured continuously so a slightly late motion still gets
// recorded.
const HOLD_MS = 6000

// 3-second NEUTRAL-POSE calibration — once the user is in a true neutral
// standing pose we count down 3 seconds and move on.  Calibration runs ONCE
// per session; it does NOT bounce back just because the pose drifts (the
// user is supposed to move next).  The only way back to calibration is the
// "tracking lost" safety net below.
const CALIB_MS = 3000

// Tracking-lost safety net: if MORE THAN 3 of the tracked landmarks have
// visibility below this threshold for longer than TRACKING_LOST_MS, we drop
// back to calibration with a "tracking lost — stand still and rebuild your
// neutral pose" warning.  Otherwise the measurement continues even if
// individual landmarks dip momentarily.
const TRACKING_LOST_VIS = 0.10
const TRACKING_LOST_MIN_MISSING = 4   // strictly MORE than 3
const TRACKING_LOST_MS = 1000

// Per-segment count of "tracked" landmark indices we report visibility for
// in the debug strip.  These are the same landmarks the relevant
// measurement function reads from.
function trackedLandmarksFor(seg: 'upper_body' | 'lower_body' | 'trunk' | 'neck') {
  if (seg === 'upper_body') return [
    { i: LM.L_SHOULDER, label: 'L Shldr' },
    { i: LM.R_SHOULDER, label: 'R Shldr' },
    { i: LM.L_ELBOW,    label: 'L Elbow' },
    { i: LM.R_ELBOW,    label: 'R Elbow' },
    { i: LM.L_WRIST,    label: 'L Wrist' },
    { i: LM.R_WRIST,    label: 'R Wrist' },
  ]
  if (seg === 'lower_body') return [
    { i: LM.L_HIP,   label: 'L Hip' },
    { i: LM.R_HIP,   label: 'R Hip' },
    { i: LM.L_KNEE,  label: 'L Knee' },
    { i: LM.R_KNEE,  label: 'R Knee' },
    { i: LM.L_ANKLE, label: 'L Ankle' },
    { i: LM.R_ANKLE, label: 'R Ankle' },
  ]
  if (seg === 'neck') return [
    { i: LM.NOSE,       label: 'Nose' },
    { i: LM.L_EAR,      label: 'L Ear' },
    { i: LM.R_EAR,      label: 'R Ear' },
    { i: LM.L_SHOULDER, label: 'L Shldr' },
    { i: LM.R_SHOULDER, label: 'R Shldr' },
  ]
  return [
    { i: LM.L_SHOULDER, label: 'L Shldr' },
    { i: LM.R_SHOULDER, label: 'R Shldr' },
    { i: LM.L_HIP,      label: 'L Hip' },
    { i: LM.R_HIP,      label: 'R Hip' },
  ]
}

export function AssessmentView({ muscleId, muscleName }: Props) {
  const movements = useMemo(() => muscleId ? getMovementsForMuscle(muscleId) : [], [muscleId])

  if (!muscleId || movements.length === 0) {
    return null   // hide entirely when there's no ROM-relevant movement
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-orange-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-orange-300">
          Progress Assessment
        </span>
      </div>
      <p className="text-[11px] text-slate-400">
        Quick range-of-motion check for your {muscleName?.toLowerCase()}. I will coach you through it: first stand in neutral pose for a moment, then I will explain the movement, then you will have time to do it.
      </p>
      <div className="space-y-1.5">
        {movements.map((mv) => (
          <MovementRow key={mv.id} muscleId={muscleId} movement={mv} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  One row per movement — shows name, last result, sparkline, "Run" button
// ─────────────────────────────────────────────────────────────────────────────

function MovementRow({ muscleId, movement }: { muscleId: string; movement: JointMovement }) {
  const [side, setSide] = useState<'L' | 'R'>(movement.side === 'L' ? 'L' : movement.side === 'R' ? 'R' : 'R')
  const [open, setOpen] = useState(false)
  // Subscribe to ROM history changes so the trend chart updates the moment
  // an assessment is saved (without this, the useMemo only re-ran when the
  // user toggled the side or reopened the modal).
  const romVersion = useROMVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = useMemo(() => getRecordsFor(muscleId, movement.id, side), [muscleId, movement.id, side, open, romVersion])
  const last = records[records.length - 1]
  const improvement = computeImprovement(records)

  return (
    <div className="rounded bg-slate-950/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-slate-100">{movement.label}</div>
          <div className="text-[10px] text-slate-500">
            target {movement.reference.ideal}°
            {last && (
              <>
                {' · '}last <span className="tabular-nums text-slate-300">{Math.round(last.angle)}°</span>
                {' · '}<span className={pct(last.angle, movement.reference.ideal) >= 80 ? 'text-emerald-400' : 'text-orange-400'}>
                  {pct(last.angle, movement.reference.ideal)}%
                </span>
              </>
            )}
          </div>
        </div>
        {movement.side === 'either' && (
          <div className="flex rounded-md bg-slate-800 p-0.5">
            {(['L', 'R'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                  side === s ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md bg-orange-500/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-orange-400"
        >
          <Play size={10} /> Run
        </button>
      </div>

      {/* Progressive trend sparkline - kept compact so a single value
          doesn't dominate the panel. */}
      {records.length >= 1 && (
        <div className="mt-1.5">
          <TrendChart records={records} reference={movement.reference.ideal} />
          <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-500">
            <span>
              {records.length} session{records.length === 1 ? '' : 's'}
              {records.length >= 2 && (
                <> · best <span className="text-emerald-300 tabular-nums">{Math.round(Math.max(...records.map((r) => r.angle)))}°</span></>
              )}
            </span>
            {improvement !== null && (
              <span className={`font-semibold ${improvement >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {improvement >= 0 ? '▲ +' : '▼ '}{improvement}%
              </span>
            )}
          </div>
        </div>
      )}

      {open && (
        <AssessmentSession
          muscleId={muscleId}
          movement={movement}
          side={side}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function pct(angle: number, ref: number) {
  return Math.round(Math.min(1, angle / ref) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
//  TrendChart - progressive plot of past assessment peaks for one movement.
//
//  Shows the last N sessions as a continuous line with dots, the target
//  reference as a dashed horizontal line, the area under the curve filled,
//  and the latest value annotated. Much more legible than the old 90x22
//  micro-sparkline.
// ─────────────────────────────────────────────────────────────────────────────

function TrendChart({ records, reference }: { records: ROMRecord[]; reference: number }) {
  // Compact, low-profile sparkline - small enough that a single value
  // doesn't dominate the muscle panel, big enough to read the trend.
  const W = 260, H = 34, PL = 4, PR = 26, PT = 4, PB = 8
  const innerW = W - PL - PR
  const innerH = H - PT - PB
  // Cap the visible series at the last 12 records so older trends don't
  // squash the chart.
  const data = records.slice(-12)
  const n = data.length
  const xs = data.map((_, i) => PL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1)))
  // Normalise Y against the target reference. Cap visual at 1.10 (110 %)
  // so a hyper-flexible result still fits without rescaling the chart.
  const Y_MAX = Math.max(1.1, ...data.map((r) => r.angle / reference))
  const ys = data.map((r) => PT + innerH - (Math.min(Y_MAX, r.angle / reference) / Y_MAX) * innerH)
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  // Closed path for the area fill underneath the line.
  const area = `${path} L ${xs[n - 1].toFixed(1)} ${(PT + innerH).toFixed(1)} L ${xs[0].toFixed(1)} ${(PT + innerH).toFixed(1)} Z`
  // Where 100 % of reference sits on the chart.
  const refY = PT + innerH - (1 / Y_MAX) * innerH
  const last = data[n - 1]
  const lastX = xs[n - 1]
  const lastY = ys[n - 1]
  const lastIsGood = (last.angle / reference) >= 0.8

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="rounded bg-slate-950/60 ring-1 ring-slate-700/60"
    >
      <defs>
        <linearGradient id="rom-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fb923c" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Target reference dashed line */}
      <line
        x1={PL} x2={W - PR}
        y1={refY} y2={refY}
        stroke="#64748b" strokeWidth="0.8" strokeDasharray="3 3"
      />
      <text x={W - PR + 2} y={refY + 2.5} fontSize="7" fill="#64748b" fontFamily="ui-monospace,monospace">
        {Math.round(reference)}°
      </text>

      {/* Filled area under the curve */}
      {n >= 2 && <path d={area} fill="url(#rom-area)" />}

      {/* Trend line */}
      {n >= 2 && <path d={path} fill="none" stroke="#fb923c" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />}

      {/* Per-session dots */}
      {xs.map((x, i) => (
        <circle
          key={i}
          cx={x} cy={ys[i]} r={i === n - 1 ? 2 : 1.4}
          fill={i === n - 1 ? (lastIsGood ? '#34d399' : '#fb923c') : '#fb923c'}
          stroke="#0f172a" strokeWidth="0.6"
        />
      ))}

      {/* Latest-value annotation */}
      <text
        x={Math.min(lastX + 4, W - PR - 2)}
        y={Math.max(8, lastY - 3)}
        fontSize="8" fontWeight="600"
        fill={lastIsGood ? '#34d399' : '#fb923c'}
        fontFamily="ui-monospace,monospace"
      >
        {Math.round(last.angle)}°
      </text>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Assessment session modal — calibration → measurement → result
// ─────────────────────────────────────────────────────────────────────────────

export function AssessmentSession({
  muscleId, movement, side, onClose, onSaved, extraMuscleIds, autoCloseOnDone, briefMode,
}: {
  muscleId: string
  movement: JointMovement
  side: 'L' | 'R'
  onClose: () => void
  onSaved?: (rec: ROMRecord) => void
  extraMuscleIds?: string[]
  autoCloseOnDone?: boolean
  /** Brief coaching mode - used on the SECOND-of-pair side in a full-body
   *  battery. Skips the long intro + howTo and just says
   *  "Now repeat the same motion with your right side." Default false. */
  briefMode?: boolean
}) {
  const [phase, setPhase]     = useState<Phase>('calibrate')
  const [progress, setProgress] = useState(0)
  const [peak, setPeak]       = useState(0)
  // Live (current frame) angle.  Drives a real-time inner ring on the dial
  // so the user knows the detector is engaged, not just whether they happened
  // to peak earlier.
  const [live, setLive]       = useState<number | null>(null)
  // Live calibration progress (0..1) and per-check status — drives the
  // neutral-pose hold UI.
  const [calibProgress, setCalibProgress] = useState(0)
  const [calibStatus, setCalibStatus] = useState<{ ok: boolean; checks: Array<{ name: string; ok: boolean; hint: string }> }>(
    { ok: false, checks: [] }
  )
  // Per-landmark visibility readout, shown as a debug strip so the user can
  // see exactly which landmark is failing when something goes wrong.
  const [visibilityMap, setVisibilityMap] = useState<Record<number, number>>({})
  // Banner shown when the safety-net re-calibration triggers, so the user
  // understands why we bounced back.
  const [trackingWarning, setTrackingWarning] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const tts = useVoiceOutput()
  const ttsRef = useRef(tts)
  useEffect(() => { ttsRef.current = tts }, [tts])
  // Ensure the AI coach stops talking the moment this overlay is unmounted
  // (close button, outside click, browser back, route change, etc.).
  useEffect(() => {
    return () => {
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    }
  }, [])
  // Throttle the "Hold neutral pose" voice cue.
  const lastNeutralCueAt = useRef(0)
  const introSpokenForId = useRef<string | null>(null)
  // Neutral-pose debounce: require N CONSECUTIVE frames of ok-status before
  // declaring "detected". Without this the calibration timer (and the TTS
  // cue) fired on the very first ok frame — which routinely happens during
  // a transient sweep as the user is still moving into position, well
  // BEFORE they've actually settled into a stable neutral pose. The result
  // was the spoken "Neutral pose detected" landing 0.5-1s ahead of the
  // user being ready.
  const neutralOkStreak = useRef(0)
  // ~15 frames at 30 fps = 500 ms of sustained "ok" required.
  const NEUTRAL_FRAMES_REQUIRED = 15

  // ── Refs that mirror the latest values of the state above ──────────────
  // CameraView captures the onLandmarks callback ONCE (when it mounts /
  // when `active` flips), so any state read from a closure inside the
  // callback would be stale.  We instead read every piece of state that
  // matters via refs, which always point to the latest values.
  const phaseRef         = useRef<Phase>('calibrate')
  useEffect(() => { phaseRef.current = phase }, [phase])

  const peakRef          = useRef(0)
  const liveRef          = useRef<number | null>(null)
  const measuredFrames   = useRef(0)   // count of frames that yielded an angle
  const startedAt        = useRef<number>(0)
  // True wall-clock 'GO' moment - the timer doesn't start until this is set
  // by the chained TTS onEnd for "Begin in three... two... one... GO!".
  // Null means measure phase is active but the user hasn't been told to go
  // yet (coach is still explaining); the timer effect treats that as 0
  // elapsed and just keeps tracking peak.
  const measureReadyAt   = useRef<number | null>(null)
  const calibStartedAt   = useRef<number | null>(null)   // wall-clock ms when neutral pose first locked
  const lastValidLms     = useRef<LandmarkSet | null>(null)   // sticky cache for measurement
  const lastValidAt      = useRef<number>(0)
  // Tracking-lost detector: timestamp of when we first saw too many
  // landmarks below TRACKING_LOST_VIS during measurement.  Cleared the
  // moment they come back.  When it exceeds TRACKING_LOST_MS we bounce
  // back to calibration with a warning.
  const trackingLostSince = useRef<number | null>(null)
  // Neutral-pose baseline - average of the user's measured angle during the
  // last second of calibration. Subtracted from every subsequent angle so
  // a movement whose neutral resting value is non-zero (e.g. trunk
  // extension, cervical extension) doesn't "max out" the dial just by
  // standing still. Captured frame-by-frame during the calibrate phase.
  const baselineSamples  = useRef<number[]>([])
  const baselineAngle    = useRef<number>(0)
  // True once "Neutral pose detected" speech has finished playing. The
  // 3-second calibration countdown only starts AFTER speech ends, so the
  // user actually has 3 full seconds to hold the pose (previously the
  // timer started immediately and the speech overlapped with the count).
  const calibSpeechDone  = useRef<boolean>(false)
  // True once the camera-ready "stand still" cue (spoken on CameraView onReady)
  // has actually finished playing. Until then we refuse to start the neutral-
  // pose-detected -> 3-second-hold chain so the two speeches don't trample.
  const cameraIntroDone  = useRef<boolean>(false)

  // Hold timer for the measurement phase
  useEffect(() => {
    if (phase !== 'measure') return
    let raf = 0
    // DON'T set startedAt here any more - we wait for measureReadyAt to be
    // set by the "GO" TTS onEnd callback. This prevents the window from
    // elapsing while the coach is still explaining what to do.
    startedAt.current = 0
    measuredFrames.current = 0
    trackingLostSince.current = null
    const tick = () => {
      // Always track peak (the user might start moving early on the
      // explanation -> we'd rather catch that peak than miss it).
      setPeak(peakRef.current)
      setLive(liveRef.current)
      // The HOLD_MS clock only runs after the GO cue has actually played.
      if (measureReadyAt.current === null) {
        setProgress(0)
        raf = requestAnimationFrame(tick)
        return
      }
      if (startedAt.current === 0) startedAt.current = measureReadyAt.current
      const elapsed = performance.now() - startedAt.current
      const p = Math.min(1, elapsed / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        // Save whatever peak we got — even if zero — and show the result.
        // We don't bounce back to calibration here any more; the user asked
        // for measurement to be one continuous 5-second window with a real
        // result at the end.
        const result: ROMRecord = {
          muscleId,
          movementId: movement.id,
          side,
          angle:      peakRef.current,
          reference:  movement.reference.ideal,
          ts:         Date.now(),
        }
        saveROMRecord(result)
        // Mirror-write under every related muscleId so the same measurement
        // shows in each muscle's per-joint history. Used by the full-body
        // battery so a single shoulder_flexion test fills the deltoid /
        // pectoralis_major / latissimus_dorsi panels at once.
        if (extraMuscleIds && extraMuscleIds.length > 0) {
          const seen = new Set([muscleId])
          for (const extra of extraMuscleIds) {
            if (seen.has(extra)) continue
            seen.add(extra)
            saveROMRecord({ ...result, muscleId: extra })
          }
        }
        onSaved?.(result)
        setPhase('result')
        ttsRef.current.speak(
          `Peak angle ${Math.round(peakRef.current)} degrees, ${pct(peakRef.current, movement.reference.ideal)} percent of normal.`,
        )
        if (autoCloseOnDone) {
          // Give the user ~3.5 s to see the dial + hear the TTS before
          // moving on. The battery's onClose handler advances to next.
          window.setTimeout(() => { onClose() }, 3500)
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Stable landmarks handler — useCallback with no deps means CameraView
  // sees the SAME function reference for the entire session, and every
  // piece of dynamic state is read via refs (phaseRef, calibStartedAt,
  // peakRef, etc.) so the captured closure is never stale.
  const handleLandmarks = useCallback((lms: LandmarkSet) => {
    // Always update the visibility debug strip so the user can see, in
    // real time, which landmarks the pose model is finding.
    const tracked = trackedLandmarksFor(movement.segment)
    const visMap: Record<number, number> = {}
    let lowVisCount = 0
    for (const t of tracked) {
      const v = lms[t.i]?.visibility ?? 0
      visMap[t.i] = v
      if (v < TRACKING_LOST_VIS) lowVisCount += 1
    }
    setVisibilityMap(visMap)

    const now = performance.now()
    const phaseNow = phaseRef.current

    if (phaseNow === 'calibrate') {
      // The per-movement intro is now spoken inside the CameraView onReady
      // handler (above) which combines neutralPose + cameraOrientation +
      // movement label and uses an onEnd callback to gate
      // cameraIntroDone.  Speaking movement.intro AGAIN here would race
      // that cue.  We mark introSpokenForId so any external code that
      // checks it sees the intro as already covered.
      introSpokenForId.current = movement.id
      // Verify this is a TRUE neutral pose.  Per-check status drives the
      // overlay so the user knows which item to fix.
      const status = verifyNeutralPose(lms, movement.segment)
      setCalibStatus(status)

      if (status.ok) {
        // Require sustained ok-status before announcing detection.
        neutralOkStreak.current += 1
        if (neutralOkStreak.current >= NEUTRAL_FRAMES_REQUIRED) {
          if (calibStartedAt.current === null) {
            // DON'T start the 3-second timer yet - first speak the cue and
            // wait for it to finish so the user actually has the full
            // 3 seconds to settle.
            calibSpeechDone.current = false
            baselineSamples.current = []
            // Don't fire the "Neutral pose detected" cue until the camera
            // intro has actually finished speaking, otherwise the two
            // speeches overlap and both come out chopped.
            if (!cameraIntroDone.current) {
              // Hold here - just keep the streak alive, but don't speak
              // or start the timer yet.
            } else if (now - lastNeutralCueAt.current > 4000) {
              ttsRef.current.speak('Neutral pose detected. Hold for three seconds.', () => {
                calibSpeechDone.current = true
                calibStartedAt.current  = performance.now()
              })
              lastNeutralCueAt.current = now
            } else {
              // No speech this cycle (rate-limited cue) - start immediately.
              calibSpeechDone.current = true
              calibStartedAt.current  = now
            }
          }
          // Collect a baseline sample on every frame while we wait for the
          // speech + 3-second hold. We'll subtract this from peak so the
          // resting value doesn't count as ROM.
          {
            const baseAng = movement.measure(lms, side)
            if (baseAng !== null) baselineSamples.current.push(baseAng)
            if (baselineSamples.current.length > 60) baselineSamples.current.shift()
          }
          if (calibStartedAt.current === null) {
            // Still waiting for speech to finish - hold progress at 0.
            setCalibProgress(0)
          } else {
          const elapsed = now - calibStartedAt.current
          setCalibProgress(Math.min(1, elapsed / CALIB_MS))
          if (elapsed >= CALIB_MS) {
            // Settle the baseline value - median of collected samples is more
            // robust to a single noisy frame than a mean.
            if (baselineSamples.current.length > 0) {
              const sorted = [...baselineSamples.current].sort((a, b) => a - b)
              baselineAngle.current = sorted[Math.floor(sorted.length / 2)]
            } else {
              baselineAngle.current = 0
            }
            // Calibration complete -> announce + explain in plain language,
            // then switch to measurement. ONE-TIME ONLY per session.
            phaseRef.current = 'measure'
            peakRef.current = 0
            liveRef.current = null
            measuredFrames.current = 0
            calibStartedAt.current = null
            trackingLostSince.current = null
            neutralOkStreak.current = 0
            setCalibProgress(0)
            setError(null)
            setTrackingWarning(null)
            setPhase('measure')
            // Phased coaching chained through TTS onEnd callbacks so the
            // measurement window starts AFTER the user has actually heard
            // the "Begin" cue. Previous code used hardcoded setTimeout
            // delays that fired before TTS finished on a slowed (0.85x)
            // rate -> user heard the explanation but measurement ended
            // before "Begin" played. measureReadyAt stays null until the
            // begin TTS completes; the timer effect respects that.
            measureReadyAt.current = null
            const explanation = movement.howTo || movement.cue
            const sideName    = side === 'L' ? 'left' : 'right'
            // Brief mode (battery right-side after left): skip the full
            // explanation and just say "Now repeat with your right side."
            if (briefMode) {
              ttsRef.current.speak('Great. Locked in.', () => {
                ttsRef.current.speak(`Now repeat the same motion with your ${sideName} side.`, () => {
                  ttsRef.current.speak('Begin in three... two... one... GO!', () => {
                    measureReadyAt.current = performance.now()
                  })
                })
              })
            } else {
              const sideCue = movement.side === 'either'
                ? `Use your ${sideName} side.`
                : ''
              ttsRef.current.speak('Great. Locked in.', () => {
                const speakExplanation = () => {
                  ttsRef.current.speak(explanation, () => {
                    ttsRef.current.speak('Begin in three... two... one... GO!', () => {
                      measureReadyAt.current = performance.now()
                    })
                  })
                }
                if (sideCue) {
                  ttsRef.current.speak(sideCue, speakExplanation)
                } else {
                  speakExplanation()
                }
              })
            }
          }
        }
          }
      } else {
        // Pose broke — reset both the streak counter AND the calibration
        // timer so the user must sustain a TRUE neutral hold from zero.
        neutralOkStreak.current = 0
        calibStartedAt.current = null
        calibSpeechDone.current = false
        baselineSamples.current = []
        setCalibProgress(0)
      }
      return
    }

    if (phaseNow !== 'measure') return

    // Tracking-lost safety net.  Strictly MORE THAN 3 tracked landmarks
    // missing for over 1 second triggers a re-calibration with a banner.
    // 1, 2, or 3 missing landmarks are fine — the sticky cache handles
    // those.
    if (lowVisCount >= TRACKING_LOST_MIN_MISSING) {
      if (trackingLostSince.current === null) trackingLostSince.current = now
      if (now - trackingLostSince.current > TRACKING_LOST_MS) {
        // Bounce back to calibration with a warning.
        phaseRef.current = 'calibrate'
        peakRef.current = 0
        liveRef.current = null
        measuredFrames.current = 0
        calibStartedAt.current = null
        trackingLostSince.current = null
        lastValidLms.current = null
        neutralOkStreak.current = 0
        measureReadyAt.current = null
        startedAt.current = 0
        setProgress(0)
        setPeak(0)
        setLive(null)
        setCalibProgress(0)
        setCalibStatus({ ok: false, checks: [] })
        setTrackingWarning(
          'Tracking lost — too many body parts left the camera. ' +
          'Stand still in your neutral pose and hold for 3 seconds to restart.'
        )
        setPhase('calibrate')
        ttsRef.current.speak('Tracking lost. Please stand still in neutral pose and hold for three seconds.')
        return
      }
    } else {
      // Enough landmarks back — clear the warning timer.
      trackingLostSince.current = null
    }

    // Sticky-landmark measurement.  Try the current frame first; if it
    // returns null, fall back to the last known-good landmarks for up to
    // 1.5 seconds so brief detection dropouts don't flicker the dial.
    let ang = movement.measure(lms, side)
    if (ang !== null) {
      lastValidLms.current = lms
      lastValidAt.current = now
    } else if (
      lastValidLms.current !== null &&
      now - lastValidAt.current < 1500
    ) {
      ang = movement.measure(lastValidLms.current, side)
    }
    // Subtract baseline so a non-zero resting angle doesn't count as ROM.
    let adjusted = ang
    if (adjusted !== null) adjusted = Math.max(0, adjusted - baselineAngle.current)
    liveRef.current = adjusted
    if (adjusted !== null) {
      measuredFrames.current += 1
      setLive(adjusted)
      // Peak tracking is GATED on measureReadyAt - we only start scoring
      // peaks after the AI coach has actually said "GO". Previously the
      // peak began updating during the explanation, so a user moving
      // experimentally during the cue would lock in a wrong peak.
      if (measureReadyAt.current !== null && adjusted > peakRef.current) {
        peakRef.current = adjusted
      }
    }
  }, [movement, side, muscleId, briefMode])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/80 px-4 py-2">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-orange-400" />
          <span className="text-sm font-semibold tracking-wide">{movement.label}</span>
          <span className="text-[10px] text-slate-500">side {side}</span>
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
                  cameraIntroDone.current = false
                  // BRIEF MODE: the user just did this exact motion on the
                  // OTHER side. Don't re-lecture them - acknowledge the side
                  // switch and let them set up.
                  if (briefMode) {
                    const sideName = side === 'L' ? 'left' : 'right'
                    ttsRef.current.speak(
                      `Now switch to your ${sideName} side and hold the same neutral pose for three seconds.`,
                      () => { cameraIntroDone.current = true },
                    )
                    return
                  }
                  // FULL MODE: speak the per-movement neutral pose + camera
                  // orientation from human_joint_neutral_camera.json. Falls
                  // back to segment-generic copy if not available.
                  const np = movement.neutralPose
                  const co = movement.cameraOrientation
                  const fallback =
                    movement.segment === 'lower_body'
                      ? 'Stand tall with knees straight, feet under your hips.'
                      : movement.segment === 'neck'
                      ? 'Face the camera with both ears visible.'
                      : 'Stand still, arms hanging by your sides.'
                  const introLine = np && co
                    ? `Next test: ${movement.label}. ${np} ${co} Hold this position for three seconds.`
                    : `${fallback} Hold the neutral pose for three seconds.`
                  ttsRef.current.speak(introLine, () => {
                    cameraIntroDone.current = true
                  })
                }}
                onError={(m) => { setError(m) }}
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

            {/* HUD overlay */}
            <div className="pointer-events-none absolute inset-0 flex flex-col">
              {phase === 'calibrate' && (
                <div className="m-auto w-[min(420px,90vw)] rounded-lg bg-black/75 px-5 py-4 text-center backdrop-blur">
                  {/* Tracking-lost warning — only visible after a re-calibration */}
                  {trackingWarning && (
                    <div className="mb-3 rounded border border-amber-500/50 bg-amber-950/60 px-3 py-2 text-left text-[11px] text-amber-100">
                      <AlertCircle size={12} className="mr-1 inline" />
                      {trackingWarning}
                    </div>
                  )}
                  <div className="text-base font-semibold text-orange-300">{calibrationCopy(movement.segment)}</div>
                  <div className="mt-1 text-xs text-slate-300">
                    {calibrationHint(movement.segment)}
                  </div>
                  {/* Per-check status — green ✓ / amber ⚠ for each verification item */}
                  {calibStatus.checks.length > 0 && (
                    <ul className="mt-3 space-y-1 text-left">
                      {calibStatus.checks.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px]">
                          <span className={c.ok ? 'text-emerald-400' : 'text-amber-300'}>
                            {c.ok ? '✓' : '○'}
                          </span>
                          <span className={c.ok ? 'text-emerald-200' : 'text-amber-100'}>
                            {c.ok ? c.name : c.hint}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Big countdown number — only visible once neutral pose is locked */}
                  <div className="mt-3 flex items-center justify-center gap-3">
                    {calibProgress > 0 ? (
                      <span className="text-3xl font-bold tabular-nums text-orange-200">
                        {Math.max(1, Math.ceil((CALIB_MS - calibProgress * CALIB_MS) / 1000))}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Settle into neutral to start the 3-second timer</span>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full transition-all ${calibStatus.ok ? 'bg-emerald-400' : 'bg-amber-400/60'}`}
                         style={{ width: `${calibProgress * 100}%` }} />
                  </div>
                </div>
              )}
              {phase === 'measure' && (
                <>
                  <div className="m-3 max-w-sm self-start rounded-lg bg-black/70 p-3 backdrop-blur">
                    <div className="text-[10px] uppercase tracking-wider text-orange-400">{movement.joint}</div>
                    <div className="mt-0.5 text-sm font-semibold">{movement.label}</div>
                    <p className="mt-1 text-[11px] text-slate-200">{movement.cue}</p>
                  </div>
                  {/* Big circular ROM dial — peak in main numerals, live angle below */}
                  <div className="m-auto flex flex-col items-center">
                    <RomDial peak={peak} live={live} reference={movement.reference.ideal} />
                    <div className="mt-3 h-1.5 w-44 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-orange-400 transition-all" style={{ width: `${progress * 100}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Hold and reach for {Math.round(HOLD_MS / 1000)} s — slow and controlled
                    </div>
                    {/* Live indicator: shows the user that the system IS detecting them.
                        Yellow when live=null (joint not visible), green otherwise. */}
                    <div className={`mt-1.5 text-[10px] font-semibold ${
                      live === null ? 'text-amber-300' : 'text-emerald-300'
                    }`}>
                      {live === null
                        ? 'Joint not detected — keep your shoulder, elbow and hand in frame'
                        : `Live: ${Math.round(live)}°`}
                    </div>
                  </div>
                </>
              )}

              {/* Visibility debug strip — bottom of frame, shows per-landmark
                  confidence so the user can see exactly which landmark the
                  pose model isn't picking up.  Pill goes green/amber/red
                  with the visibility value. */}
              {(phase === 'calibrate' || phase === 'measure') && (
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-1.5 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-6 text-[10px]">
                  {trackedLandmarksFor(movement.segment).map((t) => {
                    const v = visibilityMap[t.i] ?? 0
                    const tone = v >= 0.5 ? 'bg-emerald-500/80 text-emerald-50'
                              : v >= 0.2 ? 'bg-amber-500/80 text-amber-50'
                              :            'bg-red-600/80 text-red-50'
                    return (
                      <span key={t.i} className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${tone}`}>
                        {t.label} {Math.round(v * 100)}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {phase === 'result' && (
          <ResultView
            angle={peak}
            reference={movement.reference.ideal}
            muscleId={muscleId}
            movementId={movement.id}
            side={side}
            onClose={onClose}
            onRetry={() => {
              peakRef.current = 0
              liveRef.current = null
              calibStartedAt.current = null
              measuredFrames.current = 0
              lastValidLms.current = null
              lastValidAt.current = 0
              trackingLostSince.current = null
              phaseRef.current = 'calibrate'
              setPeak(0)
              setLive(null)
              setProgress(0)
              setCalibProgress(0)
              setCalibStatus({ ok: false, checks: [] })
              setTrackingWarning(null)
              setError(null)
              setPhase('calibrate')
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROM dial — large circular indicator
// ─────────────────────────────────────────────────────────────────────────────

function RomDial({ peak, live, reference }: { peak: number; live?: number | null; reference: number }) {
  const SIZE = 180, STROKE = 14
  const r = (SIZE - STROKE) / 2
  const C = 2 * Math.PI * r
  const ratio = Math.min(1, peak / reference)
  const offset = C - C * ratio
  // Live ring: a thinner inner arc that tracks the CURRENT frame's angle so
  // users can see real-time feedback while moving — distinct from the peak
  // ring which only ratchets up.
  const liveRatio = live != null && live > 0 ? Math.min(1, live / reference) : 0
  const liveOffset = C - C * liveRatio
  return (
    <div className="relative flex h-[180px] w-[180px] items-center justify-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke="#1e293b" strokeWidth={STROKE} fill="none" />
        {/* Live (current) ring — thinner & translucent, sits behind the peak ring */}
        {live != null && (
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={r}
            stroke="#fdba74" strokeWidth={STROKE * 0.45} fill="none"
            strokeLinecap="round" opacity={0.55}
            strokeDasharray={C}
            strokeDashoffset={liveOffset}
            style={{ transition: 'stroke-dashoffset 60ms linear' }}
          />
        )}
        {/* Peak ring — full thickness, what the user is trying to maximise */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={r}
          stroke="#fb923c" strokeWidth={STROKE} fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 80ms linear' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums text-orange-200">{Math.round(peak)}°</span>
        <span className="text-[10px] uppercase text-slate-400">of {reference}° normal</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Result view
// ─────────────────────────────────────────────────────────────────────────────

function ResultView({
  angle, reference, muscleId, movementId, side, onClose, onRetry,
}: {
  angle: number; reference: number
  muscleId: string; movementId: string; side: 'L' | 'R'
  onClose: () => void; onRetry: () => void
}) {
  const records = useMemo(() => getRecordsFor(muscleId, movementId, side), [muscleId, movementId, side])
  const improvement = computeImprovement(records)
  const ratio = Math.min(1, angle / reference)
  const band  =
    ratio >= 0.9 ? 'Excellent — at or near full ROM.'
    : ratio >= 0.75 ? 'Good — close to normal range.'
    : ratio >= 0.55 ? 'Limited — protocol can move the needle.'
    : 'Significantly restricted — start with gentle daily mobility.'

  useEffect(() => {
    return () => disposeDetector()  // free GPU/CPU when leaving result
  }, [])

  return (
    <div className="m-auto max-w-md space-y-4 px-6 py-6 text-center">
      <RomDial peak={angle} reference={reference} />
      <div className="text-sm font-semibold text-slate-100">
        {Math.round(ratio * 100)}% of normal range
      </div>
      <div className="text-xs text-slate-400">{band}</div>
      {improvement !== null && (
        <div className={`rounded-md px-3 py-2 text-sm font-semibold ${
          improvement >= 0
            ? 'bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-700/40'
            : 'bg-amber-900/30 text-amber-300 ring-1 ring-amber-700/40'
        }`}>
          {improvement >= 0 ? '+' : ''}{improvement}% vs. your last session
        </div>
      )}
      <div className="flex gap-2 justify-center">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
        >
          <RefreshCw size={12} /> Retest
        </button>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-400"
        >
          Done <ChevronRight size={12} />
        </button>
      </div>
      <p className="text-[10px] text-slate-500">
        Saved to your local progress history — no data leaves this device.
      </p>
    </div>
  )
}
