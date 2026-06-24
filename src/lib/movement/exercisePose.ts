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
}

export function postureForExercise(exerciseId?: string | null): Posture | null {
  if (!exerciseId) return null
  return EXERCISE_POSTURE[exerciseId] ?? null
}
