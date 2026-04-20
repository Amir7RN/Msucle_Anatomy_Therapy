/**
 * jsonPainPatterns.ts
 *
 * Canonical JSON-driven pain referral database (52 muscles).
 * Source: Travell & Simons Myofascial Pain and Dysfunction — verified referral
 * zones per Merck Manual clinical reference.
 *
 * Provides:
 *   JSON_PAIN_DB           — the raw JSON array typed as PainPatternEntry[]
 *   JSON_TO_MUSC_IDS       — maps json muscle_id → one or more GLB structure IDs
 *   getMusclePainDescription(muscId) — returns clinical description for a GLB ID
 *   getZonesForMusc(muscId)          — returns zone keys for a GLB structure ID
 *                                       (delegates to PAIN_PATTERNS in painPatterns.ts)
 */

export interface PainPatternEntry {
  muscle_id:                  string
  common_name:                string
  primary_pain_zone:          string[]
  referred_pain_zones:        string[]
  search_query_verification:  string
}

// ── Raw JSON database ─────────────────────────────────────────────────────────

export const JSON_PAIN_DB: PainPatternEntry[] = [
  {
    muscle_id: 'trapezius_upper',
    common_name: 'Trapezius (Upper)',
    primary_pain_zone: ['upper neck', 'shoulder region'],
    referred_pain_zones: ['posterolateral neck', 'mastoid area', 'temple', 'behind the eye'],
    search_query_verification: 'Trapezius upper referred pain pattern',
  },
  {
    muscle_id: 'trapezius_middle',
    common_name: 'Trapezius (Middle)',
    primary_pain_zone: ['mid-back between shoulder blades'],
    referred_pain_zones: ['acromion area', 'spine of scapula', 'interscapular region'],
    search_query_verification: 'Trapezius middle referred pain pattern',
  },
  {
    muscle_id: 'trapezius_lower',
    common_name: 'Trapezius (Lower)',
    primary_pain_zone: ['lower scapular region', 'mid-thoracic back'],
    referred_pain_zones: ['inferior angle of scapula', 'posterior shoulder', 'lower neck'],
    search_query_verification: 'Trapezius lower referred pain pattern',
  },
  {
    muscle_id: 'latissimus_dorsi',
    common_name: 'Latissimus Dorsi',
    primary_pain_zone: ['mid-back', 'posterior axilla'],
    referred_pain_zones: ['inferior angle of scapula', 'posterior shoulder', 'medial arm and forearm', 'ulnar side of hand'],
    search_query_verification: 'Latissimus dorsi referred pain pattern',
  },
  {
    muscle_id: 'pectoralis_major',
    common_name: 'Pectoralis Major',
    primary_pain_zone: ['anterior chest', 'front of shoulder'],
    referred_pain_zones: ['front of chest across sternum', 'anterior shoulder', 'medial arm and forearm', 'ulnar side of hand'],
    search_query_verification: 'Pectoralis major referred pain pattern',
  },
  {
    muscle_id: 'serratus_anterior',
    common_name: 'Serratus Anterior',
    primary_pain_zone: ['lateral rib cage under the arm'],
    referred_pain_zones: ['side of chest', 'scapular area', 'posterior shoulder', 'medial arm'],
    search_query_verification: 'Serratus anterior referred pain pattern',
  },
  {
    muscle_id: 'rectus_abdominis',
    common_name: 'Rectus Abdominis',
    primary_pain_zone: ['anterior abdominal wall'],
    referred_pain_zones: ['mid-back', 'lower thoracic spine', 'lumbar region', 'around umbilicus'],
    search_query_verification: 'Rectus abdominis referred pain pattern',
  },
  {
    muscle_id: 'external_oblique',
    common_name: 'External Oblique',
    primary_pain_zone: ['lateral abdomen'],
    referred_pain_zones: ['groin', 'lower abdomen', 'iliac crest', 'low back'],
    search_query_verification: 'External oblique referred pain pattern',
  },
  {
    muscle_id: 'deltoid_anterior',
    common_name: 'Deltoid (Anterior)',
    primary_pain_zone: ['front of shoulder'],
    referred_pain_zones: ['front of upper arm to elbow', 'front of shoulder joint'],
    search_query_verification: 'Deltoid anterior referred pain pattern',
  },
  {
    muscle_id: 'deltoid_lateral',
    common_name: 'Deltoid (Lateral)',
    primary_pain_zone: ['lateral shoulder'],
    referred_pain_zones: ['lateral upper arm', 'deltoid insertion area'],
    search_query_verification: 'Deltoid lateral referred pain pattern',
  },
  {
    muscle_id: 'deltoid_posterior',
    common_name: 'Deltoid (Posterior)',
    primary_pain_zone: ['back of shoulder'],
    referred_pain_zones: ['posterior upper arm', 'triceps region'],
    search_query_verification: 'Deltoid posterior referred pain pattern',
  },
  {
    muscle_id: 'biceps_brachii',
    common_name: 'Biceps Brachii (Long and Short Heads)',
    primary_pain_zone: ['front of upper arm', 'anterior shoulder'],
    referred_pain_zones: ['front of shoulder', 'front of elbow', 'radial forearm'],
    search_query_verification: 'Biceps brachii referred pain pattern',
  },
  {
    muscle_id: 'triceps_brachii',
    common_name: 'Triceps Brachii (Long and Lateral Heads)',
    primary_pain_zone: ['back of upper arm'],
    referred_pain_zones: ['posterior shoulder', 'scapular area', 'posterior elbow', 'posterior forearm'],
    search_query_verification: 'Triceps brachii referred pain pattern',
  },
  {
    muscle_id: 'brachioradialis',
    common_name: 'Brachioradialis',
    primary_pain_zone: ['lateral forearm'],
    referred_pain_zones: ['radial forearm', 'radial wrist', 'base of thumb'],
    search_query_verification: 'Brachioradialis referred pain pattern',
  },
  {
    muscle_id: 'gluteus_maximus',
    common_name: 'Gluteus Maximus',
    primary_pain_zone: ['buttock region'],
    referred_pain_zones: ['sacrum', 'coccyx', 'posterior thigh'],
    search_query_verification: 'Gluteus maximus referred pain pattern',
  },
  {
    muscle_id: 'tensor_fasciae_latae',
    common_name: 'Tensor Fasciae Latae',
    primary_pain_zone: ['lateral hip'],
    referred_pain_zones: ['lateral thigh', 'iliotibial band area', 'lateral knee'],
    search_query_verification: 'Tensor fasciae latae referred pain pattern',
  },
  {
    muscle_id: 'rectus_femoris',
    common_name: 'Rectus Femoris',
    primary_pain_zone: ['front of thigh'],
    referred_pain_zones: ['front of hip', 'anterior thigh', 'front of knee'],
    search_query_verification: 'Rectus femoris referred pain pattern',
  },
  {
    muscle_id: 'vastus_lateralis',
    common_name: 'Vastus Lateralis',
    primary_pain_zone: ['lateral thigh'],
    referred_pain_zones: ['lateral knee', 'lateral lower leg'],
    search_query_verification: 'Vastus lateralis referred pain pattern',
  },
  {
    muscle_id: 'vastus_medialis',
    common_name: 'Vastus Medialis',
    primary_pain_zone: ['medial distal thigh'],
    referred_pain_zones: ['medial knee', 'anteromedial leg'],
    search_query_verification: 'Vastus medialis referred pain pattern',
  },
  {
    muscle_id: 'tibialis_anterior',
    common_name: 'Tibialis Anterior',
    primary_pain_zone: ['anterior shin'],
    referred_pain_zones: ['dorsum of foot', 'big toe', 'medial ankle'],
    search_query_verification: 'Tibialis anterior referred pain pattern',
  },
  {
    muscle_id: 'gastrocnemius',
    common_name: 'Gastrocnemius (Medial and Lateral Heads)',
    primary_pain_zone: ['calf (posterior lower leg)'],
    referred_pain_zones: ['posterior knee', 'calf', 'heel or sole of foot', 'lateral ankle'],
    search_query_verification: 'Gastrocnemius referred pain pattern',
  },
  {
    muscle_id: 'infraspinatus',
    common_name: 'Infraspinatus',
    primary_pain_zone: ['back of shoulder blade (infraspinous fossa)'],
    referred_pain_zones: ['front of shoulder', 'anterior arm', 'radial hand and fingers'],
    search_query_verification: 'Infraspinatus referred pain pattern',
  },
  {
    muscle_id: 'teres_major',
    common_name: 'Teres Major',
    primary_pain_zone: ['posterior axilla', 'inferior angle of scapula'],
    referred_pain_zones: ['posterior shoulder', 'posterior upper arm'],
    search_query_verification: 'Teres major referred pain pattern',
  },
  {
    muscle_id: 'teres_minor',
    common_name: 'Teres Minor',
    primary_pain_zone: ['posterior shoulder below infraspinatus'],
    referred_pain_zones: ['posterior shoulder', 'lateral arm'],
    search_query_verification: 'Teres minor referred pain pattern',
  },
  {
    muscle_id: 'rhomboid_major',
    common_name: 'Rhomboid Major',
    primary_pain_zone: ['upper back between the shoulder blades'],
    referred_pain_zones: ['medial border of scapula', 'inter-scapular region'],
    search_query_verification: 'Rhomboid major referred pain pattern',
  },
  {
    muscle_id: 'rhomboid_minor',
    common_name: 'Rhomboid Minor',
    primary_pain_zone: ['upper back at the base of neck'],
    referred_pain_zones: ['medial scapular border', 'upper thoracic spine'],
    search_query_verification: 'Rhomboid minor referred pain pattern',
  },
  {
    muscle_id: 'levator_scapulae',
    common_name: 'Levator Scapulae',
    primary_pain_zone: ['side and back of neck', 'superior medial scapula'],
    referred_pain_zones: ['medial border of scapula', 'posterolateral neck', 'posterior shoulder'],
    search_query_verification: 'Levator scapulae referred pain pattern',
  },
  {
    muscle_id: 'extensor_carpi_radialis_longus',
    common_name: 'Extensor Carpi Radialis Longus',
    primary_pain_zone: ['lateral forearm near elbow'],
    referred_pain_zones: ['dorsal hand near thumb', 'lateral elbow'],
    search_query_verification: 'Extensor carpi radialis longus referred pain pattern',
  },
  {
    muscle_id: 'extensor_digitorum',
    common_name: 'Extensor Digitorum',
    primary_pain_zone: ['posterior forearm'],
    referred_pain_zones: ['dorsum of hand and fingers', 'lateral elbow'],
    search_query_verification: 'Extensor digitorum referred pain pattern',
  },
  {
    muscle_id: 'flexor_carpi_radialis',
    common_name: 'Flexor Carpi Radialis',
    primary_pain_zone: ['anterior forearm (medial)'],
    referred_pain_zones: ['palmar wrist', 'radial side of palm'],
    search_query_verification: 'Flexor carpi radialis referred pain pattern',
  },
  {
    muscle_id: 'palmaris_longus',
    common_name: 'Palmaris Longus',
    primary_pain_zone: ['central anterior forearm'],
    referred_pain_zones: ['palm of hand', 'palmar wrist'],
    search_query_verification: 'Palmaris longus referred pain pattern',
  },
  {
    muscle_id: 'gluteus_medius',
    common_name: 'Gluteus Medius',
    primary_pain_zone: ['lateral hip (beneath gluteus maximus)'],
    referred_pain_zones: ['sacrum', 'posterior buttock', 'lateral thigh', 'occasionally lateral leg'],
    search_query_verification: 'Gluteus medius referred pain pattern',
  },
  {
    muscle_id: 'biceps_femoris',
    common_name: 'Biceps Femoris (Long Head)',
    primary_pain_zone: ['posterior lateral thigh'],
    referred_pain_zones: ['posterior knee', 'lateral calf', 'lateral lower leg'],
    search_query_verification: 'Biceps femoris referred pain pattern',
  },
  {
    muscle_id: 'semitendinosus',
    common_name: 'Semitendinosus',
    primary_pain_zone: ['posterior medial thigh'],
    referred_pain_zones: ['posteromedial knee', 'medial calf'],
    search_query_verification: 'Semitendinosus referred pain pattern',
  },
  {
    muscle_id: 'semimembranosus',
    common_name: 'Semimembranosus',
    primary_pain_zone: ['deep posterior medial thigh'],
    referred_pain_zones: ['posteromedial knee', 'posterior leg'],
    search_query_verification: 'Semimembranosus referred pain pattern',
  },
  {
    muscle_id: 'gracilis',
    common_name: 'Gracilis',
    primary_pain_zone: ['medial thigh'],
    referred_pain_zones: ['medial knee', 'medial lower leg'],
    search_query_verification: 'Gracilis referred pain pattern',
  },
  {
    muscle_id: 'adductor_longus',
    common_name: 'Adductor Longus',
    primary_pain_zone: ['medial thigh and groin'],
    referred_pain_zones: ['medial thigh', 'inguinal area', 'medial knee'],
    search_query_verification: 'Adductor longus referred pain pattern',
  },
  {
    muscle_id: 'splenius_capitis',
    common_name: 'Splenius Capitis',
    primary_pain_zone: ['back of neck', 'upper thoracic spine'],
    referred_pain_zones: ['top of head', 'back of head', 'behind the eye'],
    search_query_verification: 'Splenius capitis referred pain pattern',
  },
  {
    muscle_id: 'semispinalis_capitis',
    common_name: 'Semispinalis Capitis',
    primary_pain_zone: ['deep posterior neck'],
    referred_pain_zones: ['posterior head', 'upper neck'],
    search_query_verification: 'Semispinalis capitis referred pain pattern',
  },
  {
    muscle_id: 'sternocleidomastoid',
    common_name: 'Sternocleidomastoid (Deep Head)',
    primary_pain_zone: ['front and side of neck'],
    referred_pain_zones: ['forehead', 'temple', 'ear and behind ear', 'jaw and cheek', 'top of head'],
    search_query_verification: 'Sternocleidomastoid referred pain pattern',
  },
  {
    muscle_id: 'supraspinatus',
    common_name: 'Supraspinatus',
    primary_pain_zone: ['top of shoulder blade (supraspinous fossa)'],
    referred_pain_zones: ['lateral shoulder', 'lateral arm to elbow'],
    search_query_verification: 'Supraspinatus referred pain pattern',
  },
  {
    muscle_id: 'subscapularis',
    common_name: 'Subscapularis',
    primary_pain_zone: ['anterior surface of scapula (subscapular fossa)'],
    referred_pain_zones: ['posterior shoulder', 'posterior arm', 'wrist'],
    search_query_verification: 'Subscapularis referred pain pattern',
  },
  {
    muscle_id: 'erector_spinae',
    common_name: 'Erector Spinae (Iliocostalis, Longissimus, Spinalis)',
    primary_pain_zone: ['spine from neck to lumbar region'],
    referred_pain_zones: ['paraspinal areas', 'low back', 'buttocks', 'posterior thigh'],
    search_query_verification: 'Erector spinae referred pain pattern',
  },
  {
    muscle_id: 'multifidus',
    common_name: 'Multifidus',
    primary_pain_zone: ['deep lumbar and cervical spine'],
    referred_pain_zones: ['deep low back', 'sacral region'],
    search_query_verification: 'Multifidus referred pain pattern',
  },
  {
    muscle_id: 'quadratus_lumborum',
    common_name: 'Quadratus Lumborum',
    primary_pain_zone: ['posterior iliac crest', 'lateral lumbar region'],
    referred_pain_zones: ['sacrum', 'buttock', 'hip', 'lateral thigh'],
    search_query_verification: 'Quadratus lumborum referred pain pattern',
  },
  {
    muscle_id: 'gluteus_minimus',
    common_name: 'Gluteus Minimus',
    primary_pain_zone: ['deep lateral buttock'],
    referred_pain_zones: ['lateral thigh', 'lateral leg down to ankle', 'side of calf'],
    search_query_verification: 'Gluteus minimus referred pain pattern',
  },
  {
    muscle_id: 'piriformis',
    common_name: 'Piriformis',
    primary_pain_zone: ['deep buttock near sacrum'],
    referred_pain_zones: ['buttock', 'posterior thigh', 'posterior leg resembling sciatica'],
    search_query_verification: 'Piriformis referred pain pattern',
  },
  {
    muscle_id: 'iliacus',
    common_name: 'Iliacus',
    primary_pain_zone: ['iliac fossa (pelvis)'],
    referred_pain_zones: ['groin', 'anterior thigh', 'lower abdomen'],
    search_query_verification: 'Iliacus referred pain pattern',
  },
  {
    muscle_id: 'psoas_major',
    common_name: 'Psoas Major',
    primary_pain_zone: ['lumbar spine region', 'deep pelvis'],
    referred_pain_zones: ['lumbar spine', 'sacrum', 'anterior thigh'],
    search_query_verification: 'Psoas major referred pain pattern',
  },
  {
    muscle_id: 'vastus_intermedius',
    common_name: 'Vastus Intermedius',
    primary_pain_zone: ['deep anterior thigh'],
    referred_pain_zones: ['front of thigh', 'anterior knee'],
    search_query_verification: 'Vastus intermedius referred pain pattern',
  },
  {
    muscle_id: 'popliteus',
    common_name: 'Popliteus',
    primary_pain_zone: ['back of the knee (popliteal fossa)'],
    referred_pain_zones: ['posterior knee', 'posteromedial calf'],
    search_query_verification: 'Popliteus referred pain pattern',
  },
  {
    muscle_id: 'soleus',
    common_name: 'Soleus',
    primary_pain_zone: ['deep posterior calf'],
    referred_pain_zones: ['heel', 'plantar aspect of foot', 'mid-calf'],
    search_query_verification: 'Soleus referred pain pattern',
  },
]

// ── JSON muscle_id → GLB structure IDs ────────────────────────────────────────
//
// Maps each JSON muscle_id to the one or more MUSC_ IDs that correspond
// to that muscle in the BodyParts3D GLB model.  Bilateral muscles produce
// two entries (_R and _L).
//
export const JSON_TO_MUSC_IDS: Record<string, string[]> = {
  trapezius_upper:                   ['MUSC_TRAPEZIUS'],
  trapezius_middle:                  ['MUSC_TRAPEZIUS'],
  trapezius_lower:                   ['MUSC_TRAPEZIUS'],
  latissimus_dorsi:                  ['MUSC_LATISSIMUS_DORSI_R',     'MUSC_LATISSIMUS_DORSI_L'],
  pectoralis_major:                  ['MUSC_PECTORALIS_MAJOR_R',     'MUSC_PECTORALIS_MAJOR_L'],
  serratus_anterior:                 ['MUSC_SERRATUS_ANTERIOR_R',    'MUSC_SERRATUS_ANTERIOR_L'],
  rectus_abdominis:                  ['MUSC_RECTUS_ABDOMINIS'],
  external_oblique:                  ['MUSC_EXTERNAL_OBLIQUE_R',     'MUSC_EXTERNAL_OBLIQUE_L'],
  deltoid_anterior:                  ['MUSC_DELTOID_R',              'MUSC_DELTOID_L'],
  deltoid_lateral:                   ['MUSC_DELTOID_R',              'MUSC_DELTOID_L'],
  deltoid_posterior:                 ['MUSC_DELTOID_R',              'MUSC_DELTOID_L'],
  biceps_brachii:                    ['MUSC_BICEPS_BRACHII_R',       'MUSC_BICEPS_BRACHII_L'],
  triceps_brachii:                   ['MUSC_TRICEPS_BRACHII_R',      'MUSC_TRICEPS_BRACHII_L'],
  brachioradialis:                   ['MUSC_BRACHIORADIALIS_R',      'MUSC_BRACHIORADIALIS_L'],
  gluteus_maximus:                   ['MUSC_GLUTEUS_MAXIMUS_R',      'MUSC_GLUTEUS_MAXIMUS_L'],
  tensor_fasciae_latae:              ['MUSC_TENSOR_FASCIAE_LATAE_R', 'MUSC_TENSOR_FASCIAE_LATAE_L'],
  rectus_femoris:                    ['MUSC_RECTUS_FEMORIS_R',       'MUSC_RECTUS_FEMORIS_L'],
  vastus_lateralis:                  ['MUSC_VASTUS_LATERALIS_R',     'MUSC_VASTUS_LATERALIS_L'],
  vastus_medialis:                   ['MUSC_VASTUS_MEDIALIS_R',      'MUSC_VASTUS_MEDIALIS_L'],
  tibialis_anterior:                 ['MUSC_TIBIALIS_ANTERIOR_R',    'MUSC_TIBIALIS_ANTERIOR_L'],
  gastrocnemius:                     ['MUSC_GASTROCNEMIUS_R',        'MUSC_GASTROCNEMIUS_L'],
  infraspinatus:                     ['MUSC_INFRASPINATUS_R',        'MUSC_INFRASPINATUS_L'],
  teres_major:                       ['MUSC_TERES_MAJOR_R',          'MUSC_TERES_MAJOR_L'],
  teres_minor:                       ['MUSC_TERES_MINOR_R',          'MUSC_TERES_MINOR_L'],
  rhomboid_major:                    ['MUSC_RHOMBOID_MAJOR_R',       'MUSC_RHOMBOID_MAJOR_L'],
  rhomboid_minor:                    ['MUSC_RHOMBOID_MINOR_R',       'MUSC_RHOMBOID_MINOR_L'],
  levator_scapulae:                  ['MUSC_LEVATOR_SCAPULAE_R',     'MUSC_LEVATOR_SCAPULAE_L'],
  extensor_carpi_radialis_longus:    ['MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_R', 'MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_L'],
  extensor_digitorum:                ['MUSC_EXTENSOR_DIGITORUM_R',   'MUSC_EXTENSOR_DIGITORUM_L'],
  flexor_carpi_radialis:             ['MUSC_FLEXOR_CARPI_RADIALIS_R','MUSC_FLEXOR_CARPI_RADIALIS_L'],
  palmaris_longus:                   ['MUSC_PALMARIS_LONGUS_R',      'MUSC_PALMARIS_LONGUS_L'],
  gluteus_medius:                    ['MUSC_GLUTEUS_MEDIUS_R',        'MUSC_GLUTEUS_MEDIUS_L'],
  biceps_femoris:                    ['MUSC_BICEPS_FEMORIS_R',       'MUSC_BICEPS_FEMORIS_L'],
  semitendinosus:                    ['MUSC_SEMITENDINOSUS_R',       'MUSC_SEMITENDINOSUS_L'],
  semimembranosus:                   ['MUSC_SEMIMEMBRANOSUS_R',      'MUSC_SEMIMEMBRANOSUS_L'],
  gracilis:                          ['MUSC_GRACILIS_R',             'MUSC_GRACILIS_L'],
  adductor_longus:                   ['MUSC_ADDUCTOR_LONGUS_R',      'MUSC_ADDUCTOR_LONGUS_L'],
  splenius_capitis:                  ['MUSC_SPLENIUS_CAPITIS_R',     'MUSC_SPLENIUS_CAPITIS_L'],
  semispinalis_capitis:              ['MUSC_SEMISPINALIS_CAPITIS_R', 'MUSC_SEMISPINALIS_CAPITIS_L'],
  sternocleidomastoid:               ['MUSC_STERNOCLEIDOMASTOID_R',  'MUSC_STERNOCLEIDOMASTOID_L'],
  supraspinatus:                     ['MUSC_SUPRASPINATUS_R',        'MUSC_SUPRASPINATUS_L'],
  subscapularis:                     ['MUSC_SUBSCAPULARIS_R',        'MUSC_SUBSCAPULARIS_L'],
  erector_spinae:                    ['MUSC_ERECTOR_SPINAE_R',       'MUSC_ERECTOR_SPINAE_L'],
  multifidus:                        ['MUSC_MULTIFIDUS_R',           'MUSC_MULTIFIDUS_L'],
  quadratus_lumborum:                ['MUSC_QUADRATUS_LUMBORUM_R',   'MUSC_QUADRATUS_LUMBORUM_L'],
  gluteus_minimus:                   ['MUSC_GLUTEUS_MINIMUS_R',      'MUSC_GLUTEUS_MINIMUS_L'],
  piriformis:                        ['MUSC_PIRIFORMIS_R',           'MUSC_PIRIFORMIS_L'],
  iliacus:                           ['MUSC_ILIACUS_R',              'MUSC_ILIACUS_L'],
  psoas_major:                       ['MUSC_PSOAS_MAJOR_R',          'MUSC_PSOAS_MAJOR_L'],
  vastus_intermedius:                ['MUSC_VASTUS_INTERMEDIUS_R',   'MUSC_VASTUS_INTERMEDIUS_L'],
  popliteus:                         ['MUSC_POPLITEUS_R',            'MUSC_POPLITEUS_L'],
  soleus:                            ['MUSC_SOLEUS_R',               'MUSC_SOLEUS_L'],
}

// Reverse index: MUSC_ → JSON entry (used by UI panels for display name)
const _MUSC_TO_JSON = new Map<string, PainPatternEntry>()
for (const entry of JSON_PAIN_DB) {
  const ids = JSON_TO_MUSC_IDS[entry.muscle_id] ?? []
  for (const id of ids) {
    if (!_MUSC_TO_JSON.has(id)) _MUSC_TO_JSON.set(id, entry)
  }
}

/**
 * Returns the Travell & Simons clinical description text for a GLB structure ID,
 * or undefined if no JSON entry exists for that muscle.
 */
export function getJsonEntry(muscId: string): PainPatternEntry | undefined {
  return _MUSC_TO_JSON.get(muscId)
}

/**
 * Returns the user-friendly common name for a GLB structure ID.
 * Falls back to the raw ID if no JSON entry exists.
 */
export function getMuscleCommonName(muscId: string): string {
  return _MUSC_TO_JSON.get(muscId)?.common_name ?? muscId
}
