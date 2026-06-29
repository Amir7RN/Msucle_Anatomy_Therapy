/**
 * CameraView.tsx
 *
 * Renders the webcam feed, runs MediaPipe Pose each frame, and draws a
 * coloured skeleton overlay on a transparent canvas.
 *
 * Mirror strategy (the double-flip bug fix)
 * ─────────────────────────────────────────
 * The video element uses CSS  scaleX(-1)  so the user sees themselves in
 * "selfie" orientation (raising your right hand = right hand on screen).
 * The canvas overlay uses the same CSS  scaleX(-1).
 *
 * IMPORTANT: because the canvas is already flipped by CSS, we must draw
 * landmarks with RAW coordinates (no manual 1-x inversion).  The CSS flip
 * then mirrors the drawn skeleton to match the flipped video perfectly.
 *
 * The old code did  x → 1-x  AND  scaleX(-1)  — a double flip — which put
 * every joint on the opposite side from the real limb.
 *
 * For biofeedback callbacks we emit raw landmark coordinates.  Angle
 * calculations use vectors between landmarks, which are invariant to a
 * horizontal flip, so the measured degrees are identical either way.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Camera as CameraIcon, RefreshCw } from 'lucide-react'
import { ensureDetector, detectVideoFrame } from '../../lib/movement/poseDetector'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { LM } from '../../lib/movement/landmarks'
import { createLandmarkFilter, type LandmarkFilter } from '../../lib/movement/signalFilter'

interface Props {
  active:      boolean
  onLandmarks: (lms: LandmarkSet) => void
  onReady?:    () => void
  onError?:    (message: string) => void
  /** Called once the webcam <video> is playing — lets a parent grab still
   *  frames (e.g. for Claude-vision load estimation) without owning the stream. */
  onVideoReady?: (video: HTMLVideoElement) => void
  /** When true, request the WIDEST possible field of view and force the
   *  camera's minimum optical/digital zoom after the stream starts.  Used by
   *  the walking (gait) test so a whole left-to-right walk fits in frame. */
  maxFov?:     boolean
}

// ─────────────────────────────────────────────────────────────────────────────
//  Granular skeleton segmentation
//
//  Each named segment gets its own colour and stroke thickness so the
//  user can read the overlay at a glance ("my left upper arm is the cyan
//  one").  Anatomical names match the way exercise cues are written in
//  protocol.ts.
// ─────────────────────────────────────────────────────────────────────────────

interface Segment {
  name:  string
  edges: Array<[number, number]>     // landmark index pairs
  color: string
}

const SKELETON_SEGMENTS: Segment[] = [
  { name: 'Torso',     edges: [[LM.L_SHOULDER, LM.R_SHOULDER], [LM.L_SHOULDER, LM.L_HIP], [LM.R_SHOULDER, LM.R_HIP], [LM.L_HIP, LM.R_HIP]],
    color: '#fb923c' },                                                 // orange
  { name: 'Upper Arm L', edges: [[LM.L_SHOULDER, LM.L_ELBOW]],         color: '#22d3ee' },   // cyan
  { name: 'Forearm L',   edges: [[LM.L_ELBOW,    LM.L_WRIST]],         color: '#a5f3fc' },   // light cyan
  { name: 'Upper Arm R', edges: [[LM.R_SHOULDER, LM.R_ELBOW]],         color: '#f472b6' },   // pink
  { name: 'Forearm R',   edges: [[LM.R_ELBOW,    LM.R_WRIST]],         color: '#fbcfe8' },   // light pink
  { name: 'Thigh L',     edges: [[LM.L_HIP,      LM.L_KNEE]],          color: '#a3e635' },   // lime
  { name: 'Shank L',     edges: [[LM.L_KNEE,     LM.L_ANKLE]],         color: '#d9f99d' },
  { name: 'Thigh R',     edges: [[LM.R_HIP,      LM.R_KNEE]],          color: '#fde047' },   // yellow
  { name: 'Shank R',     edges: [[LM.R_KNEE,     LM.R_ANKLE]],         color: '#fef08a' },
  // Foot lines — the ankle→toe (and heel) segments, so the ankle angle
  // (shank line vs foot line) is visible here just like the gait / movement /
  // remote-assessment overlays.
  { name: 'Foot L',      edges: [[LM.L_ANKLE, LM.L_HEEL], [LM.L_HEEL, LM.L_FOOT_IDX], [LM.L_ANKLE, LM.L_FOOT_IDX]],
    color: '#bef264' },
  { name: 'Foot R',      edges: [[LM.R_ANKLE, LM.R_HEEL], [LM.R_HEEL, LM.R_FOOT_IDX], [LM.R_ANKLE, LM.R_FOOT_IDX]],
    color: '#fde68a' },
  { name: 'Head',        edges: [[LM.NOSE,       LM.L_SHOULDER], [LM.NOSE, LM.R_SHOULDER]],
    color: '#94a3b8' },                                                 // slate
]

// Joint sizes by anatomical role so primary joints (hips, shoulders) read
// larger than secondary ones (wrists, ankles).
const JOINT_SIZES: Record<number, number> = {
  [LM.L_SHOULDER]: 1.5, [LM.R_SHOULDER]: 1.5,
  [LM.L_HIP]:      1.5, [LM.R_HIP]:      1.5,
  [LM.L_KNEE]:     1.2, [LM.R_KNEE]:     1.2,
  [LM.L_ELBOW]:    1.2, [LM.R_ELBOW]:    1.2,
}

// ─────────────────────────────────────────────────────────────────────────────
//  Landmark smoothing
//
//  Smoothing now lives in lib/movement/signalFilter.ts — a frame-rate-aware
//  One-Euro filter (Casiez et al., CHI 2012) with teleport/outlier rejection
//  and visibility hysteresis, applied to both the image and world-coord
//  channels.  It is calm on holds and snappy on fast reps, and it rejects the
//  single-frame MediaPipe "jumps" that previously corrupted angle readings.
// ─────────────────────────────────────────────────────────────────────────────

export function CameraView({ active, onLandmarks, onReady, onError, maxFov, onVideoReady }: Props) {
  const videoRef    = useRef<HTMLVideoElement | null>(null)
  const canvasRef   = useRef<HTMLCanvasElement | null>(null)
  const rafRef      = useRef<number | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const filterRef   = useRef<LandmarkFilter | null>(null)   // One-Euro filter state

  // Self-contained permission UX so EVERY panel that embeds the camera gets a
  // clear error + a one-tap "Enable camera" retry, instead of a silent black box.
  const [camError, setCamError] = useState<string | null>(null)
  const [granted,  setGranted]  = useState(false)
  const [attempt,  setAttempt]  = useState(0)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setCamError(null)

    async function setup() {
      // ── Step 1: camera permission + stream ────────────────────────────
      // Request the WIDEST FOV the device can offer — landscape 16:9, ideal
      // 1080p+, with zoom: 1 (the zoom-out hint, ignored on browsers that
      // don't support the constraint).  Pairs with object-fit:contain on
      // the <video> below so we never crop the sensor data.
      let stream: MediaStream
      try {
        // getUserMedia only exists in a SECURE context (https or localhost). On
        // a plain-http LAN address the API is missing entirely, which is the
        // most common reason "the camera won't turn on".
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          throw Object.assign(new Error('insecure'), { name: 'InsecureContextError' })
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API unavailable in this browser. Try Chrome / Safari, and make sure the page is served over https.')
        }
        const videoConstraints: MediaTrackConstraints = {
          facingMode:  { ideal: 'user' },
          width:       { ideal: 1920 },
          height:      { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
          // `zoom` and `resizeMode` are non-standard / experimental — wrap in
          // `advanced` so the constraint is silently dropped on unsupported
          // browsers instead of failing the whole call.
          advanced:    [{ zoom: 1 } as MediaTrackConstraintSet],
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })
      } catch (e) {
        const err = e as Error
        const inIframe = typeof window !== 'undefined' && window.self !== window.top
        const friendly =
          err.name === 'InsecureContextError' ? 'Camera needs a secure connection. Open this app over https:// (or http://localhost) and try again.'
          : err.name === 'NotAllowedError'    ? (inIframe
              ? 'Camera blocked. If this is embedded in another page, that page must allow camera access — or open the app in its own browser tab, then allow the camera.'
              : 'Camera permission denied. Click the camera icon in your browser’s address bar, allow access, then press Enable camera.')
          : err.name === 'NotFoundError'    ? 'No camera found on this device.'
          : err.name === 'NotReadableError' ? 'Camera is in use by another app — close other tabs/apps using the camera, then retry.'
          : `Camera error: ${err.message || err.name}`
        console.error('[camera] getUserMedia failed:', err)
        if (!cancelled) setCamError(friendly)
        onError?.(friendly)
        return
      }

      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      setGranted(true)
      setCamError(null)
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.muted = true
      video.playsInline = true

      try {
        await video.play()
        onVideoReady?.(video)
      } catch (e) {
        console.error('[camera] video.play() rejected:', e)
        onError?.(`Video could not start: ${(e as Error).message ?? e}`)
        return
      }

      // Widest-FOV mode (gait test): drive optical/digital zoom to its minimum
      // so the whole walking path fits. getCapabilities()/zoom are experimental
      // and only present on some mobile browsers — wrapped so it's a silent
      // no-op everywhere else.
      if (maxFov) {
        try {
          const track = stream.getVideoTracks()[0]
          const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number } }
          const advanced: MediaTrackConstraintSet[] = []
          if (caps.zoom && typeof caps.zoom.min === 'number') {
            advanced.push({ zoom: caps.zoom.min } as MediaTrackConstraintSet)
          }
          if (advanced.length) await track.applyConstraints({ advanced })
        } catch (e) {
          console.warn('[camera] min-zoom apply failed (non-fatal):', e)
        }
      }

      // ── Step 2: pose model load (separate try so we know which step failed)
      let detector
      try {
        detector = await ensureDetector()
      } catch (e) {
        console.error('[camera] pose model load failed:', e)
        onError?.((e as Error).message ?? 'Pose model failed to load')
        return
      }
      if (cancelled) return
      onReady?.()

      // ── Step 3: per-frame detection loop ─────────────────────────────
      const tick = () => {
        if (cancelled) return
        const v = videoRef.current
        const c = canvasRef.current
        if (v && c && v.readyState >= 2) {
          if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
            c.width  = v.videoWidth
            c.height = v.videoHeight
          }
          try {
            const now = performance.now()
            const raw = detectVideoFrame(detector, v, now)
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            if (raw) {
              // One-Euro filter + teleport rejection (lib/movement/signalFilter)
              if (!filterRef.current) filterRef.current = createLandmarkFilter()
              const lms = filterRef.current.push(raw, now)
              // Draw with RAW (smoothed) coordinates — the CSS scaleX(-1) on the
              // canvas handles the visual flip so the skeleton matches the video.
              drawSkeleton(ctx, lms, c.width, c.height)
              onLandmarks(lms)
            }
          } catch (e) {
            // Per-frame errors shouldn't tear down the whole pipeline;
            // log once and keep ticking.
            console.error('[pose] frame detect error:', e)
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    }
    void setup()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setGranted(false)
      filterRef.current?.reset()   // reset smoother so next session starts fresh
      filterRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attempt])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"            /* contain, not cover — show full sensor */
        style={{ transform: 'scaleX(-1)' }}                 /* selfie-mirror */
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Permission / error overlay — gives the user a clear reason + a one-tap
          retry on EVERY panel that embeds the camera. */}
      {active && camError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center">
          <CameraIcon size={26} className="text-amber-300" />
          <p className="max-w-xs text-[11px] leading-relaxed text-slate-200">{camError}</p>
          <button
            onClick={() => { setCamError(null); setAttempt((a) => a + 1) }}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-400"
          >
            <RefreshCw size={13} /> Enable camera
          </button>
        </div>
      )}

      {/* Quiet "starting" affordance before the stream is granted (no error yet). */}
      {active && !granted && !camError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <CameraIcon size={14} className="text-amber-300" /> Starting camera…
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Draw the segmented skeleton.  Each anatomical region gets its own colour
 * and a thickness scaled to the canvas, so segments stay readable at any
 * resolution.  Joints are filled with the segment colour for crisp endpoints.
 *
 * The "zero" calibration is implicit: landmarks are already in normalised
 * image coords [0..1] which line up 1:1 with the canvas pixel grid.  We
 * use the same canvas dimensions as the video sensor (set by the caller),
 * so the overlay sits exactly on the body without manual offset math.
 */
function drawSkeleton(ctx: CanvasRenderingContext2D, lms: LandmarkSet, w: number, h: number) {
  const px = (p: { x: number; y: number }) => [p.x * w, p.y * h] as const
  // Use large multipliers because the canvas is at NATIVE video resolution
  // (e.g. 1920 px) but may display at 300 CSS px — a 6× scale-down.
  // 0.018 × 1920 = 34 canvas px ≈ 6 displayed px at 1× DPR.  Visible at all
  // device sizes including small phones.
  // Thinner skeleton — wireframe look instead of marker pen.  Halved both
  // the floor and the per-pixel scaling vs. the original values.
  const baseLW = Math.max(2.5, w * 0.005)
  const baseR  = Math.max(3.5, w * 0.007)

  // Subtle dark outline behind every line — improves readability on busy
  // backgrounds and gives the skeleton a "rendered" feel.
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const seg of SKELETON_SEGMENTS) {
    for (const [a, b] of seg.edges) {
      const pa = lms[a], pb = lms[b]
      if (!pa || !pb) continue
      if ((pa.visibility ?? 0) < 0.5 || (pb.visibility ?? 0) < 0.5) continue
      const [ax, ay] = px(pa)
      const [bx, by] = px(pb)

      // Outer dark stroke (acts as a halo)
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth   = baseLW + 3
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()

      // Inner coloured stroke
      ctx.strokeStyle = seg.color
      ctx.lineWidth   = baseLW
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
    }
  }

  // Joints — coloured by which segment they belong to (primary joint = first
  // edge endpoint encountered).  Larger for major joints.
  const jointColor: Record<number, string> = {}
  for (const seg of SKELETON_SEGMENTS) {
    for (const [a, b] of seg.edges) {
      jointColor[a] = jointColor[a] ?? seg.color
      jointColor[b] = jointColor[b] ?? seg.color
    }
  }
  for (const [idxStr, color] of Object.entries(jointColor)) {
    const i = Number(idxStr)
    const p = lms[i]
    if (!p || (p.visibility ?? 0) < 0.5) continue
    const [x, y] = px(p)
    const r = baseR * (JOINT_SIZES[i] ?? 1)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
}
