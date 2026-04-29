/**
 * movements.ts
 *
 * The six standardized movements that make up a Movement Assessment.
 * Each entry is self-describing: title, instructions, ideal-ROM benchmarks,
 * and per-frame analyser that turns landmark sets into a metrics object.
 *
 * The orchestrator (MovementScreen.tsx) walks through these in order,
 * captures peak-performance metrics across a hold window, then passes the
 * combined results to scoring.ts and protocol.ts.
 */

import {
  jointAngleDeg, vectorVerticalAngleDeg, dist2D, symmetry, visible,
  LM, type LandmarkSet,
} from './landmarks'

/** A single per-frame metrics snapshot for one movement. */
export interface MovementMetrics {
  /** Numeric values keyed by metric name — meaning depends on the movement. */
  values:        Record<string, number>
  /** True when all required landmarks were visible this frame. */
  valid:         boolean
  /** Free-text issues detected this frame (compensation patterns). */
  compensations: string[]
}

/** Definition of one assessed movement. */
export interface MovementDef {
  id:           string
  title:        string
  /** What the user is being asked to do. */
  instruction:  string
  /** Cue word for TTS / on-screen prompt during the hold. */
  holdCue:      string
  /** Hold window (ms) over which we sample peak metrics. */
  holdMs:       number
  /** Run on each frame while the camera is on. */
  analyse:      (lms: LandmarkSet) => MovementMetrics
  /** What's a "perfect 100" for each metric reported by analyse. */
  benchmarks:   Record<string, { ideal: number; floor: number; higherIsBetter: boolean }>
  /** Plain-English explanations of what each metric means. */
  metricLabels: Record<string, string>
  /** Side-aware muscle implications for findings (used by protocol.ts). */
  implications: MovementImplication[]
}

/** Maps a finding ("low ROM on left") to candidate muscle weaknesses. */
export interface MovementImplication {
  /** Metric name from analyse().values that triggers this rule. */
  metric:    string
  /** "low" = below benchmark.floor, "high" = above (for asymmetry deltas etc). */
  direction: 'low' | 'high' | 'asymmetric'
  /** Optional side qualifier for asymmetric findings. */
  sideHint?: 'L' | 'R'
  /** muscle_id keys (from painDiagnostic.json) implicated by this finding. */
  muscles:   string[]
  /** One-line explanation shown to the user in the protocol. */
  rationale: string
}

// ─────────────────────────────────────────────────────────────────────────────
//  Movement 1 — Overhead Reach
// ─────────────────────────────────────────────────────────────────────────────

const overheadReach: MovementDef = {
  id:          'overhead_reach',
  title:       'Overhead Reach',
  instruction: 'Stand tall. Raise both arms straight overhead, palms facing each other. Reach as high as you can without arching your back.',
  holdCue:     'Hold up there.',
  holdMs:      3000,
  metricLabels: {
    L_shoulder_flexion_deg: 'Left shoulder flexion (°)',
    R_shoulder_flexion_deg: 'Right shoulder flexion (°)',
    asymmetry:              'Left/right symmetry (1.0 = perfect)',
    lumbar_extension_deg:   'Lower-back compensation (°)',
  },
  benchmarks: {
    L_shoulder_flexion_deg: { ideal: 175, floor: 140, higherIsBetter: true },
    R_shoulder_flexion_deg: { ideal: 175, floor: 140, higherIsBetter: true },
    asymmetry:              { ideal: 1,   floor: 0.85, higherIsBetter: true },
    lumbar_extension_deg:   { ideal: 0,   floor: 18,  higherIsBetter: false },
  },
  implications: [
    { metric: 'L_shoulder_flexion_deg', direction: 'low', sideHint: 'L',
      muscles: ['latissimus_dorsi', 'teres_major', 'pectoralis_major'],
      rationale: 'Limited left overhead reach often points to tight left lat / teres major / pec major.' },
    { metric: 'R_shoulder_flexion_deg', direction: 'low', sideHint: 'R',
      muscles: ['latissimus_dorsi', 'teres_major', 'pectoralis_major'],
      rationale: 'Limited right overhead reach often points to tight right lat / teres major / pec major.' },
    { metric: 'lumbar_extension_deg', direction: 'high',
      muscles: ['erector_spinae', 'quadratus_lumborum'],
      rationale: 'Lumbar extension compensation suggests the thoracic spine is stiff and the lower back is doing the reaching.' },
    { metric: 'asymmetry', direction: 'low',
      muscles: ['trapezius_lower', 'serratus_anterior'],
      rationale: 'Overhead asymmetry often involves the lower trap / serratus anterior on the limited side.' },
  ],
  analyse(lms) {
    if (!visible(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_HIP, LM.R_HIP)) {
      return { values: {} as Record<string, number>, valid: false, compensations: [] }
    }
    // Shoulder flexion: angle at shoulder formed by hip-shoulder-elbow.
    const lFlex = jointAngleDeg(lms[LM.L_HIP],   lms[LM.L_SHOULDER], lms[LM.L_ELBOW])
    const rFlex = jointAngleDeg(lms[LM.R_HIP],   lms[LM.R_SHOULDER], lms[LM.R_ELBOW])
    // Trunk forward/back tilt (mid-hip to mid-shoulder vs vertical).
    const midHip      = midpoint(lms[LM.L_HIP],      lms[LM.R_HIP])
    const midShoulder = midpoint(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
    const trunkTilt   = Math.abs(vectorVerticalAngleDeg(midHip, midShoulder))
    const comps: string[] = []
    if (trunkTilt > 18) comps.push('Lumbar extension — back arching to reach overhead')
    return {
      valid:        true,
      compensations: comps,
      values: {
        L_shoulder_flexion_deg: lFlex,
        R_shoulder_flexion_deg: rFlex,
        asymmetry:              symmetry(lFlex, rFlex),
        lumbar_extension_deg:   trunkTilt,
      },
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Movement 2 — Deep Squat
// ─────────────────────────────────────────────────────────────────────────────

const deepSquat: MovementDef = {
  id:          'deep_squat',
  title:       'Deep Squat',
  instruction: 'Feet shoulder-width apart. Squat down as deep as you can while keeping heels on the floor. Arms forward for balance.',
  holdCue:     'Hold the bottom.',
  holdMs:      3000,
  metricLabels: {
    L_knee_flexion_deg: 'Left knee flexion (°)',
    R_knee_flexion_deg: 'Right knee flexion (°)',
    asymmetry:          'Knee symmetry',
    knee_valgus_score:  'Knee valgus (lower = better)',
    trunk_lean_deg:     'Forward trunk lean (°)',
  },
  benchmarks: {
    L_knee_flexion_deg: { ideal: 130, floor: 95,  higherIsBetter: true },
    R_knee_flexion_deg: { ideal: 130, floor: 95,  higherIsBetter: true },
    asymmetry:          { ideal: 1,   floor: 0.9, higherIsBetter: true },
    knee_valgus_score:  { ideal: 0,   floor: 0.06, higherIsBetter: false },
    trunk_lean_deg:     { ideal: 30,  floor: 60,  higherIsBetter: false },
  },
  implications: [
    { metric: 'knee_valgus_score', direction: 'high',
      muscles: ['gluteus_medius', 'gluteus_minimus'],
      rationale: 'Knees collapsing inward typically means weak hip abductors (gluteus medius / minimus).' },
    { metric: 'trunk_lean_deg', direction: 'high',
      muscles: ['gastrocnemius', 'soleus'],
      rationale: 'Excessive forward lean can come from tight calves limiting ankle dorsiflexion.' },
    { metric: 'L_knee_flexion_deg', direction: 'low',
      muscles: ['rectus_femoris', 'vastus_lateralis', 'gastrocnemius'],
      rationale: 'Limited squat depth on one side — tight quads / calves on the limited side.' },
    { metric: 'R_knee_flexion_deg', direction: 'low',
      muscles: ['rectus_femoris', 'vastus_lateralis', 'gastrocnemius'],
      rationale: 'Limited squat depth on one side — tight quads / calves on the limited side.' },
    { metric: 'asymmetry', direction: 'low',
      muscles: ['quadratus_lumborum', 'gluteus_maximus'],
      rationale: 'Squat asymmetry often involves a tight QL on one side, weak glute max on the other.' },
  ],
  analyse(lms) {
    const need = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE, LM.L_SHOULDER, LM.R_SHOULDER]
    if (!visible(lms, ...need)) return { values: {} as Record<string, number>, valid: false, compensations: [] }
    const lKnee = jointAngleDeg(lms[LM.L_HIP], lms[LM.L_KNEE], lms[LM.L_ANKLE])
    const rKnee = jointAngleDeg(lms[LM.R_HIP], lms[LM.R_KNEE], lms[LM.R_ANKLE])
    // Knee valgus: how much the knees move toward the midline relative to ankles.
    // Positive = knees inside ankles (valgus).  Use ankle x-distance as scale.
    const ankleSpread = Math.abs(lms[LM.L_ANKLE].x - lms[LM.R_ANKLE].x) + 1e-6
    const kneeSpread  = Math.abs(lms[LM.L_KNEE].x  - lms[LM.R_KNEE].x)
    const valgus      = Math.max(0, (ankleSpread - kneeSpread) / ankleSpread)
    // Trunk lean: angle of mid-hip→mid-shoulder vs vertical.
    const midHip      = midpoint(lms[LM.L_HIP], lms[LM.R_HIP])
    const midShoulder = midpoint(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
    const trunkLean   = Math.abs(vectorVerticalAngleDeg(midHip, midShoulder))

    const comps: string[] = []
    if (valgus > 0.06) comps.push('Knee valgus — knees collapse inward')
    if (trunkLean > 60) comps.push('Excessive forward trunk lean')

    // Knee flexion as reported by jointAngleDeg is the angle at the knee.
    // Convert to "how much flexed from straight" (180° straight → 0° at full flex).
    const flexL = 180 - lKnee
    const flexR = 180 - rKnee
    return {
      valid:        true,
      compensations: comps,
      values: {
        L_knee_flexion_deg: flexL,
        R_knee_flexion_deg: flexR,
        asymmetry:          symmetry(flexL, flexR),
        knee_valgus_score:  valgus,
        trunk_lean_deg:     trunkLean,
      },
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Movement 3 — Neck Rotation (Left & Right captured separately by the orchestrator
//  but exposed as a single movement here — we look at peak rotation each side.)
// ─────────────────────────────────────────────────────────────────────────────

const neckRotation: MovementDef = {
  id:          'neck_rotation',
  title:       'Neck Rotation',
  instruction: 'Look forward. Slowly rotate your head as far as comfortable to the LEFT, hold, then to the RIGHT.',
  holdCue:     'Slowly rotate side to side.',
  holdMs:      6000,
  metricLabels: {
    L_rotation_deg: 'Rotation to the left (°)',
    R_rotation_deg: 'Rotation to the right (°)',
    asymmetry:      'L/R symmetry',
  },
  benchmarks: {
    L_rotation_deg: { ideal: 80, floor: 55, higherIsBetter: true },
    R_rotation_deg: { ideal: 80, floor: 55, higherIsBetter: true },
    asymmetry:      { ideal: 1,  floor: 0.85, higherIsBetter: true },
  },
  implications: [
    { metric: 'L_rotation_deg', direction: 'low', sideHint: 'L',
      muscles: ['sternocleidomastoid', 'levator_scapulae', 'splenius_capitis'],
      rationale: 'Reduced rotation to the left — the right SCM / levator / splenius are likely tight (they limit left rotation).' },
    { metric: 'R_rotation_deg', direction: 'low', sideHint: 'R',
      muscles: ['sternocleidomastoid', 'levator_scapulae', 'splenius_capitis'],
      rationale: 'Reduced rotation to the right — the left SCM / levator / splenius are likely tight.' },
  ],
  analyse(lms) {
    if (!visible(lms, LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER)) {
      return { values: {} as Record<string, number>, valid: false, compensations: [] }
    }
    const midShoulder = midpoint(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
    const earSpread   = Math.abs(lms[LM.L_EAR].x - lms[LM.R_EAR].x) + 1e-6
    // Approximate rotation: how far the nose has shifted relative to the
    // mid-shoulder line, normalised by ear spread (=> roughly degrees).
    const noseShift   = (lms[LM.NOSE].x - midShoulder.x) / earSpread
    // Right rotation = nose moves right (positive x in image), left rotation = negative.
    const rotDeg      = Math.atan(noseShift * 2) * 180 / Math.PI
    // The orchestrator collects the peak in EACH direction — we report
    // both extremes through min/max sentinels.
    return {
      valid:        true,
      compensations: [],
      values: {
        L_rotation_deg: Math.max(0, -rotDeg),
        R_rotation_deg: Math.max(0,  rotDeg),
        asymmetry:      0,   // computed at the orchestrator level from peak L vs peak R
      },
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Movement 4 — Single-Leg Balance (Left, then Right — orchestrator splits)
// ─────────────────────────────────────────────────────────────────────────────

const singleLegBalanceL: MovementDef = {
  id:          'single_leg_balance_l',
  title:       'Single-Leg Balance — Left',
  instruction: 'Stand on your LEFT leg only. Hold for 10 seconds. Try not to let your hips drop or shift.',
  holdCue:     'Hold steady on your left leg.',
  holdMs:      8000,
  metricLabels: {
    pelvic_drop_deg:    'Hip drop (Trendelenburg sign, °)',
    trunk_shift_deg:    'Trunk shift toward stance leg (°)',
  },
  benchmarks: {
    pelvic_drop_deg:    { ideal: 0, floor: 6,  higherIsBetter: false },
    trunk_shift_deg:    { ideal: 0, floor: 12, higherIsBetter: false },
  },
  implications: [
    { metric: 'pelvic_drop_deg', direction: 'high',
      muscles: ['gluteus_medius', 'gluteus_minimus'],
      rationale: 'Trendelenburg sign on left stance — the LEFT gluteus medius is weak (it stabilises the standing leg).' },
    { metric: 'trunk_shift_deg', direction: 'high',
      muscles: ['quadratus_lumborum'],
      rationale: 'Compensatory trunk shift suggests the LEFT QL is overworking to stabilise.' },
  ],
  analyse(lms) {
    return analyseSingleLeg(lms, 'L')
  },
}

const singleLegBalanceR: MovementDef = {
  id:          'single_leg_balance_r',
  title:       'Single-Leg Balance — Right',
  instruction: 'Stand on your RIGHT leg only. Hold for 10 seconds.',
  holdCue:     'Hold steady on your right leg.',
  holdMs:      8000,
  metricLabels: {
    pelvic_drop_deg:    'Hip drop (Trendelenburg sign, °)',
    trunk_shift_deg:    'Trunk shift toward stance leg (°)',
  },
  benchmarks: {
    pelvic_drop_deg:    { ideal: 0, floor: 6,  higherIsBetter: false },
    trunk_shift_deg:    { ideal: 0, floor: 12, higherIsBetter: false },
  },
  implications: [
    { metric: 'pelvic_drop_deg', direction: 'high',
      muscles: ['gluteus_medius', 'gluteus_minimus'],
      rationale: 'Trendelenburg sign on right stance — the RIGHT gluteus medius is weak.' },
    { metric: 'trunk_shift_deg', direction: 'high',
      muscles: ['quadratus_lumborum'],
      rationale: 'Compensatory trunk shift suggests the RIGHT QL is overworking.' },
  ],
  analyse(lms) {
    return analyseSingleLeg(lms, 'R')
  },
}

function analyseSingleLeg(lms: LandmarkSet, stance: 'L' | 'R'): MovementMetrics {
  if (!visible(lms, LM.L_HIP, LM.R_HIP, LM.L_SHOULDER, LM.R_SHOULDER)) {
    return { values: {} as Record<string, number>, valid: false, compensations: [] }
  }
  // Pelvic tilt: angle of L_hip→R_hip vs horizontal.
  // If standing on left, the right hip drops → R hip is lower (greater y in image).
  const dx = lms[LM.R_HIP].x - lms[LM.L_HIP].x
  const dy = lms[LM.R_HIP].y - lms[LM.L_HIP].y
  const tiltDeg = Math.atan2(dy, dx) * 180 / Math.PI
  // Drop sign convention: stance=L should have R hip lower (positive tilt with our axes).
  const drop = stance === 'L' ? tiltDeg : -tiltDeg
  // Trunk shift: lateral offset of mid-shoulder relative to mid-hip.
  const midHip      = midpoint(lms[LM.L_HIP], lms[LM.R_HIP])
  const midShoulder = midpoint(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
  const shiftDeg    = vectorVerticalAngleDeg(midHip, midShoulder)
  // For stance=L, body should NOT shift right; positive shift = away from stance.
  const towardStance = stance === 'L' ? -shiftDeg : shiftDeg

  return {
    valid:        true,
    compensations: [],
    values: {
      pelvic_drop_deg: Math.max(0, drop),
      trunk_shift_deg: Math.max(0, towardStance),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Movement 5 — Standing Hamstring Reach
// ─────────────────────────────────────────────────────────────────────────────

const hamstringReach: MovementDef = {
  id:          'hamstring_reach',
  title:       'Standing Hamstring Reach',
  instruction: 'Stand tall. Keeping legs straight, hinge at the hips and reach down toward your toes.',
  holdCue:     'Reach as low as comfortable.',
  holdMs:      4000,
  metricLabels: {
    fingertip_to_floor_norm: 'Fingertip-to-floor distance (lower = better)',
    L_hip_flexion_deg: 'Left hip flexion (°)',
    R_hip_flexion_deg: 'Right hip flexion (°)',
  },
  benchmarks: {
    fingertip_to_floor_norm: { ideal: 0,    floor: 0.30, higherIsBetter: false },
    L_hip_flexion_deg:       { ideal: 90,   floor: 50,   higherIsBetter: true },
    R_hip_flexion_deg:       { ideal: 90,   floor: 50,   higherIsBetter: true },
  },
  implications: [
    { metric: 'L_hip_flexion_deg', direction: 'low', sideHint: 'L',
      muscles: ['biceps_femoris', 'semitendinosus', 'semimembranosus', 'gastrocnemius'],
      rationale: 'Limited hip flexion on the left typically means tight left hamstrings (and sometimes calves).' },
    { metric: 'R_hip_flexion_deg', direction: 'low', sideHint: 'R',
      muscles: ['biceps_femoris', 'semitendinosus', 'semimembranosus', 'gastrocnemius'],
      rationale: 'Limited hip flexion on the right typically means tight right hamstrings.' },
    { metric: 'fingertip_to_floor_norm', direction: 'high',
      muscles: ['biceps_femoris', 'semitendinosus', 'erector_spinae'],
      rationale: 'Restricted forward fold often combines tight hamstrings and a stiff lumbar erector chain.' },
  ],
  analyse(lms) {
    const need = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_WRIST, LM.R_WRIST, LM.L_ANKLE, LM.R_ANKLE]
    if (!visible(lms, ...need)) return { values: {} as Record<string, number>, valid: false, compensations: [] }
    // Hip flexion: angle hip-shoulder vs hip-knee.
    const lHip = jointAngleDeg(lms[LM.L_SHOULDER], lms[LM.L_HIP], lms[LM.L_KNEE])
    const rHip = jointAngleDeg(lms[LM.R_SHOULDER], lms[LM.R_HIP], lms[LM.R_KNEE])
    // Convert to "how much flexed" (smaller angle = more flexed).
    const flexL = 180 - lHip
    const flexR = 180 - rHip
    // Fingertip-to-floor normalised by ankle-to-shoulder height (proxy for full body length).
    const midWrist  = midpoint(lms[LM.L_WRIST],  lms[LM.R_WRIST])
    const midAnkle  = midpoint(lms[LM.L_ANKLE],  lms[LM.R_ANKLE])
    const midShoulder = midpoint(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
    const bodyHeight = Math.abs(midShoulder.y - midAnkle.y) + 1e-6
    const fingertipDist = Math.max(0, midAnkle.y - midWrist.y) / bodyHeight
    return {
      valid: true, compensations: [],
      values: {
        fingertip_to_floor_norm: fingertipDist,
        L_hip_flexion_deg:       flexL,
        R_hip_flexion_deg:       flexR,
      },
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Movement 6 — Shoulder External Rotation (90° abduction)
// ─────────────────────────────────────────────────────────────────────────────

const shoulderExternalRotation: MovementDef = {
  id:          'shoulder_external_rotation',
  title:       'Shoulder External Rotation',
  instruction: 'Raise both elbows to shoulder height. Keep elbows bent 90°. Rotate forearms up and back as far as possible.',
  holdCue:     'Hold rotated back.',
  holdMs:      3000,
  metricLabels: {
    L_er_deg:  'Left external rotation (°)',
    R_er_deg:  'Right external rotation (°)',
    asymmetry: 'L/R symmetry',
  },
  benchmarks: {
    L_er_deg:  { ideal: 90, floor: 60, higherIsBetter: true },
    R_er_deg:  { ideal: 90, floor: 60, higherIsBetter: true },
    asymmetry: { ideal: 1,  floor: 0.85, higherIsBetter: true },
  },
  implications: [
    { metric: 'L_er_deg', direction: 'low', sideHint: 'L',
      muscles: ['subscapularis', 'pectoralis_major'],
      rationale: 'Reduced left external rotation — the LEFT subscapularis and pec major are likely tight.' },
    { metric: 'R_er_deg', direction: 'low', sideHint: 'R',
      muscles: ['subscapularis', 'pectoralis_major'],
      rationale: 'Reduced right external rotation — the RIGHT subscapularis and pec major are likely tight.' },
    { metric: 'asymmetry', direction: 'low',
      muscles: ['infraspinatus', 'teres_minor'],
      rationale: 'Asymmetric ER often involves weak infraspinatus / teres minor on the limited side.' },
  ],
  analyse(lms) {
    const need = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST]
    if (!visible(lms, ...need)) return { values: {} as Record<string, number>, valid: false, compensations: [] }
    // ER angle: forearm rotation above the elbow line.
    // Use vertical component of elbow→wrist (negative = pointing up = ER).
    const lUp = -(lms[LM.L_WRIST].y - lms[LM.L_ELBOW].y)   // positive when wrist is higher
    const rUp = -(lms[LM.R_WRIST].y - lms[LM.R_ELBOW].y)
    const lForearm = Math.hypot(lms[LM.L_WRIST].x - lms[LM.L_ELBOW].x, lms[LM.L_WRIST].y - lms[LM.L_ELBOW].y) + 1e-6
    const rForearm = Math.hypot(lms[LM.R_WRIST].x - lms[LM.R_ELBOW].x, lms[LM.R_WRIST].y - lms[LM.R_ELBOW].y) + 1e-6
    const lER = Math.asin(Math.max(-1, Math.min(1, lUp / lForearm))) * 180 / Math.PI
    const rER = Math.asin(Math.max(-1, Math.min(1, rUp / rForearm))) * 180 / Math.PI
    // Map [-90, +90] → [0, 180] then take "above-horizontal" portion as ER degrees.
    const lDeg = Math.max(0, lER)
    const rDeg = Math.max(0, rER)
    return {
      valid: true, compensations: [],
      values: {
        L_er_deg:  lDeg,
        R_er_deg:  rDeg,
        asymmetry: symmetry(lDeg, rDeg),
      },
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
//  The screening list — order matters for the orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export const MOVEMENTS: MovementDef[] = [
  overheadReach,
  deepSquat,
  neckRotation,
  singleLegBalanceL,
  singleLegBalanceR,
  hamstringReach,
  shoulderExternalRotation,
]

// ─────────────────────────────────────────────────────────────────────────────

function midpoint(a: { x: number; y: number; z: number; visibility: number },
                  b: { x: number; y: number; z: number; visibility: number }) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  }
}
