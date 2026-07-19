/**
 * plainMuscleNames.ts
 *
 * Plain-language labels for each diagnostic muscle_id.
 *
 * The tap-to-isolate flow shows these as the PRIMARY label so a non-clinical
 * user reads "Calf" instead of "Gastrocnemius".  The anatomical name
 * (common_name from painDiagnostic.json) is kept as small SECONDARY text.
 *
 * This mirrors the plain-language-cue standard already used in the assessment
 * flow (muscleJointMap.ts / AssessmentView.tsx) — everyday words, no jargon.
 *
 * Grouped rows (Calf, Hamstrings, Quadriceps, Deltoid, Glutes, …) already come
 * through MUSCLE_GROUP_MAP with plain labels, so they don't need an entry here.
 */

export const PLAIN_MUSCLE_NAMES: Record<string, string> = {
  // ── Back / shoulder ──────────────────────────────────────────────────────
  trapezius_upper:                'Upper Trap',
  trapezius_middle:               'Mid Trap',
  trapezius_lower:                'Lower Trap',
  latissimus_dorsi:               'Lats',
  serratus_anterior:              'Rib Muscle',
  rhomboid_major:                 'Between Shoulder Blades',
  rhomboid_minor:                 'Between Shoulder Blades',
  levator_scapulae:               'Neck-to-Shoulder',
  teres_major:                    'Shoulder Blade',
  teres_minor:                    'Rear Cuff',
  infraspinatus:                  'Rear Cuff',
  supraspinatus:                  'Top of Cuff',
  subscapularis:                  'Front Cuff',

  // ── Chest / core ─────────────────────────────────────────────────────────
  pectoralis_major:               'Chest',
  rectus_abdominis:               'Abs',
  external_oblique:               'Side Abs',

  // ── Shoulder cap / arm ───────────────────────────────────────────────────
  deltoid_anterior:               'Front Shoulder',
  deltoid_lateral:                'Side Shoulder',
  deltoid_posterior:              'Rear Shoulder',
  biceps_brachii:                 'Biceps',
  triceps_brachii:                'Triceps',
  brachioradialis:                'Forearm',
  extensor_carpi_radialis_longus: 'Back of Forearm',
  extensor_digitorum:             'Finger Extensor',
  flexor_carpi_radialis:          'Front of Forearm',
  palmaris_longus:                'Wrist Flexor',

  // ── Hip / glutes ─────────────────────────────────────────────────────────
  gluteus_maximus:                'Glute',
  gluteus_medius:                 'Side Glute',
  gluteus_minimus:                'Deep Glute',
  tensor_fasciae_latae:           'Outer Hip',
  piriformis:                     'Deep Hip',
  iliacus:                        'Hip Flexor',
  psoas_major:                    'Deep Hip Flexor',

  // ── Thigh ────────────────────────────────────────────────────────────────
  rectus_femoris:                 'Front Thigh',
  vastus_lateralis:               'Outer Thigh',
  vastus_medialis:                'Inner Thigh (knee)',
  vastus_intermedius:             'Front Thigh (deep)',
  biceps_femoris:                 'Outer Hamstring',
  semitendinosus:                 'Inner Hamstring',
  semimembranosus:                'Deep Hamstring',
  gracilis:                       'Inner Thigh',
  adductor_longus:                'Groin',

  // ── Lower leg ────────────────────────────────────────────────────────────
  tibialis_anterior:              'Shin',
  gastrocnemius:                  'Calf',
  soleus:                         'Deep Calf',
  popliteus:                      'Back of Knee',

  // ── Neck / spine ─────────────────────────────────────────────────────────
  splenius_capitis:               'Back of Neck',
  splenius_cervicis:              'Side of Neck',
  semispinalis_capitis:           'Deep Neck',
  sternocleidomastoid:            'Front of Neck',
  erector_spinae:                 'Lower Back',
  iliocostalis_thoracis:          'Mid-Back (outer)',
  longissimus_thoracis:           'Mid-Back (inner)',
  multifidus:                     'Deep Spine',
  quadratus_lumborum:             'Side Lower Back',
}

/**
 * Split a candidate row into its display parts.
 *
 *  • Grouped rows arrive with common_name already plain (e.g. "Calf (2)") —
 *    we keep that as the primary label and add no secondary text.
 *  • Single muscles show the plain label as primary and the anatomical name
 *    as small secondary text (only when the two actually differ).
 */
export function muscleLabelParts(
  muscle_id: string,
  common_name: string,
): { primary: string; secondary: string | null } {
  // Grouped marker form: "Group (n)" — already plain, count baked in.
  if (/\(\d+\)\s*$/.test(common_name)) {
    return { primary: common_name, secondary: null }
  }
  const plain = PLAIN_MUSCLE_NAMES[muscle_id]
  if (plain && plain.toLowerCase() !== common_name.toLowerCase()) {
    return { primary: plain, secondary: common_name }
  }
  return { primary: common_name, secondary: null }
}
