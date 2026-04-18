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
    description: 'Trigger points in the SCM refer pain to the vertex, occiput, cheek, over the eye, throat and sternum. The sternal head refers to the vertex, occiput and cheek; the clavicular head refers to the frontal region and ear. Autonomic symptoms such as lacrimation or sinus congestion may occur.',
    zones: ['head_vertex', 'head_occiput', 'head_cheek_r', 'head_eye_r', 'head_forehead', 'head_ear_r', 'head_temple_r', 'neck_r', 'throat', 'sternum'],
  },

  MUSC_STERNOCLEIDOMASTOID_L: {
    description: 'The left SCM mirrors the right. Pain refers to the vertex, occiput, cheek, over the eye, throat and sternum on the left side. The clavicular head refers to the frontal region and ear. Autonomic symptoms may occur.',
    zones: ['head_vertex', 'head_occiput', 'head_cheek_l', 'head_eye_l', 'head_forehead', 'head_ear_l', 'head_temple_l', 'neck_l', 'throat', 'sternum'],
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
    description: 'Pectoralis major trigger points can mimic angina. Referred pain is experienced in the anterior chest, front of the shoulder, down the inside of the arm and along the inside of the elbow. Breast tenderness and nipple hypersensitivity may also occur.',
    zones: ['chest_r', 'chest_upper', 'sternum', 'shoulder_r', 'arm_ant_r', 'arm_med_r', 'elbow_r'],
  },

  MUSC_PECTORALIS_MAJOR_L: {
    description: 'Left pectoralis major is anatomically and functionally identical to the right. Pain referral patterns are mirrored. Chest pain mimicking cardiac pathology should always be medically evaluated.',
    zones: ['chest_l', 'chest_upper', 'sternum', 'shoulder_l', 'arm_ant_l', 'arm_med_l', 'elbow_l'],
  },

  MUSC_RECTUS_ABDOMINIS: {
    description: 'Trigger points refer pain to the upper or lower abdomen (often mimicking digestive pain or cramps), the lower back and sacral region, and occasionally the ribs and sternum. Pain may present as tightness or deep aching across the abdomen or back.',
    zones: ['abdomen_upper', 'abdomen_lower', 'lower_back', 'sternum'],
  },

  MUSC_EXTERNAL_OBLIQUE_R: {
    description: 'External oblique trigger points may refer pain to the lower chest, flank, groin or testicular area on the same side. Pain can wrap around the torso and mimic abdominal or visceral pain.',
    zones: ['flank_r', 'lat_chest_r', 'abdomen_lower', 'groin_r'],
  },

  MUSC_EXTERNAL_OBLIQUE_L: {
    description: 'Same anatomy and referral pattern as the right external oblique. Pain is mirrored on the left side, wrapping around the torso toward the groin.',
    zones: ['flank_l', 'lat_chest_l', 'abdomen_lower', 'groin_l'],
  },

  MUSC_TRAPEZIUS: {
    description: 'Upper trapezius trigger points commonly refer pain to the temple, forehead and back of the head, mimicking tension headaches. Pain radiates into the neck and shoulders and causes tightness around the head.',
    zones: ['head_temple_r', 'head_temple_l', 'head_occiput', 'head_forehead', 'neck_post', 'shoulder_r', 'shoulder_l', 'upper_back'],
  },

  MUSC_LATISSIMUS_DORSI_R: {
    description: 'Trigger points may refer pain to the mid-back, inferior angle of the scapula, posterior shoulder and down the medial arm to the fourth and fifth fingers. Pain can mimic scapular or shoulder pathology.',
    zones: ['mid_back', 'scapula_r', 'shoulder_post_r', 'arm_post_r', 'forearm_med_r', 'hand_fingers_r'],
  },

  MUSC_LATISSIMUS_DORSI_L: {
    description: 'Same anatomy and referral pattern as the right latissimus dorsi. Pain is mirrored to the left mid-back, scapula, posterior shoulder and medial arm.',
    zones: ['mid_back', 'scapula_l', 'shoulder_post_l', 'arm_post_l', 'forearm_med_l', 'hand_fingers_l'],
  },

  MUSC_SERRATUS_ANTERIOR_R: {
    description: 'Trigger points may cause pain along the lateral chest wall and around the scapula, sometimes radiating to the medial arm. Pain can mimic cardiac or rib dysfunction.',
    zones: ['lat_chest_r', 'scapula_r', 'arm_med_r'],
  },

  MUSC_SERRATUS_ANTERIOR_L: {
    description: 'Same anatomy and referral pattern as the right serratus anterior. Pain is mirrored to the left lateral chest, scapula and medial arm.',
    zones: ['lat_chest_l', 'scapula_l', 'arm_med_l'],
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
    description: 'Trigger points can refer pain to the posterior shoulder, posterior arm and forearm, and sometimes the dorsal hand (ring and little finger side). Pain may mimic tennis elbow or bursitis.',
    zones: ['shoulder_post_r', 'arm_post_r', 'elbow_r', 'forearm_med_r', 'hand_fingers_r'],
  },

  MUSC_TRICEPS_BRACHII_L: {
    description: 'Mirrors the right triceps brachii. Pain along the posterior shoulder, upper arm and forearm on the left side.',
    zones: ['shoulder_post_l', 'arm_post_l', 'elbow_l', 'forearm_med_l', 'hand_fingers_l'],
  },

  MUSC_DELTOID_R: {
    description: 'Trigger points cause pain at the deltoid insertion and radiate down the lateral arm, often producing a dull ache when raising the arm. Anterior and posterior portions refer locally.',
    zones: ['shoulder_r', 'arm_ant_r', 'arm_post_r'],
  },

  MUSC_DELTOID_L: {
    description: 'Same referral pattern as the right deltoid. Dull aching pain at the shoulder and down the lateral arm when raising the arm on the left side.',
    zones: ['shoulder_l', 'arm_ant_l', 'arm_post_l'],
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
    description: 'Trigger points often refer pain deep into the shoulder joint, across the deltoid region and down the lateral arm to the forearm. Pain in the anterior shoulder can mimic bursitis or rotator cuff tears.',
    zones: ['shoulder_r', 'shoulder_post_r', 'arm_ant_r', 'arm_post_r', 'forearm_lat_r'],
  },

  MUSC_INFRASPINATUS_L: {
    description: 'Same referral as the right infraspinatus. Deep shoulder joint pain and lateral arm pain mirrored to the left side.',
    zones: ['shoulder_l', 'shoulder_post_l', 'arm_ant_l', 'arm_post_l', 'forearm_lat_l'],
  },

  MUSC_BRACHIALIS_R: {
    description: 'Trigger points refer pain to the anterior elbow and sometimes down to the thumb. Pain may mimic elbow tendinitis.',
    zones: ['elbow_r', 'forearm_lat_r', 'hand_thumb_r'],
  },

  MUSC_BRACHIALIS_L: {
    description: 'Same referral as the right brachialis. Anterior elbow pain with possible thumb referral on the left side.',
    zones: ['elbow_l', 'forearm_lat_l', 'hand_thumb_l'],
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
    description: 'Trigger points refer pain to the right buttock, sacrum and sometimes the posterior thigh. Pain can radiate toward the hip joint. Aggravated by prolonged sitting or climbing stairs.',
    zones: ['buttock_r', 'sacrum', 'lat_hip_r', 'thigh_post_r'],
  },

  MUSC_GLUTEUS_MAXIMUS_L: {
    description: 'Same as the right gluteus maximus. Pain in the left buttock, sacrum and posterior thigh. Mirrored referral pattern.',
    zones: ['buttock_l', 'sacrum', 'lat_hip_l', 'thigh_post_l'],
  },

  MUSC_GLUTEUS_MEDIUS_R: {
    description: 'Trigger points cause pain in the right lateral hip and buttock, sometimes extending down the lateral thigh to the knee. May mimic trochanteric bursitis or IT band syndrome.',
    zones: ['lat_hip_r', 'buttock_r', 'thigh_lat_r', 'knee_lat_r'],
  },

  MUSC_GLUTEUS_MEDIUS_L: {
    description: 'Same referral as the right gluteus medius. Lateral hip, buttock and lateral thigh to knee pain on the left side.',
    zones: ['lat_hip_l', 'buttock_l', 'thigh_lat_l', 'knee_lat_l'],
  },

  MUSC_RECTUS_FEMORIS_R: {
    description: 'Trigger points refer pain to the anterior thigh and knee, sometimes radiating down the quadriceps. Pain can mimic patellar tendinopathy or knee pathology.',
    zones: ['thigh_ant_r', 'knee_r'],
  },

  MUSC_RECTUS_FEMORIS_L: {
    description: 'Same as the right rectus femoris. Anterior thigh and knee pain on the left. Can mimic patellar tendinopathy.',
    zones: ['thigh_ant_l', 'knee_l'],
  },

  MUSC_VASTUS_LATERALIS_R: {
    description: 'Trigger points refer pain to the lateral thigh and lateral knee. Pain can mimic iliotibial band syndrome or lateral knee pathology.',
    zones: ['thigh_lat_r', 'knee_lat_r', 'knee_r'],
  },

  MUSC_VASTUS_LATERALIS_L: {
    description: 'Same referral as the right vastus lateralis. Lateral thigh and lateral knee pain on the left side.',
    zones: ['thigh_lat_l', 'knee_lat_l', 'knee_l'],
  },

  MUSC_BICEPS_FEMORIS_R: {
    description: 'Trigger points refer pain to the lateral hamstring, posterior-lateral knee and sometimes the lateral calf. Pain may mimic lateral knee tendon problems or popliteal issues.',
    zones: ['thigh_post_r', 'knee_post_r', 'knee_lat_r', 'calf_r'],
  },

  MUSC_BICEPS_FEMORIS_L: {
    description: 'Same as the right biceps femoris. Posterior-lateral thigh, posterior knee and lateral calf pain on the left side.',
    zones: ['thigh_post_l', 'knee_post_l', 'knee_lat_l', 'calf_l'],
  },

  MUSC_GASTROCNEMIUS_R: {
    description: 'Trigger points refer pain to the calf, behind the knee and sometimes the sole of the foot. Pain may mimic deep vein thrombosis or plantar fasciitis.',
    zones: ['calf_r', 'knee_post_r', 'ankle_r', 'foot_r'],
  },

  MUSC_GASTROCNEMIUS_L: {
    description: 'Same referral as the right gastrocnemius. Calf, posterior knee and foot pain on the left side.',
    zones: ['calf_l', 'knee_post_l', 'ankle_l', 'foot_l'],
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
    description: 'Trigger points refer pain to the anterior shin and down to the big toe and medial arch, often mimicking shin splints or anterior compartment syndrome.',
    zones: ['shin_r', 'foot_r', 'arch_r'],
  },

  MUSC_TIBIALIS_ANTERIOR_L: {
    description: 'Same referral as the right tibialis anterior. Anterior shin and foot pain with big toe referral on the left side.',
    zones: ['shin_l', 'foot_l', 'arch_l'],
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
}
