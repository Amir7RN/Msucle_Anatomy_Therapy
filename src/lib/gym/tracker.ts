/**
 * gym/tracker.ts
 *
 * One generic tracker drives every exercise. Given an Exercise's `track` config
 * and a frame of MediaPipe landmarks it produces:
 *   • the working joint angle (averaged across sides for bilateral lifts),
 *   • a 0–1 muscle-activation signal scaled to the exercise's range,
 *   • a live rep count (via the existing repCounter state machine),
 *   • peak-activation and range-of-motion telemetry for the session log.
 *
 * Keeping this generic means new exercises are pure data — no per-exercise code.
 */

import { jointAngleDeg, visible, type LandmarkSet } from '../movement/landmarks'
import { createRepCounter, type RepCounter } from '../movement/repCounter'
import { type Exercise, jointTriplet } from './exercises'

export interface TrackFrame {
  valid:        boolean   // were the needed joints visible this frame?
  angle:        number    // working angle (deg)
  activation:   number    // 0..1, how contracted the target muscle is right now
  formGood:     boolean   // in the contracted zone (drives rep counting)
  reps:         number
  justRepped:   boolean   // true on the single frame a rep completes
  peakActivation: number  // session peak 0..1
  romDeg:       number    // session range of motion seen (max-min angle)
}

/** Scale a raw angle into 0..1 activation given the exercise's range + which end is the contraction. */
function activationFrom(angle: number, range: [number, number], contractAt: 'low' | 'high'): number {
  const [lo, hi] = range
  const span = Math.max(1, hi - lo)
  const t = Math.min(1, Math.max(0, (angle - lo) / span))   // 0 at lo, 1 at hi
  return contractAt === 'low' ? 1 - t : t
}

export interface ExerciseTracker {
  update: (lms: LandmarkSet) => TrackFrame
  reset:  () => void
  reps:   () => number
}

export function createExerciseTracker(exercise: Exercise): ExerciseTracker {
  const counter: RepCounter = createRepCounter(exercise.repGoal)
  const { joint, side, range, contractAt } = exercise.track

  let peak = 0
  let minAngle = Infinity
  let maxAngle = -Infinity

  function angleForSide(lms: LandmarkSet, s: 'left' | 'right'): number | null {
    const [a, b, c] = jointTriplet(joint, s)
    if (!visible(lms, a, b, c)) return null
    return jointAngleDeg(lms[a], lms[b], lms[c])
  }

  function update(lms: LandmarkSet): TrackFrame {
    let angle: number | null = null
    if (side === 'both') {
      const l = angleForSide(lms, 'left')
      const r = angleForSide(lms, 'right')
      if (l != null && r != null) angle = (l + r) / 2
      else angle = l ?? r   // tolerate one side dropping out
    } else {
      angle = angleForSide(lms, side)
    }

    if (angle == null) {
      // No reliable read this frame — hold state, report invalid.
      const st = counter.state
      return {
        valid: false, angle: 0, activation: 0, formGood: false,
        reps: st.count, justRepped: false, peakActivation: peak,
        romDeg: maxAngle > minAngle ? maxAngle - minAngle : 0,
      }
    }

    const activation = activationFrom(angle, range, contractAt)
    const formGood = activation >= 0.6
    const st = counter.update(formGood)

    peak = Math.max(peak, activation)
    minAngle = Math.min(minAngle, angle)
    maxAngle = Math.max(maxAngle, angle)

    return {
      valid: true, angle, activation, formGood,
      reps: st.count, justRepped: st.just_completed,
      peakActivation: peak,
      romDeg: maxAngle - minAngle,
    }
  }

  function reset() {
    counter.reset()
    peak = 0; minAngle = Infinity; maxAngle = -Infinity
  }

  return { update, reset, reps: () => counter.state.count }
}
