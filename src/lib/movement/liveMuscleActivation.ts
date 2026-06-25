/**
 * liveMuscleActivation.ts
 *
 * Engine behind the Live Muscle Twin. Estimates, in real time and on-device,
 * how hard each muscle is working, and drives the 3-D atlas's COLOUR (dim
 * baseline at rest → deep red under load).
 *
 * Design principles (v2 — after the "everything flickers while standing" fix)
 * ──────────────────────────────────────────────────────────────────────────
 *   1. ISOMETRIC BASELINE. At rest every muscle sits at a low, calm baseline
 *      tone (postural/isometric). Nothing flickers when you stand still.
 *   2. MOVEMENT DRIVES ACTIVATION. A muscle only brightens above baseline when
 *      its joint is actually (a) away from neutral and/or (b) moving. We blend
 *      ROM-deviation with smoothed angular velocity, so a slow hold deep in
 *      range still reads as work, and a fast rep reads as more.
 *   3. SMOOTH ENVELOPE. Every muscle's displayed level is low-passed with a
 *      fast attack / slow decay, so activation glows and fades instead of
 *      strobing on per-frame pose noise.
 *   4. LOAD SCALING. External load (a dumbbell the camera sees, estimated by
 *      Claude vision — see loadEstimator.ts) multiplies agonist effort, because
 *      the same motion under load means much higher activation. Without a known
 *      load we assume bodyweight (factor 1).
 *
 * It is a kinesiology estimate for biofeedback/education, not EMG. Absolute
 * magnitude under load is approximate; an EMG sleeve would be the ground-truth
 * upgrade and can feed the same twin.
 */

import type { LandmarkSet } from './landmarks'
import { readJointMovement } from './muscleJointMap'
import { OrientationTracker, type OrientationEstimate } from './bodyOrientation'
import { romFraction } from './constraints'
import type { MuscleActivation } from './muscleActivation'
import type { SymmetryRegion } from '../insights/symmetry'
import type { ActivationPattern } from './activationPriors'

type MovePhase = 'concentric' | 'eccentric' | 'isometric'
type MuscleRole = 'agonist' | 'antagonist' | 'stabilizer'

/** Richer activation record (superset of MuscleActivation for the viewer). */
export interface LiveMuscleActivation extends MuscleActivation {
  role:  MuscleRole
  phase: MovePhase
  side:  'L' | 'R' | 'C'
}

/** Per-joint live reading surfaced to the ROM radar + asymmetry meter. */
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
  /** Overall movement energy 0..1 (0 = perfectly still). Drives "you're moving" UI. */
  movementEnergy: number
}

/** External load (kg) the user is holding, per hand. 0 = bodyweight only. */
export interface LoadInput { leftKg?: number; rightKg?: number }

// ─────────────────────────────────────────────────────────────────────────────
//  Kinesiology table (unchanged structure; see v1 notes)
// ─────────────────────────────────────────────────────────────────────────────

interface MuscleRule {
  muscleId: string
  role:     MuscleRole
  weight:   number
  region?:  SymmetryRegion
  crossBase?: 'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle'
}

interface MovementRule {
  movementId: string
  regionBase: 'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle' | 'neck' | 'trunk'
  band:       { min: number; peak: number; max: number }
  muscles:    MuscleRule[]
  central?:   boolean
}

const MOVEMENT_RULES: MovementRule[] = [
  { movementId: 'elbow_flexion', regionBase: 'elbow', band: { min: 15, peak: 95, max: 150 },
    muscles: [
      { muscleId: 'biceps_brachii',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'brachialis',      role: 'agonist',    weight: 0.85 },
      { muscleId: 'brachioradialis', role: 'agonist',    weight: 0.55 },
      { muscleId: 'triceps_brachii', role: 'antagonist', weight: 0.30 },
    ] },
  { movementId: 'shoulder_flexion', regionBase: 'shoulder', band: { min: 20, peak: 110, max: 180 },
    muscles: [
      { muscleId: 'deltoid_anterior',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'pectoralis_major',  role: 'agonist',    weight: 0.55, region: 'trunk' },
      { muscleId: 'serratus_anterior', role: 'agonist',    weight: 0.45, region: 'trunk' },
      { muscleId: 'trapezius_lower',   role: 'stabilizer', weight: 0.40, region: 'trunk' },
      { muscleId: 'latissimus_dorsi',  role: 'antagonist', weight: 0.30, region: 'trunk' },
    ] },
  { movementId: 'shoulder_abduction', regionBase: 'shoulder', band: { min: 15, peak: 95, max: 180 },
    muscles: [
      { muscleId: 'deltoid_lateral',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'supraspinatus',    role: 'agonist',    weight: 0.7 },
      { muscleId: 'trapezius_upper',  role: 'stabilizer', weight: 0.5, region: 'neck' },
      { muscleId: 'serratus_anterior',role: 'stabilizer', weight: 0.4, region: 'trunk' },
    ] },
  { movementId: 'shoulder_external_rotation', regionBase: 'shoulder', band: { min: 10, peak: 50, max: 90 },
    muscles: [
      { muscleId: 'infraspinatus',     role: 'agonist',    weight: 1.0 },
      { muscleId: 'teres_minor',       role: 'agonist',    weight: 0.8 },
      { muscleId: 'deltoid_posterior', role: 'agonist',    weight: 0.5 },
      { muscleId: 'subscapularis',     role: 'antagonist', weight: 0.3 },
    ] },
  { movementId: 'hip_flexion', regionBase: 'hip', band: { min: 20, peak: 80, max: 120 },
    muscles: [
      { muscleId: 'iliacus',        role: 'agonist',    weight: 1.0 },
      { muscleId: 'psoas_major',    role: 'agonist',    weight: 1.0 },
      { muscleId: 'rectus_femoris', role: 'agonist',    weight: 0.6, crossBase: 'knee' },
      { muscleId: 'sartorius',      role: 'agonist',    weight: 0.4 },
      { muscleId: 'gluteus_maximus',role: 'antagonist', weight: 0.3 },
    ] },
  { movementId: 'hip_extension', regionBase: 'hip', band: { min: 5, peak: 18, max: 30 },
    muscles: [
      { muscleId: 'gluteus_maximus', role: 'agonist',    weight: 1.0 },
      { muscleId: 'biceps_femoris',  role: 'agonist',    weight: 0.6, crossBase: 'knee' },
      { muscleId: 'semitendinosus',  role: 'agonist',    weight: 0.6, crossBase: 'knee' },
      { muscleId: 'erector_spinae',  role: 'stabilizer', weight: 0.4, region: 'trunk' },
      { muscleId: 'iliacus',         role: 'antagonist', weight: 0.25 },
    ] },
  { movementId: 'hip_abduction', regionBase: 'hip', band: { min: 8, peak: 30, max: 45 },
    muscles: [
      { muscleId: 'gluteus_medius',       role: 'agonist',    weight: 1.0 },
      { muscleId: 'gluteus_minimus',      role: 'agonist',    weight: 0.8 },
      { muscleId: 'tensor_fasciae_latae', role: 'agonist',    weight: 0.6 },
      { muscleId: 'adductor_longus',      role: 'antagonist', weight: 0.3 },
    ] },
  { movementId: 'knee_flexion', regionBase: 'knee', band: { min: 15, peak: 90, max: 135 },
    muscles: [
      { muscleId: 'biceps_femoris',  role: 'agonist',    weight: 1.0 },
      { muscleId: 'semitendinosus',  role: 'agonist',    weight: 0.9 },
      { muscleId: 'semimembranosus', role: 'agonist',    weight: 0.8 },
      { muscleId: 'gastrocnemius',   role: 'agonist',    weight: 0.4, crossBase: 'ankle' },
      { muscleId: 'rectus_femoris',  role: 'antagonist', weight: 0.35 },
      { muscleId: 'vastus_lateralis',role: 'antagonist', weight: 0.30 },
    ] },
  { movementId: 'ankle_plantarflexion', regionBase: 'ankle', band: { min: 10, peak: 35, max: 50 },
    muscles: [
      { muscleId: 'gastrocnemius',     role: 'agonist',    weight: 1.0 },
      { muscleId: 'soleus',            role: 'agonist',    weight: 0.9 },
      { muscleId: 'tibialis_anterior', role: 'antagonist', weight: 0.25 },
    ] },
  { movementId: 'ankle_dorsiflexion', regionBase: 'ankle', band: { min: 5, peak: 14, max: 20 },
    muscles: [
      { muscleId: 'tibialis_anterior', role: 'agonist',    weight: 1.0 },
      { muscleId: 'gastrocnemius',     role: 'antagonist', weight: 0.3 },
    ] },
  { movementId: 'trunk_flexion', regionBase: 'trunk', central: true, band: { min: 10, peak: 45, max: 70 },
    muscles: [
      { muscleId: 'rectus_abdominis', role: 'agonist',    weight: 1.0 },
      { muscleId: 'external_oblique', role: 'agonist',    weight: 0.6 },
      { muscleId: 'erector_spinae',   role: 'antagonist', weight: 0.4 },
    ] },
  { movementId: 'trunk_extension', regionBase: 'trunk', central: true, band: { min: 5, peak: 22, max: 40 },
    muscles: [
      { muscleId: 'erector_spinae',   role: 'agonist',    weight: 1.0 },
      { muscleId: 'multifidus',       role: 'agonist',    weight: 0.7 },
      { muscleId: 'rectus_abdominis', role: 'antagonist', weight: 0.4 },
    ] },
  // ── Neck / head (gives the head-neck section real activation data) ──────────
  { movementId: 'cervical_rotation_left', regionBase: 'neck', central: true, band: { min: 10, peak: 45, max: 70 },
    muscles: [
      { muscleId: 'sternocleidomastoid', role: 'agonist',    weight: 1.0 },
      { muscleId: 'splenius_capitis',    role: 'agonist',    weight: 0.6 },
      { muscleId: 'trapezius_upper',     role: 'stabilizer', weight: 0.5 },
    ] },
  { movementId: 'cervical_rotation_right', regionBase: 'neck', central: true, band: { min: 10, peak: 45, max: 70 },
    muscles: [
      { muscleId: 'sternocleidomastoid', role: 'agonist',    weight: 1.0 },
      { muscleId: 'splenius_capitis',    role: 'agonist',    weight: 0.6 },
      { muscleId: 'trapezius_upper',     role: 'stabilizer', weight: 0.5 },
    ] },
  { movementId: 'cervical_flexion', regionBase: 'neck', central: true, band: { min: 8, peak: 30, max: 55 },
    muscles: [
      { muscleId: 'sternocleidomastoid', role: 'agonist',    weight: 1.0 },
      { muscleId: 'scalenus',            role: 'agonist',    weight: 0.5 },
    ] },
]

const SIDED_MOVEMENTS   = MOVEMENT_RULES.filter((r) => !r.central)
const CENTRAL_MOVEMENTS = MOVEMENT_RULES.filter((r) =>  r.central)

// ── Tuning ───────────────────────────────────────────────────────────────────
const BASELINE        = 0.12   // calm isometric tone for every muscle at rest
const VEL_DEADBAND    = 12      // deg/s below which a joint is "still" (no drive)
const VEL_REF         = 130     // deg/s mapping to full movement energy
const STILL_DEG_PER_S = 10      // |vel| below this → isometric phase
const ATTACK          = 0.45    // envelope rise (fast — muscle lights quickly)
const DECAY           = 0.08    // envelope fall (slow — fades like a real glow)
const LOAD_PER_KG     = 0.05    // each kg adds 5% agonist effort (per hand)
const LOAD_MAX        = 2.2     // cap the load multiplier

function regionFor(base: MovementRule['regionBase'], side: 'L' | 'R'): SymmetryRegion {
  if (base === 'trunk') return 'trunk'
  if (base === 'neck')  return 'neck'
  return `${side === 'L' ? 'left' : 'right'}_${base}` as SymmetryRegion
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)) }

function roleFactor(role: MuscleRole, phase: MovePhase): number {
  if (role === 'agonist')    return phase === 'concentric' ? 1.0 : phase === 'eccentric' ? 0.85 : 0.7
  if (role === 'antagonist') return phase === 'eccentric' ? 0.45 : 0.22
  return 0.5   // stabilizer
}

/** Unique muscle key (a muscle can appear in multiple movements / regions). */
function muscleKey(muscleId: string, region: SymmetryRegion): string {
  return `${muscleId}:${region}`
}

export class LiveActivationEngine {
  private tracker = new OrientationTracker()
  private prevAngle = new Map<string, number>()
  private prevT     = new Map<string, number>()
  private vel       = new Map<string, number>()     // smoothed deg/s per joint
  private level     = new Map<string, number>()     // smoothed displayed level per muscle
  private meta      = new Map<string, { muscleId: string; region: SymmetryRegion; role: MuscleRole; phase: MovePhase; side: 'L'|'R'|'C' }>()

  update(lms: LandmarkSet, tMs: number, load: LoadInput = {}, prior?: ActivationPattern | null): LiveFrame {
    const orientation = this.tracker.update(lms)
    const readings: JointLiveReading[] = []

    // Target activation accumulator (max wins across movements per muscle).
    const target = new Map<string, number>()
    let energyAccum = 0
    let energyCount = 0

    const loadFactor = (side: 'L' | 'R'): number => {
      const kg = side === 'L' ? (load.leftKg ?? 0) : (load.rightKg ?? 0)
      return Math.min(LOAD_MAX, 1 + Math.max(0, kg) * LOAD_PER_KG)
    }

    const evalMovement = (rule: MovementRule, side: 'L' | 'R') => {
      const r = readJointMovement(rule.movementId, lms, side, { orientation })
      if (!r) return
      const key = `${rule.movementId}:${side}`

      // Angular velocity (deg/s), low-passed.
      const pa = this.prevAngle.get(key); const pt = this.prevT.get(key)
      let v = this.vel.get(key) ?? 0
      if (pa !== undefined && pt !== undefined) {
        const dt = Math.max(1e-3, (tMs - pt) / 1000)
        v = 0.55 * v + 0.45 * ((r.raw - pa) / dt)
      }
      this.prevAngle.set(key, r.raw); this.prevT.set(key, tMs); this.vel.set(key, v)

      const speed = Math.abs(v)
      const phase: MovePhase = speed < STILL_DEG_PER_S ? 'isometric' : v > 0 ? 'concentric' : 'eccentric'

      // Movement energy (deadbanded so standing noise reads as zero).
      const movEnergy = speed < VEL_DEADBAND ? 0 : clamp01((speed - VEL_DEADBAND) / VEL_REF)
      // Deviation from neutral within the normal range.
      const dev = clamp01(romFraction(rule.movementId, r.value) ?? 0)
      // Combined drive (only rises with real motion / range). Confidence-gated.
      const drive = clamp01(0.55 * dev + 0.75 * movEnergy) * clamp01(r.confidence + 0.15)

      if (r.confidence > 0.3) { energyAccum += movEnergy; energyCount += 1 }

      const lf = loadFactor(side)

      for (const m of rule.muscles) {
        const region = m.region ?? regionFor(m.crossBase ?? rule.regionBase, side)
        const k = muscleKey(m.muscleId, region)
        // Agonists scale with external load; antagonists/stabilizers less so.
        const loadScale = m.role === 'agonist' ? lf : 1 + (lf - 1) * 0.4
        const t = clamp01(drive * m.weight * roleFactor(m.role, phase) * loadScale)
        const prev = target.get(k) ?? 0
        if (t > prev) {
          target.set(k, t)
          this.meta.set(k, { muscleId: m.muscleId, region, role: m.role, phase, side })
        } else if (!this.meta.has(k)) {
          this.meta.set(k, { muscleId: m.muscleId, region, role: m.role, phase, side })
        }
      }

      readings.push({
        movementId: rule.movementId, side, angle: r.value,
        romFrac: dev, confidence: r.confidence, phase,
      })
    }

    for (const rule of SIDED_MOVEMENTS)   { evalMovement(rule, 'L'); evalMovement(rule, 'R') }
    for (const rule of CENTRAL_MOVEMENTS) {
      // Cervical rotation is side-specific; trunk/flexion are side-agnostic.
      const side: 'L' | 'R' = rule.movementId.includes('left') ? 'L'
        : rule.movementId.includes('right') ? 'R' : 'R'
      evalMovement(rule, side)
    }

    // Movement energy first, so the exercise prior can scale with how hard the
    // user is actually moving.
    const movementEnergy = energyCount ? clamp01(energyAccum / energyCount) : 0
    // Exercise prior: when a known exercise is active, drive its canonical
    // muscles toward their literature/MinT peak, scaled by movement energy.
    const priorScale = prior ? clamp01(0.15 + movementEnergy * 1.4) : 0

    // Envelope-smooth every known muscle toward (baseline + drive*(1-baseline)),
    // so muscles that aren't driven this frame decay back to the calm baseline.
    const activations: LiveMuscleActivation[] = []
    const applyEnvelope = (k: string, driveTarget: number) => {
      const finalTarget = BASELINE + driveTarget * (1 - BASELINE)
      const cur = this.level.get(k) ?? BASELINE
      const a = finalTarget > cur ? ATTACK : DECAY
      const next = cur + (finalTarget - cur) * a
      this.level.set(k, next)
      const meta = this.meta.get(k)
      if (meta) {
        activations.push({
          muscleId: meta.muscleId, region: meta.region, level: next,
          role: meta.role, phase: meta.phase, side: meta.side,
        })
      }
    }
    // One pass over every muscle seen this frame, decaying, or in the prior;
    // blend the geometric estimate with the exercise prior (max wins).
    const allKeys = new Set<string>([...this.level.keys(), ...this.meta.keys(), ...target.keys()])
    for (const k of allKeys) {
      let drive = target.get(k) ?? 0
      if (prior) {
        const meta = this.meta.get(k)
        const p = meta ? prior[meta.muscleId] : undefined
        if (p !== undefined) drive = Math.max(drive, p * priorScale)
      }
      applyEnvelope(k, drive)
    }

    return {
      activations: activations.sort((a, b) => b.level - a.level),
      readings,
      orientation,
      movementEnergy,
    }
  }

  reset(): void {
    this.tracker.reset()
    this.prevAngle.clear(); this.prevT.clear(); this.vel.clear()
    this.level.clear(); this.meta.clear()
  }
}

// ── Asymmetry summary (unchanged) ─────────────────────────────────────────────

export interface AsymmetryRow { jointBase: string; left: number; right: number; asym: number }

export function summariseAsymmetry(readings: JointLiveReading[]): AsymmetryRow[] {
  const byBase = new Map<string, { L?: number; R?: number }>()
  for (const r of readings) {
    const cur = byBase.get(r.movementId) ?? {}
    cur[r.side] = Math.max(cur[r.side] ?? 0, r.angle)
    byBase.set(r.movementId, cur)
  }
  const rows: AsymmetryRow[] = []
  for (const [base, v] of byBase) {
    if (v.L === undefined || v.R === undefined) continue
    const m = Math.max(v.L, v.R, 1e-6)
    rows.push({ jointBase: base, left: v.L, right: v.R, asym: Math.abs(v.L - v.R) / m })
  }
  return rows.sort((a, b) => b.asym - a.asym)
}
