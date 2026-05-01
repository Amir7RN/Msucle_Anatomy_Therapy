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
//  Wall-arm detector
//
//  For exercises where one arm rests on a wall (e.g. Standing Chest Stretch),
//  we must NOT hard-code left vs right because the user can stand on either
//  side.  Instead we detect the "wall arm" as the one whose elbow has the
//  greatest lateral abduction from the body (i.e. the arm sticking furthest
//  outward, roughly horizontal at chest height).
//
//  vectorVerticalAngleDeg(shoulder→elbow) gives the deviation from straight
//  up (0°).  90° = fully horizontal.  The arm with the larger absolute value
//  is the one in contact with the wall.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * pickWallArm — detects which arm is in contact with the wall.
 *
 * The wall arm is held roughly HORIZONTAL at chest height (≈ 90° from
 * vertical in the shoulder→elbow vector).  The hanging/free arm hangs down
 * (≈ 170–180° from vertical).
 *
 * BUG FIX: original code picked the arm with the LARGEST absolute angle,
 * which selected the hanging arm (180°) instead of the wall arm (90°).
 * Correct criterion: arm whose shoulder→elbow vector is CLOSEST TO 90°.
 */
function pickWallArm(lms: LandmarkSet): 'L' | 'R' | null {
  const hasL = visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
  const hasR = visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
  if (!hasL && !hasR) return null
  if (!hasL) return 'R'
  if (!hasR) return 'L'
  const angL = Math.abs(vectorVerticalAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW]))
  const angR = Math.abs(vectorVerticalAngleDeg(lms[LM.R_SHOULDER], lms[LM.R_ELBOW]))
  // Closest to 90° = most horizontal = wall arm
  return Math.abs(angL - 90) <= Math.abs(angR - 90) ? 'L' : 'R'
}

/**
 * pickRaisedArm — detects which arm is held at shoulder height.
 *
 * Used for cross-arm stretch: the user raises ONE arm to shoulder height
 * (hip→shoulder→elbow ≈ 90°), then pulls it across with the other hand.
 * We pick the arm whose HIP→SHOULDER→ELBOW angle is closest to 90°.
 */
function pickRaisedArm(lms: LandmarkSet): 'L' | 'R' | null {
  const hasL = visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
  const hasR = visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
  if (!hasL && !hasR) return null
  if (!hasL) return 'R'
  if (!hasR) return 'L'
  const angL = jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW])
  const angR = jointAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER], lms[LM.R_ELBOW])
  // Closest hip→shoulder→elbow angle to 90° = arm held at shoulder height
  return Math.abs(angL - 90) <= Math.abs(angR - 90) ? 'L' : 'R'
}

/**
 * pickHighElbow — detects which arm has the elbow ABOVE the shoulder.
 *
 * Used for hand-behind-back: the top arm has its elbow raised toward the
 * ceiling.  In MediaPipe image coords Y increases downward, so the higher
 * elbow has the SMALLER Y value.
 */
function pickHighElbow(lms: LandmarkSet): 'L' | 'R' | null {
  const hasL = visible(lms, LM.L_SHOULDER, LM.L_ELBOW)
  const hasR = visible(lms, LM.R_SHOULDER, LM.R_ELBOW)
  if (!hasL && !hasR) return null
  if (!hasL) return 'R'
  if (!hasR) return 'L'
  // Smaller image Y = higher in the frame = the arm going behind the head
  return lms[LM.L_ELBOW].y <= lms[LM.R_ELBOW].y ? 'L' : 'R'
}

// ─────────────────────────────────────────────────────────────────────────────
//  Biofeedback definitions
// ─────────────────────────────────────────────────────────────────────────────

export const BIOFEEDBACK_DEFS: Record<string, BiofeedbackDef> = {

  // ── Doorway Stretch ───────────────────────────────────────────────────────
  // Stand in a doorway, both forearms on the frame at chest height,
  // step forward so the chest opens and both anterior deltoids stretch.
  //
  // BOTH-ARM check: evaluate each arm independently and return the value
  // for the arm that is FURTHEST from ideal (worst offender drives the cue).
  doorway_stretch: {
    exerciseId: 'doorway_stretch',
    title:      'Doorway Stretch',
    introCue:   'Step into the doorway with your forearms on the frame at shoulder height, elbows bent to 90 degrees. Step one foot forward to open your chest.',
    checks: [
      {
        label:    'Elbows at shoulder height',
        ideal:    [80, 105],
        // Return the angle for the WORSE arm (furthest from 90°) so the cue
        // targets whichever side needs the most correction.
        measure:  (lms) => {
          const hasL = visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
          const hasR = visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
          if (!hasL && !hasR) return null
          const angL = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW]) : 90
          const angR = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER], lms[LM.R_ELBOW]) : 90
          // Return the angle furthest from the ideal midpoint (92.5°)
          return Math.abs(angL - 92.5) >= Math.abs(angR - 92.5) ? angL : angR
        },
        belowCue: 'Raise your elbows to shoulder height on the doorframe.',
        aboveCue: 'Lower your elbows slightly — they should be at shoulder level.',
      },
      {
        label:    'Elbows bent 90°',
        ideal:    [80, 105],
        measure:  (lms) => {
          const hasL = visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
          const hasR = visible(lms, LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST)
          if (!hasL && !hasR) return null
          const angL = hasL ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST]) : 90
          const angR = hasR ? jointAngleDeg(lms[LM.R_SHOULDER], lms[LM.R_ELBOW], lms[LM.R_WRIST]) : 90
          return Math.abs(angL - 92.5) >= Math.abs(angR - 92.5) ? angL : angR
        },
        belowCue: 'Bend your elbows more — aim for 90 degrees on the frame.',
        aboveCue: 'Bend your elbows a little more to rest the forearms on the frame.',
      },
    ],
  },

  // ── Seated / Standing Cross-Arm Stretch ───────────────────────────────────
  // The user raises ONE arm (either side) to shoulder height, bends the elbow,
  // then uses the opposite hand to pull it across the chest.
  //
  // SIDE-AGNOSTIC via pickRaisedArm: the arm whose hip→shoulder→elbow angle
  // is closest to 90° is the one being stretched — works left or right.
  cross_arm_stretch: {
    exerciseId: 'cross_arm_stretch',
    title:      'Cross-Arm Stretch',
    introCue:   'Raise either arm to shoulder height, bend the elbow, and use your opposite hand to pull the elbow across your chest. Relax your neck and shoulder.',
    checks: [
      {
        label:    'Arm at shoulder height',
        ideal:    [75, 105],
        measure:  (lms) => {
          const side = pickRaisedArm(lms)
          if (!side) return null
          const hip      = lms[side === 'L' ? LM.L_HIP      : LM.R_HIP]
          const shoulder = lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER]
          const elbow    = lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW]
          return jointAngleDeg(hip, shoulder, elbow)
        },
        belowCue: 'Lift your arm to shoulder height before pulling it across.',
        aboveCue: 'Lower your arm to shoulder level — don\'t let it rise above.',
      },
      {
        label:    'Elbow bent ~90°',
        ideal:    [75, 110],
        measure:  (lms) => {
          const side = pickRaisedArm(lms)
          if (!side) return null
          const shoulder = lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER]
          const elbow    = lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW]
          const wrist    = lms[side === 'L' ? LM.L_WRIST    : LM.R_WRIST]
          if (!visible(lms, side === 'L' ? LM.L_WRIST : LM.R_WRIST)) return null
          return jointAngleDeg(shoulder, elbow, wrist)
        },
        belowCue: 'Bend the elbow more — aim for about 90 degrees.',
        aboveCue: 'Relax the elbow into a gentle 90-degree bend.',
      },
    ],
  },

  // ── Hand Behind Back Stretch ───────────────────────────────────────────────
  // One hand reaches behind the head (top arm, elbow pointing up),
  // the other reaches behind the lower back.  Either arm can be the top one.
  //
  // SIDE-AGNOSTIC via pickHighElbow: whichever elbow is higher in the frame
  // is the "top arm" going behind the head.
  //
  // Check 1: top elbow pointing toward ceiling (shoulder→elbow ≈ 0–55° from up).
  // Check 2: upright spine — measured on the OPPOSITE (low) arm's hip→shoulder.
  hand_behind_back: {
    exerciseId: 'hand_behind_back',
    title:      'Hand Behind Back Stretch',
    introCue:   'Reach one hand behind your head and the other behind your lower back, holding a towel between them. Keep your spine tall and your shoulder blades down. Either arm can go up.',
    checks: [
      {
        label:    'Top elbow pointing up',
        ideal:    [0, 55],
        measure:  (lms) => {
          const side = pickHighElbow(lms)
          if (!side) return null
          const shoulder = lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER]
          const elbow    = lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW]
          return Math.abs(vectorVerticalAngleDeg(shoulder, elbow))
        },
        belowCue: '',   // Math.abs() ≥ 0, so belowCue never fires
        aboveCue: 'Raise your top elbow higher — point it toward the ceiling.',
      },
      {
        label:    'Upright posture',
        ideal:    [0, 18],
        measure:  (lms) => {
          // Use the lower arm's side for the spine check (less obscured)
          const topSide  = pickHighElbow(lms)
          const lowSide  = topSide === 'L' ? 'R' : 'L'
          const hip      = lms[lowSide === 'L' ? LM.L_HIP      : LM.R_HIP]
          const shoulder = lms[lowSide === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER]
          if (!visible(lms, lowSide === 'L' ? LM.L_HIP : LM.R_HIP,
                            lowSide === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER)) return null
          return Math.abs(vectorVerticalAngleDeg(hip, shoulder))
        },
        belowCue: '',
        aboveCue: 'Stand tall — keep your shoulder blades down and your spine straight.',
      },
    ],
  },

  // ── Standing Chest Stretch (Wall Arm Stretch) ─────────────────────────────
  // Stand next to a wall, reach the arm back so the palm rests on the wall
  // at chest height, then rotate the body away to stretch the anterior deltoid.
  //
  // SIDE-AGNOSTIC: user can stand with left or right arm on the wall.
  // pickWallArm() detects which elbow is most abducted (further from vertical)
  // and tracks that arm — so the guidance works regardless of which side faces
  // the wall.
  //
  // Check 1: wall arm at chest/shoulder height (hip→shoulder→elbow ≈ 75–105°).
  // Check 2: shoulder not shrugged up — hip→shoulder vector stays vertical.
  standing_chest: {
    exerciseId: 'standing_chest',
    title:      'Standing Chest Stretch',
    introCue:   'Place your palm on the wall at chest height, elbow slightly bent. Slowly rotate your body away from the arm until you feel a stretch across your chest and front shoulder. Either side works — I\'ll find your wall arm automatically.',
    checks: [
      {
        label:    'Wall arm at chest height',
        ideal:    [75, 105],
        measure:  (lms) => {
          const side = pickWallArm(lms)
          if (!side) return null
          const hip      = lms[side === 'L' ? LM.L_HIP      : LM.R_HIP]
          const shoulder = lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER]
          const elbow    = lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW]
          return jointAngleDeg(hip, shoulder, elbow)
        },
        belowCue: 'Raise your wall arm — keep the palm on the wall at chest/shoulder height.',
        aboveCue: 'Lower your wall arm slightly — aim for chest height, not overhead.',
      },
      {
        label:    'Shoulder relaxed down',
        ideal:    [0, 20],
        measure:  (lms) => {
          const side = pickWallArm(lms)
          if (!side) return null
          const hip      = lms[side === 'L' ? LM.L_HIP      : LM.R_HIP]
          const shoulder = lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER]
          return visible(lms, side === 'L' ? LM.L_HIP : LM.R_HIP,
                              side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER)
            ? Math.abs(vectorVerticalAngleDeg(hip, shoulder))
            : null
        },
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
