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
  /** Static stretches/holds never enter the repetition counter. */
  mode?:      'dynamic' | 'hold'
  /** Human-readable phase cues used to build a complete setup → move → exit flow. */
  setupCue?:  string
  actionCue?: string
  exitCue?:   string
  holdMs?:    number
  /** A dynamic exercise needs a real rest → target → rest cycle. */
  motion?: {
    measure: (lms: LandmarkSet) => number | null
    start: [number, number]
    target: [number, number]
  }
}

export interface FormSnapshot {
  cueText: string
  good:    boolean
  tracking: 'good' | 'lost'
  missing: string[]
  details: Array<{ label: string; deg: number; status: 'good' | 'low' | 'high' }>
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exercise ID → biofeedback key mapping
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_TO_BIOFEEDBACK: Record<string, string> = {
  // ── Deltoid (all 6 exercises now have guidance) ───────────────────────────
  doorway_stretch:  'doorway_stretch',
  seated_cross_arm: 'seated_cross_arm',
  standing_sleeper: 'standing_sleeper',
  hand_behind_back: 'hand_behind_back',
  standing_chest:   'standing_chest',
  crab_press:       'crab_press',
  // ── Rotator cuff ─────────────────────────────────────────────────────────
  side_lying_er:    'side_lying_er',
  post_shoulder:    'post_shoulder',
  wand_rotation:    'wand_rotation',
  wall_climb:       'wall_climb',
  scapular_reach:   'scapular_reach',
  pendulum:         'pendulum',
  high_low_rows:    'high_low_rows',
  up_back_stretch:  'up_back_stretch',
  supported_ext:    'supported_ext',
  // ── Glutes / hamstrings ───────────────────────────────────────────────────
  glute_bridge:     'glute_bridge',
  hip_hinge:        'hip_hinge',
  side_clamshell:   'side_clamshell',
  hamstring_squeeze:'hamstring_squeeze',
  // ── Biceps brachii ────────────────────────────────────────────────────────
  bb_flex_ext:         'bb_flex_ext',
  bb_shoulder_flex:    'bb_shoulder_flex',
  bb_wall_stretch:     'bb_wall_stretch',
  bb_ext_rotation:     'bb_ext_rotation',
  bb_sleeper_stretch:  'bb_sleeper_stretch',
  // ── Quadriceps ────────────────────────────────────────────────────────────
  qd_wall_squat:           'qd_wall_squat',
  qd_stiff_deadlift:       'qd_stiff_deadlift',
  qd_quad_stretch_stand:   'qd_quad_stretch_stand',
  qd_quad_stretch_side:    'qd_quad_stretch_side',
  qd_hamstring_supine:     'qd_hamstring_supine',
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

function pickFlexedElbow(lms: LandmarkSet): 'L' | 'R' | null {
  const hasL = visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
  const hasR = visible(lms, LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST)
  if (!hasL && !hasR) return null
  if (!hasL) return 'R'
  if (!hasR) return 'L'
  const left = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST])
  const right = jointAngleDeg(lms[LM.R_SHOULDER], lms[LM.R_ELBOW], lms[LM.R_WRIST])
  return left <= right ? 'L' : 'R'
}

function selectedArmAngle(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const s = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const e = side === 'L' ? LM.L_ELBOW : LM.R_ELBOW
  const w = side === 'L' ? LM.L_WRIST : LM.R_WRIST
  return visible(lms, s, e, w) ? jointAngleDeg(lms[s], lms[e], lms[w]) : null
}

function selectedKneeAngle(lms: LandmarkSet): number | null {
  const hasL = visible(lms, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE)
  const hasR = visible(lms, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE)
  if (!hasL && !hasR) return null
  const left = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE]) : 180
  const right = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE]) : 180
  return Math.min(left, right)
}

/** Rotation of the ribcage relative to the pelvis, using world X/Z when available. */
function torsoRotationDeg(lms: LandmarkSet): number | null {
  if (!visible(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP)) return null
  const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER]
  const lh = lms[LM.L_HIP], rh = lms[LM.R_HIP]
  const sx = (rs.wx ?? rs.x) - (ls.wx ?? ls.x)
  const sz = (rs.wz ?? rs.z) - (ls.wz ?? ls.z)
  const hx = (rh.wx ?? rh.x) - (lh.wx ?? lh.x)
  const hz = (rh.wz ?? rh.z) - (lh.wz ?? lh.z)
  const dot = sx * hx + sz * hz
  const mag = Math.hypot(sx, sz) * Math.hypot(hx, hz)
  if (mag < 1e-6) return null
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI
}

function uprightDeg(lms: LandmarkSet): number | null {
  if (!visible(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP)) return null
  const hip = {
    x: (lms[LM.L_HIP].x + lms[LM.R_HIP].x) / 2,
    y: (lms[LM.L_HIP].y + lms[LM.R_HIP].y) / 2,
    z: (lms[LM.L_HIP].z + lms[LM.R_HIP].z) / 2,
    visibility: 1,
  }
  const shoulder = {
    x: (lms[LM.L_SHOULDER].x + lms[LM.R_SHOULDER].x) / 2,
    y: (lms[LM.L_SHOULDER].y + lms[LM.R_SHOULDER].y) / 2,
    z: (lms[LM.L_SHOULDER].z + lms[LM.R_SHOULDER].z) / 2,
    visibility: 1,
  }
  return Math.abs(vectorVerticalAngleDeg(hip, shoulder))
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

  // ── Elbow Flexion / Extension (Biceps brachii flex_ext) ──────────────────
  // Measures the more-flexed elbow (smaller angle = more bent).  Target the
  // contracted top position of the curl.
  elbow_flexion: {
    exerciseId: 'bb_flex_ext',
    title:      'Elbow Flexion & Extension',
    introCue:   'Bring the palm toward your shoulder, then slowly straighten the arm.',
    checks: [
      {
        label:    'Elbow Flexion',
        ideal:    [40, 90],
        measure:  (lms) => {
          const hasL = visible(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)
          const hasR = visible(lms, LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST)
          if (!hasL && !hasR) return null
          const aL = hasL ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST]) : 999
          const aR = hasR ? jointAngleDeg(lms[LM.R_SHOULDER], lms[LM.R_ELBOW], lms[LM.R_WRIST]) : 999
          return Math.min(aL, aR)  // most-flexed (smallest angle)
        },
        belowCue: 'Ease off — don\'t over-flex the elbow.',
        aboveCue: 'Bend the elbow more — bring the palm closer to the shoulder.',
      },
    ],
  },

  // ── Shoulder Flexion (single arm raise overhead) ──────────────────────────
  // Pick the arm raised higher; measure hip→shoulder→elbow approaching 180°.
  shoulder_flexion: {
    exerciseId: 'bb_shoulder_flex',
    title:      'Shoulder Flexion',
    introCue:   'Lift your arm straight forward and up until it points at the ceiling.',
    checks: [
      {
        label:    'Shoulder Flexion',
        ideal:    [150, 180],
        measure:  (lms) => {
          const hasL = visible(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)
          const hasR = visible(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)
          if (!hasL && !hasR) return null
          const aL = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_SHOULDER], lms[LM.L_ELBOW]) : 0
          const aR = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_SHOULDER], lms[LM.R_ELBOW]) : 0
          return Math.max(aL, aR)  // most-raised arm
        },
        belowCue: 'Lift the arm higher — reach for the ceiling.',
        aboveCue: 'Don\'t arch the back — keep the lift smooth and controlled.',
      },
    ],
  },

  // ── Shoulder Extension (wall biceps stretch) ──────────────────────────────
  // Wall arm — most horizontal arm; ideal close to horizontal (~90° from
  // vertical) while the body turns away.
  shoulder_extension: {
    exerciseId: 'bb_wall_stretch',
    title:      'Wall Biceps Stretch',
    introCue:   'Place your palm on the wall behind you with the arm straight, then slowly turn your body away.',
    checks: [
      {
        label:    'Arm Extension',
        ideal:    [70, 110],
        measure:  (lms) => {
          const side = pickWallArm(lms)
          if (!side) return null
          const S = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const E = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          if (!visible(lms, S, E)) return null
          return Math.abs(vectorVerticalAngleDeg(lms[S], lms[E]))
        },
        belowCue: 'Straighten the arm more — keep it horizontal on the wall.',
        aboveCue: 'Lower the elbow slightly — keep the arm at shoulder height.',
      },
    ],
  },

  // ── Wall Squat (knee bend ~90°) ───────────────────────────────────────────
  knee_squat: {
    exerciseId: 'qd_wall_squat',
    title:      'Wall Squat',
    introCue:   'Stand with your back on the wall, then slide down until your thighs are level with your knees.',
    checks: [
      {
        label:    'Knee Flexion',
        ideal:    [80, 105],
        measure:  (lms) => {
          const hasL = visible(lms, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE)
          const hasR = visible(lms, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE)
          if (!hasL && !hasR) return null
          const aL = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE]) : 180
          const aR = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE]) : 180
          // Most-flexed knee (smaller angle = deeper squat)
          return Math.min(aL, aR)
        },
        belowCue: 'Don\'t go too deep — bring the hips up slightly.',
        aboveCue: 'Slide a little lower — thighs should be level with your knees.',
      },
    ],
  },

  // ── Quad Stretch (heel toward buttock, knee fully folded) ─────────────────
  quad_stretch: {
    exerciseId: 'qd_quad_stretch_stand',
    title:      'Quadriceps Stretch',
    introCue:   'Pull your foot toward your buttock and hold the stretch in the front of the thigh.',
    checks: [
      {
        label:    'Knee Flexion (stretch)',
        ideal:    [20, 60],
        measure:  (lms) => {
          const hasL = visible(lms, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE)
          const hasR = visible(lms, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE)
          if (!hasL && !hasR) return null
          const aL = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE]) : 180
          const aR = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE]) : 180
          // Most-flexed knee (the one being stretched)
          return Math.min(aL, aR)
        },
        belowCue: 'Ease the stretch — don\'t force the foot toward the buttock.',
        aboveCue: 'Pull the heel closer to the buttock for a deeper stretch.',
      },
    ],
  },

  // ── Supine Hamstring Stretch (leg raised straight up) ─────────────────────
  supine_hamstring: {
    exerciseId: 'qd_hamstring_supine',
    title:      'Supine Hamstring Stretch',
    introCue:   'Lie on your back and lift your leg straight up toward your body.',
    checks: [
      {
        label:    'Hip Flexion',
        ideal:    [70, 100],
        measure:  (lms) => {
          const hasL = visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
          const hasR = visible(lms, LM.R_SHOULDER, LM.R_HIP, LM.R_KNEE)
          if (!hasL && !hasR) return null
          // Hip flexion = 180 - (shoulder-hip-knee angle).
          // Pick the leg with greater flexion (the lifted one).
          const fL = hasL ? 180 - jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE]) : 0
          const fR = hasR ? 180 - jointAngleDeg(lms[LM.R_SHOULDER], lms[LM.R_HIP], lms[LM.R_KNEE]) : 0
          return Math.max(fL, fR)
        },
        belowCue: 'Lift the leg higher toward you — keep it straight.',
        aboveCue: 'Ease the leg back slightly — feel the stretch without strain.',
      },
    ],
  },
}

// Every shipped exercise gets its own definition. Similar-looking movements
// may share a measurement, but never inherit the wrong posture or coaching.
const elbowFlexionMeasure = BIOFEEDBACK_DEFS.elbow_flexion.checks[0].measure
const shoulderFlexionMeasure = BIOFEEDBACK_DEFS.shoulder_flexion.checks[0].measure
const hipFlexionMeasure = BIOFEEDBACK_DEFS.hip_hinge.checks[0].measure
const kneeFlexionMeasure = BIOFEEDBACK_DEFS.knee_squat.checks[0].measure

Object.assign(BIOFEEDBACK_DEFS, {
  seated_cross_arm: {
    ...BIOFEEDBACK_DEFS.cross_arm_stretch,
    exerciseId: 'seated_cross_arm', mode: 'hold', holdMs: 15000,
    setupCue: 'Sit tall with both shoulders visible and let the arm start relaxed.',
    actionCue: 'Bring one straight arm across your chest and use the other arm for gentle support. Keep the working shoulder down.',
    exitCue: 'Release the supporting arm and slowly return the stretched arm to your side.',
  },
  standing_sleeper: {
    exerciseId: 'standing_sleeper', title: 'Standing Sleeper Rotation', mode: 'hold', holdMs: 12000,
    introCue: 'Stand tall. Raise the working upper arm to shoulder height, bend the elbow to 90 degrees, then rotate only within a gentle range.',
    setupCue: 'Face the camera with the working elbow level with the shoulder.',
    actionCue: 'Keep the elbow at shoulder height and slowly rotate the forearm downward. Do not force the shoulder.',
    exitCue: 'Return the forearm upright first, then lower the arm.',
    checks: [
      { label: 'Upper arm height', ideal: [75, 105], measure: (lms: LandmarkSet) => {
        const side = pickRaisedArm(lms); if (!side) return null
        return jointAngleDeg(lms[side === 'L' ? LM.L_HIP : LM.R_HIP], lms[side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER], lms[side === 'L' ? LM.L_ELBOW : LM.R_ELBOW])
      }, belowCue: 'Raise the elbow to shoulder height.', aboveCue: 'Lower the elbow to shoulder height.' },
      { label: 'Elbow bend', ideal: [75, 105], measure: (lms: LandmarkSet) => { const s = pickRaisedArm(lms); return s ? selectedArmAngle(lms, s) : null }, belowCue: 'Bend the elbow closer to 90 degrees.', aboveCue: 'Bend the elbow closer to 90 degrees.' },
    ],
  },
  post_shoulder: {
    ...BIOFEEDBACK_DEFS.cross_arm_stretch,
    exerciseId: 'post_shoulder', title: 'Posterior Shoulder Stretch', mode: 'hold', holdMs: 15000,
    setupCue: 'Stand tall with the shoulder relaxed away from your ear.',
    actionCue: 'Draw one straight arm across the chest. Apply gentle pressure above the elbow, never on the joint.',
    exitCue: 'Release the pressure and slowly lower the arm.',
  },
  wand_rotation: {
    exerciseId: 'wand_rotation', title: 'Supine Wand Rotation', mode: 'dynamic',
    introCue: 'Lie on your back with both elbows bent and use the wand to guide one forearm outward without lifting the shoulder.',
    setupCue: 'Lie fully supported, elbows bent about 90 degrees and upper arms close to your sides.',
    actionCue: 'Use the opposite hand to guide the working forearm outward slowly. Keep both elbows bent and shoulders relaxed.',
    exitCue: 'Guide the forearm back to the starting position; do not let it drop.',
    checks: [{ label: 'Elbow bend', ideal: [75, 105], measure: (lms: LandmarkSet) => { const s = pickFlexedElbow(lms); return s ? selectedArmAngle(lms, s) : null }, belowCue: 'Open the elbow slightly toward 90 degrees.', aboveCue: 'Bend the elbow toward 90 degrees.' }],
  },
  wall_climb: {
    exerciseId: 'wall_climb', title: 'Wall Climb', mode: 'dynamic',
    introCue: 'Face the wall and walk your fingers upward only as far as the shoulder stays relaxed and symptoms do not increase.',
    setupCue: 'Stand close to the wall with the hand at chest height and elbow nearly straight.',
    actionCue: 'Walk the fingers up slowly. Keep the shoulder down and do not lean or arch to gain height.',
    exitCue: 'Walk the fingers back down under control.',
    checks: [{ label: 'Arm elevation', ideal: [125, 175], measure: shoulderFlexionMeasure, belowCue: 'Walk the hand a little higher without shrugging.', aboveCue: 'Stop at your comfortable ceiling; do not arch for more range.' }],
    motion: { measure: shoulderFlexionMeasure, start: [10, 60], target: [120, 180] },
  },
  scapular_reach: {
    exerciseId: 'scapular_reach', title: 'Supine Scapular Reach', mode: 'dynamic',
    introCue: 'Lie on your back with the arm pointing to the ceiling. Reach the hand upward by moving the shoulder blade, then settle it back down.',
    setupCue: 'Keep the arm vertical and the elbow straight.', actionCue: 'Reach the hand toward the ceiling without bending the elbow or rolling the trunk.', exitCue: 'Lower the shoulder blade gently back to the floor.',
    checks: [{ label: 'Elbow extension', ideal: [155, 180], measure: (lms: LandmarkSet) => { const s = pickRaisedArm(lms); return s ? selectedArmAngle(lms, s) : null }, belowCue: 'Straighten the elbow so the reach comes from the shoulder blade.', aboveCue: '' }],
  },
  pendulum: {
    exerciseId: 'pendulum', title: 'Shoulder Pendulum', mode: 'dynamic',
    introCue: 'Support yourself with one hand, hinge at the hips, and let the other arm hang completely relaxed while your body makes a small sway.',
    setupCue: 'Hinge forward with one hand supported and let the working arm hang loose.', actionCue: 'Use a small body sway to make a gentle circle; do not actively swing from the shoulder.', exitCue: 'Let the circle get smaller, stop, then stand up using your support.',
    checks: [
      { label: 'Torso hinge', ideal: [35, 80], measure: (lms: LandmarkSet) => { const u = uprightDeg(lms); return u }, belowCue: 'Hinge a little farther so the arm can hang freely.', aboveCue: 'Come up slightly; keep a comfortable supported hinge.' },
      { label: 'Relaxed straight arm', ideal: [150, 180], measure: (lms: LandmarkSet) => { const side = pickFlexedElbow(lms); return side ? selectedArmAngle(lms, side === 'L' ? 'R' : 'L') : null }, belowCue: 'Let the hanging elbow soften toward straight.', aboveCue: '' },
    ],
  },
  high_low_rows: {
    exerciseId: 'high_low_rows', title: 'High-to-Low Row', mode: 'dynamic',
    introCue: 'Start with the arms forward, then draw the elbows down and back while keeping the ribs and shoulders quiet.',
    setupCue: 'Stand tall with arms reaching forward and shoulders relaxed.', actionCue: 'Pull elbows toward your back pockets. Pause without shrugging or leaning.', exitCue: 'Return the arms forward slowly until the elbows are nearly straight.',
    checks: [{ label: 'Row elbow bend', ideal: [55, 100], measure: elbowFlexionMeasure, belowCue: 'Ease the pull slightly.', aboveCue: 'Draw the elbows farther back and down.' }],
    motion: { measure: elbowFlexionMeasure, start: [145, 180], target: [45, 105] },
  },
  up_back_stretch: {
    exerciseId: 'up_back_stretch', title: 'Up-the-Back Stretch', mode: 'hold', holdMs: 12000,
    introCue: 'Reach one hand behind the lower back and slide it upward only within a comfortable range.',
    setupCue: 'Stand tall with the working hand resting behind the hip.', actionCue: 'Slide the hand up the spine gently while the shoulder stays down and the chest stays tall.', exitCue: 'Slide the hand back down before bringing it around to your side.',
    checks: [{ label: 'Working elbow bend', ideal: [35, 110], measure: (lms: LandmarkSet) => { const s = pickFlexedElbow(lms); return s ? selectedArmAngle(lms, s) : null }, belowCue: 'Ease the reach; do not force the hand higher.', aboveCue: 'Bend the elbow as the hand slides gently up the back.' }],
  },
  supported_ext: {
    exerciseId: 'supported_ext', title: 'Supported Shoulder Extension', mode: 'hold', holdMs: 10000,
    introCue: 'Sit or stand tall with the forearm supported, then move only through a gentle shoulder range.',
    setupCue: 'Set the support so you can relax your neck and keep the trunk still.', actionCue: 'Move the supported arm slowly without shrugging or twisting the back.', exitCue: 'Return the arm to neutral while it stays supported.',
    checks: [{ label: 'Upright trunk', ideal: [0, 20], measure: uprightDeg, belowCue: '', aboveCue: 'Keep the trunk tall; do not lean to create the motion.' }],
  },
  hamstring_squeeze: {
    exerciseId: 'hamstring_squeeze', title: 'Seated Hamstring Squeeze', mode: 'hold', holdMs: 8000,
    introCue: 'Sit tall with the heel planted slightly in front of the knee. Pull the heel backward into the floor without letting it move.',
    setupCue: 'Sit near the chair edge, heel planted and knee comfortably bent.', actionCue: 'Dig the heel down and back as if dragging it toward the chair, but keep the foot still.', exitCue: 'Gradually reduce the pressure before relaxing the leg.',
    checks: [
      { label: 'Knee position', ideal: [75, 120], measure: selectedKneeAngle, belowCue: 'Move the heel slightly forward to open the knee angle.', aboveCue: 'Bring the heel a little closer so the knee is comfortably bent.' },
      { label: 'Tall posture', ideal: [0, 20], measure: uprightDeg, belowCue: '', aboveCue: 'Sit tall rather than leaning over the working leg.' },
    ],
  },
  bb_flex_ext: {
    ...BIOFEEDBACK_DEFS.elbow_flexion, exerciseId: 'bb_flex_ext', mode: 'dynamic',
    setupCue: 'Stand tall with the upper arm beside the ribs and elbow almost straight.', actionCue: 'Curl the palm toward the shoulder without letting the elbow drift forward.', exitCue: 'Lower slowly until the elbow is straight, not locked.',
    motion: { measure: elbowFlexionMeasure, start: [145, 180], target: [35, 95] },
  },
  bb_shoulder_flex: {
    ...BIOFEEDBACK_DEFS.shoulder_flexion, exerciseId: 'bb_shoulder_flex', mode: 'dynamic',
    setupCue: 'Stand tall with the arm at your side and ribs relaxed.', actionCue: 'Lift the straight arm forward and overhead without shrugging or arching your back.', exitCue: 'Lower the arm slowly to your side.',
    motion: { measure: shoulderFlexionMeasure, start: [0, 40], target: [140, 180] },
  },
  bb_wall_stretch: {
    exerciseId: 'bb_wall_stretch', title: 'Wall Biceps Stretch', mode: 'hold', holdMs: 15000,
    introCue: 'Stand beside the wall. Place your palm slightly behind you with the elbow straight. Keep the shoulder relaxed, then slowly turn your chest away until you feel only a mild stretch through the front of the upper arm or chest.',
    setupCue: 'Stand beside the wall with the palm slightly behind you and the whole arm visible to the camera.',
    actionCue: 'Keep the elbow straight and shoulder down. Slowly turn your chest away. Stop for sharp shoulder pain, tingling, or pain traveling down the arm.',
    exitCue: 'Turn your chest back toward the arm first, then release the hand from the wall.',
    checks: [
      { label: 'Arm at shoulder height', ideal: [70, 110], measure: (lms: LandmarkSet) => { const s = pickWallArm(lms); if (!s) return null; const S = s === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER, E = s === 'L' ? LM.L_ELBOW : LM.R_ELBOW; return visible(lms, S, E) ? Math.abs(vectorVerticalAngleDeg(lms[S], lms[E])) : null }, belowCue: 'Raise the wall arm toward shoulder height.', aboveCue: 'Lower the wall arm to shoulder height.' },
      { label: 'Elbow extension', ideal: [155, 180], measure: (lms: LandmarkSet) => { const s = pickWallArm(lms); return s ? selectedArmAngle(lms, s) : null }, belowCue: 'Straighten the wall-side elbow without locking it hard.', aboveCue: '' },
      { label: 'Torso turn', ideal: [10, 45], measure: torsoRotationDeg, belowCue: 'Keep the palm set and slowly turn your chest away.', aboveCue: 'Reduce the turn; this should be a mild stretch, not a forced twist.' },
      { label: 'Shoulder relaxed', ideal: [0, 22], measure: uprightDeg, belowCue: '', aboveCue: 'Relax the shoulder away from your ear and avoid leaning.' },
    ],
  },
  bb_ext_rotation: {
    ...BIOFEEDBACK_DEFS.side_lying_er, exerciseId: 'bb_ext_rotation', title: 'Reclining External Rotation', mode: 'dynamic',
    setupCue: 'Recline with the elbow supported and bent to 90 degrees.', actionCue: 'Rotate the forearm outward while the elbow stays planted.', exitCue: 'Return the forearm slowly without letting the shoulder roll forward.',
  },
  bb_sleeper_stretch: {
    ...BIOFEEDBACK_DEFS.sleeper_stretch, exerciseId: 'bb_sleeper_stretch', mode: 'hold', holdMs: 12000,
    setupCue: 'Lie on the working side with the shoulder and elbow each at about 90 degrees.', actionCue: 'Use the top hand to guide the forearm down gently; keep the shoulder blade settled.', exitCue: 'Release the top hand and let the forearm return upright before rolling away.',
  },
  qd_wall_squat: {
    ...BIOFEEDBACK_DEFS.knee_squat, exerciseId: 'qd_wall_squat', mode: 'dynamic',
    setupCue: 'Place your back on the wall, feet forward and about hip-width apart.', actionCue: 'Slide down with knees tracking over the feet; stop before pain or loss of control.', exitCue: 'Press through both feet and slide back to standing.',
    motion: { measure: kneeFlexionMeasure, start: [150, 180], target: [75, 110] },
  },
  qd_stiff_deadlift: {
    ...BIOFEEDBACK_DEFS.hip_hinge, exerciseId: 'qd_stiff_deadlift', title: 'Stiff-Leg Hip Hinge', mode: 'dynamic',
    setupCue: 'Stand tall with soft—not locked—knees and the load close to your thighs.', actionCue: 'Push the hips back while the spine stays long and the load stays close.', exitCue: 'Drive the floor away and bring the hips forward to stand tall.',
    checks: [
      ...BIOFEEDBACK_DEFS.hip_hinge.checks,
      { label: 'Soft straight knees', ideal: [150, 178], measure: selectedKneeAngle, belowCue: 'Straighten the knees slightly while keeping them soft.', aboveCue: 'Unlock the knees; do not force them backward.' },
    ],
    motion: { measure: hipFlexionMeasure, start: [0, 25], target: [45, 100] },
  },
  qd_quad_stretch_stand: {
    ...BIOFEEDBACK_DEFS.quad_stretch, exerciseId: 'qd_quad_stretch_stand', mode: 'hold', holdMs: 15000,
    setupCue: 'Stand beside a stable support and bend one knee.', actionCue: 'Hold the ankle and bring the heel toward the buttock while the knees stay close and trunk stays tall.', exitCue: 'Release slowly and place the foot down under control.',
  },
  qd_quad_stretch_side: {
    ...BIOFEEDBACK_DEFS.quad_stretch, exerciseId: 'qd_quad_stretch_side', title: 'Side-Lying Quad Stretch', mode: 'hold', holdMs: 15000,
    setupCue: 'Lie on your side with hips stacked and the lower leg comfortable.', actionCue: 'Bend the top knee and guide the heel toward the buttock without arching the back.', exitCue: 'Release the ankle slowly and straighten the leg before rolling up.',
  },
  qd_hamstring_supine: {
    ...BIOFEEDBACK_DEFS.supine_hamstring, exerciseId: 'qd_hamstring_supine', mode: 'hold', holdMs: 15000,
    setupCue: 'Lie on your back with both hips level and loop a strap behind one thigh or foot.', actionCue: 'Raise the working leg until you feel a mild back-of-thigh stretch while keeping the knee nearly straight.', exitCue: 'Bend the knee slightly, then lower the leg with the strap under control.',
    checks: [
      ...BIOFEEDBACK_DEFS.supine_hamstring.checks,
      { label: 'Knee extension', ideal: [150, 180], measure: (lms: LandmarkSet) => { const hasL = visible(lms, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE), hasR = visible(lms, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE); if (!hasL && !hasR) return null; const l = hasL ? jointAngleDeg(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE]) : 0, r = hasR ? jointAngleDeg(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE]) : 0; return Math.max(l, r) }, belowCue: 'Straighten the raised knee only as comfort allows.', aboveCue: '' },
    ],
  },
} satisfies Record<string, BiofeedbackDef>)

const leftHipAngle = (lms: LandmarkSet) => visible(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)
  ? jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE]) : null
const clamAngle = (lms: LandmarkSet) => {
  const angle = leftHipAngle(lms); return angle === null ? null : Math.abs(180 - angle)
}
Object.assign(BIOFEEDBACK_DEFS.crab_press, { mode: 'dynamic', setupCue: 'Sit with hands behind you and feet planted.', actionCue: 'Press the hips up to a tabletop without shrugging.', exitCue: 'Lower the hips slowly to the floor.', motion: { measure: leftHipAngle, start: [80, 135], target: [145, 180] } })
Object.assign(BIOFEEDBACK_DEFS.side_lying_er, { mode: 'dynamic', setupCue: 'Lie on your side with the elbow pinned to your ribs and bent 90 degrees.', actionCue: 'Rotate the forearm upward without letting the elbow leave your side.', exitCue: 'Lower the forearm slowly to the start.' })
Object.assign(BIOFEEDBACK_DEFS.glute_bridge, { mode: 'dynamic', setupCue: 'Lie on your back with feet planted and knees bent.', actionCue: 'Drive through the feet and lift until shoulders, hips and knees form a line.', exitCue: 'Lower one segment at a time without dropping.', motion: { measure: leftHipAngle, start: [75, 135], target: [150, 180] } })
Object.assign(BIOFEEDBACK_DEFS.side_clamshell, { mode: 'dynamic', setupCue: 'Lie on your side with knees bent and hips stacked.', actionCue: 'Open the top knee while heels stay together and pelvis stays still.', exitCue: 'Lower the knee slowly until the legs meet.', motion: { measure: clamAngle, start: [0, 18], target: [22, 55] } })
Object.assign(BIOFEEDBACK_DEFS.hip_hinge, { mode: 'dynamic', setupCue: 'Stand tall with soft knees.', actionCue: 'Push the hips back with a long neutral spine.', exitCue: 'Squeeze the glutes and return to standing.', motion: { measure: hipFlexionMeasure, start: [0, 25], target: [55, 105] } })

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

function inRange(value: number, range: [number, number], tolerance = 0): boolean {
  return value >= range[0] - tolerance && value <= range[1] + tolerance
}

/**
 * Safe fallback procedure used for every definition that does not have a
 * hand-authored sequence. It never advances without visible measurements.
 */
export function buildExerciseProcedure(def: BiofeedbackDef): ExerciseProcedure {
  const canMeasure = (lms: LandmarkSet) => def.checks.every((check) => check.measure(lms) !== null)
  const targetCheck = (lms: LandmarkSet): StepCheck | null => {
    if (!canMeasure(lms)) return null
    const snap = evaluateExercise(lms, def)
    const good = snap.details.filter((d) => d.status === 'good').length
    return {
      done: snap.good,
      progress: def.checks.length ? good / def.checks.length : 0,
      hint: snap.cueText || 'Move slowly toward the demonstrated position.',
    }
  }

  if (def.mode === 'dynamic' && def.motion) {
    return {
      exerciseId: def.exerciseId,
      steps: [
        {
          id: 'start', instruction: def.setupCue ?? def.introCue,
          completionText: 'Starting position found.', holdMs: 500,
          check(lms) {
            const v = def.motion!.measure(lms)
            return v === null ? null : { done: inRange(v, def.motion!.start, 5), progress: inRange(v, def.motion!.start, 5) ? 1 : 0.2, hint: def.setupCue ?? 'Return to the starting position.' }
          },
        },
        {
          id: 'target', instruction: def.actionCue ?? def.introCue,
          completionText: 'Target position reached.', holdMs: 500,
          check(lms) {
            const v = def.motion!.measure(lms)
            if (v === null || !canMeasure(lms)) return null
            return { done: inRange(v, def.motion!.target, 5), progress: inRange(v, def.motion!.target, 5) ? 1 : 0.35, hint: evaluateExercise(lms, def).cueText || def.actionCue || 'Move toward the target.' }
          },
        },
        {
          id: 'return', instruction: def.exitCue ?? 'Return slowly to the starting position.',
          completionText: 'One controlled repetition complete.', holdMs: 400,
          check(lms) {
            const v = def.motion!.measure(lms)
            return v === null ? null : { done: inRange(v, def.motion!.start, 5), progress: inRange(v, def.motion!.start, 5) ? 1 : 0.25, hint: def.exitCue ?? 'Return slowly to the start.' }
          },
        },
      ],
    }
  }

  return {
    exerciseId: def.exerciseId,
    steps: [
      {
        id: 'setup', instruction: def.setupCue ?? def.introCue,
        completionText: 'I can see the required joints.', holdMs: 500,
        check(lms) { return canMeasure(lms) ? { done: true, progress: 1, hint: '' } : null },
      },
      {
        id: 'enter', instruction: def.actionCue ?? def.introCue,
        completionText: 'Position found. Keep breathing.', holdMs: 800,
        check: targetCheck,
      },
      {
        id: 'hold', instruction: `Hold gently. ${def.actionCue ?? ''}`.trim(),
        completionText: 'Hold complete. Ease out slowly.', holdMs: def.holdMs ?? 10000,
        isTimedHold: true, holdLabel: 'Gentle hold…', check: targetCheck,
      },
      {
        id: 'exit', instruction: def.exitCue ?? 'Ease out slowly and return to a relaxed starting position.',
        completionText: 'Safe return complete.', holdMs: 600,
        check(lms) {
          if (!canMeasure(lms)) return null
          const first = def.checks[0]
          const value = first.measure(lms)
          if (value === null) return null
          const outside = !inRange(value, first.ideal, 10)
          return { done: outside, progress: outside ? 1 : 0.3, hint: def.exitCue ?? 'Ease out of the stretch slowly.' }
        },
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exercise ID → procedure key
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_TO_PROCEDURE: Record<string, string> = {
  doorway_stretch:  'doorway_stretch',
  seated_cross_arm: 'seated_cross_arm',
  standing_sleeper: 'standing_sleeper',
  hand_behind_back: 'hand_behind_back',
  standing_chest:   'standing_chest',
  crab_press:       'crab_press',
  side_lying_er:    'side_lying_er',
  post_shoulder:    'post_shoulder',
  wand_rotation:    'wand_rotation',
  wall_climb:       'wall_climb',
  scapular_reach:   'scapular_reach',
  pendulum:         'pendulum',
  high_low_rows:    'high_low_rows',
  up_back_stretch:  'up_back_stretch',
  supported_ext:    'supported_ext',
  glute_bridge:     'glute_bridge',
  hip_hinge:        'hip_hinge',
  side_clamshell:   'side_clamshell',
  hamstring_squeeze:'hamstring_squeeze',
  bb_flex_ext: 'bb_flex_ext',
  bb_shoulder_flex: 'bb_shoulder_flex',
  bb_wall_stretch: 'bb_wall_stretch',
  bb_ext_rotation: 'bb_ext_rotation',
  bb_sleeper_stretch: 'bb_sleeper_stretch',
  qd_wall_squat: 'qd_wall_squat',
  qd_stiff_deadlift: 'qd_stiff_deadlift',
  qd_quad_stretch_stand: 'qd_quad_stretch_stand',
  qd_quad_stretch_side: 'qd_quad_stretch_side',
  qd_hamstring_supine: 'qd_hamstring_supine',
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
          if (!side) return null
          if (!visible(lms, side === 'L' ? LM.L_HIP : LM.R_HIP,
                            side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER,
                            side === 'L' ? LM.L_ELBOW : LM.R_ELBOW))
            return null
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
          if (!hasL && !hasR) return null
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
          if (!side) return null
          const hipSide = side === 'L' ? LM.L_HIP : LM.R_HIP
          const sSide   = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const eSide   = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          if (!visible(lms, hipSide, sSide, eSide)) return null
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
          if (!side) return null
          const sSide = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
          const eSide = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
          if (!visible(lms, sSide, eSide)) return null
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
            return null
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
            return null
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
          if (!visible(lms, LM.L_ELBOW, LM.L_WRIST)) return null
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
            return null
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
            return null
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
            return null
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
  const missing: string[] = []
  let firstBadCue = ''
  let allGood = true

  for (const check of def.checks) {
    const v = check.measure(lms)
    if (v === null) { allGood = false; missing.push(check.label); continue }
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
    cueText: missing.length > 0
      ? `Tracking lost — return to view (${missing.join(', ')}).`
      : allGood ? 'Good alignment — hold it.' : firstBadCue,
    good:    allGood,
    tracking: missing.length > 0 ? 'lost' : 'good',
    missing,
    details,
  }
}
