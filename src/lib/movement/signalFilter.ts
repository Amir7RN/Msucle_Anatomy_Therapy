/**
 * signalFilter.ts
 *
 * Production-grade landmark stream conditioning for a single-camera pose
 * pipeline.  Replaces the hand-rolled adaptive-EMA in CameraView with four
 * layers that every serious markerless-mocap stack uses:
 *
 *   1. One-Euro filter  (Casiez, Roussel & Vogel, CHI 2012)
 *      The reference low-latency filter for noisy interactive signals. A
 *      first-order adaptive low-pass whose cutoff rises with speed: it is
 *      very smooth when a joint is still (kills jitter on a hold) and very
 *      responsive when it moves fast (no lag on a quick rep). Tuned per
 *      coordinate, applied independently to image x/y/z and world wx/wy/wz.
 *
 *   2. Per-user, per-channel ADAPTIVE weighting  (new in v2)
 *      A fixed minCutoff is a compromise: too high and a shaky depth channel
 *      still jitters, too low and a clean channel lags. Instead we MEASURE the
 *      residual jitter of every channel while the joint is at rest (|velocity|
 *      below a deadband) and pull that channel's minCutoff down when it is
 *      noisier than a reference, up when it is cleaner. So MediaPipe's weak
 *      z-depth channel gets smoothed hard for THIS user's THIS camera, while a
 *      crisp image-x channel keeps its low latency. The filter self-tunes
 *      continuously — no explicit calibration button needed — and converges
 *      within the first still second (the neutral-pose phase).
 *
 *   3. Scale-normalised teleport / outlier rejection
 *      MediaPipe occasionally emits a single-frame "jump" — a wrist that
 *      snaps across the frame for one detection then snaps back. These
 *      destroy angle measurements (a 90° elbow reads 150° for one frame).
 *      We reject any per-frame displacement that is physically impossible,
 *      but the threshold is EXPRESSED IN TORSO-LENGTHS (measured live from the
 *      user's shoulder↔hip span), not raw normalised units — so a close-up
 *      user's genuine fast move isn't rejected and a far/small user's glitch
 *      isn't missed. Consecutive rejects are counted so a sustained real move
 *      is eventually accepted rather than frozen forever.
 *
 *   4. Confidence-weighted visibility hysteresis
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
 *   // (optional) inspect what the filter learned about this user:
 *   const cal = filter.calibration()   // { torsoScale, converged, adaptedChannels }
 */

import type { Landmark, LandmarkSet } from './landmarks'
import { LM } from './landmarks'

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

// ── Adaptive-weighting tuning ─────────────────────────────────────────────────
//
// Reference rest jitter (residual |raw − filtered| while the joint is still),
// in normalised units for image channels and metres for world channels. A
// channel noisier than this gets its minCutoff pulled DOWN (more smoothing);
// a cleaner channel gets it pulled UP (less lag). These reference values are
// the empirical median residual of the heavy MediaPipe model on a steady hold.
const REF_JITTER_IMG   = 0.0035
const REF_JITTER_WORLD = 0.0060
// How far the adaptive multiplier may move the base minCutoff. Bounded so a
// pathological measurement can never freeze a channel (too low) or make it
// useless (too high).
const ADAPT_MIN = 0.35
const ADAPT_MAX = 1.6
// EMA weight for the rolling rest-jitter estimate (slow — it's a noise-floor
// estimate, not a signal). ~2 s time-constant at 30 fps.
const JITTER_EMA = 0.03
// |derivative| below this (per-second) counts as "at rest" for jitter sampling.
const REST_VEL = 0.15

/**
 * One scalar One-Euro channel (position + its derivative low-pass) with a
 * self-tuning minCutoff driven by the channel's measured rest jitter.
 */
class OneEuroChannel {
  private xPrev: number | null = null
  private dxPrev = 0
  private restJitter: number   // rolling EMA of residual noise at rest
  private adaptMul = 1          // current minCutoff multiplier (for introspection)

  constructor(private p: OneEuroParams, private refJitter: number) {
    this.restJitter = refJitter
  }

  filter(x: number, dt: number): number {
    if (this.xPrev === null || !isFinite(x)) {
      this.xPrev = isFinite(x) ? x : 0
      this.dxPrev = 0
      return this.xPrev
    }
    if (dt <= 0) dt = 1 / 30
    // Derivative + its low-pass.
    const dx    = (x - this.xPrev) / dt
    const aD    = alpha(this.p.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev

    // Adaptive minCutoff: noisier-than-reference → lower cutoff (smoother).
    // Bounded multiplier keeps it stable.
    this.adaptMul = clampNum(this.refJitter / Math.max(this.restJitter, 1e-6), ADAPT_MIN, ADAPT_MAX)
    const minCut  = this.p.minCutoff * this.adaptMul

    // Speed-adaptive cutoff (the One-Euro core).
    const cutoff = minCut + this.p.beta * Math.abs(dxHat)
    const a      = alpha(cutoff, dt)
    const xHat   = a * x + (1 - a) * this.xPrev

    // Learn the rest-jitter floor: only sample when the joint is essentially
    // still, so real motion never inflates the noise estimate. The residual is
    // |raw − filtered| — exactly the jitter the filter is fighting.
    if (Math.abs(dxHat) < REST_VEL) {
      const residual = Math.abs(x - xHat)
      this.restJitter = (1 - JITTER_EMA) * this.restJitter + JITTER_EMA * residual
    }

    this.xPrev  = xHat
    this.dxPrev = dxHat
    return xHat
  }

  /** Current filtered value without advancing (used when a frame is rejected). */
  peek(): number { return this.xPrev ?? 0 }

  /** Current adaptive multiplier (1 = neutral, <1 = smoothing harder). */
  adaptation(): number { return this.adaptMul }

  reset(): void {
    this.xPrev = null
    this.dxPrev = 0
    this.restJitter = this.refJitter
    this.adaptMul = 1
  }
}

function clampNum(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

// ── Per-landmark filter bundle ───────────────────────────────────────────────

class LandmarkChannels {
  x  = new OneEuroChannel(IMG_PARAMS,   REF_JITTER_IMG)
  y  = new OneEuroChannel(IMG_PARAMS,   REF_JITTER_IMG)
  z  = new OneEuroChannel(IMG_PARAMS,   REF_JITTER_IMG)
  wx = new OneEuroChannel(WORLD_PARAMS, REF_JITTER_WORLD)
  wy = new OneEuroChannel(WORLD_PARAMS, REF_JITTER_WORLD)
  wz = new OneEuroChannel(WORLD_PARAMS, REF_JITTER_WORLD)
  vis = 0
  /** Consecutive frames whose raw position was rejected as a teleport. */
  rejects = 0
  /** True once we have a valid filtered position to hold. */
  primed = false

  /** Mean image-channel adaptation across x/y (for the calibration read-out). */
  imgAdaptation(): number { return (this.x.adaptation() + this.y.adaptation()) / 2 }
}

// Max plausible endpoint speed, expressed in TORSO-LENGTHS per second. A human
// limb endpoint can cross ~4 torso-lengths/s at a brisk rep; the single-frame
// snap of a MediaPipe glitch is an order of magnitude beyond that. Multiplying
// by the live torso scale (below) converts this to normalised units/frame so
// the threshold is the same for a near or far user.
const MAX_SPEED_TORSO = 8.0
// Fallback torso scale (normalised units) before we've measured the user — the
// median shoulder↔hip image span at a typical framing.
const DEFAULT_TORSO = 0.22
// After this many consecutive rejects we ACCEPT the new position — it isn't a
// glitch, the subject really did move/teleport (e.g. re-entered frame).
const MAX_CONSECUTIVE_REJECTS = 4
const VIS_ALPHA = 0.30      // visibility low-pass (per frame)
// Frames of still, converged tracking before we call the filter "calibrated".
const CONVERGE_FRAMES = 20

/** What the filter has learned about this user / camera. */
export interface FilterCalibration {
  /** Live torso scale in normalised image units (shoulder↔hip span). */
  torsoScale: number
  /** True once per-channel adaptation has settled on a still user. */
  converged:  boolean
  /** Count of channels currently smoothing harder than baseline (adaptMul<0.85). */
  adaptedChannels: number
}

export interface LandmarkFilter {
  /** Filter one raw frame; returns the conditioned LandmarkSet. */
  push: (raw: LandmarkSet, tMs: number) => LandmarkSet
  /** Introspect what the adaptive layer has learned (HUD / diagnostics). */
  calibration: () => FilterCalibration
  reset: () => void
}

/** Shoulder↔hip image-space span for the current frame, or null. */
function measureTorsoScale(lms: LandmarkSet): number | null {
  const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER]
  const lh = lms[LM.L_HIP],      rh = lms[LM.R_HIP]
  if (!ls || !rs || !lh || !rh) return null
  if (Math.min(ls.visibility ?? 0, rs.visibility ?? 0, lh.visibility ?? 0, rh.visibility ?? 0) < 0.4) return null
  const shx = (ls.x + rs.x) / 2, shy = (ls.y + rs.y) / 2
  const hx  = (lh.x + rh.x) / 2, hy  = (lh.y + rh.y) / 2
  const d = Math.hypot(shx - hx, shy - hy)
  return d > 1e-3 ? d : null
}

export function createLandmarkFilter(): LandmarkFilter {
  let channels: LandmarkChannels[] = []
  let lastT: number | null = null
  let torsoScale = DEFAULT_TORSO
  let stillFrames = 0
  let converged = false

  function ensure(n: number) {
    if (channels.length !== n) {
      channels = Array.from({ length: n }, () => new LandmarkChannels())
    }
  }

  function push(raw: LandmarkSet, tMs: number): LandmarkSet {
    ensure(raw.length)
    const dt = lastT === null ? 1 / 30 : Math.max(1e-3, (tMs - lastT) / 1000)
    lastT = tMs

    // Track the user's live torso scale (slow EMA — body size doesn't jump).
    // The teleport gate below is scaled by this so rejection is frame-invariant.
    const ts = measureTorsoScale(raw)
    if (ts !== null) torsoScale = 0.9 * torsoScale + 0.1 * ts
    const maxStep = MAX_SPEED_TORSO * torsoScale * dt   // normalised units this frame

    let frameStill = ts !== null

    const out = raw.map((lm, i): Landmark => {
      const ch = channels[i]
      if (!lm) return lm

      // ── Scale-normalised teleport rejection (image space) ─────────────
      let useRaw = true
      if (ch.primed) {
        const px = ch.x.peek(), py = ch.y.peek()
        const step = Math.hypot(lm.x - px, lm.y - py)
        if (step > maxStep && ch.rejects < MAX_CONSECUTIVE_REJECTS) {
          useRaw = false
          ch.rejects += 1
        } else {
          ch.rejects = 0
        }
        // Any real per-joint motion means this isn't a "still" frame for the
        // convergence gate (jitter learning still happens per-channel below).
        if (step > maxStep * 0.08) frameStill = false
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

    // Convergence: the adaptive layer has "learned this user" once it has seen
    // a run of still, in-frame frames (the neutral-pose phase). Motion resets
    // the counter so we don't declare convergence mid-rep.
    if (frameStill) stillFrames += 1
    else            stillFrames = 0
    if (stillFrames >= CONVERGE_FRAMES) converged = true

    return out
  }

  function calibration(): FilterCalibration {
    let adapted = 0
    for (const ch of channels) if (ch.primed && ch.imgAdaptation() < 0.85) adapted += 1
    return { torsoScale, converged, adaptedChannels: adapted }
  }

  function reset() {
    channels = []
    lastT = null
    torsoScale = DEFAULT_TORSO
    stillFrames = 0
    converged = false
  }

  return { push, calibration, reset }
}
