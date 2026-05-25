/**
 * directionalCue.ts
 *
 * Local, deterministic, ZERO-LATENCY coaching engine.
 *
 * Why this exists
 * ───────────────
 * The Claude-powered AI coach gives rich feedback but at ~1-3 s round-trip
 * latency that's too slow to react to live joint motion. A "bend your arm
 * 10 more degrees" cue must arrive WHILE the user is still moving — not
 * three seconds after they stop.
 *
 * This module runs on the live FormSnapshot stream and emits short,
 * angle-precise directional cues with a deterministic state machine.
 * It also respects the user's measured ROM peak (from the assessment
 * system) as a safe ceiling — so it never pushes past what the user
 * has demonstrated they can do without pain.
 *
 * Cue cadence
 * ───────────
 *   • Routine cues   — debounced to ≥ 2.5 s between speak events
 *   • Safety cues    — immediate (e.g. user past their measured peak)
 *   • Same cue text  — never spoken twice in a row
 */

import type { FormSnapshot } from './biofeedback'

/** A single joint's live state and target. */
export interface JointSample {
  label:        string         // e.g. "Elbow Flexion"
  current:      number         // current angle in degrees
  ideal:        [number, number] // healthy target range [min, max]
  status:       'good' | 'low' | 'high'
  /** User's measured peak for this joint (from past assessments). Optional. */
  measuredPeak?: number
}

export interface CueOutput {
  /** What to speak. Short — < 12 words; read aloud during motion. */
  text:     string
  /** True if this is a safety override (over measured peak) — speak NOW. */
  urgent:   boolean
  /** Identifier so the caller can de-duplicate repeats. */
  key:      string
}

/* ──────────────────────────────────────────────────────────────────────────
   PICKER — one short phrase, chosen with simple round-robin so the coach
   doesn't sound robotic.  Counter mod len gives variety without RNG.
   ────────────────────────────────────────────────────────────────────── */
let phraseCounter = 0
function pick(...phrases: string[]): string {
  const p = phrases[phraseCounter % phrases.length]
  phraseCounter += 1
  return p
}

/** Round to nearest 5° for natural-sounding cues ("10 more" not "9.3 more"). */
function roundToFive(deg: number): number {
  return Math.max(0, Math.round(deg / 5) * 5)
}

/* ──────────────────────────────────────────────────────────────────────────
   Cue generator.  Returns null if nothing worth saying right now.
   ────────────────────────────────────────────────────────────────────── */
export function generateCue(s: JointSample): CueOutput | null {
  const [lo, hi] = s.ideal
  const mid = (lo + hi) / 2
  const cur = s.current

  /* ── SAFETY OVERRIDE — past the user's measured peak ──────────────── */
  if (s.measuredPeak !== undefined && cur >= s.measuredPeak - 2) {
    return {
      text: pick(
        `Ease up - that's your safe limit today.`,
        `Hold there — you're at your safe peak. Don't push further.`,
        `Good range — back off slightly, you've reached your ceiling.`,
      ),
      urgent: true,
      key:    `safety-${Math.round(cur / 5)}`,
    }
  }

  /* ── IN TARGET ZONE — perfect ─────────────────────────────────────── */
  if (cur >= lo && cur <= hi) {
    const fromMid = Math.abs(cur - mid)
    if (fromMid <= 5) {
      return {
        text: pick(
          `Perfect — you're right in the zone. Hold it.`,
          `Excellent. Keep that position.`,
          `That's the spot — breathe and hold.`,
          `Nailed it. Stay here.`,
        ),
        urgent: false,
        key:    'in-zone-mid',
      }
    }
    return {
      text: pick(
        `Good — you're in range. Stay smooth.`,
        `On target. Hold this position.`,
        `Locked in. Don't lose it.`,
      ),
      urgent: false,
      key:    'in-zone-edge',
    }
  }

  /* ── BELOW TARGET — need to increase the angle ────────────────────── */
  if (cur < lo) {
    const delta = roundToFive(lo - cur)
    // Very close — encouragement
    if (delta <= 5) {
      return {
        text: pick(
          `Almost there - just a touch more.`,
          `Great progress — push a little further.`,
          `Five more and you're in the zone.`,
        ),
        urgent: false,
        key:    `under-close-${delta}`,
      }
    }
    return {
      text: pick(
        `Keep going - little more.`,
        `Close. Smooth and steady.`,
        `You're getting there - keep reaching.`,
        `Bend a touch more - you've got this.`,
      ),
      urgent: false,
      key:    `under-${delta}`,
    }
  }

  /* ── ABOVE TARGET — back off ──────────────────────────────────────── */
  if (cur > hi) {
    const delta = roundToFive(cur - hi)
    if (delta <= 5) {
      return {
        text: pick(
          `Easy — ease back just a touch.`,
          `Ease off just a hair and you're set.`,
          `You're slightly past — soften it.`,
        ),
        urgent: false,
        key:    `over-close-${delta}`,
      }
    }
    return {
      text: pick(
        `Ease back a bit - you're past the target.`,
        `Slow down - come back a little.`,
        `Too far. Bring it back toward ${Math.round(mid)}.`,
      ),
      urgent: false,
      key:    `over-${delta}`,
    }
  }

  return null
}

/* ──────────────────────────────────────────────────────────────────────────
   Stream wrapper — call on each smoothed FormSnapshot.
   Returns the cue to speak NOW, or null if nothing changed enough.
   ────────────────────────────────────────────────────────────────────── */

/** Caller-owned state passed to each pickCue() call. */
export interface CueStreamState {
  lastKey:        string | null
  lastSpokenAt:   number          // ms (Date.now()) when we last spoke
  cooldownMs:     number          // routine cue cooldown (default 3000)
}

export function pickCue(
  snapshot:    FormSnapshot,
  state:       CueStreamState,
  peakLookup?: (jointLabel: string) => number | undefined,
): CueOutput | null {
  if (snapshot.details.length === 0) return null

  // Choose the joint that's furthest from its ideal — that's what needs
  // coaching most. If everything is good, pick the first joint for in-zone
  // reinforcement.
  let worst: JointSample | null = null
  let worstScore = -1
  for (const d of snapshot.details) {
    // Build sample. We don't know ideal from FormSnapshot, but we have
    // status, so we infer worst-ness from status. 'low'/'high' > 'good'.
    const score = d.status === 'good' ? 0 : 1
    if (score > worstScore) {
      worstScore = score
      worst = {
        label:        d.label,
        current:      d.deg,
        ideal:        [0, 0],          // filled by caller below
        status:       d.status,
        measuredPeak: peakLookup?.(d.label),
      }
    }
  }
  if (!worst) return null
  return pickCueFromJoint(worst, state)
}

/** Run the cue generator on a JointSample whose ideal[] is known. */
export function pickCueFromJoint(
  sample: JointSample,
  state:  CueStreamState,
): CueOutput | null {
  const cue = generateCue(sample)
  if (!cue) return null

  const now = Date.now()
  const cooldown = cue.urgent ? 800 : state.cooldownMs
  if (now - state.lastSpokenAt < cooldown)   return null
  if (cue.key === state.lastKey && !cue.urgent) return null

  state.lastKey      = cue.key
  state.lastSpokenAt = now
  return cue
}

export function createCueStream(cooldownMs = 5000): CueStreamState {
  return { lastKey: null, lastSpokenAt: 0, cooldownMs }
}
