/**
 * exercisePose.ts
 *
 * Per-exercise POSTURE prior for the live Muscle Twin shown during guided
 * exercises. The idea (from user feedback): when the user is doing a known
 * exercise we already know, with high confidence, what body posture it should
 * be in — so the model shouldn't free-guess the global posture from noisy pose.
 * It should adopt the exercise's expected posture (stand / sit / lie / side) and
 * only let the LIMBS track live motion on top of it.
 *
 * This both stabilises the model (no random flips) and makes it gravity-aware:
 * a glute bridge lies the model on its back, a clamshell puts it on its side,
 * a wall stretch keeps it standing.
 */

import type { SegmentId } from './poseRig'

export type Posture = 'standing' | 'seated' | 'supine' | 'prone' | 'side'

/** Exercise id (matches EXERCISE_TO_BIOFEEDBACK / procedure keys) → posture. */
export const EXERCISE_POSTURE: Record<string, Posture> = {
  // Shoulder / deltoid
  doorway_stretch:  'standing',
  seated_cross_arm: 'seated',
  standing_sleeper: 'standing',
  hand_behind_back: 'standing',
  standing_chest:   'standing',
  crab_press:       'supine',   // reverse tabletop — face up
  // Rotator cuff
  side_lying_er:    'side',
  post_shoulder:    'side',     // sleeper stretch — lying on the side
  wand_rotation:    'standing',
  // Glutes / hamstrings
  glute_bridge:     'supine',
  hip_hinge:        'standing',
  side_clamshell:   'side',
  hamstring_squeeze:'supine',
  // Biceps
  bb_flex_ext:        'standing',
  bb_shoulder_flex:   'standing',
  bb_wall_stretch:    'standing',
  bb_ext_rotation:    'side',
  bb_sleeper_stretch: 'side',
  // Quads
  qd_wall_squat:         'standing',
  qd_stiff_deadlift:     'standing',
  qd_quad_stretch_stand: 'standing',
  qd_quad_stretch_side:  'side',
  qd_hamstring_supine:   'supine',

  // ── MoveMate Train catalogue (gym/exercises.ts ids) ───────────────────────
  push_up: 'prone', db_bench_press: 'supine', incline_press: 'seated',
  chest_fly: 'supine', dips: 'standing',
  bent_row: 'standing', lat_pulldown: 'seated', one_arm_row: 'standing',
  face_pull: 'standing', superman: 'prone',
  overhead_press: 'standing', lateral_raise: 'standing', front_raise: 'standing',
  rear_delt_fly: 'standing', ext_rotation: 'standing',
  biceps_curl: 'standing', hammer_curl: 'standing', triceps_ext: 'standing',
  triceps_kickback: 'standing', concentration_curl: 'seated',
  bodyweight_squat: 'standing', goblet_squat: 'standing', reverse_lunge: 'standing',
  calf_raise: 'standing',
  crunch: 'supine', leg_raise: 'supine', bicycle: 'supine',
  plank: 'prone', mountain_climber: 'prone',
}

export function postureForExercise(exerciseId?: string | null): Posture | null {
  if (!exerciseId) return null
  return EXERCISE_POSTURE[exerciseId] ?? null
}

/**
 * Per-exercise KINEMATIC prior for the pose overlay.
 *
 * When the user selects an exercise, we know which body segments are actually
 * supposed to move — a biceps curl moves the forearms, a squat moves the legs
 * and trunk. Everything else should stay still. Feeding the rig this set lets it
 * track the working limbs responsively while heavily stabilising the rest, so
 * the overlay stops jittering on segments that shouldn't move for THIS motion
 * and the tracking is biased toward the exercise's expected trajectory.
 *
 * Segments NOT listed here are "held" (extra smoothing toward their last good
 * direction). An exercise with no entry lets every segment track freely.
 */
export const EXERCISE_MOVING_SEGMENTS: Record<string, SegmentId[]> = {
  // Rehab / atlas guided exercises
  bb_flex_ext:        ['forearmL', 'forearmR'],
  bb_shoulder_flex:   ['upperArmL', 'upperArmR'],
  side_lying_er:      ['forearmL', 'forearmR'],
  wand_rotation:      ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  glute_bridge:       ['thighL', 'thighR', 'trunk'],
  hip_hinge:          ['trunk', 'thighL', 'thighR'],
  side_clamshell:     ['thighL', 'thighR'],
  hamstring_squeeze:  ['shankL', 'shankR'],
  qd_wall_squat:      ['thighL', 'thighR', 'shankL', 'shankR'],
  qd_stiff_deadlift:  ['trunk', 'thighL', 'thighR'],

  // MoveMate Train catalogue
  push_up:          ['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'trunk'],
  db_bench_press:   ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  incline_press:    ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  chest_fly:        ['upperArmL', 'upperArmR'],
  dips:             ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  bent_row:         ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  lat_pulldown:     ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  one_arm_row:      ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  face_pull:        ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  superman:         ['upperArmL', 'upperArmR', 'thighL', 'thighR', 'trunk'],
  overhead_press:   ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'],
  lateral_raise:    ['upperArmL', 'upperArmR'],
  front_raise:      ['upperArmL', 'upperArmR'],
  rear_delt_fly:    ['upperArmL', 'upperArmR'],
  ext_rotation:     ['forearmL', 'forearmR'],
  biceps_curl:      ['forearmL', 'forearmR'],
  hammer_curl:      ['forearmL', 'forearmR'],
  triceps_ext:      ['forearmL', 'forearmR'],
  triceps_kickback: ['forearmL', 'forearmR'],
  concentration_curl: ['forearmL', 'forearmR'],
  bodyweight_squat: ['thighL', 'thighR', 'shankL', 'shankR', 'trunk'],
  goblet_squat:     ['thighL', 'thighR', 'shankL', 'shankR', 'trunk'],
  reverse_lunge:    ['thighL', 'thighR', 'shankL', 'shankR'],
  calf_raise:       ['shankL', 'shankR'],
  crunch:           ['trunk'],
  leg_raise:        ['thighL', 'thighR'],
  bicycle:          ['thighL', 'thighR', 'shankL', 'shankR', 'trunk'],
  plank:            [],
  mountain_climber: ['thighL', 'thighR'],
}

/** Segments the exercise expects to move; null when the exercise is unknown. */
export function movingSegmentsForExercise(exerciseId?: string | null): SegmentId[] | null {
  if (!exerciseId) return null
  return EXERCISE_MOVING_SEGMENTS[exerciseId] ?? null
}
