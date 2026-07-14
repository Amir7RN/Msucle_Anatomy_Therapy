/**
 * tracker.ts
 *
 * LowerLimbTracker — the public, framework-agnostic entry point for this
 * package. Point it at ANY <video> element that's already playing (a local
 * webcam via getUserMedia, a remote peer's video element from your OWN
 * call/WebRTC stack, or a plain recorded file) and it will:
 *
 *   - run MediaPipe pose detection + One-Euro landmark smoothing
 *   - compute a depth-corrected left/right ankle + shank angle every frame
 *   - bridge short tracking gaps (occlusion/motion blur) via interpolation
 *   - let you "zero" the reading to the current pose at any instant
 *   - optionally draw a skeleton + live angle labels onto a canvas you provide
 *   - optionally record that same composite (video + overlay) to an mp4
 *     (webm fallback), with the same neutral-zeroing applied to the whole clip
 *
 * This class intentionally has NO WebRTC/signaling/call code — that's your
 * own infrastructure. It only ever touches the <video> element you hand it.
 */

import { createPoseDetector, detectVideoFrame, disposePoseDetector, type PoseDetectorOptions } from './poseDetector'
import { createLandmarkFilter, type LandmarkFilter } from './signalFilter'
import {
  measureGaitFrame, GaitGapFiller, GaitStepMachine, summariseGait, fillInstantaneousSpeed,
  buildGaitCsv, ANKLE_DEPTH_TRUST_CAP, type GaitSample, type GaitSummary,
} from './gait'
import { BaselineCollector, zeroSigned } from './baseline'
import { measurementConfidence, confidenceBand } from './confidence'
import { depthReliability } from './anatomicalFrame'
import { LM, type LandmarkSet } from './landmarks'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

export type ConfidenceBand = 'strong' | 'fair' | 'weak'

export interface LowerLimbFrame {
  timestampMs: number
  /** Degrees, + dorsiflexion / − plantarflexion. Relative to the last zero()
   *  once one has been captured (see `zeroed`); raw otherwise. */
  leftAnkleDeg: number | null
  rightAnkleDeg: number | null
  leftShankDeg: number | null
  rightShankDeg: number | null
  /** True when this frame's ankle value was bridged (gap-filled) rather than
   *  a fresh measurement — see README "Interpolation & tracking loss". */
  leftInterpolated: boolean
  rightInterpolated: boolean
  /** Fused live tracking-confidence badge, per side. */
  leftConfidence: ConfidenceBand
  rightConfidence: ConfidenceBand
  /** True once a zero() baseline is active and applied to the *Deg fields above. */
  zeroed: boolean
  /** Full 33-point smoothed landmark set, for consumers who want more than
   *  the ankle pair (e.g. knee/hip angles) — see landmarks.ts's LM indices. */
  landmarks: LandmarkSet
}

export interface LowerLimbTrackerOptions extends PoseDetectorOptions {
  /** Canvas to draw the live skeleton + angle labels onto every frame (kept
   *  transparent so you can CSS-stack it over your own <video> element).
   *  Optional — omit for headless (data-only) use. Recording works either
   *  way; it always composites onto its own private offscreen canvas. */
  overlayCanvas?: HTMLCanvasElement
  /** Cap on how much the ankle angle blend trusts 3-D depth (0..1). Default
   *  matches gait.ts's ANKLE_DEPTH_TRUST_CAP (0.5) — see gait.ts's module
   *  docstring for why this is capped rather than fully trusted. */
  depthTrustCap?: number
}

const KEY_LA = 'leftAnkle'
const KEY_RA = 'rightAnkle'
const KEY_LS = 'leftShank'
const KEY_RS = 'rightShank'

// Typical convergence for zero() — the very first frame after calling it
// already reads ~0 (see BaselineCollector.currentOffsets, called every frame
// while collecting); this just bounds how long it keeps refining.
const BASELINE_WINDOW_MS = 300
const BASELINE_HARD_CAP_MS = 2000
const BASELINE_MIN_SAMPLES = 3

// Skeleton edges + joints drawn on the overlay/recording canvas. L=orange /
// R=cyan throughout this package (overlay, labels, docs, plots).
const EDGES: Array<[number, number, string]> = [
  [LM.L_SHOULDER, LM.R_SHOULDER, '#fb923c'],
  [LM.L_SHOULDER, LM.L_HIP, '#fb923c'], [LM.R_SHOULDER, LM.R_HIP, '#fb923c'],
  [LM.L_HIP, LM.R_HIP, '#fb923c'],
  [LM.L_HIP, LM.L_KNEE, '#a3e635'], [LM.L_KNEE, LM.L_ANKLE, '#d9f99d'], [LM.L_ANKLE, LM.L_FOOT_IDX, '#d9f99d'],
  [LM.R_HIP, LM.R_KNEE, '#fde047'], [LM.R_KNEE, LM.R_ANKLE, '#fef08a'], [LM.R_ANKLE, LM.R_FOOT_IDX, '#fef08a'],
]
const JOINTS = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE]

function drawSkeleton(ctx: CanvasRenderingContext2D, lms: LandmarkSet, w: number, h: number) {
  ctx.lineCap = 'round'
  for (const [a, b, color] of EDGES) {
    const pa = lms[a], pb = lms[b]
    if (!pa || !pb) continue
    if ((pa.visibility ?? 0) < 0.3 || (pb.visibility ?? 0) < 0.3) continue
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(4, w * 0.008)
    ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke()
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, w * 0.005)
    ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke()
  }
  for (const j of JOINTS) {
    const p = lms[j]
    if (!p || (p.visibility ?? 0) < 0.3) continue
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath(); ctx.arc(p.x * w, p.y * h, Math.max(3, w * 0.006), 0, Math.PI * 2); ctx.fill()
  }
}

function drawAnkleLabels(ctx: CanvasRenderingContext2D, lms: LandmarkSet, w: number, h: number, f: LowerLimbFrame) {
  const fontPx = Math.max(12, w * 0.016)
  ctx.font = `bold ${fontPx}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'left'
  const label = (v: number | null, interpolated: boolean) =>
    v == null ? '—' : `${interpolated ? '~' : ''}${v > 0 ? '+' : ''}${Math.round(v)}°`
  const draw = (idx: number, text: string, color: string, dim: boolean, dx: number) => {
    const p = lms[idx]
    if (!p) return
    const x = p.x * w + dx, y = p.y * h
    ctx.globalAlpha = dim ? 0.55 : 0.95
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(2, w * 0.003)
    ctx.strokeText(text, x, y)
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    ctx.globalAlpha = 1
  }
  draw(LM.L_ANKLE, label(f.leftAnkleDeg, f.leftInterpolated), '#fb923c', f.leftInterpolated, -fontPx * 2.6)
  draw(LM.R_ANKLE, label(f.rightAnkleDeg, f.rightInterpolated), '#22d3ee', f.rightInterpolated, fontPx * 0.5)
}

/** Prefer MP4 (H.264/AAC) so the saved clip is a universally-playable .mp4;
 *  browsers that don't support it fall back to WebM. */
function pickMime(): string {
  const opts = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const o of opts) { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(o)) return o }
  return ''
}

export class LowerLimbTracker {
  private video: HTMLVideoElement
  private overlayCanvas?: HTMLCanvasElement
  private opts: LowerLimbTrackerOptions
  private depthTrustCap: number

  private detector: PoseLandmarker | null = null
  private filter: LandmarkFilter | null = null
  private gapLA = new GaitGapFiller()
  private gapRA = new GaitGapFiller()
  private gapLS = new GaitGapFiller()
  private gapRS = new GaitGapFiller()
  private stepMachine = new GaitStepMachine()

  private rafId: number | null = null
  private running = false
  private listeners = new Set<(f: LowerLimbFrame) => void>()

  private baselineCollector = new BaselineCollector()
  private baselineOffsets: Record<string, number> | null = null
  private baselining = false
  private baselineStart = 0

  private recCanvas: HTMLCanvasElement | null = null
  private mediaRecorder: MediaRecorder | null = null
  private recChunks: Blob[] = []
  private recording = false
  private recStart = 0
  private prevHipX: number | null = null
  private hipVelEma = 0
  private walkDir = 1
  private rawSamples: Array<{ t: number; la: number | null; ra: number | null; ls: number | null; rs: number | null }> = []
  private samples: GaitSample[] = []
  private lastSummary: GaitSummary | null = null

  constructor(video: HTMLVideoElement, opts: LowerLimbTrackerOptions = {}) {
    this.video = video
    this.overlayCanvas = opts.overlayCanvas
    this.opts = opts
    this.depthTrustCap = opts.depthTrustCap ?? ANKLE_DEPTH_TRUST_CAP
  }

  /** Loads the pose model and begins the per-frame tracking loop. */
  async start(): Promise<void> {
    if (this.running) return
    this.detector = await createPoseDetector(this.opts)
    this.filter = createLandmarkFilter()
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.tick()
      this.rafId = requestAnimationFrame(loop)
    }
    loop()
  }

  /** Stops the tracking loop (does not release the model — call destroy()
   *  for that, or start() again to resume). */
  stop(): void {
    this.running = false
    if (this.rafId != null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  /** Instantly re-baseline every channel to the CURRENT pose — every
   *  *Deg value in onFrame()/getSummary() becomes a delta from this instant
   *  going forward. Converges over ~300ms (the very first frame after
   *  calling this already reads ~0); safe to call whether or not you're
   *  recording. */
  zero(): void {
    this.baselineCollector.reset()
    this.baselineOffsets = null
    this.baselining = true
    this.baselineStart = performance.now()
  }

  /** Reverts to raw (un-zeroed) readings. */
  clearZero(): void {
    this.baselineCollector.reset()
    this.baselineOffsets = null
    this.baselining = false
  }

  /**
   * Starts recording the composite (video + skeleton + angle labels) to a
   * clip, and resets the step/summary buffers for a fresh session. Zeroes
   * the baseline by default (pass `zeroFirst: false` to keep whatever
   * baseline — or lack of one — is already active).
   */
  startRecording(zeroFirst = true): void {
    if (this.recording) return
    this.rawSamples = []
    this.samples = []
    this.lastSummary = null
    this.stepMachine.reset()
    this.prevHipX = null; this.hipVelEma = 0; this.walkDir = 1
    this.recStart = performance.now()
    if (zeroFirst) this.zero()

    const rc = this.recCanvas ?? (this.recCanvas = document.createElement('canvas'))
    rc.width = this.video.videoWidth || 640
    rc.height = this.video.videoHeight || 480
    if (typeof rc.captureStream !== 'function') {
      throw new Error('LowerLimbTracker: this browser does not support canvas.captureStream() — cannot record.')
    }
    const stream = rc.captureStream(30)
    // Carry over audio from whatever's already feeding the video element
    // (a local getUserMedia stream, a remote WebRTC peer's stream, etc.) —
    // works with any source without this package needing to know about it.
    const src = this.video.srcObject
    if (src instanceof MediaStream) src.getAudioTracks().forEach((t) => stream.addTrack(t))

    this.recChunks = []
    const mime = pickMime()
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    mr.ondataavailable = (e) => { if (e.data && e.data.size) this.recChunks.push(e.data) }
    mr.start(250)
    this.mediaRecorder = mr
    this.recording = true
  }

  /** Stops recording and resolves with the captured clip (mp4 where the
   *  browser supports it, webm otherwise — check `blob.type`). Also
   *  finalizes getSummary()/exportCsv() for this recording window. */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder
      if (!mr || !this.recording) { reject(new Error('LowerLimbTracker: not recording.')); return }
      this.recording = false
      mr.onstop = () => {
        const type = this.recChunks[0]?.type || mr.mimeType || 'video/webm'
        const blob = new Blob(this.recChunks, { type })
        this.finalizeSamples()
        resolve(blob)
      }
      mr.stop()
      this.mediaRecorder = null
    })
  }

  /** Subscribe to every processed frame (runs continuously whether or not
   *  you're recording). Returns an unsubscribe function. */
  onFrame(cb: (f: LowerLimbFrame) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** Excursion/cadence/speed/symmetry summary for the last
   *  startRecording()..stopRecording() window, or null before one completes. */
  getSummary(): GaitSummary | null { return this.lastSummary }

  /** CSV of the last recording window's summary + per-frame samples, or
   *  null before one completes. */
  exportCsv(): string | null {
    return this.lastSummary ? buildGaitCsv(this.samples, this.lastSummary) : null
  }

  /** Releases the pose model and stops the loop. Call when you're done with
   *  this tracker (e.g. the call/page is closing). */
  destroy(): void {
    this.stop()
    if (this.recording) { try { this.mediaRecorder?.stop() } catch { /* */ } }
    this.recording = false
    disposePoseDetector(this.detector)
    this.detector = null
    this.listeners.clear()
  }

  // ── internals ────────────────────────────────────────────────────────────

  private finalizeSamples(): void {
    const raw = this.rawSamples
    if (raw.length < 5) return
    const off = this.baselineOffsets
    const samples: GaitSample[] = raw.map((s) => ({
      t: s.t, leg: 'out',
      leftAnkle: zeroSigned(s.la, off, KEY_LA),
      rightAnkle: zeroSigned(s.ra, off, KEY_RA),
      leftShank: zeroSigned(s.ls, off, KEY_LS),
      rightShank: zeroSigned(s.rs, off, KEY_RS),
      speed: null,
    }))
    const stepLen = this.stepMachine.medianStepLength()
    fillInstantaneousSpeed(samples, stepLen)
    this.samples = samples
    this.lastSummary = summariseGait(samples, this.stepMachine.count(), stepLen)
  }

  private tick(): void {
    const v = this.video
    if (!this.detector || !this.filter || v.readyState < 2 || !v.videoWidth) return
    const nowMs = performance.now()
    const raw = detectVideoFrame(this.detector, v, nowMs)
    // One-Euro smoothing + teleport rejection before any angle math.
    const lms = raw ? this.filter.push(raw, nowMs) : null
    const m = lms ? measureGaitFrame(lms) : null

    // Gap-fill runs every frame, unconditionally, so each channel's
    // hold/velocity state stays continuous regardless of zero()/recording state.
    const la = this.gapLA.push(m?.leftAnkle ?? null, nowMs)
    const ra = this.gapRA.push(m?.rightAnkle ?? null, nowMs)
    const ls = this.gapLS.push(m?.leftShank ?? null, nowMs)
    const rs = this.gapRS.push(m?.rightShank ?? null, nowMs)

    if (this.baselining) {
      // Feed GENUINE (non-interpolated) samples only, so a held/extrapolated
      // guess never pollutes the neutral-standing median.
      if (!la.interpolated && la.value != null) this.baselineCollector.addSample(KEY_LA, la.value)
      if (!ra.interpolated && ra.value != null) this.baselineCollector.addSample(KEY_RA, ra.value)
      if (!ls.interpolated && ls.value != null) this.baselineCollector.addSample(KEY_LS, ls.value)
      if (!rs.interpolated && rs.value != null) this.baselineCollector.addSample(KEY_RS, rs.value)
      // Recompute every frame — the very first frame's own reading becomes
      // its own baseline (reads ~0 immediately), refining over a short window.
      this.baselineOffsets = this.baselineCollector.currentOffsets()
      const elapsed = nowMs - this.baselineStart
      const settled = elapsed >= BASELINE_WINDOW_MS && this.baselineCollector.ready(BASELINE_MIN_SAMPLES)
      if (settled || elapsed >= BASELINE_HARD_CAP_MS) this.baselining = false
    }

    const off = this.baselineOffsets

    let laDr = 0, raDr = 0
    if (lms) {
      laDr = Math.min(this.depthTrustCap, depthReliability(lms, LM.L_KNEE, LM.L_ANKLE, LM.L_FOOT_IDX))
      raDr = Math.min(this.depthTrustCap, depthReliability(lms, LM.R_KNEE, LM.R_ANKLE, LM.R_FOOT_IDX))
    }

    const frame: LowerLimbFrame = {
      timestampMs: nowMs,
      leftAnkleDeg: zeroSigned(la.value, off, KEY_LA),
      rightAnkleDeg: zeroSigned(ra.value, off, KEY_RA),
      leftShankDeg: zeroSigned(ls.value, off, KEY_LS),
      rightShankDeg: zeroSigned(rs.value, off, KEY_RS),
      leftInterpolated: la.interpolated,
      rightInterpolated: ra.interpolated,
      leftConfidence: confidenceBand(measurementConfidence({ visibility: m?.leftVis ?? 0, depthReliability: laDr, stability: la.interpolated ? 0.3 : 0.85 })),
      rightConfidence: confidenceBand(measurementConfidence({ visibility: m?.rightVis ?? 0, depthReliability: raDr, stability: ra.interpolated ? 0.3 : 0.85 })),
      zeroed: off != null,
      landmarks: lms ?? [],
    }
    this.listeners.forEach((cb) => cb(frame))

    // Live overlay: transparent skeleton + labels only, so callers can
    // CSS-stack this canvas over their own <video> without it showing a
    // second copy of the video.
    if (this.overlayCanvas) {
      const c = this.overlayCanvas
      if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight }
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, c.width, c.height)
        if (lms) { drawSkeleton(ctx, lms, c.width, c.height); drawAnkleLabels(ctx, lms, c.width, c.height, frame) }
      }
    }

    if (this.recording) {
      // Composite (video + skeleton + labels) onto a private offscreen
      // canvas — this is what captureStream() records, so the saved clip
      // has the pose overlay BURNED IN regardless of what overlayCanvas does.
      const rc = this.recCanvas ?? (this.recCanvas = document.createElement('canvas'))
      if (rc.width !== v.videoWidth || rc.height !== v.videoHeight) { rc.width = v.videoWidth; rc.height = v.videoHeight }
      const rctx = rc.getContext('2d')
      if (rctx) {
        rctx.drawImage(v, 0, 0, rc.width, rc.height)
        if (lms) { drawSkeleton(rctx, lms, rc.width, rc.height); drawAnkleLabels(rctx, lms, rc.width, rc.height, frame) }
      }

      const t = (nowMs - this.recStart) / 1000
      this.rawSamples.push({ t, la: la.value, ra: ra.value, ls: ls.value, rs: rs.value })
      if (m) {
        const hx = m.hipX
        if (this.prevHipX != null) this.hipVelEma = 0.3 * (hx - this.prevHipX) + 0.7 * this.hipVelEma
        this.prevHipX = hx
        if (Math.abs(this.hipVelEma) > 0.0015) this.walkDir = this.hipVelEma > 0 ? 1 : -1
        this.stepMachine.push(m.leftAnkleX, m.rightAnkleX, m.hipX, this.walkDir, t, m.legLen, m.stepLenM)
      }
    }
  }
}
