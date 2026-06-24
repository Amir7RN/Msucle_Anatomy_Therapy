/**
 * signalFilter.ts
 *
 * Production-grade landmark stream conditioning for a single-camera pose
 * pipeline.  Replaces the hand-rolled adaptive-EMA in CameraView with three
 * layers that every serious markerless-mocap stack uses:
 *
 *   1. One-Euro filter  (Casiez, Roussel & Vogel, CHI 2012)
 *      The reference low-latency filter for noisy interactive signals. A
 *      first-order adaptive low-pass whose cutoff rises with speed: it is
 *      very smooth when a joint is still (kills jitter on a hold) and very
 *      responsive when it moves fast (no lag on a quick rep). Tuned per
 *      coordinate, applied independently to image x/y/z and world wx/wy/wz.
 *
 *   2. Teleport / outlier rejection
 *      MediaPipe occasionally emits a single-frame "jump" — a wrist that
 *      snaps across the frame for one detection then snaps back. These
 *      destroy angle measurements (a 90° elbow reads 150° for one frame).
 *      We reject any per-frame displacement that is physically impossible
 *      (> MAX_SPEED) and HOLD the previous filtered value for that frame,
 *      counting consecutive rejects so a genuine fast move (sustained) is
 *      eventually accepted rather than frozen forever.
 *
 *   3. Confidence-weighted visibility hysteresis
 *      MediaPipe's per-frame visibility flickers (a raised wrist dips from
 *      0.6→0.05 between frames without moving). We low-pass visibility so a
 *      1–2 frame dropout doesn't blank the measurement, but a real loss
 *      (visibility stays ~0) decays past threshold within ~150 ms.
 *
 * The filter is frame-rate aware: it takes the real Δt between frames, so it
 * behaves identically at 15 fps (CPU delegate) and 30 fps (GPU delegate).
 *
 * Usage (CameraView):
 *   const filter = createLandmarkFilter()
 *   // each frame:
 *   const smoothed = filter.push(rawLandmarks, performance.now())
 */

import type { Landmark, LandmarkSet } from './landmarks'

// ── One-Euro scalar filter ───────────────────────────────────────────────────

interface OneEuroParams {
  /** Minimum cutoff frequency (Hz). Lower = smoother when still. */
  minCutoff: number
  /** Speed coefficient. Higher = more responsive when moving fast. */
  beta:      number
  /** Cutoff for the derivative (velocity) low-pass (Hz). */
  dCutoff:   number
}

// Defaults tuned for 0..1 normalised landmark coordinates at ~30 fps.
//   minCutoff 1.0 Hz  → calm holds barely move
//   beta      0.7     → snaps to fast limb motion without trailing
//   dCutoff   1.0 Hz  → stable speed estimate
const IMG_PARAMS:   OneEuroParams = { minCutoff: 1.0, beta: 0.7, dCutoff: 1.0 }
// World coords are in metres with a different scale & noise profile; a lower
// minCutoff smooths the noisier z-depth channel that MediaPipe is weakest at.
const WORLD_PARAMS: OneEuroParams = { minCutoff: 0.8, beta: 0.5, dCutoff: 1.0 }

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

/** One scalar One-Euro channel (position + its derivative low-pass). */
class OneEuroChannel {
  private xPrev: number | null = null
  private dxPrev = 0
  constructor(private p: OneEuroParams) {}

  filter(x: number, dt: number): number {
    if (this.xPrev === null || !isFinite(x)) {
      this.xPrev = isFinite(x) ? x : 0
      this.dxPrev = 0
      return this.xPrev
    }
    if (dt <= 0) dt = 1 / 30
    // Derivative + its low-pass.
    const dx   = (x - this.xPrev) / dt
    const aD   = alpha(this.p.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    // Speed-adaptive cutoff.
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(dxHat)
    const a      = alpha(cutoff, dt)
    const xHat   = a * x + (1 - a) * this.xPrev
    this.xPrev  = xHat
    this.dxPrev = dxHat
    return xHat
  }

  /** Current filtered value without advancing (used when a frame is rejected). */
  peek(): number { return this.xPrev ?? 0 }

  reset(): void { this.xPrev = null; this.dxPrev = 0 }
}

// ── Per-landmark filter bundle ───────────────────────────────────────────────

class LandmarkChannels {
  x  = new OneEuroChannel(IMG_PARAMS)
  y  = new OneEuroChannel(IMG_PARAMS)
  z  = new OneEuroChannel(IMG_PARAMS)
  wx = new OneEuroChannel(WORLD_PARAMS)
  wy = new OneEuroChannel(WORLD_PARAMS)
  wz = new OneEuroChannel(WORLD_PARAMS)
  vis = 0
  /** Consecutive frames whose raw position was rejected as a teleport. */
  rejects = 0
  /** True once we have a valid filtered position to hold. */
  primed = false
}

// Max plausible image-space speed for a landmark, in normalised units / second.
// A human limb endpoint can cross ~1.2 frame-widths/s at a brisk rep; we set
// the reject threshold well above that. A single-frame snap across the frame
// at 30 fps is ~30 units/s — far above this, so it gets rejected.
const MAX_SPEED = 6.0       // normalised units per second
// After this many consecutive rejects we ACCEPT the new position — it isn't a
// glitch, the subject really did move/teleport (e.g. re-entered frame).
const MAX_CONSECUTIVE_REJECTS = 4
const VIS_ALPHA = 0.30      // visibility low-pass (per frame)

export interface LandmarkFilter {
  /** Filter one raw frame; returns the conditioned LandmarkSet. */
  push: (raw: LandmarkSet, tMs: number) => LandmarkSet
  reset: () => void
}

export function createLandmarkFilter(): LandmarkFilter {
  let channels: LandmarkChannels[] = []
  let lastT: number | null = null

  function ensure(n: number) {
    if (channels.length !== n) {
      channels = Array.from({ length: n }, () => new LandmarkChannels())
    }
  }

  function push(raw: LandmarkSet, tMs: number): LandmarkSet {
    ensure(raw.length)
    const dt = lastT === null ? 1 / 30 : Math.max(1e-3, (tMs - lastT) / 1000)
    lastT = tMs

    return raw.map((lm, i): Landmark => {
      const ch = channels[i]
      if (!lm) return lm

      // ── Teleport rejection (image space) ──────────────────────────────
      let useRaw = true
      if (ch.primed) {
        const px = ch.x.peek(), py = ch.y.peek()
        const speed = Math.hypot(lm.x - px, lm.y - py) / dt
        if (speed > MAX_SPEED && ch.rejects < MAX_CONSECUTIVE_REJECTS) {
          useRaw = false
          ch.rejects += 1
        } else {
          ch.rejects = 0
        }
      }

      // Visibility hysteresis (always tracked, even on a rejected frame).
      ch.vis = VIS_ALPHA * (lm.visibility ?? 0) + (1 - VIS_ALPHA) * ch.vis

      if (!useRaw) {
        // Hold last filtered position for this frame.
        const hasW = ch.wx.peek() !== 0 || ch.wy.peek() !== 0 || ch.wz.peek() !== 0
        return {
          x: ch.x.peek(), y: ch.y.peek(), z: ch.z.peek(),
          visibility: ch.vis,
          wx: hasW ? ch.wx.peek() : lm.wx,
          wy: hasW ? ch.wy.peek() : lm.wy,
          wz: hasW ? ch.wz.peek() : lm.wz,
        }
      }

      const x = ch.x.filter(lm.x, dt)
      const y = ch.y.filter(lm.y, dt)
      const z = ch.z.filter(lm.z ?? 0, dt)

      const hasWorld = lm.wx !== undefined && lm.wy !== undefined && lm.wz !== undefined
      const wx = hasWorld ? ch.wx.filter(lm.wx!, dt) : lm.wx
      const wy = hasWorld ? ch.wy.filter(lm.wy!, dt) : lm.wy
      const wz = hasWorld ? ch.wz.filter(lm.wz!, dt) : lm.wz

      ch.primed = true
      return { x, y, z, visibility: ch.vis, wx, wy, wz }
    })
  }

  function reset() {
    channels = []
    lastT = null
  }

  return { push, reset }
}
