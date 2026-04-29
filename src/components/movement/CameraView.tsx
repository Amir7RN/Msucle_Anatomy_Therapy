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

// Skeleton edges — pairs of landmark indices to draw lines between.
const EDGES: Array<[number, number]> = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW], [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW], [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP],   [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE], [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE], [LM.R_KNEE, LM.R_ANKLE],
]

export function CameraView({ active, onLandmarks, onReady, onError }: Props) {
  const videoRef  = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef    = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        await video.play()

        const detector = await ensureDetector()
        if (cancelled) return
        onReady?.()

        const tick = () => {
          if (cancelled) return
          const v = videoRef.current
          const c = canvasRef.current
          if (v && c && v.readyState >= 2) {
            // Match canvas to video render size
            if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
              c.width  = v.videoWidth
              c.height = v.videoHeight
            }
            const lms = detectVideoFrame(detector, v, performance.now())
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            if (lms) {
              // Mirror x for body-space (selfie video is flipped via CSS, so
              // the LANDMARK x's also need flipping to match the viewer's mental model).
              const mirrored = lms.map((p) => ({ ...p, x: 1 - p.x }))
              drawSkeleton(ctx, mirrored, c.width, c.height)
              onLandmarks(mirrored)
            }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch (e) {
        onError?.((e as Error).message ?? 'Camera unavailable')
      }
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
        className="h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}   // selfie mirror for natural feel
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
    </div>
  )
}

function drawSkeleton(ctx: CanvasRenderingContext2D, lms: LandmarkSet, w: number, h: number) {
  const px = (p: { x: number; y: number }) => [p.x * w, p.y * h] as const
  ctx.lineWidth = Math.max(2, w * 0.004)

  // Edges
  ctx.strokeStyle = 'rgba(255,140,0,0.85)'
  for (const [a, b] of EDGES) {
    const pa = lms[a], pb = lms[b]
    if (!pa || !pb) continue
    if ((pa.visibility ?? 0) < 0.5 || (pb.visibility ?? 0) < 0.5) continue
    const [ax, ay] = px(pa)
    const [bx, by] = px(pb)
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
  }
  // Joints
  ctx.fillStyle = '#FFF3D8'
  for (const i of EDGES.flat()) {
    const p = lms[i]
    if (!p || (p.visibility ?? 0) < 0.5) continue
    const [x, y] = px(p)
    ctx.beginPath(); ctx.arc(x, y, Math.max(3, w * 0.005), 0, Math.PI * 2); ctx.fill()
  }
}
