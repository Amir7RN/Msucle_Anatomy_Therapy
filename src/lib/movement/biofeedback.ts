/**
 * biofeedback.ts
 *
 * Per-exercise live form-checking definitions for the "Mirror-Me" guidance
 * mode.  Each entry maps a protocol exercise ID to:
 *   • the joint angle(s) to monitor in real time
 *   • the ideal range for each angle while the user holds the position
 *   • voice cue text when the user is out of range
 *
 * All angle calculations use raw MediaPipe landmark coordinates (no manual
 * 1-x inversion — CameraView passes raw coords; the CSS scaleX(-1) handles
 * the visual flip).  jointAngleDeg is invariant to horizontal reflection so
 * left/right measurements remain accurate.
 *
 * Measurement helpers
 * ────────────────────
 *   jointAngleDeg(A, B, C)         → angle in degrees at vertex B (0–180)
 *   vectorVerticalAngleDeg(A, B)   → angle of A→B from straight-up (−180..180)
 *                                    0° = up, 90° = right, −90° = left
 */

import { jointAngleDeg, vectorVerticalAngleDeg, LM, type LandmarkSet, visible } from './landmarks'

export interface FormCheck {
  label:     string
  ideal:     [number, number]
  measure:   (lms: LandmarkSet) => number | null
  belowCue:  string
  aboveCue:  string
}

export interface BiofeedbackDef {
  exerciseId: string
  title:      string
  introCue:   string
  checks:     FormCheck[]
}

export interface FormSnapshot {
  cueText: string
  good:    boolean
  details: Array<{ label: string; deg: number; status: 'good' | 'low' | 'high' }>
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exercise ID → biofeedback key mapping
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_TO_BIOFEEDBACK: Record<string, string> = {
  // ── Deltoid (all 6 exercises now have guidance) ───────────────────────────
  doorway_stretch:  'doorway_stretch',
  seated_cross_arm: 'cross_arm_stretch',
  standing_sleeper: 'cross_arm_stretch',   // standing version uses same arm-across-chest pattern
  hand_behind_back: 'hand_behind_back',
  standing_chest:   'standing_chest',
  crab_press:       'crab_press',
  // ── Rotator cuff ─────────────────────────────────────────────────────────
  side_lying_er:    'side_lying_er',
  post_shoulder:    'sleeper_stretch',
  // ── Glutes / hamstrings ───────────────────────────────────────────────────
  glute_bridge:     'glute_bridge',
  hip_hinge:        'hip_hinge',
  side_clamshell:   'side_clamshell',
}

// ─────────────────────────────────────────────────────────────────────────────
//  Biofeedback definitions
// ─────────────────────────────────────────────────────────────────────────────

export const BIOFEEDBACK_DEFS: Record<string, BiofeedbackDef> = {

  // ── Doorway Stretch ───────────────────────────────────────────────────────
  // Stand in a doorway, forearms resting on the frame at chest height,
  // step forward so the chest opens and the anterior deltoid stretches.
  //
  // Check 1: elbow at shoulder height (hip→shoulder→elbow angle ≈ 90°).
  // Check 2: elbow bent ~90° so the forearm rests on the frame.
  doorway_stretch: {
    exerciseId: 'doorway_stretch',
    title:      'Doorway Stretch',
    introCue:   'Step into the doorway with your forearms on the frame at shoulder height, elbows bent to 90 degrees. Step one foot forward to open your chest.',
    checks: [
      {
        label:    'Elbow at shoulder height',
        ideal:    [80, 105],
        measure:  (lms) =>
          visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
            ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW])
            : null,
        belowCue: 'Raise your elbows to shoulder height on the doorframe.',
        aboveCue: 'Lower your elbows slightly — they should be at shoulder level.',
      },
      {
        label:    'Elbow bent 90°',
        ideal:    [80, 105],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
            : null,
        belowCue: 'Bend your elbow more — aim for 90 degrees on the frame.',
        aboveCue: 'Bend your elbow a little more to rest the forearm on the frame.',
      },
    ],
  },

  // ── Seated / Standing Cross-Arm Stretch ───────────────────────────────────
  // Used for both seated_cross_arm and standing_sleeper (which in practice is
  // the arm-across-chest variant, not the floor-lying sleeper stretch).
  //
  // The stretching arm is held at shoulder height (hip→shoulder→elbow ≈ 90°),
  // elbow bent ~90° so the opposite hand can grip and pull it across the chest.
  cross_arm_stretch: {
    exerciseId: 'cross_arm_stretch',
    title:      'Cross-Arm Stretch',
    introCue:   'Raise your arm to shoulder height, bend the elbow, and use your opposite hand to pull the elbow across your chest. Relax your neck and shoulder.',
    checks: [
      {
        label:    'Arm at shoulder height',
        ideal:    [75, 105],
        measure:  (lms) =>
          visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
            ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW])
            : null,
        belowCue: 'Lift your arm to shoulder height before pulling it across.',
        aboveCue: 'Lower your arm to shoulder level — don\'t let it rise above.',
      },
      {
        label:    'Elbow bent ~90°',
        ideal:    [75, 110],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
            : null,
        belowCue: 'Bend the elbow more — aim for about 90 degrees.',
        aboveCue: 'Relax the elbow into a gentle 90-degree bend.',
      },
    ],
  },

  // ── Hand Behind Back Stretch ───────────────────────────────────────────────
  // One hand reaches behind the head (top arm, elbow pointing to ceiling),
  // the other hand reaches behind the lower back.  They hold opposite ends
  // of a towel.  The top hand then slides up to deepen the stretch.
  //
  // Check 1: top elbow raised (vector shoulder→elbow should point upward).
  //          vectorVerticalAngleDeg ≈ 0° = straight up, so ideal 0–55°.
  // Check 2: upright spine — hip→shoulder vector should be close to vertical.
  hand_behind_back: {
    exerciseId: 'hand_behind_back',
    title:      'Hand Behind Back Stretch',
    introCue:   'Reach one hand behind your head and the other behind your lower back, holding a towel between them. Keep your spine tall and your shoulder blades down.',
    checks: [
      {
        label:    'Top elbow pointing up',
        ideal:    [0, 55],
        measure:  (lms) =>
          visible(lms, LM.R_SHOULDER, LM.R_ELBOW)
            ? Math.abs(vectorVerticalAngleDeg(lms[LM.R_SHOULDER], lms[LM.R_ELBOW]))
            : null,
        belowCue: '',   // Math.abs() ≥ 0, so belowCue never fires
        aboveCue: 'Raise your top elbow higher — point it toward the ceiling.',
      },
      {
        label:    'Upright posture',
        ideal:    [0, 18],
        measure:  (lms) =>
          visible(lms, LM.L_HIP, LM.L_SHOULDER)
            ? Math.abs(vectorVerticalAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER]))
            : null,
        belowCue: '',   // never fires (Math.abs ≥ 0)
        aboveCue: 'Stand tall — keep your shoulder blades down and your spine straight.',
      },
    ],
  },

  // ── Standing Chest Stretch (Wall Arm Stretch) ─────────────────────────────
  // Stand next to a wall, reach the arm back so the palm rests on the wall
  // at chest height, then rotate the body away to stretch the anterior deltoid.
  //
  // Check 1: arm at chest/shoulder height (hip→shoulder→elbow ≈ 80–100°).
  // Check 2: shoulder not shrugged up — spine-to-shoulder vector stays vertical.
  standing_chest: {
    exerciseId: 'standing_chest',
    title:      'Standing Chest Stretch',
    introCue:   'Place your palm on the wall at chest height, elbow slightly bent. Slowly rotate your body away from the arm until you feel a stretch across your chest and front shoulder.',
    checks: [
      {
        label:    'Arm at chest height',
        ideal:    [75, 105],
        measure:  (lms) =>
          visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
            ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER], lms[LM.R_ELBOW])
            : null,
        belowCue: 'Raise your arm — keep the palm on the wall at chest/shoulder height.',
        aboveCue: 'Lower your arm slightly — aim for chest height, not overhead.',
      },
      {
        label:    'Shoulder relaxed down',
        ideal:    [0, 20],
        measure:  (lms) =>
          visible(lms, LM.R_HIP, LM.R_SHOULDER)
            ? Math.abs(vectorVerticalAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER]))
            : null,
        belowCue: '',
        aboveCue: 'Relax your shoulder down — avoid letting it rise toward your ear.',
      },
    ],
  },

  // ── Crab Press ────────────────────────────────────────────────────────────
  // Seated on the floor, hands planted behind the body with fingers pointing
  // back, press the hips up until knees, hips, and shoulders form a flat line.
  //
  // Check 1: hip extension — shoulder→hip→knee angle ≈ 160–180° when the
  //          hips are fully lifted to "tabletop."
  // Check 2: arms straight — shoulder→elbow→wrist ≈ 155–180° (support position).
  crab_press: {
    exerciseId: 'crab_press',
    title:      'Crab Press',
    introCue:   'Sit with your hands behind you and fingers pointing away. Press through your hands and feet to lift your hips to a flat tabletop position. Engage your core throughout.',
    checks: [
      {
        label:    'Hips at tabletop height',
        ideal:    [155, 180],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
            : null,
        belowCue: 'Lift your hips higher — drive them up until your body makes a flat table.',
        aboveCue: 'Lower your hips slightly to avoid over-arching your lower back.',
      },
      {
        label:    'Arms extended',
        ideal:    [150, 180],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
            : null,
        belowCue: 'Straighten your arms — press the floor away to support your weight.',
        aboveCue: 'Good arm position — keep pressing through your hands.',
      },
    ],
  },

  // ── Rotator Cuff — Sleeper Stretch (floor lying) ──────────────────────────
  sleeper_stretch: {
    exerciseId: 'sleeper_stretch',
    title:      'Sleeper Stretch',
    introCue:   'Lying on your side, arm out at 90 degrees. Rest your other hand on the forearm and gently press it toward the floor. I\'ll let you know when you\'re in the right position.',
    checks: [
      {
        label:    'Elbow bent ~90°',
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

  // ── Rotator Cuff — Side-Lying External Rotation ───────────────────────────
  side_lying_er: {
    exerciseId: 'side_lying_er',
    title:      'Side-Lying External Rotation',
    introCue:   'Lying on your side, elbow bent to 90 degrees, slowly rotate your forearm up toward the ceiling. I\'ll watch the angle.',
    checks: [
      {
        label:    'Elbow angle (90° target)',
        ideal:    [80, 100],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
            : null,
        belowCue: 'Bend the elbow more — hold 90 degrees throughout.',
        aboveCue: 'Straighten the elbow slightly — 90 degrees is the target.',
      },
    ],
  },

  // ── Glutes / Core — Glute Bridge ─────────────────────────────────────────
  glute_bridge: {
    exerciseId: 'glute_bridge',
    title:      'Glute Bridge',
    introCue:   'Lie on your back, knees bent, feet flat. Drive through your heels to lift your hips. I\'ll watch your hip height.',
    checks: [
      {
        label:    'Hip extension',
        ideal:    [160, 180],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
            ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
            : null,
        belowCue: 'Lift higher — push your hips toward the ceiling.',
        aboveCue: 'A little less — don\'t over-arch your lower back.',
      },
    ],
  },

  // ── Glutes / Hip — Side-Lying Clamshell ──────────────────────────────────
  side_clamshell: {
    exerciseId: 'side_clamshell',
    title:      'Side-Lying Clamshell',
    introCue:   'Lying on your side, knees bent and stacked. Lift the top knee, keeping heels together. I\'ll cue your range.',
    checks: [
      {
        label:    'Hip abduction',
        ideal:    [25, 50],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
            ? Math.abs(180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE]))
            : null,
        belowCue: 'Open the knee more — feel the work in your outer hip.',
        aboveCue: 'Don\'t roll the pelvis back — keep strict range, slightly less.',
      },
    ],
  },

  // ── Glutes / Posterior Chain — Hip Hinge ─────────────────────────────────
  hip_hinge: {
    exerciseId: 'hip_hinge',
    title:      'Hip Hinge',
    introCue:   'Stand with feet hip-width apart. Push hips back and hinge forward keeping a flat back. I\'ll watch your hip angle.',
    checks: [
      {
        label:    'Hip flexion',
        ideal:    [65, 100],
        measure:  (lms) =>
          visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
            ? 180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
            : null,
        belowCue: 'Push the hips back further — hinge more at the hip.',
        aboveCue: 'Don\'t drop the chest too low — keep a neutral spine.',
      },
    ],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Frame evaluator
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateExercise(lms: LandmarkSet, def: BiofeedbackDef): FormSnapshot {
  const details: FormSnapshot['details'] = []
  let firstBadCue = ''
  let allGood = true

  for (const check of def.checks) {
    const v = check.measure(lms)
    if (v === null) { allGood = false; continue }
    const [lo, hi] = check.ideal
    if (v < lo) {
      details.push({ label: check.label, deg: v, status: 'low' })
      if (!firstBadCue && check.belowCue) firstBadCue = check.belowCue
      allGood = false
    } else if (v > hi) {
      details.push({ label: check.label, deg: v, status: 'high' })
      if (!firstBadCue && check.aboveCue) firstBadCue = check.aboveCue
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
