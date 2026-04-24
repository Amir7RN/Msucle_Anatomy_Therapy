/**
 * diagnostic.ts
 *
 * Area-to-Muscle reverse mapping.
 *
 * The user clicks a point on the body.  We resolve that 3D point to one or
 * more named body zones (the ellipsoids defined in BODY_ZONES), then search
 * the diagnostic JSON for every muscle that lists any of those zones in its
 * primary or referred pain set.  The result is a normalised probability
 * distribution of which muscles could be generating pain there.
 *
 * ── Identity integrity (Task 3) ──────────────────────────────────────────────
 *
 *  • DiagnosticMuscle.muscle_id keys from painDiagnostic.json are NEVER renamed.
 *  • They are bridged to the existing GLB mesh IDs (MUSC_*) through an explicit
 *    map below.  The diagnostic JSON remains the single source of truth for
 *    clinical labels; the mesh IDs remain the source of truth for 3D selection.
 *
 * ── Asset loading ────────────────────────────────────────────────────────────
 *
 *  loadDiagnosticMuscles() fetches from `${import.meta.env.BASE_URL}data/
 *  painDiagnostic.json` so GitHub Pages builds serve the file from the
 *  correct sub-path.  Never hard-code a leading slash.
 */

import * as THREE from 'three'
import { BODY_ZONES } from '../data/painPatterns'

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiagnosticMuscle {
  muscle_id:           string
  common_name:         string
  primary_pain_zone:   string[]
  referred_pain_zones: string[]
}

export interface MuscleContribution {
  /** The original muscle_id key from painDiagnostic.json — never renamed. */
  muscle_id:   string
  common_name: string
  /** Normalised probability in the range [0, 1]. */
  probability: number
  /** Raw weight before normalisation (debug / tie-breaking). */
  rawWeight:   number
  /** Which bucket produced the highest weight for this muscle. */
  matchType:   'primary' | 'referred'
  /** The zone keys from BODY_ZONES that caused this muscle to match. */
  matchedZones: string[]
  /** Mesh IDs (MUSC_*) to select / highlight on the model. */
  meshIds:     string[]
  /** Optional anatomical parent group label used for hierarchical UI. */
  group?:      string
}

export interface DiagnosticResult {
  clickedZones:  string[]
  clickPoint:    [number, number, number]
  contributions: MuscleContribution[]
}

export interface GroupedContribution {
  id: string
  label: string
  probability: number
  muscles: MuscleContribution[]
}

// ─────────────────────────────────────────────────────────────────────────────
//  Weights
// ─────────────────────────────────────────────────────────────────────────────

export const PRIMARY_WEIGHT  = 0.75
export const REFERRED_WEIGHT = 0.25

export const MUSCLE_GROUP_MAP: Record<string, string> = {
  biceps_femoris:   'Hamstrings',
  semitendinosus:   'Hamstrings',
  semimembranosus:  'Hamstrings',
  supraspinatus:    'Rotator Cuff',
  infraspinatus:    'Rotator Cuff',
  teres_minor:      'Rotator Cuff',
  subscapularis:    'Rotator Cuff',
  rectus_femoris:   'Quadriceps',
  vastus_lateralis: 'Quadriceps',
  vastus_medialis:  'Quadriceps',
  vastus_intermedius: 'Quadriceps',
}

// ─────────────────────────────────────────────────────────────────────────────
//  Anatomical text → BODY_ZONES keys
//
//  The diagnostic JSON uses clinical prose ("front of shoulder", "ulnar side
//  of hand").  BODY_ZONES uses structured keys (shoulder_r, hand_fingers_r).
//  This map expands every phrase the JSON is known to use into the set of
//  zone keys it can match.  Bilateral phrases expand to both sides so that
//  whichever side the user actually clicks will intersect correctly.
//
//  Maintenance rule: if you introduce a new clinical phrase in
//  painDiagnostic.json, add its mapping here (or in the fuzzy fallback).
// ─────────────────────────────────────────────────────────────────────────────

export const ANATOMICAL_ZONE_MAP: Record<string, string[]> = {
  // Neck / head
  'upper neck':                      ['neck_r', 'neck_l', 'neck_post'],
  'posterolateral neck':             ['neck_r', 'neck_l', 'neck_post'],
  'side and back of neck':           ['neck_r', 'neck_l', 'neck_post'],
  'front and side of neck':          ['neck_r', 'neck_l', 'throat'],
  'back of neck':                    ['neck_post'],
  'deep posterior neck':             ['neck_post'],
  'lower neck':                      ['neck_post', 'upper_back'],
  'mastoid area':                    ['head_ear_r', 'head_ear_l'],
  'temple':                          ['head_temple_r', 'head_temple_l'],
  'behind the eye':                  ['head_eye_r', 'head_eye_l'],
  'forehead':                        ['head_forehead'],
  'ear and behind ear':              ['head_ear_r', 'head_ear_l'],
  'jaw and cheek':                   ['head_jaw_r', 'head_jaw_l', 'head_cheek_r', 'head_cheek_l'],
  'top of head':                     ['head_vertex'],
  'back of head':                    ['head_occiput'],
  'posterior head':                  ['head_occiput'],

  // Upper back / scapula / interscapular
  'shoulder region':                 ['shoulder_r', 'shoulder_l', 'shoulder_post_r', 'shoulder_post_l'],
  'mid-back between shoulder blades':['upper_back'],
  'upper back between the shoulder blades': ['upper_back'],
  'upper back at the base of neck':  ['upper_back', 'neck_post'],
  'inter-scapular region':           ['upper_back'],
  'interscapular region':            ['upper_back'],
  'spine of scapula':                ['scapula_r', 'scapula_l'],
  'medial border of scapula':        ['upper_back', 'scapula_r', 'scapula_l'],
  'medial scapular border':          ['upper_back', 'scapula_r', 'scapula_l'],
  'superior medial scapula':         ['upper_back', 'scapula_r', 'scapula_l'],
  'scapular area':                   ['scapula_r', 'scapula_l', 'upper_back'],
  'acromion area':                   ['shoulder_r', 'shoulder_l'],
  'lower scapular region':           ['scapula_r', 'scapula_l', 'mid_back'],
  'mid-thoracic back':               ['mid_back'],
  'upper thoracic spine':            ['upper_back'],
  'inferior angle of scapula':       ['scapula_r', 'scapula_l', 'mid_back'],
  'back of shoulder blade (infraspinous fossa)': ['scapula_r', 'scapula_l'],
  'anterior surface of scapula (subscapular fossa)': ['scapula_r', 'scapula_l'],
  'top of shoulder blade (supraspinous fossa)': ['scapula_r', 'scapula_l', 'shoulder_r', 'shoulder_l'],

  // Mid / lower back / spine
  'mid-back':                        ['mid_back'],
  'lower thoracic spine':            ['mid_back'],
  'low back':                        ['lower_back'],
  'lumbar region':                   ['lower_back'],
  'lumbar spine':                    ['lower_back'],
  'lumbar spine region':             ['lower_back'],
  'deep low back':                   ['lower_back'],
  'lateral lumbar region':           ['lower_back', 'flank_r', 'flank_l'],
  'posterior iliac crest':           ['lower_back'],
  'iliac crest':                     ['lower_back', 'flank_r', 'flank_l'],
  'spine from neck to lumbar region':['upper_back', 'mid_back', 'lower_back'],
  'deep lumbar and cervical spine':  ['lower_back', 'neck_post'],
  'paraspinal areas':                ['upper_back', 'mid_back', 'lower_back'],
  'sacrum':                          ['sacrum'],
  'sacral region':                   ['sacrum'],
  'coccyx':                          ['sacrum'],

  // Chest / abdomen
  'anterior chest':                  ['chest_r', 'chest_l', 'chest_upper'],
  'front of chest across sternum':   ['sternum', 'chest_upper'],
  'side of chest':                   ['lat_chest_r', 'lat_chest_l'],
  'lateral rib cage under the arm':  ['lat_chest_r', 'lat_chest_l'],
  'anterior abdominal wall':         ['abdomen_upper', 'abdomen_lower'],
  'lateral abdomen':                 ['flank_r', 'flank_l'],
  'lower abdomen':                   ['abdomen_lower'],
  'around umbilicus':                ['abdomen_upper', 'abdomen_lower'],

  // Shoulder
  'front of shoulder':               ['shoulder_r', 'shoulder_l', 'chest_upper'],
  'anterior shoulder':               ['shoulder_r', 'shoulder_l', 'chest_upper'],
  'front of shoulder joint':         ['shoulder_r', 'shoulder_l'],
  'lateral shoulder':                ['shoulder_r', 'shoulder_l'],
  'back of shoulder':                ['shoulder_post_r', 'shoulder_post_l'],
  'posterior shoulder':              ['shoulder_post_r', 'shoulder_post_l'],
  'posterior shoulder below infraspinatus': ['shoulder_post_r', 'shoulder_post_l'],
  'posterior axilla':                ['shoulder_post_r', 'shoulder_post_l', 'scapula_r', 'scapula_l'],
  'deltoid insertion area':          ['arm_ant_r', 'arm_ant_l', 'shoulder_r', 'shoulder_l'],

  // Arm (upper)
  'front of upper arm':              ['arm_ant_r', 'arm_ant_l'],
  'front of upper arm to elbow':     ['arm_ant_r', 'arm_ant_l', 'elbow_r', 'elbow_l'],
  'back of upper arm':               ['arm_post_r', 'arm_post_l'],
  'posterior upper arm':             ['arm_post_r', 'arm_post_l'],
  'triceps region':                  ['arm_post_r', 'arm_post_l'],
  'lateral upper arm':               ['arm_ant_r', 'arm_ant_l', 'shoulder_r', 'shoulder_l'],
  'medial arm':                      ['arm_med_r', 'arm_med_l'],
  'medial arm and forearm':          ['arm_med_r', 'arm_med_l', 'forearm_med_r', 'forearm_med_l'],
  'anterior arm':                    ['arm_ant_r', 'arm_ant_l'],
  'posterior arm':                   ['arm_post_r', 'arm_post_l'],
  'lateral arm':                     ['arm_ant_r', 'arm_ant_l'],
  'lateral arm to elbow':            ['arm_ant_r', 'arm_ant_l', 'elbow_r', 'elbow_l'],

  // Elbow / forearm
  'front of elbow':                  ['elbow_r', 'elbow_l'],
  'posterior elbow':                 ['elbow_r', 'elbow_l'],
  'lateral elbow':                   ['elbow_r', 'elbow_l', 'forearm_lat_r', 'forearm_lat_l'],
  'lateral forearm':                 ['forearm_lat_r', 'forearm_lat_l'],
  'lateral forearm near elbow':      ['forearm_lat_r', 'forearm_lat_l', 'elbow_r', 'elbow_l'],
  'radial forearm':                  ['forearm_lat_r', 'forearm_lat_l'],
  'posterior forearm':               ['forearm_lat_r', 'forearm_lat_l', 'forearm_med_r', 'forearm_med_l'],
  'anterior forearm (medial)':       ['forearm_med_r', 'forearm_med_l'],
  'central anterior forearm':        ['forearm_med_r', 'forearm_med_l'],

  // Hand / wrist
  'ulnar side of hand':              ['hand_fingers_r', 'hand_fingers_l', 'hand_r', 'hand_l'],
  'radial hand and fingers':         ['hand_thumb_r', 'hand_thumb_l', 'hand_fingers_r', 'hand_fingers_l'],
  'dorsum of hand and fingers':      ['hand_fingers_r', 'hand_fingers_l', 'hand_r', 'hand_l'],
  'dorsal hand near thumb':          ['hand_thumb_r', 'hand_thumb_l'],
  'base of thumb':                   ['hand_thumb_r', 'hand_thumb_l'],
  'radial wrist':                    ['hand_thumb_r', 'hand_thumb_l', 'hand_r', 'hand_l'],
  'palmar wrist':                    ['hand_r', 'hand_l'],
  'wrist':                           ['hand_r', 'hand_l'],
  'radial side of palm':             ['hand_r', 'hand_l', 'hand_thumb_r', 'hand_thumb_l'],
  'palm of hand':                    ['hand_r', 'hand_l'],

  // Buttock / hip / groin
  'buttock region':                  ['buttock_r', 'buttock_l'],
  'buttock':                         ['buttock_r', 'buttock_l'],
  'buttocks':                        ['buttock_r', 'buttock_l'],
  'posterior buttock':               ['buttock_r', 'buttock_l'],
  'deep buttock near sacrum':        ['buttock_r', 'buttock_l', 'sacrum'],
  'deep lateral buttock':            ['buttock_r', 'buttock_l', 'lat_hip_r', 'lat_hip_l'],
  'lateral hip':                     ['lat_hip_r', 'lat_hip_l'],
  'lateral hip (beneath gluteus maximus)': ['lat_hip_r', 'lat_hip_l'],
  'hip':                             ['lat_hip_r', 'lat_hip_l'],
  'front of hip':                    ['groin_r', 'groin_l', 'thigh_ant_r', 'thigh_ant_l'],
  'groin':                           ['groin_r', 'groin_l'],
  'inguinal area':                   ['groin_r', 'groin_l'],
  'iliac fossa (pelvis)':            ['abdomen_lower', 'groin_r', 'groin_l'],
  'deep pelvis':                     ['abdomen_lower', 'groin_r', 'groin_l'],

  // Thigh
  'front of thigh':                  ['thigh_ant_r', 'thigh_ant_l'],
  'anterior thigh':                  ['thigh_ant_r', 'thigh_ant_l'],
  'deep anterior thigh':             ['thigh_ant_r', 'thigh_ant_l'],
  'lateral thigh':                   ['thigh_lat_r', 'thigh_lat_l'],
  'iliotibial band area':            ['thigh_lat_r', 'thigh_lat_l'],
  'medial thigh':                    ['thigh_med_r', 'thigh_med_l'],
  'medial thigh and groin':          ['thigh_med_r', 'thigh_med_l', 'groin_r', 'groin_l'],
  'medial distal thigh':             ['thigh_med_r', 'thigh_med_l', 'knee_med_r', 'knee_med_l'],
  'posterior thigh':                 ['thigh_post_r', 'thigh_post_l'],
  'posterior lateral thigh':         ['thigh_post_r', 'thigh_post_l', 'thigh_lat_r', 'thigh_lat_l'],
  'posterior medial thigh':          ['thigh_post_r', 'thigh_post_l', 'thigh_med_r', 'thigh_med_l'],
  'deep posterior medial thigh':     ['thigh_post_r', 'thigh_post_l', 'thigh_med_r', 'thigh_med_l'],

  // Knee
  'front of knee':                   ['knee_r', 'knee_l'],
  'anterior knee':                   ['knee_r', 'knee_l'],
  'lateral knee':                    ['knee_lat_r', 'knee_lat_l'],
  'medial knee':                     ['knee_med_r', 'knee_med_l'],
  'posterior knee':                  ['knee_post_r', 'knee_post_l'],
  'posteromedial knee':              ['knee_post_r', 'knee_post_l', 'knee_med_r', 'knee_med_l'],
  'back of the knee (popliteal fossa)': ['knee_post_r', 'knee_post_l'],

  // Lower leg
  'anterior shin':                   ['shin_r', 'shin_l'],
  'calf (posterior lower leg)':      ['calf_r', 'calf_l'],
  'calf':                            ['calf_r', 'calf_l'],
  'mid-calf':                        ['calf_r', 'calf_l'],
  'deep posterior calf':             ['calf_r', 'calf_l'],
  'medial calf':                     ['calf_r', 'calf_l'],
  'lateral calf':                    ['calf_r', 'calf_l'],
  'side of calf':                    ['calf_r', 'calf_l'],
  'posteromedial calf':              ['calf_r', 'calf_l'],
  'posterior leg':                   ['calf_r', 'calf_l'],
  'posterior leg resembling sciatica':['calf_r', 'calf_l', 'thigh_post_r', 'thigh_post_l'],
  'lateral lower leg':               ['calf_r', 'calf_l', 'shin_r', 'shin_l'],
  'lateral leg down to ankle':       ['calf_r', 'calf_l', 'shin_r', 'shin_l', 'ankle_r', 'ankle_l'],
  'occasionally lateral leg':        ['calf_r', 'calf_l', 'shin_r', 'shin_l'],
  'anteromedial leg':                ['shin_r', 'shin_l'],

  // Ankle / foot
  'medial ankle':                    ['ankle_r', 'ankle_l'],
  'lateral ankle':                   ['ankle_r', 'ankle_l'],
  'heel':                            ['arch_r', 'arch_l', 'foot_r', 'foot_l'],
  'heel or sole of foot':            ['arch_r', 'arch_l', 'foot_r', 'foot_l'],
  'plantar aspect of foot':          ['arch_r', 'arch_l'],
  'dorsum of foot':                  ['foot_r', 'foot_l'],
  'big toe':                         ['foot_r', 'foot_l'],
}

// ─────────────────────────────────────────────────────────────────────────────
//  muscle_id (diagnostic JSON) → mesh IDs (MUSC_*)
//
//  JSON keys are preserved verbatim (Task 3 — ID Integrity).  This map adds
//  the bridge layer without altering them.  Bilateral muscles map to both
//  sides; midline muscles (rectus_abdominis, erector_spinae, multifidus)
//  map to a single mesh ID.
//
//  If the mesh ID does not exist in the scene it is silently ignored at
//  selection time, so adding extra candidates is safe.
// ─────────────────────────────────────────────────────────────────────────────

export const DIAGNOSTIC_TO_MESH_IDS: Record<string, string[]> = {
  trapezius_upper:                ['MUSC_TRAPEZIUS_UPPER_R', 'MUSC_TRAPEZIUS_UPPER_L'],
  trapezius_middle:               ['MUSC_TRAPEZIUS_MIDDLE_R', 'MUSC_TRAPEZIUS_MIDDLE_L'],
  trapezius_lower:                ['MUSC_TRAPEZIUS_LOWER_R', 'MUSC_TRAPEZIUS_LOWER_L'],
  latissimus_dorsi:               ['MUSC_LATISSIMUS_DORSI_R', 'MUSC_LATISSIMUS_DORSI_L'],
  pectoralis_major:               ['MUSC_PECTORALIS_MAJOR_R', 'MUSC_PECTORALIS_MAJOR_L'],
  serratus_anterior:              ['MUSC_SERRATUS_ANTERIOR_R', 'MUSC_SERRATUS_ANTERIOR_L'],
  rectus_abdominis:               ['MUSC_RECTUS_ABDOMINIS'],
  external_oblique:               ['MUSC_EXTERNAL_OBLIQUE_R', 'MUSC_EXTERNAL_OBLIQUE_L'],
  deltoid_anterior:               ['MUSC_DELTOID_ANTERIOR_R', 'MUSC_DELTOID_ANTERIOR_L'],
  deltoid_lateral:                ['MUSC_DELTOID_LATERAL_R', 'MUSC_DELTOID_LATERAL_L'],
  deltoid_posterior:              ['MUSC_DELTOID_POSTERIOR_R', 'MUSC_DELTOID_POSTERIOR_L'],
  biceps_brachii:                 ['MUSC_BICEPS_BRACHII_R', 'MUSC_BICEPS_BRACHII_L'],
  triceps_brachii:                ['MUSC_TRICEPS_BRACHII_R', 'MUSC_TRICEPS_BRACHII_L'],
  brachioradialis:                ['MUSC_BRACHIORADIALIS_R', 'MUSC_BRACHIORADIALIS_L'],
  gluteus_maximus:                ['MUSC_GLUTEUS_MAXIMUS_R', 'MUSC_GLUTEUS_MAXIMUS_L'],
  gluteus_medius:                 ['MUSC_GLUTEUS_MEDIUS_R', 'MUSC_GLUTEUS_MEDIUS_L'],
  gluteus_minimus:                ['MUSC_GLUTEUS_MINIMUS_R', 'MUSC_GLUTEUS_MINIMUS_L'],
  tensor_fasciae_latae:           ['MUSC_TENSOR_FASCIAE_LATAE_R', 'MUSC_TENSOR_FASCIAE_LATAE_L'],
  rectus_femoris:                 ['MUSC_RECTUS_FEMORIS_R', 'MUSC_RECTUS_FEMORIS_L'],
  vastus_lateralis:               ['MUSC_VASTUS_LATERALIS_R', 'MUSC_VASTUS_LATERALIS_L'],
  vastus_medialis:                ['MUSC_VASTUS_MEDIALIS_R', 'MUSC_VASTUS_MEDIALIS_L'],
  vastus_intermedius:             ['MUSC_VASTUS_INTERMEDIUS_R', 'MUSC_VASTUS_INTERMEDIUS_L'],
  tibialis_anterior:              ['MUSC_TIBIALIS_ANTERIOR_R', 'MUSC_TIBIALIS_ANTERIOR_L'],
  gastrocnemius:                  ['MUSC_GASTROCNEMIUS_R', 'MUSC_GASTROCNEMIUS_L'],
  soleus:                         ['MUSC_SOLEUS_R', 'MUSC_SOLEUS_L'],
  popliteus:                      ['MUSC_POPLITEUS_R', 'MUSC_POPLITEUS_L'],
  infraspinatus:                  ['MUSC_INFRASPINATUS_R', 'MUSC_INFRASPINATUS_L'],
  supraspinatus:                  ['MUSC_SUPRASPINATUS_R', 'MUSC_SUPRASPINATUS_L'],
  subscapularis:                  ['MUSC_SUBSCAPULARIS_R', 'MUSC_SUBSCAPULARIS_L'],
  teres_major:                    ['MUSC_TERES_MAJOR_R', 'MUSC_TERES_MAJOR_L'],
  teres_minor:                    ['MUSC_TERES_MINOR_R', 'MUSC_TERES_MINOR_L'],
  rhomboid_major:                 ['MUSC_RHOMBOID_MAJOR_R', 'MUSC_RHOMBOID_MAJOR_L'],
  rhomboid_minor:                 ['MUSC_RHOMBOID_MINOR_R', 'MUSC_RHOMBOID_MINOR_L'],
  levator_scapulae:               ['MUSC_LEVATOR_SCAPULAE_R', 'MUSC_LEVATOR_SCAPULAE_L'],
  extensor_carpi_radialis_longus: ['MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_R', 'MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_L'],
  extensor_digitorum:             ['MUSC_EXTENSOR_DIGITORUM_R', 'MUSC_EXTENSOR_DIGITORUM_L'],
  flexor_carpi_radialis:          ['MUSC_FLEXOR_CARPI_RADIALIS_R', 'MUSC_FLEXOR_CARPI_RADIALIS_L'],
  palmaris_longus:                ['MUSC_PALMARIS_LONGUS_R', 'MUSC_PALMARIS_LONGUS_L'],
  biceps_femoris:                 ['MUSC_BICEPS_FEMORIS_R', 'MUSC_BICEPS_FEMORIS_L'],
  semitendinosus:                 ['MUSC_SEMITENDINOSUS_R', 'MUSC_SEMITENDINOSUS_L'],
  semimembranosus:                ['MUSC_SEMIMEMBRANOSUS_R', 'MUSC_SEMIMEMBRANOSUS_L'],
  gracilis:                       ['MUSC_GRACILIS_R', 'MUSC_GRACILIS_L'],
  adductor_longus:                ['MUSC_ADDUCTOR_LONGUS_R', 'MUSC_ADDUCTOR_LONGUS_L'],
  splenius_capitis:               ['MUSC_SPLENIUS_CAPITIS_R', 'MUSC_SPLENIUS_CAPITIS_L'],
  semispinalis_capitis:           ['MUSC_SEMISPINALIS_CAPITIS_R', 'MUSC_SEMISPINALIS_CAPITIS_L'],
  sternocleidomastoid:            ['MUSC_STERNOCLEIDOMASTOID_R', 'MUSC_STERNOCLEIDOMASTOID_L'],
  erector_spinae:                 ['MUSC_ERECTOR_SPINAE_R', 'MUSC_ERECTOR_SPINAE_L'],
  multifidus:                     ['MUSC_MULTIFIDUS'],
  quadratus_lumborum:             ['MUSC_QUADRATUS_LUMBORUM_R', 'MUSC_QUADRATUS_LUMBORUM_L'],
  piriformis:                     ['MUSC_PIRIFORMIS_R', 'MUSC_PIRIFORMIS_L'],
  iliacus:                        ['MUSC_ILIACUS_R', 'MUSC_ILIACUS_L'],
  psoas_major:                    ['MUSC_PSOAS_MAJOR_R', 'MUSC_PSOAS_MAJOR_L'],
}

// ─────────────────────────────────────────────────────────────────────────────
//  JSON loader — preserves BASE_URL for GitHub Pages
// ─────────────────────────────────────────────────────────────────────────────

let _cache: DiagnosticMuscle[] | null = null

export async function loadDiagnosticMuscles(): Promise<DiagnosticMuscle[]> {
  if (_cache) return _cache
  const url = `${import.meta.env.BASE_URL}data/painDiagnostic.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`painDiagnostic.json load failed: ${res.status}`)
  _cache = (await res.json()) as DiagnosticMuscle[]
  return _cache
}

// ─────────────────────────────────────────────────────────────────────────────
//  Spatial zone resolver — world point → BODY_ZONES keys
//
//  A zone is a unit sphere scaled to an ellipsoid at pos with half-extents
//  scale.  A world point p is inside the ellipsoid iff:
//
//      Σ ((p_i − pos_i) / scale_i)²  ≤  1
//
//  We return every zone the point is inside.  If none contain the point
//  (common on arms/legs which are shelled by several overlapping zones),
//  we fall back to the single nearest zone, measured with the same metric.
// ─────────────────────────────────────────────────────────────────────────────

export function findZonesAtPoint(point: THREE.Vector3): string[] {
  const inside: string[] = []
  let   bestKey = ''
  let   bestDist = Infinity

  for (const [key, def] of Object.entries(BODY_ZONES)) {
    const dx = (point.x - def.pos[0]) / def.scale[0]
    const dy = (point.y - def.pos[1]) / def.scale[1]
    const dz = (point.z - def.pos[2]) / def.scale[2]
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 <= 1) inside.push(key)
    if (d2 < bestDist) { bestDist = d2; bestKey = key }
  }

  return inside.length > 0 ? inside : (bestKey ? [bestKey] : [])
}

// ─────────────────────────────────────────────────────────────────────────────
//  Anatomical phrase → zone keys  (with defensive fallback)
// ─────────────────────────────────────────────────────────────────────────────

function expandAnatomicalPhrase(phrase: string): string[] {
  const key = phrase.trim().toLowerCase()
  const mapped = ANATOMICAL_ZONE_MAP[key]
  if (mapped) return mapped
  // Fallback: crude keyword match — catches phrasing drift without a crash.
  const hits = new Set<string>()
  for (const [k, zones] of Object.entries(ANATOMICAL_ZONE_MAP)) {
    if (k.split(/\s+/).some((w) => w.length > 3 && key.includes(w))) {
      zones.forEach((z) => hits.add(z))
    }
  }
  return [...hits]
}

function zonesOverlap(clickedZones: string[], phrase: string): boolean {
  const expanded = expandAnatomicalPhrase(phrase)
  return expanded.some((z) => clickedZones.includes(z))
}

// ─────────────────────────────────────────────────────────────────────────────
//  calculateMuscleContribution  —  Task 1 core
//
//  For each muscle in the diagnostic catalogue:
//    • If ANY clicked zone matches a phrase in primary_pain_zone   → w = 0.75
//    • Else if ANY clicked zone matches referred_pain_zones         → w = 0.25
//    • Else                                                         → skip
//
//  The per-muscle weight is the maximum category hit (primary wins over
//  referred when both match — this avoids double-counting a muscle whose
//  primary zone happens to re-appear in its referred list).
//
//  Raw weights are then normalised so the total equals 1 (100%).
//  Ties are broken by matchType (primary > referred) then alphabetical
//  muscle_id for deterministic ordering.
// ─────────────────────────────────────────────────────────────────────────────

export function calculateMuscleContribution(
  clickedZones: string[],
  catalogue:    DiagnosticMuscle[],
): MuscleContribution[] {
  if (clickedZones.length === 0) return []

  const raw: Omit<MuscleContribution, 'probability'>[] = []

  for (const m of catalogue) {
    let   best:         number = 0
    let   bestType:     'primary' | 'referred' = 'referred'
    const matchedZones = new Set<string>()

    for (const phrase of m.primary_pain_zone) {
      const expanded = expandAnatomicalPhrase(phrase)
      const hit = expanded.filter((z) => clickedZones.includes(z))
      if (hit.length > 0) {
        best     = PRIMARY_WEIGHT
        bestType = 'primary'
        hit.forEach((z) => matchedZones.add(z))
      }
    }
    // Only consider referred if primary did not match — prevents the same
    // muscle from getting credit in both buckets.
    if (best === 0) {
      for (const phrase of m.referred_pain_zones) {
        const expanded = expandAnatomicalPhrase(phrase)
        const hit = expanded.filter((z) => clickedZones.includes(z))
        if (hit.length > 0) {
          best     = REFERRED_WEIGHT
          bestType = 'referred'
          hit.forEach((z) => matchedZones.add(z))
        }
      }
    }

    if (best > 0) {
      raw.push({
        muscle_id:   m.muscle_id,
        common_name: m.common_name,
        rawWeight:   best,
        matchType:   bestType,
        matchedZones: [...matchedZones],
        meshIds:     DIAGNOSTIC_TO_MESH_IDS[m.muscle_id] ?? [],
        group:       MUSCLE_GROUP_MAP[m.muscle_id],
      })
    }
  }

  const total = raw.reduce((s, r) => s + r.rawWeight, 0)
  if (total === 0) return []

  return raw
    .map((r) => ({ ...r, probability: r.rawWeight / total }))
    .sort((a, b) => {
      if (b.probability !== a.probability) return b.probability - a.probability
      if (a.matchType !== b.matchType)     return a.matchType === 'primary' ? -1 : 1
      return a.muscle_id.localeCompare(b.muscle_id)
    })
}

export function groupContributions(
  contributions: MuscleContribution[],
): GroupedContribution[] {
  const grouped = new Map<string, MuscleContribution[]>()
  const singles: GroupedContribution[] = []

  for (const c of contributions) {
    if (!c.group) {
      singles.push({
        id: c.muscle_id,
        label: c.common_name,
        probability: c.probability,
        muscles: [c],
      })
      continue
    }
    const list = grouped.get(c.group) ?? []
    list.push(c)
    grouped.set(c.group, list)
  }

  const hierarchy: GroupedContribution[] = []
  for (const [group, muscles] of grouped.entries()) {
    if (muscles.length === 1) {
      const [single] = muscles
      singles.push({
        id: single.muscle_id,
        label: single.common_name,
        probability: single.probability,
        muscles: [single],
      })
      continue
    }
    hierarchy.push({
      id: `group:${group.toLowerCase().replace(/\s+/g, '_')}`,
      label: group,
      probability: muscles.reduce((acc, m) => acc + m.probability, 0),
      muscles: [...muscles].sort((a, b) => b.probability - a.probability),
    })
  }

  return [...hierarchy, ...singles].sort((a, b) => b.probability - a.probability)
}

export function filterMeshIdsBySide(
  meshIds: string[],
  clickPoint: THREE.Vector3,
): string[] {
  if (meshIds.length <= 1) return meshIds
  if (clickPoint.x > 0) {
    const right = meshIds.filter((id) => id.endsWith('_R'))
    return right.length ? right : meshIds
  }
  if (clickPoint.x < 0) {
    const left = meshIds.filter((id) => id.endsWith('_L'))
    return left.length ? left : meshIds
  }
  return meshIds
}

// ─────────────────────────────────────────────────────────────────────────────
//  Side picker — choose the mesh closest to the click point
//
//  When the user clicks near the right shoulder, we want to preselect
//  MUSC_PECTORALIS_MAJOR_R, not the left one. For this project workflow,
//  clicks with x > 0 are treated as right-side intent; x < 0 as left-side.
// ─────────────────────────────────────────────────────────────────────────────

export function pickSideFromClick(
  meshIds: string[],
  clickPoint: THREE.Vector3,
): string | null {
  if (meshIds.length === 0) return null
  if (meshIds.length === 1) return meshIds[0]
  const rightIds = meshIds.filter((id) => id.endsWith('_R'))
  const leftIds  = meshIds.filter((id) => id.endsWith('_L'))
  if (rightIds.length && leftIds.length) {
    return clickPoint.x > 0 ? rightIds[0] : leftIds[0]
  }
  return meshIds[0]
}

// ─────────────────────────────────────────────────────────────────────────────
//  Anatomical muscle groups for hierarchical UI display
// ─────────────────────────────────────────────────────────────────────────────

export interface MuscleGroupDef {
  label:   string
  /** muscle_id keys from the diagnostic JSON catalogue */
  members: string[]
}

/** Groups that should be collapsed under a parent row when 2+ members appear. */
export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  {
    label:   'Hamstrings',
    members: ['biceps_femoris', 'semitendinosus', 'semimembranosus'],
  },
  {
    label:   'Quadriceps',
    members: ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius'],
  },
  {
    label:   'Rotator Cuff',
    members: ['supraspinatus', 'infraspinatus', 'teres_minor', 'subscapularis'],
  },
  {
    // All three deltoid heads share similar rehab exercises (shoulder press, lateral raises,
    // band pull-aparts). Merging into one "Deltoid" group gives a cleaner clinical summary
    // while the individual breakdown remains accessible when expanded.
    label:   'Deltoid',
    members: ['deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Grouped display types
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupedMuscleContribution {
  type:             'group'
  label:            string
  totalProbability: number
  /** 'mixed' when the group has both primary and referred members */
  matchType:        'primary' | 'referred' | 'mixed'
  members:          MuscleContribution[]
  /** Union of all member meshIds (for hover/pulse) */
  meshIds:          string[]
}

export type DiagnosticDisplayItem = MuscleContribution | GroupedMuscleContribution

/** Type guard — narrows DiagnosticDisplayItem to GroupedMuscleContribution */
export function isGrouped(item: DiagnosticDisplayItem): item is GroupedMuscleContribution {
  return (item as GroupedMuscleContribution).type === 'group'
}

// ─────────────────────────────────────────────────────────────────────────────
//  groupContributionsForDisplay
//
//  Rules:
//  • Check every MUSCLE_GROUP.  If 2+ members appear in contributions, collapse
//    them into a GroupedMuscleContribution.
//  • If only 1 member from a group appears, leave it as a flat item.
//  • Remaining flat items keep their original probability order.
// ─────────────────────────────────────────────────────────────────────────────

export function groupContributionsForDisplay(
  contributions: MuscleContribution[],
): DiagnosticDisplayItem[] {
  const used = new Set<string>()
  const result: DiagnosticDisplayItem[] = []

  for (const group of MUSCLE_GROUPS) {
    const members = contributions.filter((c) => group.members.includes(c.muscle_id))
    if (members.length < 2) continue  // leave solo members as flat items

    members.forEach((m) => used.add(m.muscle_id))

    const matchTypes = new Set(members.map((m) => m.matchType))
    const matchType: GroupedMuscleContribution['matchType'] =
      matchTypes.size > 1 ? 'mixed' : (matchTypes.values().next().value as 'primary' | 'referred')

    const totalProbability = Math.min(
      1,
      members.reduce((sum, m) => sum + m.probability, 0),
    )

    const meshIds = [...new Set(members.flatMap((m) => m.meshIds))]

    result.push({
      type:  'group',
      label: group.label,
      totalProbability,
      matchType,
      members,
      meshIds,
    })
  }

  // Append remaining flat items (not consumed by a group) in their original order
  for (const c of contributions) {
    if (!used.has(c.muscle_id)) {
      result.push(c)
    }
  }

  // Sort: groups first by totalProbability, flats by probability
  result.sort((a, b) => {
    const pa = isGrouped(a) ? a.totalProbability : a.probability
    const pb = isGrouped(b) ? b.totalProbability : b.probability
    return pb - pa
  })

  return result
}
