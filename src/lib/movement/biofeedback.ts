/**
 * biofeedback.ts
 *
 * Per-exercise live form-checking definitions for the "Mirror-Me" guidance
 * mode.  Each entry maps a protocol exercise (from protocol.ts EXERCISE_LIBRARY)
 * to:
 *   • the joint angle(s) we should monitor in real time
 *   • the ideal range for that angle while the user holds the exercise
 *   • the cue text / voice line to deliver if the user is out of range
 *
 * The MovementScreen / ExerciseGuide UI calls evaluateExercise(landmarks, def)
 * each frame and uses the returned cue to drive on-screen text + TTS feedback.
 */

import { jointAngleDeg, LM, type LandmarkSet, visible } from './landmarks'

export interface FormCheck {
  /** Display name of the angle being measured. */
  label:     string
  /** [min, max] degrees that count as "good form". */
  ideal:     [number, number]
  /** Returns the current angle in degrees, or null if landmarks aren't visible. */
  measure:   (lms: LandmarkSet) => number | null
  /** Cue when angle is BELOW ideal min ("not enough"). */
  belowCue:  string
  /** Cue when angle is ABOVE ideal max ("too much"). */
  aboveCue:  string
}

export interface BiofeedbackDef {
  /** exercise.id from EXERCISE_LIBRARY */
  exerciseId: string
  /** Human title shown in the guidance HUD. */
  title:      string
  /** Voice cue read aloud when the exercise begins. */
  introCue:   string
  /** Form checks evaluated each frame. */
  checks:     FormCheck[]
}

/** Result of one frame's evaluation. */
export interface FormSnapshot {
  cueText: string                     // empty string = "Good alignment."
  good:    boolean
  details: Array<{ label: string; deg: number; status: 'good' | 'low' | 'high' }>
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps exercise IDs (from MetadataPanel's ExerciseDef.id) to a biofeedback
 * definition key.  Used by ExerciseGuidance to find the right FormChecks.
 * Exercises without a mapping still get camera + skeleton, just no angle cues.
 */
export const EXERCISE_TO_BIOFEEDBACK: Record<string, string> = {
  // Deltoid
  doorway_stretch:  'doorway_pec',
  standing_sleeper: 'sleeper_stretch',
  // Rotator cuff
  side_lying_er:    'side_lying_er',
  post_shoulder:    'sleeper_stretch',   // similar lying position
  // Hamstrings / glutes
  glute_bridge:     'glute_bridge',
  hip_hinge:        'hip_hinge',
  // Clamshell / hip
  side_clamshell:   'side_clamshell',
}

export const BIOFEEDBACK_DEFS: Record<string, BiofeedbackDef> = {
  // Doorway pec stretch — we monitor shoulder abduction (arm height) so the
  // user actually gets the upper-pec fibres stretched, not the mid fibres.
  doorway_pec: {
    exerciseId: 'doorway_pec',
    title:      'Doorway Pec Stretch',
    introCue:   'Step into the doorway with your forearm on the frame at shoulder height. I\'ll watch your form.',
    checks: [
      {
        label:    'Elbow at shoulder height',
        ideal:    [85, 100],
        measure:  (lms) =>
          visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
            ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW])
            : null,
        belowCue: 'Lift your elbow higher — try to bring it level with your shoulder.',
        aboveCue: 'Drop your elbow slightly — you want it just at shoulder height.',
      },
    ],
  },

  // Sleeper stretch — the angle of the forearm relative to the floor tells
  // us whether the user is letting the shoulder rotate into the stretch.
  sleeper_stretch: {
    exerciseId: 'sleeper_stretch',
    title:      'Sleeper Stretch',
    introCue:   'Lying on your side, arm out at 90 degrees, gently press the forearm down. I\'ll let you know when you\'re in the right position.',
    checks: [
      {
        label:    'Shoulder external rotation',
        ideal:    [60, 95],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
            : null,
        belowCue: 'Bend the elbow more — aim for 90 degrees.',
        aboveCue: 'A bit too straight — bring the wrist closer to the floor.',
      },
    ],
  },

  // Glute bridge — monitor hip extension (hip-shoulder-knee angle).
  glute_bridge: {
    exerciseId: 'glute_bridge',
    title:      'Glute Bridge',
    introCue:   'Lie on your back, knees bent, drive through your heels. I\'ll watch your hip height.',
    checks: [
      {
        label:    'Hip extension',
        ideal:    [160, 180],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
            : null,
        belowCue: 'Lift higher — push your hips toward the ceiling.',
        aboveCue: 'A little less — don\'t over-arch your back.',
      },
    ],
  },

  // Side-lying clamshell — monitor hip abduction.
  side_clamshell: {
    exerciseId: 'side_clamshell',
    title:      'Side-Lying Clamshell',
    introCue:   'Lie on your side, knees bent and stacked. Lift the top knee, keeping heels together. I\'ll cue your range.',
    checks: [
      {
        label:    'Hip abduction',
        ideal:    [25, 50],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
            ? Math.abs(180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE]))
            : null,
        belowCue: 'Open the knee more — feel it in your outer hip.',
        aboveCue: 'Don\'t roll the pelvis back — slightly less range, but keep it strict.',
      },
    ],
  },

  // Side-lying external rotation — key rotator cuff strength exercise.
  // We measure elbow angle (shoulder→elbow→wrist) while the user rotates
  // the forearm upward from neutral.
  side_lying_er: {
    exerciseId: 'side_lying_er',
    title:      'Side-Lying External Rotation',
    introCue:   'Lie on your side with your elbow bent to 90 degrees. Slowly rotate your forearm up toward the ceiling. I\'ll watch the angle.',
    checks: [
      {
        label:    'Elbow angle (90° target)',
        ideal:    [80, 100],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
            : null,
        belowCue: 'Bend the elbow more — try to hold 90 degrees.',
        aboveCue: 'Straighten the elbow slightly — 90 degrees is the target.',
      },
    ],
  },

  // Hip hinge — monitors the trunk-to-thigh angle during the forward lean.
  hip_hinge: {
    exerciseId: 'hip_hinge',
    title:      'Hip Hinge',
    introCue:   'Stand with feet hip-width apart. Push your hips back and hinge forward, keeping a flat back. I\'ll watch your hip angle.',
    checks: [
      {
        label:    'Hip flexion',
        ideal:    [65, 100],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
            ? 180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
            : null,
        belowCue: 'Push the hips back further — hinge more at the hip.',
        aboveCue: 'Don\'t drop the chest too low — maintain a neutral spine.',
      },
    ],
  },
}

/**
 * Evaluate a single frame.  Returns the most relevant cue (the first failing
 * check, or empty if everything is in the green).  Used every frame by the
 * guidance UI; aggregate over a smoothing window before driving TTS so the
 * user doesn't get a chatty cue every 16 ms.
 */
export function evaluateExercise(lms: LandmarkSet, def: BiofeedbackDef): FormSnapshot {
  const details: FormSnapshot['details'] = []
  let firstBadCue: string = ''
  let allGood = true

  for (const check of def.checks) {
    const v = check.measure(lms)
    if (v === null) {
      allGood = false
      continue
    }
    const [lo, hi] = check.ideal
    if (v < lo) {
      details.push({ label: check.label, deg: v, status: 'low' })
      if (!firstBadCue) firstBadCue = check.belowCue
      allGood = false
    } else if (v > hi) {
      details.push({ label: check.label, deg: v, status: 'high' })
      if (!firstBadCue) firstBadCue = check.aboveCue
      allGood = false
    } else {
      details.push({ label: check.label, deg: v, status: 'good' })
    }
  }

  return {
    cueText: allGood ? 'Good alignment — hold it.' : firstBadCue,
    good:    allGood,
    details,
  }
}
