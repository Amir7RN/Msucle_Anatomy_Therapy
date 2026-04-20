/**
 * painPatterns.ts
 *
 * Pain referral data for all 52 muscles.
 * Source: Muscle Pain Referral Atlas (Travell & Simons / clinical reference).
 *
 * Coordinate space (verified against loaded GLB mesh centers):
 *   patient RIGHT = NEGATIVE x  (Biceps_R is at x ≈ -0.180)
 *   patient LEFT  = POSITIVE  x  (Biceps_L is at x ≈ +0.181)
 *   up  = +y  (feet at y = -0.925, head top at y ≈ +0.643)
 *   anterior (front) = +z  (Pec is at z ≈ 0.151, back muscles at z ≈ 0.03)
 */

export interface ZoneDef {
  pos:   [number, number, number]
  scale: [number, number, number]
}

export interface PainPattern {
  description: string
  zones: string[]
}

// ── Body zone geometry ────────────────────────────────────────────────────────
// Each zone is a unit sphere (r=1) scaled to a body-surface ellipsoid.
// Positions are calibrated to actual GLB mesh-center data.

export const BODY_ZONES: Record<string, ZoneDef> = {

  // ── HEAD  (y: 0.52 – 0.643, head spans ~0.16 wide) ────────────────────────
  head_vertex:     { pos: [ 0.000,  0.638,  0.005], scale: [0.060, 0.038, 0.060] },
  head_forehead:   { pos: [ 0.000,  0.620,  0.060], scale: [0.085, 0.038, 0.032] },
  // right = negative x
  head_temple_r:   { pos: [-0.068,  0.592,  0.025], scale: [0.040, 0.050, 0.038] },
  head_temple_l:   { pos: [ 0.068,  0.592,  0.025], scale: [0.040, 0.050, 0.038] },
  head_eye_r:      { pos: [-0.042,  0.608,  0.072], scale: [0.030, 0.024, 0.024] },
  head_eye_l:      { pos: [ 0.042,  0.608,  0.072], scale: [0.030, 0.024, 0.024] },
  // masseter centre: -0.047, 0.531, 0.124
  head_cheek_r:    { pos: [-0.058,  0.548,  0.082], scale: [0.042, 0.038, 0.032] },
  head_cheek_l:    { pos: [ 0.058,  0.548,  0.082], scale: [0.042, 0.038, 0.032] },
  head_jaw_r:      { pos: [-0.058,  0.520,  0.082], scale: [0.040, 0.036, 0.032] },
  head_jaw_l:      { pos: [ 0.058,  0.520,  0.082], scale: [0.040, 0.036, 0.032] },
  head_ear_r:      { pos: [-0.082,  0.548, -0.012], scale: [0.032, 0.040, 0.032] },
  head_ear_l:      { pos: [ 0.082,  0.548, -0.012], scale: [0.032, 0.040, 0.032] },
  head_occiput:    { pos: [ 0.000,  0.572, -0.070], scale: [0.080, 0.062, 0.035] },
  head_teeth_r:    { pos: [-0.028,  0.522,  0.098], scale: [0.028, 0.038, 0.022] },
  head_teeth_l:    { pos: [ 0.028,  0.522,  0.098], scale: [0.028, 0.038, 0.022] },

  // ── NECK  (SCM_R at -0.032, 0.466, 0.105) ────────────────────────────────
  neck_r:          { pos: [-0.038,  0.468,  0.042], scale: [0.035, 0.055, 0.035] },
  neck_l:          { pos: [ 0.038,  0.468,  0.042], scale: [0.035, 0.055, 0.035] },
  neck_post:       { pos: [ 0.000,  0.462, -0.042], scale: [0.065, 0.065, 0.032] },
  throat:          { pos: [ 0.000,  0.475,  0.065], scale: [0.038, 0.048, 0.030] },

  // ── TRUNK ANTERIOR  (Pec_R: -0.099, 0.284, 0.151; Rect_Ab: 0, 0.055, 0.178) ──
  sternum:         { pos: [ 0.000,  0.352,  0.108], scale: [0.046, 0.096, 0.022] },
  chest_upper:     { pos: [ 0.000,  0.400,  0.095], scale: [0.142, 0.052, 0.045] },
  chest_r:         { pos: [-0.100,  0.292,  0.128], scale: [0.072, 0.080, 0.045] },
  chest_l:         { pos: [ 0.100,  0.292,  0.128], scale: [0.072, 0.080, 0.045] },
  lat_chest_r:     { pos: [-0.148,  0.195,  0.058], scale: [0.055, 0.095, 0.045] },
  lat_chest_l:     { pos: [ 0.148,  0.195,  0.058], scale: [0.055, 0.095, 0.045] },
  abdomen_upper:   { pos: [ 0.000,  0.098,  0.148], scale: [0.105, 0.070, 0.045] },
  abdomen_lower:   { pos: [ 0.000,  0.018,  0.142], scale: [0.095, 0.070, 0.045] },
  flank_r:         { pos: [-0.090,  0.065,  0.090], scale: [0.055, 0.092, 0.045] },
  flank_l:         { pos: [ 0.090,  0.065,  0.090], scale: [0.055, 0.092, 0.045] },

  // ── TRUNK POSTERIOR  (ErectorSpinae: -0.051, 0.163, 0.034; LatDorsi: -0.089, 0.135, 0.032) ──
  upper_back:      { pos: [ 0.000,  0.358, -0.060], scale: [0.145, 0.095, 0.038] },
  mid_back:        { pos: [ 0.000,  0.165, -0.065], scale: [0.128, 0.095, 0.038] },
  lower_back:      { pos: [ 0.000,  0.022, -0.065], scale: [0.115, 0.082, 0.038] },
  // infraspinatus_r at -0.126, 0.334, 0.029
  scapula_r:       { pos: [-0.130,  0.338, -0.052], scale: [0.072, 0.080, 0.038] },
  scapula_l:       { pos: [ 0.130,  0.338, -0.052], scale: [0.072, 0.080, 0.038] },

  // ── SHOULDER  (Deltoid_R: -0.155, 0.329, 0.058) ─────────────────────────
  shoulder_r:      { pos: [-0.172,  0.352,  0.020], scale: [0.062, 0.072, 0.062] },
  shoulder_l:      { pos: [ 0.172,  0.352,  0.020], scale: [0.062, 0.072, 0.062] },
  shoulder_post_r: { pos: [-0.158,  0.330, -0.040], scale: [0.062, 0.062, 0.048] },
  shoulder_post_l: { pos: [ 0.158,  0.330, -0.040], scale: [0.062, 0.062, 0.048] },

  // ── PELVIS / GLUTES  (GlutMax_R: -0.072, -0.148, 0.037; GlutMed_R: -0.103, -0.082) ──
  sacrum:          { pos: [ 0.000, -0.162, -0.058], scale: [0.070, 0.070, 0.038] },
  buttock_r:       { pos: [-0.082, -0.172, -0.065], scale: [0.080, 0.080, 0.055] },
  buttock_l:       { pos: [ 0.082, -0.172, -0.065], scale: [0.080, 0.080, 0.055] },
  lat_hip_r:       { pos: [-0.135, -0.148,  0.028], scale: [0.062, 0.072, 0.055] },
  lat_hip_l:       { pos: [ 0.135, -0.148,  0.028], scale: [0.062, 0.072, 0.055] },
  groin_r:         { pos: [-0.065, -0.112,  0.075], scale: [0.048, 0.055, 0.038] },
  groin_l:         { pos: [ 0.065, -0.112,  0.075], scale: [0.048, 0.055, 0.038] },

  // ── UPPER ARM  (Biceps_R: -0.180, 0.225, 0.082; Triceps_R: -0.179, 0.221, 0.042) ──
  arm_ant_r:       { pos: [-0.192,  0.248,  0.075], scale: [0.045, 0.105, 0.040] },
  arm_ant_l:       { pos: [ 0.192,  0.248,  0.075], scale: [0.045, 0.105, 0.040] },
  arm_post_r:      { pos: [-0.185,  0.228,  0.030], scale: [0.045, 0.105, 0.040] },
  arm_post_l:      { pos: [ 0.185,  0.228,  0.030], scale: [0.045, 0.105, 0.040] },
  arm_med_r:       { pos: [-0.168,  0.235,  0.055], scale: [0.038, 0.095, 0.040] },
  arm_med_l:       { pos: [ 0.168,  0.235,  0.055], scale: [0.038, 0.095, 0.040] },
  // Brachioradialis_R: -0.245, 0.036, 0.086
  elbow_r:         { pos: [-0.238,  0.098,  0.068], scale: [0.040, 0.048, 0.040] },
  elbow_l:         { pos: [ 0.238,  0.098,  0.068], scale: [0.040, 0.048, 0.040] },

  // ── FOREARM / HAND  (Brachiorad_R: -0.245, 0.036, 0.086) ────────────────
  forearm_lat_r:   { pos: [-0.248,  0.032,  0.084], scale: [0.040, 0.080, 0.032] },
  forearm_lat_l:   { pos: [ 0.248,  0.032,  0.084], scale: [0.040, 0.080, 0.032] },
  forearm_med_r:   { pos: [-0.238,  0.028,  0.038], scale: [0.040, 0.080, 0.032] },
  forearm_med_l:   { pos: [ 0.238,  0.028,  0.038], scale: [0.040, 0.080, 0.032] },
  hand_thumb_r:    { pos: [-0.248, -0.112,  0.092], scale: [0.022, 0.040, 0.022] },
  hand_thumb_l:    { pos: [ 0.248, -0.112,  0.092], scale: [0.022, 0.040, 0.022] },
  hand_fingers_r:  { pos: [-0.235, -0.115,  0.048], scale: [0.032, 0.040, 0.022] },
  hand_fingers_l:  { pos: [ 0.235, -0.115,  0.048], scale: [0.032, 0.040, 0.022] },
  hand_r:          { pos: [-0.242, -0.122,  0.072], scale: [0.040, 0.048, 0.022] },
  hand_l:          { pos: [ 0.242, -0.122,  0.072], scale: [0.040, 0.048, 0.022] },

  // ── THIGH  (RectusFem_R: -0.105, -0.343, 0.123; VastusLat_R: -0.119, -0.373, 0.102) ──
  thigh_ant_r:     { pos: [-0.108, -0.348,  0.118], scale: [0.062, 0.128, 0.048] },
  thigh_ant_l:     { pos: [ 0.108, -0.348,  0.118], scale: [0.062, 0.128, 0.048] },
  // BicepsFemoris_R: -0.088, -0.377, 0.054
  thigh_post_r:    { pos: [-0.090, -0.378,  0.042], scale: [0.062, 0.120, 0.048] },
  thigh_post_l:    { pos: [ 0.090, -0.378,  0.042], scale: [0.062, 0.120, 0.048] },
  thigh_lat_r:     { pos: [-0.122, -0.375,  0.095], scale: [0.055, 0.128, 0.045] },
  thigh_lat_l:     { pos: [ 0.122, -0.375,  0.095], scale: [0.055, 0.128, 0.045] },
  // VastusMedialis_R: -0.068, -0.396, 0.112
  thigh_med_r:     { pos: [-0.072, -0.398,  0.108], scale: [0.048, 0.112, 0.040] },
  thigh_med_l:     { pos: [ 0.072, -0.398,  0.108], scale: [0.048, 0.112, 0.040] },

  // ── KNEE ─────────────────────────────────────────────────────────────────
  knee_r:          { pos: [-0.092, -0.558,  0.082], scale: [0.052, 0.055, 0.045] },
  knee_l:          { pos: [ 0.092, -0.558,  0.082], scale: [0.052, 0.055, 0.045] },
  knee_post_r:     { pos: [-0.088, -0.572,  0.022], scale: [0.055, 0.055, 0.040] },
  knee_post_l:     { pos: [ 0.088, -0.572,  0.022], scale: [0.055, 0.055, 0.040] },
  knee_med_r:      { pos: [-0.058, -0.565,  0.075], scale: [0.040, 0.055, 0.040] },
  knee_med_l:      { pos: [ 0.058, -0.565,  0.075], scale: [0.040, 0.055, 0.040] },
  knee_lat_r:      { pos: [-0.122, -0.565,  0.072], scale: [0.040, 0.055, 0.040] },
  knee_lat_l:      { pos: [ 0.122, -0.565,  0.072], scale: [0.040, 0.055, 0.040] },

  // ── LOWER LEG  (TibialisAnt_R: -0.085, -0.746, 0.100; Gastro_R: -0.083, -0.621, 0.037) ──
  shin_r:          { pos: [-0.086, -0.720,  0.092], scale: [0.038, 0.102, 0.038] },
  shin_l:          { pos: [ 0.086, -0.720,  0.092], scale: [0.038, 0.102, 0.038] },
  calf_r:          { pos: [-0.084, -0.675,  0.032], scale: [0.045, 0.102, 0.038] },
  calf_l:          { pos: [ 0.084, -0.675,  0.032], scale: [0.045, 0.102, 0.038] },

  // ── ANKLE / FOOT ─────────────────────────────────────────────────────────
  ankle_r:         { pos: [-0.082, -0.848,  0.040], scale: [0.040, 0.032, 0.032] },
  ankle_l:         { pos: [ 0.082, -0.848,  0.040], scale: [0.040, 0.032, 0.032] },
  foot_r:          { pos: [-0.076, -0.906,  0.040], scale: [0.040, 0.022, 0.065] },
  foot_l:          { pos: [ 0.076, -0.906,  0.040], scale: [0.040, 0.022, 0.065] },
  arch_r:          { pos: [-0.072, -0.915,  0.022], scale: [0.032, 0.020, 0.050] },
  arch_l:          { pos: [ 0.072, -0.915,  0.022], scale: [0.032, 0.020, 0.050] },
}

// ── Pain patterns for all 52 muscles ──────────────────────────────────────────

export const PAIN_PATTERNS: Record<string, PainPattern> = {

  // ── HEAD / NECK ─────────────────────────────────────────────────────────────

  MUSC_STERNOCLEIDOMASTOID_R: {
    description: 'Primary pain in the front and side of the right neck. Referred pain to the forehead, temple, ear and behind the ear, jaw and cheek, and top of the head. The sternal head refers to the vertex, cheek and over the eye; the clavicular head refers to the frontal region and ear. Autonomic symptoms (lacrimation, sinus congestion) may occur.',
    zones: ['neck_r', 'throat', 'head_forehead', 'head_temple_r', 'head_ear_r', 'head_jaw_r', 'head_cheek_r', 'head_vertex'],
  },

  MUSC_STERNOCLEIDOMASTOID_L: {
    description: 'Left SCM mirrors the right. Primary pain in the front and side of the left neck. Referred pain to the forehead, temple, ear and behind the ear, jaw and cheek, and top of the head.',
    zones: ['neck_l', 'throat', 'head_forehead', 'head_temple_l', 'head_ear_l', 'head_jaw_l', 'head_cheek_l', 'head_vertex'],
  },

  MUSC_MASSETER_R: {
    description: 'Trigger points in the masseter refer deep aching or toothache-like pain to the upper and lower molar teeth, mandible and maxilla, cheek, temple and sometimes the ear. Pain can radiate to the TMJ, mimicking temporomandibular joint dysfunction.',
    zones: ['head_jaw_r', 'head_teeth_r', 'head_cheek_r', 'head_temple_r', 'head_ear_r'],
  },

  MUSC_MASSETER_L: {
    description: 'Left masseter shares the same referral pattern as the right. Pain mimics dental pathology on the left side and may radiate to the ear or temple.',
    zones: ['head_jaw_l', 'head_teeth_l', 'head_cheek_l', 'head_temple_l', 'head_ear_l'],
  },

  MUSC_TEMPORALIS_R: {
    description: 'Temporalis has four pain zones: (A) temple and supraorbital ridge extending to upper incisor teeth; (B) mid-temporal region to intermediate maxillary teeth; (C) molar teeth and TMJ; (D) temporoparietal scalp. Often associated with tension-type headaches.',
    zones: ['head_temple_r', 'head_forehead', 'head_eye_r', 'head_teeth_r', 'head_jaw_r', 'head_vertex'],
  },

  MUSC_TEMPORALIS_L: {
    description: 'Left temporalis is anatomically and functionally identical to the right. Pain referral follows the same four zones on the left side.',
    zones: ['head_temple_l', 'head_forehead', 'head_eye_l', 'head_teeth_l', 'head_jaw_l', 'head_vertex'],
  },

  // ── TRUNK ────────────────────────────────────────────────────────────────────

  MUSC_PECTORALIS_MAJOR_R: {
    description: 'Pectoralis major trigger points can mimic angina. Primary pain in the anterior chest and front of the shoulder. Referred pain spreads across the sternum, down the front of the chest, along the medial arm and forearm to the ulnar side of the hand. Breast tenderness may also occur.',
    zones: ['chest_r', 'chest_upper', 'sternum', 'shoulder_r', 'arm_ant_r', 'arm_med_r', 'forearm_med_r', 'hand_fingers_r'],
  },

  MUSC_PECTORALIS_MAJOR_L: {
    description: 'Left pectoralis major mirrors the right. Primary pain in the anterior chest and front of the left shoulder. Referred pain across the sternum, medial arm and forearm to the ulnar side of the hand. Chest pain mimicking cardiac pathology should always be medically evaluated.',
    zones: ['chest_l', 'chest_upper', 'sternum', 'shoulder_l', 'arm_ant_l', 'arm_med_l', 'forearm_med_l', 'hand_fingers_l'],
  },

  MUSC_RECTUS_ABDOMINIS: {
    description: 'Primary pain across the anterior abdominal wall. Referred pain to the mid-back, lower thoracic spine, lumbar region and around the umbilicus. Often mimics visceral or digestive pain.',
    zones: ['abdomen_upper', 'abdomen_lower', 'mid_back', 'lower_back'],
  },

  MUSC_EXTERNAL_OBLIQUE_R: {
    description: 'Primary pain in the lateral abdomen. Referred pain to the groin, lower abdomen, iliac crest and low back. Pain can wrap around the torso and mimic abdominal or visceral pain.',
    zones: ['flank_r', 'abdomen_lower', 'groin_r', 'lower_back'],
  },

  MUSC_EXTERNAL_OBLIQUE_L: {
    description: 'Same anatomy and referral pattern as the right external oblique. Primary lateral abdomen pain with referral to the groin, lower abdomen, iliac crest and low back on the left side.',
    zones: ['flank_l', 'abdomen_lower', 'groin_l', 'lower_back'],
  },

  MUSC_TRAPEZIUS: {
    description: 'The trapezius has three functional trigger-point divisions. Upper: primary pain in the upper neck and shoulder region; refers to the posterolateral neck, mastoid area, temple and behind the eye. Middle: primary pain between the shoulder blades; refers to the acromion, spine of scapula and interscapular region. Lower: primary pain in the lower scapular region and mid-thoracic back; refers to the inferior angle of the scapula, posterior shoulder and lower neck. Together they produce a broad neck–shoulder–upper-back pain complex that often mimics tension headache.',
    zones: [
      // Upper division — primary
      'neck_r', 'neck_l', 'neck_post', 'shoulder_r', 'shoulder_l',
      // Upper division — referred
      'head_temple_r', 'head_temple_l', 'head_ear_r', 'head_ear_l',
      'head_eye_r', 'head_eye_l', 'head_occiput',
      // Middle division — primary + referred
      'upper_back', 'scapula_r', 'scapula_l',
      // Lower division — primary + referred
      'mid_back', 'shoulder_post_r', 'shoulder_post_l',
    ],
  },

  MUSC_LATISSIMUS_DORSI_R: {
    description: 'Primary pain in the mid-back and posterior axilla. Referred pain to the inferior angle of the scapula, posterior shoulder, medial arm and forearm, and the ulnar side of the hand. Can mimic scapular or shoulder pathology.',
    zones: ['mid_back', 'lat_chest_r', 'scapula_r', 'shoulder_post_r', 'arm_post_r', 'arm_med_r', 'forearm_med_r', 'hand_fingers_r'],
  },

  MUSC_LATISSIMUS_DORSI_L: {
    description: 'Same anatomy and referral pattern as the right latissimus dorsi. Primary mid-back and posterior axilla pain with referral to the scapula, posterior shoulder, medial arm and forearm, and ulnar hand on the left side.',
    zones: ['mid_back', 'lat_chest_l', 'scapula_l', 'shoulder_post_l', 'arm_post_l', 'arm_med_l', 'forearm_med_l', 'hand_fingers_l'],
  },

  MUSC_SERRATUS_ANTERIOR_R: {
    description: 'Primary pain in the lateral rib cage under the arm. Referred pain to the side of the chest, scapular area, posterior shoulder and medial arm. Can mimic cardiac or rib dysfunction.',
    zones: ['lat_chest_r', 'scapula_r', 'shoulder_post_r', 'arm_med_r'],
  },

  MUSC_SERRATUS_ANTERIOR_L: {
    description: 'Same anatomy and referral pattern as the right serratus anterior. Primary lateral rib pain with referral to the side of the chest, scapula, posterior shoulder and medial arm on the left side.',
    zones: ['lat_chest_l', 'scapula_l', 'shoulder_post_l', 'arm_med_l'],
  },

  MUSC_ERECTOR_SPINAE_R: {
    description: 'Trigger points produce deep, aching pain along the thoracic or lumbar spine, with referral across the back or into the right buttock. Pain may mimic disc or facet joint pathology.',
    zones: ['upper_back', 'mid_back', 'lower_back', 'buttock_r'],
  },

  MUSC_ERECTOR_SPINAE_L: {
    description: 'Mirrors the right side. Deep aching pain along the spine with referral to the lower back and left buttock. Pain may mimic disc or facet joint pathology.',
    zones: ['upper_back', 'mid_back', 'lower_back', 'buttock_l'],
  },

  // ── UPPER LIMB ────────────────────────────────────────────────────────────────

  MUSC_BICEPS_BRACHII_R: {
    description: 'Trigger points refer pain to the front of the shoulder, the elbow crease and down the forearm to the radial side. Pain may be mistaken for bicipital tendinitis or epicondylalgia.',
    zones: ['shoulder_r', 'arm_ant_r', 'elbow_r', 'forearm_lat_r'],
  },

  MUSC_BICEPS_BRACHII_L: {
    description: 'Same anatomy and referral pattern as the right biceps brachii. Pain refers to the anterior shoulder, elbow crease and lateral forearm on the left side.',
    zones: ['shoulder_l', 'arm_ant_l', 'elbow_l', 'forearm_lat_l'],
  },

  MUSC_TRICEPS_BRACHII_R: {
    description: 'Primary pain in the back of the upper arm. Referred pain to the posterior shoulder and scapular area, posterior elbow and posterior forearm. Pain may mimic tennis elbow or bursitis.',
    zones: ['arm_post_r', 'shoulder_post_r', 'scapula_r', 'elbow_r', 'forearm_med_r'],
  },

  MUSC_TRICEPS_BRACHII_L: {
    description: 'Same referral as the right triceps brachii. Primary posterior upper-arm pain with referral to the posterior shoulder, scapular area, posterior elbow and posterior forearm on the left side.',
    zones: ['arm_post_l', 'shoulder_post_l', 'scapula_l', 'elbow_l', 'forearm_med_l'],
  },

  MUSC_DELTOID_R: {
    description: 'The deltoid has three functional divisions. Anterior: primary pain in the front of the shoulder; refers to the front of the upper arm toward the elbow and the front of the shoulder joint. Lateral: primary pain in the lateral shoulder; refers to the lateral upper arm and deltoid insertion area. Posterior: primary pain in the back of the shoulder; refers to the posterior upper arm and triceps region. Combined trigger points produce diffuse shoulder and upper-arm pain that worsens with arm elevation.',
    zones: ['shoulder_r', 'arm_ant_r', 'arm_med_r', 'arm_post_r', 'elbow_r'],
  },

  MUSC_DELTOID_L: {
    description: 'The left deltoid mirrors the right. Anterior, lateral and posterior divisions produce diffuse shoulder and upper-arm pain — front-of-shoulder and upper-arm toward elbow, lateral upper arm, and posterior upper arm respectively.',
    zones: ['shoulder_l', 'arm_ant_l', 'arm_med_l', 'arm_post_l', 'elbow_l'],
  },

  MUSC_BRACHIORADIALIS_R: {
    description: 'Trigger points refer pain along the lateral forearm into the thumb and index finger. Pain may mimic tennis elbow or radial tunnel syndrome.',
    zones: ['elbow_r', 'forearm_lat_r', 'hand_thumb_r'],
  },

  MUSC_BRACHIORADIALIS_L: {
    description: 'Mirrors the right. Pain along the lateral forearm to the thumb and index finger on the left side.',
    zones: ['elbow_l', 'forearm_lat_l', 'hand_thumb_l'],
  },

  MUSC_INFRASPINATUS_R: {
    description: 'Primary pain in the back of the right shoulder blade (infraspinous fossa). Referred pain to the front of the shoulder, anterior arm and the radial side of the hand and fingers. Often mistaken for bicipital tendinitis or rotator cuff pathology.',
    zones: ['scapula_r', 'shoulder_r', 'arm_ant_r', 'forearm_lat_r', 'hand_thumb_r'],
  },

  MUSC_INFRASPINATUS_L: {
    description: 'Same referral as the right infraspinatus. Primary pain in the left infraspinous fossa with referral to the front of the shoulder, anterior arm and radial hand.',
    zones: ['scapula_l', 'shoulder_l', 'arm_ant_l', 'forearm_lat_l', 'hand_thumb_l'],
  },

  MUSC_BRACHIALIS_R: {
    description: 'Primary pain in the front of the upper arm. Referred pain to the front of the shoulder, front of the elbow and radial forearm, sometimes extending to the base of the thumb. Often active alongside biceps brachii trigger points.',
    zones: ['arm_ant_r', 'shoulder_r', 'elbow_r', 'forearm_lat_r', 'hand_thumb_r'],
  },

  MUSC_BRACHIALIS_L: {
    description: 'Same referral as the right brachialis. Primary anterior upper-arm pain with referral to the front of the shoulder, elbow and radial forearm on the left side.',
    zones: ['arm_ant_l', 'shoulder_l', 'elbow_l', 'forearm_lat_l', 'hand_thumb_l'],
  },

  MUSC_CORACOBRACHIALIS_R: {
    description: 'Trigger points may refer pain to the front of the shoulder and down the posterior arm, sometimes mimicking triceps pain. Active in throwing and push-up type movements.',
    zones: ['shoulder_r', 'arm_ant_r', 'arm_post_r'],
  },

  MUSC_CORACOBRACHIALIS_L: {
    description: 'Same referral as the right coracobrachialis. Anterior shoulder and posterior arm pain on the left side.',
    zones: ['shoulder_l', 'arm_ant_l', 'arm_post_l'],
  },

  // ── LOWER LIMB ────────────────────────────────────────────────────────────────

  MUSC_GLUTEUS_MAXIMUS_R: {
    description: 'Primary pain in the right buttock region. Referred pain to the sacrum, coccyx and posterior thigh. Aggravated by prolonged sitting or climbing stairs.',
    zones: ['buttock_r', 'sacrum', 'thigh_post_r'],
  },

  MUSC_GLUTEUS_MAXIMUS_L: {
    description: 'Same referral as the right gluteus maximus. Primary buttock pain with referral to the sacrum, coccyx and posterior thigh on the left side.',
    zones: ['buttock_l', 'sacrum', 'thigh_post_l'],
  },

  MUSC_GLUTEUS_MEDIUS_R: {
    description: 'Primary pain in the lateral hip beneath gluteus maximus. Referred pain to the sacrum, posterior buttock, lateral thigh and occasionally the lateral leg. May mimic trochanteric bursitis or IT band syndrome.',
    zones: ['lat_hip_r', 'sacrum', 'buttock_r', 'thigh_lat_r', 'shin_r'],
  },

  MUSC_GLUTEUS_MEDIUS_L: {
    description: 'Same referral as the right gluteus medius. Primary lateral hip pain with referral to the sacrum, posterior buttock, lateral thigh and occasionally lateral leg on the left side.',
    zones: ['lat_hip_l', 'sacrum', 'buttock_l', 'thigh_lat_l', 'shin_l'],
  },

  MUSC_RECTUS_FEMORIS_R: {
    description: 'Primary pain in the front of the thigh. Referred pain to the front of the hip, anterior thigh and front of the knee. Can mimic patellar tendinopathy or hip flexor pathology.',
    zones: ['groin_r', 'thigh_ant_r', 'knee_r'],
  },

  MUSC_RECTUS_FEMORIS_L: {
    description: 'Same referral as the right rectus femoris. Primary anterior thigh pain with referral to the front of the hip and front of the knee on the left side.',
    zones: ['groin_l', 'thigh_ant_l', 'knee_l'],
  },

  MUSC_VASTUS_LATERALIS_R: {
    description: 'Primary pain in the lateral thigh. Referred pain to the lateral knee and lateral lower leg. Can mimic iliotibial band syndrome or lateral knee pathology.',
    zones: ['thigh_lat_r', 'knee_lat_r', 'shin_r'],
  },

  MUSC_VASTUS_LATERALIS_L: {
    description: 'Same referral as the right vastus lateralis. Primary lateral thigh pain with referral to the lateral knee and lateral lower leg on the left side.',
    zones: ['thigh_lat_l', 'knee_lat_l', 'shin_l'],
  },

  MUSC_BICEPS_FEMORIS_R: {
    description: 'Primary pain in the posterior lateral thigh. Referred pain to the posterior knee, lateral calf and lateral lower leg. May mimic lateral knee tendon problems or popliteal issues.',
    zones: ['thigh_post_r', 'thigh_lat_r', 'knee_post_r', 'knee_lat_r', 'calf_r', 'shin_r'],
  },

  MUSC_BICEPS_FEMORIS_L: {
    description: 'Same referral as the right biceps femoris. Primary posterior lateral thigh pain with referral to the posterior knee, lateral calf and lateral lower leg on the left side.',
    zones: ['thigh_post_l', 'thigh_lat_l', 'knee_post_l', 'knee_lat_l', 'calf_l', 'shin_l'],
  },

  MUSC_GASTROCNEMIUS_R: {
    description: 'Primary pain in the calf (posterior lower leg). Referred pain to the posterior knee, calf, heel or sole of the foot, and lateral ankle. Pain may mimic deep vein thrombosis or plantar fasciitis.',
    zones: ['calf_r', 'knee_post_r', 'ankle_r', 'arch_r', 'foot_r'],
  },

  MUSC_GASTROCNEMIUS_L: {
    description: 'Same referral as the right gastrocnemius. Primary calf pain with referral to the posterior knee, heel, sole and lateral ankle on the left side.',
    zones: ['calf_l', 'knee_post_l', 'ankle_l', 'arch_l', 'foot_l'],
  },

  MUSC_SOLEUS_R: {
    description: 'Trigger points refer pain to the lower calf, heel and sometimes the arch of the foot. Deep calf pain that may present like Achilles tendinopathy or plantar fasciitis.',
    zones: ['calf_r', 'ankle_r', 'arch_r'],
  },

  MUSC_SOLEUS_L: {
    description: 'Same referral as the right soleus. Lower calf, heel and arch pain on the left side.',
    zones: ['calf_l', 'ankle_l', 'arch_l'],
  },

  MUSC_TIBIALIS_ANTERIOR_R: {
    description: 'Primary pain in the anterior shin. Referred pain to the dorsum of the foot, big toe and medial ankle. Often mimics shin splints or anterior compartment syndrome.',
    zones: ['shin_r', 'foot_r', 'ankle_r', 'arch_r'],
  },

  MUSC_TIBIALIS_ANTERIOR_L: {
    description: 'Same referral as the right tibialis anterior. Primary anterior shin pain with referral to the dorsum of the foot, big toe and medial ankle on the left side.',
    zones: ['shin_l', 'foot_l', 'ankle_l', 'arch_l'],
  },

  MUSC_VASTUS_MEDIALIS_R: {
    description: 'Trigger points refer pain to the medial knee and lower medial thigh. Pain may mimic medial meniscus injury or MCL involvement.',
    zones: ['thigh_med_r', 'knee_med_r', 'knee_r'],
  },

  MUSC_VASTUS_MEDIALIS_L: {
    description: 'Same referral as the right vastus medialis. Medial thigh and medial knee pain on the left side.',
    zones: ['thigh_med_l', 'knee_med_l', 'knee_l'],
  },

  MUSC_SARTORIUS_R: {
    description: 'Trigger points refer pain to the medial thigh, medial knee and sometimes the medial calf. Pain can mimic medial knee ligament injury.',
    zones: ['thigh_med_r', 'knee_med_r', 'shin_r'],
  },

  MUSC_SARTORIUS_L: {
    description: 'Same referral as the right sartorius. Medial thigh, medial knee and medial calf pain on the left side.',
    zones: ['thigh_med_l', 'knee_med_l', 'shin_l'],
  },

  // ── ROTATOR CUFF ─────────────────────────────────────────────────────────────

  MUSC_SUPRASPINATUS_R: {
    description: 'Trigger points in the supraspinatus refer pain to the lateral shoulder and down the lateral arm toward the elbow. Pain is often confused with shoulder bursitis or rotator cuff impingement syndrome.',
    zones: ['shoulder_r', 'scapula_r', 'arm_ant_r', 'elbow_r'],
  },
  MUSC_SUPRASPINATUS_L: {
    description: 'Same referral pattern as the right supraspinatus, mirrored to the left side.',
    zones: ['shoulder_l', 'scapula_l', 'arm_ant_l', 'elbow_l'],
  },

  MUSC_SUBSCAPULARIS_R: {
    description: 'Trigger points in the subscapularis refer pain to the posterior shoulder and posterior arm, and may extend to the wrist. Frequently causes restricted external rotation of the shoulder.',
    zones: ['shoulder_r', 'shoulder_post_r', 'arm_post_r', 'hand_r'],
  },
  MUSC_SUBSCAPULARIS_L: {
    description: 'Same referral pattern as the right subscapularis, mirrored to the left side.',
    zones: ['shoulder_l', 'shoulder_post_l', 'arm_post_l', 'hand_l'],
  },

  MUSC_TERES_MAJOR_R: {
    description: 'Trigger points in teres major refer pain to the posterior axilla, inferior angle of the scapula, and down the posterior upper arm. Pain can resemble triceps or latissimus referral.',
    zones: ['scapula_r', 'shoulder_post_r', 'arm_post_r'],
  },
  MUSC_TERES_MAJOR_L: {
    description: 'Same referral as the right teres major, mirrored to the left side.',
    zones: ['scapula_l', 'shoulder_post_l', 'arm_post_l'],
  },

  MUSC_TERES_MINOR_R: {
    description: 'Trigger points in teres minor refer pain to the posterior shoulder just below the infraspinatus, radiating to the lateral arm. Often accompanies infraspinatus trigger points.',
    zones: ['shoulder_post_r', 'scapula_r', 'arm_med_r'],
  },
  MUSC_TERES_MINOR_L: {
    description: 'Same referral as the right teres minor, mirrored to the left side.',
    zones: ['shoulder_post_l', 'scapula_l', 'arm_med_l'],
  },

  // ── INTERSCAPULAR MUSCLES ─────────────────────────────────────────────────────

  MUSC_RHOMBOID_MAJOR_R: {
    description: 'Rhomboid major trigger points refer pain along the medial border of the scapula and into the inter-scapular region. Pain is felt superficially and may not respond to typical postural correction alone.',
    zones: ['scapula_r', 'upper_back', 'mid_back'],
  },
  MUSC_RHOMBOID_MAJOR_L: {
    description: 'Same referral as the right rhomboid major, mirrored to the left side.',
    zones: ['scapula_l', 'upper_back', 'mid_back'],
  },

  MUSC_RHOMBOID_MINOR_R: {
    description: 'Rhomboid minor trigger points refer pain at the upper medial scapular border and into the upper thoracic spine. Often co-active with rhomboid major and levator scapulae.',
    zones: ['scapula_r', 'upper_back', 'neck_post'],
  },
  MUSC_RHOMBOID_MINOR_L: {
    description: 'Same referral as the right rhomboid minor, mirrored to the left side.',
    zones: ['scapula_l', 'upper_back', 'neck_post'],
  },

  MUSC_LEVATOR_SCAPULAE_R: {
    description: 'Levator scapulae trigger points produce intense pain at the angle of the neck, with referral along the medial border of the scapula, the posterior shoulder, and down the thoracic spine. Patients often present with a restricted "stiff neck."',
    zones: ['neck_post', 'neck_r', 'scapula_r', 'shoulder_post_r'],
  },
  MUSC_LEVATOR_SCAPULAE_L: {
    description: 'Same referral as the right levator scapulae, mirrored to the left side.',
    zones: ['neck_post', 'neck_l', 'scapula_l', 'shoulder_post_l'],
  },

  // ── POSTERIOR NECK ────────────────────────────────────────────────────────────

  MUSC_SPLENIUS_CAPITIS_R: {
    description: 'Splenius capitis trigger points refer pain to the top and back of the head and can produce a sensation "behind the eye" on the ipsilateral side. Associated with cervicogenic headache.',
    zones: ['neck_post', 'upper_back', 'head_vertex', 'head_occiput', 'head_eye_r'],
  },
  MUSC_SPLENIUS_CAPITIS_L: {
    description: 'Same referral as the right splenius capitis. Pain to the top and back of the head and behind the left eye.',
    zones: ['neck_post', 'upper_back', 'head_vertex', 'head_occiput', 'head_eye_l'],
  },

  MUSC_SEMISPINALIS_CAPITIS_R: {
    description: 'Semispinalis capitis trigger points cause a band-like headache across the occiput and upper neck. Pain is deep and diffuse, often confused with tension headache.',
    zones: ['neck_post', 'head_occiput', 'head_vertex'],
  },
  MUSC_SEMISPINALIS_CAPITIS_L: {
    description: 'Same referral as the right semispinalis capitis, mirrored to the left side.',
    zones: ['neck_post', 'head_occiput', 'head_vertex'],
  },

  // ── FOREARM EXTENSORS ─────────────────────────────────────────────────────────

  MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_R: {
    description: 'Trigger points in extensor carpi radialis longus refer pain to the lateral elbow and along the dorsal forearm toward the thumb side of the hand. Commonly mistaken for lateral epicondylalgia (tennis elbow).',
    zones: ['elbow_r', 'forearm_lat_r', 'hand_thumb_r'],
  },
  MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_L: {
    description: 'Same referral as the right extensor carpi radialis longus, mirrored to the left side.',
    zones: ['elbow_l', 'forearm_lat_l', 'hand_thumb_l'],
  },

  MUSC_EXTENSOR_DIGITORUM_R: {
    description: 'Extensor digitorum trigger points refer pain to the dorsum of the hand and fingers, and may radiate up to the lateral elbow. Pain can mimic radial tunnel syndrome or dorsal carpal pain.',
    zones: ['forearm_med_r', 'elbow_r', 'hand_fingers_r'],
  },
  MUSC_EXTENSOR_DIGITORUM_L: {
    description: 'Same referral as the right extensor digitorum, mirrored to the left side.',
    zones: ['forearm_med_l', 'elbow_l', 'hand_fingers_l'],
  },

  // ── FOREARM FLEXORS ───────────────────────────────────────────────────────────

  MUSC_FLEXOR_CARPI_RADIALIS_R: {
    description: 'Flexor carpi radialis trigger points refer pain to the palmar wrist and the radial side of the palm. Pain can mimic carpal tunnel syndrome or wrist flexor tendinopathy.',
    zones: ['forearm_lat_r', 'hand_r', 'hand_thumb_r'],
  },
  MUSC_FLEXOR_CARPI_RADIALIS_L: {
    description: 'Same referral as the right flexor carpi radialis, mirrored to the left side.',
    zones: ['forearm_lat_l', 'hand_l', 'hand_thumb_l'],
  },

  MUSC_PALMARIS_LONGUS_R: {
    description: 'Palmaris longus trigger points refer pain to the palm of the hand and the palmar wrist, producing a "needling" sensation in the center of the palm.',
    zones: ['forearm_lat_r', 'forearm_med_r', 'hand_r'],
  },
  MUSC_PALMARIS_LONGUS_L: {
    description: 'Same referral as the right palmaris longus, mirrored to the left side.',
    zones: ['forearm_lat_l', 'forearm_med_l', 'hand_l'],
  },

  // ── HAMSTRINGS ────────────────────────────────────────────────────────────────

  MUSC_SEMITENDINOSUS_R: {
    description: 'Semitendinosus trigger points refer pain to the posterior medial thigh and into the posteromedial knee and medial calf. Pain can mimic medial knee ligament injury.',
    zones: ['thigh_post_r', 'thigh_med_r', 'knee_post_r', 'knee_med_r', 'calf_r'],
  },
  MUSC_SEMITENDINOSUS_L: {
    description: 'Same referral as the right semitendinosus, mirrored to the left side.',
    zones: ['thigh_post_l', 'thigh_med_l', 'knee_post_l', 'knee_med_l', 'calf_l'],
  },

  MUSC_SEMIMEMBRANOSUS_R: {
    description: 'Semimembranosus trigger points refer pain to the deep posterior medial thigh, the posteromedial knee, and down the posterior leg. Often co-active with semitendinosus.',
    zones: ['thigh_post_r', 'thigh_med_r', 'knee_post_r', 'calf_r'],
  },
  MUSC_SEMIMEMBRANOSUS_L: {
    description: 'Same referral as the right semimembranosus, mirrored to the left side.',
    zones: ['thigh_post_l', 'thigh_med_l', 'knee_post_l', 'calf_l'],
  },

  // ── MEDIAL THIGH ─────────────────────────────────────────────────────────────

  MUSC_GRACILIS_R: {
    description: 'Gracilis trigger points cause a hot, stinging pain along the inner thigh that can radiate to the medial knee and medial lower leg. Often mistaken for knee ligament pathology.',
    zones: ['thigh_med_r', 'knee_med_r', 'shin_r'],
  },
  MUSC_GRACILIS_L: {
    description: 'Same referral as the right gracilis, mirrored to the left side.',
    zones: ['thigh_med_l', 'knee_med_l', 'shin_l'],
  },

  MUSC_ADDUCTOR_LONGUS_R: {
    description: 'Adductor longus trigger points refer pain to the medial thigh, groin, and inguinal area. Pain may radiate to the medial knee. Common in sports involving kicking or sudden direction changes.',
    zones: ['thigh_med_r', 'groin_r', 'knee_med_r'],
  },
  MUSC_ADDUCTOR_LONGUS_L: {
    description: 'Same referral as the right adductor longus, mirrored to the left side.',
    zones: ['thigh_med_l', 'groin_l', 'knee_med_l'],
  },

  // ── HIP EXTERNAL ROTATORS / DEEP PELVIS ───────────────────────────────────────

  MUSC_TENSOR_FASCIAE_LATAE_R: {
    description: 'Primary pain in the lateral hip. Referred pain down the lateral thigh along the iliotibial band to the lateral knee. Pain is often aggravated by running, walking uphill, or crossing the legs.',
    zones: ['lat_hip_r', 'thigh_lat_r', 'knee_lat_r'],
  },
  MUSC_TENSOR_FASCIAE_LATAE_L: {
    description: 'Same referral as the right TFL. Primary lateral hip pain with referral down the lateral thigh to the lateral knee on the left side.',
    zones: ['lat_hip_l', 'thigh_lat_l', 'knee_lat_l'],
  },

  MUSC_PIRIFORMIS_R: {
    description: 'Piriformis trigger points cause deep buttock pain near the sacrum with referral down the posterior thigh, mimicking sciatic nerve compression. Pain is aggravated by sitting and hip internal rotation.',
    zones: ['buttock_r', 'sacrum', 'thigh_post_r', 'calf_r'],
  },
  MUSC_PIRIFORMIS_L: {
    description: 'Same referral as the right piriformis, mirrored to the left side.',
    zones: ['buttock_l', 'sacrum', 'thigh_post_l', 'calf_l'],
  },

  MUSC_GLUTEUS_MINIMUS_R: {
    description: 'Gluteus minimus trigger points can produce a "pseudo-sciatica" pattern — pain from the deep lateral buttock down the lateral thigh and calf to the ankle. Differentiated from true sciatica by absence of neurological signs.',
    zones: ['lat_hip_r', 'buttock_r', 'thigh_lat_r', 'shin_r', 'ankle_r'],
  },
  MUSC_GLUTEUS_MINIMUS_L: {
    description: 'Same referral as the right gluteus minimus, mirrored to the left side.',
    zones: ['lat_hip_l', 'buttock_l', 'thigh_lat_l', 'shin_l', 'ankle_l'],
  },

  // ── LUMBAR / DEEP BACK ────────────────────────────────────────────────────────

  MUSC_QUADRATUS_LUMBORUM_R: {
    description: 'Quadratus lumborum is one of the most common sources of low back pain. Trigger points refer pain to the sacrum, posterior iliac crest, buttock, lateral hip, and sometimes the lateral thigh. Pain is severe and can prevent rolling in bed.',
    zones: ['lower_back', 'sacrum', 'lat_hip_r', 'buttock_r', 'thigh_lat_r'],
  },
  MUSC_QUADRATUS_LUMBORUM_L: {
    description: 'Same referral as the right quadratus lumborum, mirrored to the left side.',
    zones: ['lower_back', 'sacrum', 'lat_hip_l', 'buttock_l', 'thigh_lat_l'],
  },

  MUSC_MULTIFIDUS_R: {
    description: 'Multifidus trigger points cause deep, segmental spinal pain at the lumbar or cervical level, with referral to the sacral region. Often involved in chronic low back pain that does not respond to superficial treatment.',
    zones: ['lower_back', 'mid_back', 'sacrum'],
  },
  MUSC_MULTIFIDUS_L: {
    description: 'Same referral as the right multifidus, mirrored to the left side.',
    zones: ['lower_back', 'mid_back', 'sacrum'],
  },

  // ── HIP FLEXORS ───────────────────────────────────────────────────────────────

  MUSC_PSOAS_MAJOR_R: {
    description: 'Psoas major trigger points refer pain along the lumbar spine, into the sacrum, and down the anterior thigh. Psoas dysfunction is a frequent contributor to chronic low back pain and groin pain in runners and cyclists.',
    zones: ['lower_back', 'sacrum', 'groin_r', 'thigh_ant_r'],
  },
  MUSC_PSOAS_MAJOR_L: {
    description: 'Same referral as the right psoas major, mirrored to the left side.',
    zones: ['lower_back', 'sacrum', 'groin_l', 'thigh_ant_l'],
  },

  MUSC_ILIACUS_R: {
    description: 'Iliacus trigger points refer pain to the groin, lower abdomen, and anterior thigh. Pain is typically felt deep in the iliac fossa and aggravated by walking or climbing stairs.',
    zones: ['groin_r', 'abdomen_lower', 'thigh_ant_r'],
  },
  MUSC_ILIACUS_L: {
    description: 'Same referral as the right iliacus, mirrored to the left side.',
    zones: ['groin_l', 'abdomen_lower', 'thigh_ant_l'],
  },

  // ── DEEP THIGH ────────────────────────────────────────────────────────────────

  MUSC_VASTUS_INTERMEDIUS_R: {
    description: 'Vastus intermedius trigger points refer pain to the deep anterior thigh and toward the front of the knee. Located beneath rectus femoris, it is often overlooked in quadriceps assessments.',
    zones: ['thigh_ant_r', 'knee_r'],
  },
  MUSC_VASTUS_INTERMEDIUS_L: {
    description: 'Same referral as the right vastus intermedius, mirrored to the left side.',
    zones: ['thigh_ant_l', 'knee_l'],
  },

  MUSC_POPLITEUS_R: {
    description: 'Popliteus trigger points cause pain directly behind the knee in the popliteal fossa, with referral into the posteromedial calf. Pain increases with walking downhill or squatting.',
    zones: ['knee_post_r', 'calf_r'],
  },
  MUSC_POPLITEUS_L: {
    description: 'Same referral as the right popliteus, mirrored to the left side.',
    zones: ['knee_post_l', 'calf_l'],
  },
}
