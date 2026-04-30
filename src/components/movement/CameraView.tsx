/**
 * CameraView.tsx
 *
 * Renders the user's webcam, runs MediaPipe pose detection on each frame,
 * and draws the skeleton overlay on a transparent canvas.  Fires a callback
 * with each new landmark set for the orchestrator to analyse.
 *
 * The video element is mirrored (selfie-style) so movements feel natural;
 * landmark coordinates are mirrored back to body-space (left limb = body's
 * left) before being passed to the analyser.
 */

import React, { useEffect, useRef } from 'react'
import { ensureDetector, detectVideoFrame } from '../../lib/movement/poseDetector'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { LM } from '../../lib/movement/landmarks'

interface Props {
  active:      boolean
  onLandmarks: (lms: LandmarkSet) => void
  onReady?:    () => void
  onError?:    (message: string) => void
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

export function CameraView({ active, onLandmarks, onReady, onError }: Props) {
  const videoRef  = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef    = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function setup() {
      // ── Step 1: camera permission + stream ────────────────────────────
      // Request the WIDEST FOV the device can offer — landscape 16:9, ideal
      // 1080p+, with zoom: 1 (the zoom-out hint, ignored on browsers that
      // don't support the constraint).  Pairs with object-fit:contain on
      // the <video> below so we never crop the sensor data.
      let stream: MediaStream
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API unavailable in this browser. Try Chrome / Safari.')
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
        const friendly =
          err.name === 'NotAllowedError'    ? 'Camera permission denied. Allow camera access in your browser settings and reload.'
          : err.name === 'NotFoundError'    ? 'No camera found on this device.'
          : err.name === 'NotReadableError' ? 'Camera is in use by another app — close other tabs/apps using the camera.'
          : `Camera error: ${err.message || err.name}`
        console.error('[camera] getUserMedia failed:', err)
        onError?.(friendly)
        return
      }

      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.muted = true
      video.playsInline = true

      try {
        await video.play()
      } catch (e) {
        console.error('[camera] video.play() rejected:', e)
        onError?.(`Video could not start: ${(e as Error).message ?? e}`)
        return
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
            const lms = detectVideoFrame(detector, v, performance.now())
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            if (lms) {
              const mirrored = lms.map((p) => ({ ...p, x: 1 - p.x }))
              drawSkeleton(ctx, mirrored, c.width, c.height)
              onLandmarks(mirrored)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

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
  const baseLW = Math.max(3, w * 0.005)
  const baseR  = Math.max(4, w * 0.006)

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
