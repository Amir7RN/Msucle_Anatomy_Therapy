/**
 * liveMuscleActivation.ts
 *
 * The engine behind ZevaHealth's "Live Muscle Twin" — a real-time, pose-driven
 * estimate of which muscles are working RIGHT NOW, used to light up the 3-D
 * muscular-system atlas as the user moves. No other single-camera rehab
 * platform drives an anatomical digital twin from live pose; this is the
 * differentiating feature.
 *
 * How it differs from muscleActivation.ts
 * ────────────────────────────────────────
 * The original computeActivation() only fires during a *guided exercise*,
 * matching the FormSnapshot's text labels. This engine works CONTINUOUSLY from
 * raw landmarks in ANY body orientation, and adds the kinesiology that makes
 * the picture believable:
 *
 *   • Agonist / antagonist roles — when you curl, biceps light up (agonist)
 *     and triceps glow faintly (antagonist co-contraction), and vice-versa.
 *   • Concentric / eccentric / isometric phase — derived from joint angular
 *     velocity, because a muscle lowering a weight (eccentric) is still very
 *     active. This is what most "activation" demos miss.
 *   • Effort scaling — activation rises as the joint moves deeper into its
 *     range (more mechanical demand), referenced to the ROM bounds in the
 *     biomechanics JSON.
 *   • Confidence gating — a joint the camera can't see well doesn't blast the
 *     model with false activation.
 *
 * It is a kinesiology approximation for education + engagement + biofeedback,
 * NOT an EMG simulation.
 */

import type { LandmarkSet } from './landmarks'
import { readJointMovement } from './muscleJointMap'
import { OrientationTracker, type OrientationEstimate } from './bodyOrientation'
import { romFraction } from './constraints'
import type { MuscleActivation } from './muscleActivation'
import type { SymmetryRegion } from '../insights/symmetry'

type MovePhase = 'concentric' | 'eccentric' | 'isometric'
type MuscleRole = 'agonist' | 'antagonist' | 'stabilizer'

/** Richer activation record (superset of MuscleActivation for the viewer). */
export interface LiveMuscleActivation extends MuscleActivation {
  role:  MuscleRole
  phase: MovePhase
  side:  'L' | 'R' | 'C'
}

/** Per-joint live reading surfaced to the ROM / asymmetry HUD. */
export interface JointLiveReading {
  movementId: string
  side:       'L' | 'R'
  angle:      number       // calibrated, clamped degrees
  romFrac:    number       // 0..1+ within the normal range
  confidence: number
  phase:      MovePhase
}

export interface LiveFrame {
  activations: LiveMuscleActivation[]
  readings:    JointLiveReading[]
  orientation: OrientationEstimate
}

// ─────────────────────────────────────────────────────────────────────────────
//  Kinesiology table
//
//  Each movement maps to the muscles that drive it (agonists) plus the
//  opposing group (antagonists, which co-contract for control). muscleId stems
//  match the GLB mesh names via MuscleActivationViewer's matchStem().
// ─────────────────────────────────────────────────────────────────────────────

interface MuscleRule {
  muscleId: string
  role:     MuscleRole
  weight:   number
  /** Fixed region override (for central muscles, e.g. trunk / neck). */
  region?:  SymmetryRegion
  /** Side-aware region base override — when a muscle that drives this joint
   *  visually belongs to a DIFFERENT joint's region on the SAME side
   *  (e.g. rectus femoris drives hip flexion but glows at the knee). */
  crossBase?: 'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle'
}

interface MovementRule {
  movementId: string
  /** Region base used to build {side}_{base} unless a muscle overrides it. */
  regionBase: 'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle' | 'neck' | 'trunk'
  /** Working ROM band for activation (deg) + activation peak. */
  band:       { min: number; peak: number; max: number }
  muscles:    MuscleRule[]
  /** When true the movement has no left/right side (trunk, neck flex). */
  central?:   boolean
}

const MOVEMENT_RULES: MovementRule[] = [
  {
    movementId: 'elbow_flexion', regionBase: 'elbow',
    band: { min: 15, peak: 95, max: 150 },
    muscles: [
      { muscleId: 'biceps_brachii',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'brachialis',      role: 'agonist',    weight: 0.85 },
      { muscleId: 'brachioradialis', role: 'agonist',    weight: 0.55 },
      { muscleId: 'triceps_brachii', role: 'antagonist', weight: 0.30 },
    ],
  },
  {
    movementId: 'shoulder_flexion', regionBase: 'shoulder',
    band: { min: 20, peak: 110, max: 180 },
    muscles: [
      { muscleId: 'deltoid_anterior',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'pectoralis_major',  role: 'agonist',    weight: 0.55, region: 'trunk' },
      { muscleId: 'serratus_anterior', role: 'agonist',    weight: 0.45, region: 'trunk' },
      { muscleId: 'trapezius_lower',   role: 'stabilizer', weight: 0.40, region: 'trunk' },
      { muscleId: 'latissimus_dorsi',  role: 'antagonist', weight: 0.30, region: 'trunk' },
    ],
  },
  {
    movementId: 'shoulder_abduction', regionBase: 'shoulder',
    band: { min: 15, peak: 95, max: 180 },
    muscles: [
      { muscleId: 'deltoid_lateral',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'supraspinatus',    role: 'agonist',    weight: 0.7 },
      { muscleId: 'trapezius_upper',  role: 'stabilizer', weight: 0.5, region: 'neck' },
      { muscleId: 'serratus_anterior',role: 'stabilizer', weight: 0.4, region: 'trunk' },
    ],
  },
  {
    movementId: 'shoulder_external_rotation', regionBase: 'shoulder',
    band: { min: 10, peak: 50, max: 90 },
    muscles: [
      { muscleId: 'infraspinatus',     role: 'agonist',    weight: 1.0 },
      { muscleId: 'teres_minor',       role: 'agonist',    weight: 0.8 },
      { muscleId: 'deltoid_posterior', role: 'agonist',    weight: 0.5 },
      { muscleId: 'subscapularis',     role: 'antagonist', weight: 0.3 },
    ],
  },
  {
    movementId: 'hip_flexion', regionBase: 'hip',
    band: { min: 20, peak: 80, max: 120 },
    muscles: [
      { muscleId: 'iliacus',        role: 'agonist',    weight: 1.0 },
      { muscleId: 'psoas_major',    role: 'agonist',    weight: 1.0 },
      { muscleId: 'rectus_femoris', role: 'agonist',    weight: 0.6, crossBase: 'knee' },
      { muscleId: 'sartorius',      role: 'agonist',    weight: 0.4 },
      { muscleId: 'gluteus_maximus',role: 'antagonist', weight: 0.3 },
    ],
  },
  {
    movementId: 'hip_extension', regionBase: 'hip',
    band: { min: 5, peak: 18, max: 30 },
    muscles: [
      { muscleId: 'gluteus_maximus', role: 'agonist',    weight: 1.0 },
      { muscleId: 'biceps_femoris',  role: 'agonist',    weight: 0.6, crossBase: 'knee' },
      { muscleId: 'semitendinosus',  role: 'agonist',    weight: 0.6, crossBase: 'knee' },
      { muscleId: 'erector_spinae',  role: 'stabilizer', weight: 0.4, region: 'trunk' },
      { muscleId: 'iliacus',         role: 'antagonist', weight: 0.25 },
    ],
  },
  {
    movementId: 'hip_abduction', regionBase: 'hip',
    band: { min: 8, peak: 30, max: 45 },
    muscles: [
      { muscleId: 'gluteus_medius',       role: 'agonist',    weight: 1.0 },
      { muscleId: 'gluteus_minimus',      role: 'agonist',    weight: 0.8 },
      { muscleId: 'tensor_fasciae_latae', role: 'agonist',    weight: 0.6 },
      { muscleId: 'adductor_longus',      role: 'antagonist', weight: 0.3 },
    ],
  },
  {
    movementId: 'knee_flexion', regionBase: 'knee',
    band: { min: 15, peak: 90, max: 135 },
    muscles: [
      { muscleId: 'biceps_femoris',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'semitendinosus',  role: 'agonist',    weight: 0.9 },
      { muscleId: 'semimembranosus', role: 'agonist',    weight: 0.8 },
      { muscleId: 'gastrocnemius',   role: 'agonist',    weight: 0.4, crossBase: 'ankle' },
      { muscleId: 'rectus_femoris',  role: 'antagonist', weight: 0.35 },
      { muscleId: 'vastus_lateralis',role: 'antagonist', weight: 0.30 },
    ],
  },
  {
    movementId: 'ankle_plantarflexion', regionBase: 'ankle',
    band: { min: 10, peak: 35, max: 50 },
    muscles: [
      { muscleId: 'gastrocnemius',     role: 'agonist',    weight: 1.0 },
      { muscleId: 'soleus',            role: 'agonist',    weight: 0.9 },
      { muscleId: 'tibialis_anterior', role: 'antagonist', weight: 0.25 },
    ],
  },
  {
    movementId: 'ankle_dorsiflexion', regionBase: 'ankle',
    band: { min: 5, peak: 14, max: 20 },
    muscles: [
      { muscleId: 'tibialis_anterior', role: 'agonist',    weight: 1.0 },
      { muscleId: 'gastrocnemius',     role: 'antagonist', weight: 0.3 },
    ],
  },
  {
    movementId: 'trunk_flexion', regionBase: 'trunk', central: true,
    band: { min: 10, peak: 45, max: 70 },
    muscles: [
      { muscleId: 'rectus_abdominis', role: 'agonist',    weight: 1.0 },
      { muscleId: 'external_oblique', role: 'agonist',    weight: 0.6 },
      { muscleId: 'erector_spinae',   role: 'antagonist', weight: 0.4 },
    ],
  },
  {
    movementId: 'trunk_extension', regionBase: 'trunk', central: true,
    band: { min: 5, peak: 22, max: 40 },
    muscles: [
      { muscleId: 'erector_spinae',   role: 'agonist',    weight: 1.0 },
      { muscleId: 'multifidus',       role: 'agonist',    weight: 0.7 },
      { muscleId: 'rectus_abdominis', role: 'antagonist', weight: 0.4 },
    ],
  },
]

const SIDED_MOVEMENTS = MOVEMENT_RULES.filter((r) => !r.central)
const CENTRAL_MOVEMENTS = MOVEMENT_RULES.filter((r) => r.central)

const STILL_DEG_PER_S = 8

function regionFor(base: MovementRule['regionBase'], side: 'L' | 'R'): SymmetryRegion {
  if (base === 'trunk') return 'trunk'
  if (base === 'neck')  return 'neck'
  const prefix = side === 'L' ? 'left' : 'right'
  return `${prefix}_${base}` as SymmetryRegion
}

/** Gaussian band weight centred at peak across [min,max]. */
function bandWeight(deg: number, min: number, max: number, peak: number): number {
  if (deg < min) return 0
  const sigma = (max - min) / 3.2
  const x = (deg - peak) / sigma
  return Math.max(0, Math.min(1, Math.exp(-(x * x) / 2)))
}

/** Role × phase factor — eccentric work still counts; antagonists co-contract. */
function roleFactor(role: MuscleRole, phase: MovePhase): number {
  if (role === 'agonist') {
    return phase === 'concentric' ? 1.0 : phase === 'eccentric' ? 0.8 : 0.65
  }
  if (role === 'antagonist') {
    // Antagonists are most active eccentrically (decelerating the limb).
    return phase === 'eccentric' ? 0.5 : 0.25
  }
  return 0.55   // stabilizer: steady postural tone while the limb is loaded
}

/**
 * Stateful engine — construct once per live session, call update() each frame.
 * Tracks per-joint angular velocity to infer movement phase.
 */
export class LiveActivationEngine {
  private tracker = new OrientationTracker()
  private prevAngle = new Map<string, number>()
  private prevT = new Map<string, number>()
  private vel = new Map<string, number>()        // smoothed deg/s

  update(lms: LandmarkSet, tMs: number): LiveFrame {
    const orientation = this.tracker.update(lms)
    const acc = new Map<string, LiveMuscleActivation>()
    const readings: JointLiveReading[] = []

    const evalMovement = (rule: MovementRule, side: 'L' | 'R') => {
      const r = readJointMovement(rule.movementId, lms, side, { orientation })
      if (!r) return
      const key = `${rule.movementId}:${side}`

      // Angular velocity (deg/s), low-passed.
      const pa = this.prevAngle.get(key)
      const pt = this.prevT.get(key)
      let v = this.vel.get(key) ?? 0
      if (pa !== undefined && pt !== undefined) {
        const dt = Math.max(1e-3, (tMs - pt) / 1000)
        v = 0.6 * v + 0.4 * ((r.raw - pa) / dt)
      }
      this.prevAngle.set(key, r.raw)
      this.prevT.set(key, tMs)
      this.vel.set(key, v)

      const phase: MovePhase =
        Math.abs(v) < STILL_DEG_PER_S ? 'isometric' : v > 0 ? 'concentric' : 'eccentric'

      const bw = bandWeight(r.value, rule.band.min, rule.band.max, rule.band.peak)
      if (bw < 0.02 || r.confidence < 0.25) {
        // Still surface a (low-activation) reading for the ROM HUD.
        readings.push({
          movementId: rule.movementId, side, angle: r.value,
          romFrac: romFraction(rule.movementId, r.value) ?? 0,
          confidence: r.confidence, phase,
        })
        return
      }

      // Effort: deeper into range = more demand. Plus a mild velocity boost.
      const rf = romFraction(rule.movementId, r.value) ?? bw
      const effort = 0.4 + 0.6 * Math.min(1, rf)
      const velBoost = 1 + Math.min(0.25, Math.abs(v) / 400)

      for (const m of rule.muscles) {
        const level = Math.max(0, Math.min(1,
          bw * m.weight * roleFactor(m.role, phase) * effort * velBoost * r.confidence,
        ))
        if (level < 0.03) continue
        const region = m.region ?? regionFor(m.crossBase ?? rule.regionBase, side)
        const mapKey = `${m.muscleId}:${region}`
        const prev = acc.get(mapKey)
        if (!prev || prev.level < level) {
          acc.set(mapKey, {
            muscleId: m.muscleId, region, level,
            role: m.role, phase, side,
          })
        }
      }

      readings.push({
        movementId: rule.movementId, side, angle: r.value,
        romFrac: rf, confidence: r.confidence, phase,
      })
    }

    for (const rule of SIDED_MOVEMENTS) { evalMovement(rule, 'L'); evalMovement(rule, 'R') }
    for (const rule of CENTRAL_MOVEMENTS) { evalMovement(rule, 'R') }   // central: use R as carrier

    return {
      activations: [...acc.values()].sort((a, b) => b.level - a.level),
      readings,
      orientation,
    }
  }

  reset(): void {
    this.tracker.reset()
    this.prevAngle.clear(); this.prevT.clear(); this.vel.clear()
  }
}

/** Left/right ROM asymmetry per joint base for the HUD (0..1, 0 = symmetric). */
export interface AsymmetryRow { jointBase: string; left: number; right: number; asym: number }

export function summariseAsymmetry(readings: JointLiveReading[]): AsymmetryRow[] {
  const byBase = new Map<string, { L?: number; R?: number }>()
  for (const r of readings) {
    const base = r.movementId
    const cur = byBase.get(base) ?? {}
    cur[r.side] = Math.max(cur[r.side] ?? 0, r.angle)
    byBase.set(base, cur)
  }
  const rows: AsymmetryRow[] = []
  for (const [base, v] of byBase) {
    if (v.L === undefined || v.R === undefined) continue
    const m = Math.max(v.L, v.R, 1e-6)
    rows.push({ jointBase: base, left: v.L, right: v.R, asym: Math.abs(v.L - v.R) / m })
  }
  return rows.sort((a, b) => b.asym - a.asym)
}
