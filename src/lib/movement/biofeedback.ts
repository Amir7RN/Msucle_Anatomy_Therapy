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
//  Step-by-step Procedure system
//
//  Each exercise has an ordered list of ExerciseStep entries.  The AiCoach
//  component drives a state machine through these steps:
//    1. Show the step's instruction aloud and on screen.
//    2. Check the current pose on every animation frame.
//    3. When `check()` returns { done: true }, start an accumulation timer.
//    4. Once the pose has been held for `holdMs` ms, advance to the next step
//       (or finish).
//  Intermediate setup steps use a short holdMs (≈1 500 ms) so the transition
//  feels instant.  The final stretch hold uses a long holdMs (20 000 ms) and
//  renders a circular countdown ring.
// ─────────────────────────────────────────────────────────────────────────────

/** Returned by a step's check() function every animation frame. */
export interface StepCheck {
  /** True when the pose satisfies this step's requirement. */
  done:     boolean
  /** 0–1 progress toward the required position (drives the progress bar). */
  progress: number
  /** Short cue to show/speak when done is false. */
  hint:     string
}

/** One step in a guided exercise procedure. */
export interface ExerciseStep {
  id:             string
  /** Text spoken + displayed when this step first becomes active. */
  instruction:    string
  /** Short celebratory text spoken when this step completes. */
  completionText: string
  /**
   * How long (ms) the "done" pose must be maintained to advance.
   * Use ≈1 500 ms for positioning steps, 5 000–20 000 ms for timed holds.
   */
  holdMs:         number
  /** When true the UI renders a circular countdown ring instead of a fill bar. */
  isTimedHold?:   boolean
  /** Label shown inside the hold ring (default "Hold…"). */
  holdLabel?:     string
  /**
   * Evaluate the current pose for this step.
   * Returns null when the required landmarks are not visible.
   */
  check: (lms: LandmarkSet) => StepCheck | null
}

/** Ordered step list for one exercise. */
export interface ExerciseProcedure {
  exerciseId: string
  steps:      ExerciseStep[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)) }

/** 0–1 closeness of `value` to `target`; drops to 0 at `maxDev` away. */
function nearTarget(v: number, target: number, maxDev: number): number {
  return clamp01(1 - Math.abs(v - target) / maxDev)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exercise ID → procedure key
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_TO_PROCEDURE: Record<string, string> = {
  doorway_stretch:  'doorway_stretch',
  seated_cross_arm: 'cross_arm_stretch',
  standing_sleeper: 'cross_arm_stretch',
  hand_behind_back: 'hand_behind_back',
  standing_chest:   'standing_chest',
  crab_press:       'crab_press',
  side_lying_er:    'side_lying_er',
  post_shoulder:    'sleeper_stretch',
  glute_bridge:     'glute_bridge',
  hip_hinge:        'hip_hinge',
  side_clamshell:   'side_clamshell',
}

// ─────────────────────────────────────────────────────────────────────────────
//  Procedure definitions
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_PROCEDURES: Record<string, ExerciseProcedure> = {

  // ── Standing Chest Stretch ─────────────────────────────────────────────────
  standing_chest: {
    exerciseId: 'standing_chest',
    steps: [
      {
        id: 'raise_arm',
        instruction: 'Stand sideways next to a wall and raise your arm out to the side at shoulder height.',
        completionText: 'Arm is up!',
        holdMs: 1500,
        check(lms) {
          const side = pickWallArm(lms)
          if (!side) return null
          if (!visible(lms, side === 'L' ? LM.L_HIP : LM.R_HIP,
                            side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER,
                            side === 'L' ? LM.L_ELBOW : LM.R_ELBOW)) return null
          const angle = jointAngleDeg(
            lms[side === 'L' ? LM.L_HIP      : LM.R_HIP],
            lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER],
            lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW],
          )
          return {
            done:     angle >= 70 && angle <= 115,
            progress: nearTarget(angle, 90, 60),
            hint:     angle < 70 ? 'Raise your arm higher — aim for shoulder height.'
                                 : 'Lower your arm slightly to shoulder level.',
          }
        },
      },
      {
        id: 'place_on_wall',
        instruction: 'Place your palm flat against the wall, then slowly rotate your body away to feel the stretch.',
        completionText: 'Great — feeling the stretch!',
        holdMs: 2000,
        check(lms) {
          const side = pickWallArm(lms)
          if (!side) return null
          if (!visible(lms, side === 'L' ? LM.L_HIP : LM.R_HIP,
                            side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER,
                            side === 'L' ? LM.L_ELBOW : LM.R_ELBOW)) return null
          const hip      = lms[side === 'L' ? LM.L_HIP      : LM.R_HIP]
          const shoulder = lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER]
          const elbow    = lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW]
          const angle    = jointAngleDeg(hip, shoulder, elbow)
          const shrug    = Math.abs(vectorVerticalAngleDeg(hip, shoulder))
          const done     = angle >= 70 && angle <= 115 && shrug <= 25
          return {
            done,
            progress: done ? 1 : nearTarget(angle, 90, 60) * 0.8,
            hint: shrug > 25 ? 'Relax your shoulder down — don\'t let it shrug.'
                             : 'Keep your arm on the wall and lean your chest forward.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold the stretch — breathe and feel the pull across your chest and front shoulder.',
        completionText: 'Excellent stretch — well done!',
        holdMs: 20000,
        isTimedHold: true,
        holdLabel: 'Hold the stretch…',
        check(lms) {
          const side = pickWallArm(lms)
          if (!side) return { done: true, progress: 1, hint: '' }  // can't see: benefit of doubt
          if (!visible(lms, side === 'L' ? LM.L_HIP : LM.R_HIP,
                            side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER,
                            side === 'L' ? LM.L_ELBOW : LM.R_ELBOW))
            return { done: true, progress: 1, hint: '' }
          const angle = jointAngleDeg(
            lms[side === 'L' ? LM.L_HIP      : LM.R_HIP],
            lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER],
            lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW],
          )
          return {
            done:     angle >= 60 && angle <= 125,
            progress: nearTarget(angle, 90, 60),
            hint:     'Keep your arm on the wall — don\'t let it drop.',
          }
        },
      },
    ],
  },

  // ── Doorway Stretch ────────────────────────────────────────────────────────
  doorway_stretch: {
    exerciseId: 'doorway_stretch',
    steps: [
      {
        id: 'raise_both_arms',
        instruction: 'Step into a doorway and raise both arms to shoulder height with elbows bent to 90°.',
        completionText: 'Both arms are up — nice!',
        holdMs: 1500,
        check(lms) {
          const hasL = visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
          const hasR = visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
          if (!hasL && !hasR) return null
          const angL = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW]) : 90
          const angR = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER], lms[LM.R_ELBOW]) : 90
          const lOk = angL >= 75 && angL <= 110
          const rOk = angR >= 75 && angR <= 110
          return {
            done:     lOk && rOk,
            progress: (nearTarget(angL, 90, 55) + nearTarget(angR, 90, 55)) / 2,
            hint:     !lOk ? 'Adjust your left arm to shoulder height.'
                   : !rOk ? 'Adjust your right arm to shoulder height.'
                   :        'Raise both arms to shoulder height.',
          }
        },
      },
      {
        id: 'step_forward',
        instruction: 'Step one foot forward through the doorway — feel your chest open as you lean in.',
        completionText: 'Chest is open — hold the stretch.',
        holdMs: 2000,
        check(lms) {
          const hasL = visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
          const hasR = visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
          if (!hasL && !hasR) return null
          const angL = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW]) : 90
          const angR = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER], lms[LM.R_ELBOW]) : 90
          const done = angL >= 70 && angL <= 115 && angR >= 70 && angR <= 115
          return {
            done,
            progress: done ? 1 : (nearTarget(angL, 90, 55) + nearTarget(angR, 90, 55)) / 2,
            hint: 'Keep both forearms on the doorframe as you lean forward.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold — push your chest through the doorway, breathe into the stretch.',
        completionText: 'Great doorway stretch!',
        holdMs: 20000,
        isTimedHold: true,
        holdLabel: 'Hold the stretch…',
        check(lms) {
          const hasL = visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
          const hasR = visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
          if (!hasL && !hasR) return { done: true, progress: 1, hint: '' }
          const angL = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW]) : 90
          const angR = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER], lms[LM.R_ELBOW]) : 90
          return {
            done:     angL >= 60 && angL <= 125 && angR >= 60 && angR <= 125,
            progress: (nearTarget(angL, 90, 55) + nearTarget(angR, 90, 55)) / 2,
            hint:     'Keep your forearms on the doorframe — don\'t let them drop.',
          }
        },
      },
    ],
  },

  // ── Cross-Arm Stretch  (seated_cross_arm + standing_sleeper) ───────────────
  cross_arm_stretch: {
    exerciseId: 'cross_arm_stretch',
    steps: [
      {
        id: 'raise_arm',
        instruction: 'Raise one arm to shoulder height directly in front of you.',
        completionText: 'Arm at shoulder height!',
        holdMs: 1500,
        check(lms) {
          const side = pickRaisedArm(lms)
          if (!side) return null
          if (!visible(lms, side === 'L' ? LM.L_HIP : LM.R_HIP,
                            side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER,
                            side === 'L' ? LM.L_ELBOW : LM.R_ELBOW)) return null
          const angle = jointAngleDeg(
            lms[side === 'L' ? LM.L_HIP      : LM.R_HIP],
            lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER],
            lms[side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW],
          )
          return {
            done:     angle >= 75 && angle <= 105,
            progress: nearTarget(angle, 90, 55),
            hint:     angle < 75 ? 'Lift your arm more — aim for shoulder height.'
                                 : 'Lower your arm a touch to shoulder level.',
          }
        },
      },
      {
        id: 'pull_across',
        instruction: 'Use your opposite hand to pull the elbow across your chest. Keep the shoulder pressed down.',
        completionText: 'Good pull — feel the stretch!',
        holdMs: 2000,
        check(lms) {
          const side = pickRaisedArm(lms)
          if (!side) return null
          const eSide = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          const lSide = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const rSide = side === 'L' ? LM.R_SHOULDER : LM.L_SHOULDER
          if (!visible(lms, eSide, lSide, rSide)) return null
          const shoulderWidth = Math.abs(lms[LM.L_SHOULDER].x - lms[LM.R_SHOULDER].x)
          // "across" = elbow has moved ≥25% of shoulder width toward the opposite side
          const elbowAcross = side === 'L'
            ? lms[eSide].x < lms[lSide].x - shoulderWidth * 0.25
            : lms[eSide].x > lms[lSide].x + shoulderWidth * 0.25
          const hipSide = side === 'L' ? LM.L_HIP : LM.R_HIP
          const angle = visible(lms, hipSide, lSide, eSide)
            ? jointAngleDeg(lms[hipSide], lms[lSide], lms[eSide])
            : 90
          const armUp = angle >= 65 && angle <= 115
          return {
            done:     elbowAcross && armUp,
            progress: (elbowAcross ? 0.6 : 0) + (armUp ? 0.4 : 0),
            hint:     !armUp ? 'Keep your arm at shoulder height as you pull.'
                             : 'Pull the elbow further across your chest.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold the pull — relax your neck, keep the shoulder blade down, breathe.',
        completionText: 'Excellent cross-arm stretch!',
        holdMs: 20000,
        isTimedHold: true,
        holdLabel: 'Hold the pull…',
        check(lms) {
          const side = pickRaisedArm(lms)
          if (!side) return { done: true, progress: 1, hint: '' }
          const hipSide = side === 'L' ? LM.L_HIP : LM.R_HIP
          const sSide   = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const eSide   = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          if (!visible(lms, hipSide, sSide, eSide)) return { done: true, progress: 1, hint: '' }
          const angle = jointAngleDeg(lms[hipSide], lms[sSide], lms[eSide])
          return {
            done:     angle >= 60 && angle <= 120,
            progress: nearTarget(angle, 90, 55),
            hint:     'Keep the elbow pulled across and your arm at shoulder height.',
          }
        },
      },
    ],
  },

  // ── Hand Behind Back ────────────────────────────────────────────────────────
  hand_behind_back: {
    exerciseId: 'hand_behind_back',
    steps: [
      {
        id: 'raise_top_arm',
        instruction: 'Reach one arm up and behind your head — point the elbow toward the ceiling.',
        completionText: 'Top arm is up!',
        holdMs: 1500,
        check(lms) {
          const side = pickHighElbow(lms)
          if (!side) return null
          const sSide = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const eSide = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          if (!visible(lms, sSide, eSide)) return null
          const angle = Math.abs(vectorVerticalAngleDeg(lms[sSide], lms[eSide]))
          return {
            done:     angle <= 60,
            progress: clamp01(1 - angle / 90),
            hint:     'Point the elbow more toward the ceiling — hand behind the head.',
          }
        },
      },
      {
        id: 'reach_behind_back',
        instruction: 'Now reach your lower hand behind your lower back. Use a towel if you can\'t touch.',
        completionText: 'Both hands in position!',
        holdMs: 2000,
        check(lms) {
          const side = pickHighElbow(lms)
          if (!side) return null
          const sSide = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const eSide = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          if (!visible(lms, sSide, eSide)) return null
          const angle = Math.abs(vectorVerticalAngleDeg(lms[sSide], lms[eSide]))
          return {
            done:     angle <= 65,
            progress: angle <= 65 ? 1 : clamp01(1 - angle / 90),
            hint:     'Keep the top elbow pointing up as you settle into position.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold — stand tall, shoulder blades down, breathe through the stretch.',
        completionText: 'Great hold — arms working together!',
        holdMs: 20000,
        isTimedHold: true,
        holdLabel: 'Hold…',
        check(lms) {
          const side = pickHighElbow(lms)
          if (!side) return { done: true, progress: 1, hint: '' }
          const sSide = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const eSide = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          if (!visible(lms, sSide, eSide)) return { done: true, progress: 1, hint: '' }
          const angle = Math.abs(vectorVerticalAngleDeg(lms[sSide], lms[eSide]))
          return {
            done:     angle <= 75,
            progress: clamp01(1 - angle / 90),
            hint:     'Keep that top elbow reaching toward the ceiling.',
          }
        },
      },
    ],
  },

  // ── Crab Press ─────────────────────────────────────────────────────────────
  crab_press: {
    exerciseId: 'crab_press',
    steps: [
      {
        id: 'sit_position',
        instruction: 'Sit on the floor with hands planted behind you, fingers pointing away from your body.',
        completionText: 'Starting position — now press up!',
        holdMs: 1500,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     angle >= 80 && angle <= 130,
            progress: nearTarget(angle, 105, 45),
            hint:     'Sit on the floor with knees bent, hands planted behind you.',
          }
        },
      },
      {
        id: 'press_hips_up',
        instruction: 'Press through your hands and feet — drive your hips up toward the ceiling.',
        completionText: 'Hips are up — hold the table!',
        holdMs: 1000,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     angle >= 145,
            progress: clamp01((angle - 90) / 70),
            hint:     angle < 130 ? 'Push harder — drive those hips all the way up.'
                                  : 'Almost there — press through your hands and feet.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold the tabletop — body flat, arms straight, core engaged.',
        completionText: 'Solid crab press — great work!',
        holdMs: 10000,
        isTimedHold: true,
        holdLabel: 'Hold the table…',
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE))
            return { done: true, progress: 1, hint: '' }
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     angle >= 148,
            progress: clamp01((angle - 110) / 55),
            hint:     'Hips are dropping — press through your hands and feet to lift up.',
          }
        },
      },
    ],
  },

  // ── Sleeper Stretch ─────────────────────────────────────────────────────────
  sleeper_stretch: {
    exerciseId: 'sleeper_stretch',
    steps: [
      {
        id: 'starting_position',
        instruction: 'Lie on your side with your bottom arm stretched out, elbow bent to 90°.',
        completionText: 'Elbow is at 90° — now press gently.',
        holdMs: 1500,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
          return {
            done:     angle >= 75 && angle <= 100,
            progress: nearTarget(angle, 90, 50),
            hint:     angle < 75 ? 'Bend your elbow more — aim for 90 degrees.'
                                 : 'Straighten slightly — 90 degrees is the target.',
          }
        },
      },
      {
        id: 'press_forearm',
        instruction: 'Gently press the forearm toward the floor with your top hand — feel the stretch in the back of your shoulder.',
        completionText: 'Stretch is on — hold it.',
        holdMs: 2000,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
          return {
            done:     angle >= 60 && angle <= 95,
            progress: nearTarget(angle, 78, 40),
            hint:     'Gently press your forearm toward the floor — keep it controlled.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold the gentle pressure — breathe and let the shoulder relax.',
        completionText: 'Great sleeper stretch!',
        holdMs: 20000,
        isTimedHold: true,
        holdLabel: 'Hold the pressure…',
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST))
            return { done: true, progress: 1, hint: '' }
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
          return {
            done:     angle >= 55 && angle <= 100,
            progress: nearTarget(angle, 78, 45),
            hint:     'Maintain gentle pressure — keep the elbow in position.',
          }
        },
      },
    ],
  },

  // ── Side-Lying External Rotation ───────────────────────────────────────────
  side_lying_er: {
    exerciseId: 'side_lying_er',
    steps: [
      {
        id: 'starting_position',
        instruction: 'Lie on your side with your elbow bent to 90°, forearm pointing forward.',
        completionText: 'Elbow set — now rotate up.',
        holdMs: 1500,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
          return {
            done:     angle >= 80 && angle <= 100,
            progress: nearTarget(angle, 90, 45),
            hint:     angle < 80 ? 'Bend your elbow to 90 degrees.'
                                 : 'Straighten slightly — 90 degrees is the starting position.',
          }
        },
      },
      {
        id: 'rotate_up',
        instruction: 'Slowly rotate your forearm upward toward the ceiling, keeping the elbow pinned to your side.',
        completionText: 'At the top — hold!',
        holdMs: 1000,
        check(lms) {
          if (!visible(lms, LM.L_ELBOW, LM.L_WRIST)) return null
          const wristAbove = lms[LM.L_WRIST].y < lms[LM.L_ELBOW].y
          return {
            done:     wristAbove,
            progress: wristAbove ? 1 : clamp01(1 - (lms[LM.L_WRIST].y - lms[LM.L_ELBOW].y) / 0.15),
            hint:     'Rotate the forearm upward — lift the wrist toward the ceiling.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold at the top — elbow stays pinned, wrist pointing up.',
        completionText: 'Great external rotation!',
        holdMs: 5000,
        isTimedHold: true,
        holdLabel: 'Hold at the top…',
        check(lms) {
          if (!visible(lms, LM.L_ELBOW, LM.L_WRIST)) return { done: true, progress: 1, hint: '' }
          const done = lms[LM.L_WRIST].y < lms[LM.L_ELBOW].y
          return {
            done,
            progress: done ? 1 : 0.3,
            hint:     'Keep the wrist pointing toward the ceiling.',
          }
        },
      },
    ],
  },

  // ── Glute Bridge ───────────────────────────────────────────────────────────
  glute_bridge: {
    exerciseId: 'glute_bridge',
    steps: [
      {
        id: 'lie_down',
        instruction: 'Lie on your back with knees bent to about 90° and feet flat on the floor.',
        completionText: 'Good starting position!',
        holdMs: 1500,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     angle >= 80 && angle <= 130,
            progress: nearTarget(angle, 105, 45),
            hint:     'Lie on your back with knees bent, feet flat on the floor.',
          }
        },
      },
      {
        id: 'lift_hips',
        instruction: 'Drive through your heels — squeeze your glutes and lift your hips toward the ceiling.',
        completionText: 'Hips are up — hold the bridge!',
        holdMs: 1000,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     angle >= 150,
            progress: clamp01((angle - 90) / 75),
            hint:     angle < 130 ? 'Push your hips higher — drive through the heels.'
                                  : 'Almost there — squeeze the glutes to finish the lift.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold the bridge — squeeze your glutes, keep knees hip-width.',
        completionText: 'Strong glute bridge — excellent!',
        holdMs: 10000,
        isTimedHold: true,
        holdLabel: 'Hold the bridge…',
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE))
            return { done: true, progress: 1, hint: '' }
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     angle >= 148,
            progress: clamp01((angle - 110) / 60),
            hint:     'Hips are dropping — squeeze the glutes and drive them back up.',
          }
        },
      },
    ],
  },

  // ── Side-Lying Clamshell ───────────────────────────────────────────────────
  side_clamshell: {
    exerciseId: 'side_clamshell',
    steps: [
      {
        id: 'starting_position',
        instruction: 'Lie on your side with knees bent and stacked on top of each other.',
        completionText: 'Good starting position!',
        holdMs: 1500,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)) return null
          const angle = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     angle >= 80 && angle <= 130,
            progress: nearTarget(angle, 105, 40),
            hint:     'Lie on your side with both knees bent and stacked together.',
          }
        },
      },
      {
        id: 'open_knee',
        instruction: 'Slowly lift your top knee like a clamshell opening — keep your heels together.',
        completionText: 'Good range — hold it open!',
        holdMs: 1000,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)) return null
          const abduction = Math.abs(180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE]))
          return {
            done:     abduction >= 20,
            progress: clamp01(abduction / 35),
            hint:     'Open the knee further — feel the outer hip working.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold at the top — don\'t roll the pelvis back.',
        completionText: 'Excellent clamshell!',
        holdMs: 5000,
        isTimedHold: true,
        holdLabel: 'Hold it open…',
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE))
            return { done: true, progress: 1, hint: '' }
          const abduction = Math.abs(180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE]))
          return {
            done:     abduction >= 15,
            progress: clamp01(abduction / 35),
            hint:     'Keep the knee lifted — don\'t let it drop.',
          }
        },
      },
    ],
  },

  // ── Hip Hinge ──────────────────────────────────────────────────────────────
  hip_hinge: {
    exerciseId: 'hip_hinge',
    steps: [
      {
        id: 'stand_tall',
        instruction: 'Stand tall with feet hip-width apart, arms relaxed at your sides.',
        completionText: 'Good upright posture — now hinge.',
        holdMs: 1500,
        check(lms) {
          if (!visible(lms, LM.L_HIP, LM.L_SHOULDER)) return null
          const tilt = Math.abs(vectorVerticalAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER]))
          return {
            done:     tilt <= 20,
            progress: clamp01(1 - tilt / 40),
            hint:     'Stand straight — keep your spine vertical before you hinge.',
          }
        },
      },
      {
        id: 'hinge_forward',
        instruction: 'Push your hips back and hinge forward at the hip — flat back, soft knees.',
        completionText: 'Good hinge — hold it!',
        holdMs: 1500,
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)) return null
          const flexion = 180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     flexion >= 60 && flexion <= 105,
            progress: nearTarget(flexion, 80, 50),
            hint:     flexion < 60 ? 'Push your hips further back — hinge deeper.'
                                   : 'Don\'t drop your chest too low — flat back.',
          }
        },
      },
      {
        id: 'hold',
        instruction: 'Hold the hinge — hamstrings loaded, flat back, hips pushed back.',
        completionText: 'Perfect hip hinge — great body awareness!',
        holdMs: 5000,
        isTimedHold: true,
        holdLabel: 'Hold the hinge…',
        check(lms) {
          if (!visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE))
            return { done: true, progress: 1, hint: '' }
          const flexion = 180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
          return {
            done:     flexion >= 50 && flexion <= 115,
            progress: nearTarget(flexion, 80, 50),
            hint:     'Maintain the hinge — keep pushing those hips back.',
          }
        },
      },
    ],
  },

}

// ─────────────────────────────────────────────────────────────────────────────
//  Frame evaluator
// ─────────────────────────────────────────────────────────────────────────────

// ±7° tolerance window applied around every ideal range.
// This prevents the coach from toggling "bad form" on every minor pose wobble.
// The cue still fires, but only when the user is genuinely out of range,
// not just at the edge of the target zone.
const FORM_TOLERANCE_DEG = 7

export function evaluateExercise(lms: LandmarkSet, def: BiofeedbackDef): FormSnapshot {
  const details: FormSnapshot['details'] = []
  let firstBadCue = ''
  let allGood = true

  for (const check of def.checks) {
    const v = check.measure(lms)
    if (v === null) { allGood = false; continue }
    const [lo, hi] = check.ideal
    // Apply tolerance: only flag as bad when clearly outside the range
    if (v < lo - FORM_TOLERANCE_DEG) {
      details.push({ label: check.label, deg: v, status: 'low' })
      if (!firstBadCue && check.belowCue) firstBadCue = check.belowCue
      allGood = false
    } else if (v > hi + FORM_TOLERANCE_DEG) {
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
