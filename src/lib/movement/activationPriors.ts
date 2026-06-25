/**
 * activationPriors.ts
 *
 * Exercise-grounded muscle-activation PRIORS.
 *
 * Why (research-backed)
 * ─────────────────────
 * The deep-research review of RGB-pose → muscle-activation datasets concluded
 * that the state-of-the-art path is a model trained on simulation-derived
 * activations (Muscles-in-Time / OpenSim) — pose sequence → normalized [0,1]
 * per-muscle activation — collapsed into the ~13 muscle groups that matter, and
 * fine-tuned on real EMG (Muscles-in-Action). That full ML pipeline needs an
 * 11 GB dataset and offline training and can't run in-browser at inference.
 *
 * Until that model is trained and exported (see the staged plan in
 * POSE_ACCURACY_AND_MUSCLE_TWIN.md), this module captures the SAME knowledge in
 * a lightweight, real-time form: for each known exercise we encode the
 * canonical peak activation of each muscle group — values consistent with the
 * EMG literature and the representative MinT/OpenSim patterns from the research
 * (e.g. squat → quads/glutes/erectors dominate; curl → biceps/brachialis;
 * hip-hinge → glutes/hamstrings/erectors). The live kinesiology engine then
 * blends toward this prior, scaled by how hard the user is actually moving and
 * the external load — so the activation a user sees for a known exercise tracks
 * the literature instead of relying on the per-frame geometric estimate alone.
 *
 * Keys are the engine's muscle ids (see liveMuscleActivation.ts). Values are
 * the muscle's peak normalized activation [0,1] at the loaded phase.
 */

export type ActivationPattern = Record<string, number>

/**
 * Per-exercise canonical activation. Covers the app's strengthening exercises
 * plus the classic gym lifts from the research appendix (for when those are
 * added). Stretches are intentionally omitted — their target muscle is being
 * lengthened (low EMG), so the geometric engine handles them better than an
 * "activation" prior would.
 */
export const EXERCISE_ACTIVATION: Record<string, ActivationPattern> = {
  // ── App strengthening / loaded exercises ──────────────────────────────────
  glute_bridge: {
    gluteus_maximus: 0.85, biceps_femoris: 0.55, semitendinosus: 0.5,
    erector_spinae: 0.45, rectus_abdominis: 0.30,
  },
  hip_hinge: {
    gluteus_maximus: 0.70, biceps_femoris: 0.75, semitendinosus: 0.65,
    erector_spinae: 0.70, rectus_abdominis: 0.30,
  },
  hamstring_squeeze: {
    biceps_femoris: 0.80, semitendinosus: 0.75, semimembranosus: 0.7,
    gluteus_maximus: 0.55, gastrocnemius: 0.35,
  },
  side_clamshell: {
    gluteus_medius: 0.85, gluteus_minimus: 0.65, tensor_fasciae_latae: 0.5,
    gluteus_maximus: 0.30,
  },
  crab_press: {
    gluteus_maximus: 0.6, triceps_brachii: 0.55, deltoid_posterior: 0.45,
    erector_spinae: 0.45, rectus_abdominis: 0.35,
  },
  qd_wall_squat: {
    rectus_femoris: 0.8, vastus_lateralis: 0.85, gluteus_maximus: 0.5,
    biceps_femoris: 0.3, erector_spinae: 0.3,
  },
  qd_stiff_deadlift: {
    biceps_femoris: 0.78, semitendinosus: 0.7, gluteus_maximus: 0.7,
    erector_spinae: 0.8,
  },
  // Biceps / arm strengthening
  bb_flex_ext: {
    biceps_brachii: 0.88, brachialis: 0.6, brachioradialis: 0.5,
    deltoid_anterior: 0.2,
  },
  bb_shoulder_flex: {
    deltoid_anterior: 0.8, pectoralis_major: 0.45, serratus_anterior: 0.45,
    trapezius_lower: 0.4,
  },
  bb_ext_rotation: {
    infraspinatus: 0.85, teres_minor: 0.7, deltoid_posterior: 0.45,
  },
  side_lying_er: {
    infraspinatus: 0.85, teres_minor: 0.7, deltoid_posterior: 0.4,
  },
  wand_rotation: {
    infraspinatus: 0.6, subscapularis: 0.5, deltoid_posterior: 0.35,
  },

  // ── Classic gym lifts (from the research appendix; ready for when added) ──
  barbell_back_squat: {
    gluteus_maximus: 0.82, rectus_femoris: 0.88, vastus_lateralis: 0.88,
    biceps_femoris: 0.45, gastrocnemius: 0.4, erector_spinae: 0.7, rectus_abdominis: 0.3,
  },
  conventional_deadlift: {
    gluteus_maximus: 0.85, biceps_femoris: 0.8, semitendinosus: 0.78,
    erector_spinae: 0.9, latissimus_dorsi: 0.55, trapezius_upper: 0.6, rectus_abdominis: 0.35,
  },
  dumbbell_bicep_curl: {
    biceps_brachii: 0.9, brachialis: 0.65, brachioradialis: 0.55,
    deltoid_anterior: 0.25,
  },
  barbell_row: {
    latissimus_dorsi: 0.8, trapezius_lower: 0.6, deltoid_posterior: 0.55,
    biceps_brachii: 0.45, erector_spinae: 0.5,
  },
  overhead_press: {
    deltoid_anterior: 0.85, deltoid_lateral: 0.6, triceps_brachii: 0.7,
    trapezius_upper: 0.55, serratus_anterior: 0.5,
  },
}

/** Canonical activation pattern for an exercise, or null if none is defined. */
export function priorFor(exerciseId?: string | null): ActivationPattern | null {
  if (!exerciseId) return null
  return EXERCISE_ACTIVATION[exerciseId] ?? null
}

/** All muscle-group ids the priors reference (≈ the research's 13 groups). */
export const PRIOR_MUSCLE_GROUPS = [
  'gluteus_maximus', 'gluteus_medius', 'rectus_femoris', 'vastus_lateralis',
  'biceps_femoris', 'semitendinosus', 'gastrocnemius', 'erector_spinae',
  'rectus_abdominis', 'latissimus_dorsi', 'trapezius_upper', 'deltoid_anterior',
  'biceps_brachii', 'triceps_brachii', 'infraspinatus',
] as const
