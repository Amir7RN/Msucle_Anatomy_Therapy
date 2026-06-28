/**
 * personalization.ts
 *
 * THE BRIDGE. This is the piece that turns a one-size template into something
 * that behaves like a physical therapist who knows YOU. It takes the static
 * `UserProfile` and derives a `PersonalizationModel` — a small set of
 * multipliers and per-region capacities that the fatigue engine
 * (`muscleStatus.ts`) and the exercise prescription read from.
 *
 * Why this matters (the user's own example)
 * ─────────────────────────────────────────
 * A young adult, an 80-year-old, and a bodybuilder doing the SAME joint motion
 * are not under the same physiological load. A bodybuilder's "hard" is the
 * deconditioned beginner's "impossible". A real PT calibrates intensity and
 * reads fatigue against the person in front of them; a fixed FATIGUE_GAIN
 * constant cannot. Here we make those constants a function of:
 *
 *   • AGE          — recovery rate and connective-tissue resilience fall with
 *                    age; older users fatigue sooner and recover slower.
 *   • FITNESS      — training age raises work capacity and fatigue resistance.
 *   • COMPOSITION  — more lean mass (higher muscleIndex) = more capacity; a
 *                    higher fat fraction adds a small cardiometabolic cost.
 *   • INJURY       — flagged regions get a load cap, a caution flag and a
 *                    faster perceived-fatigue curve so we back off early.
 *   • MEASURED BASELINE — the engine still adapts to the user's own fresh ROM
 *                    each session; this model sets the STARTING expectation so
 *                    the very first reps are already calibrated, not generic.
 *
 * Everything is bounded and reduces to the legacy constants when no real
 * profile exists (so guests behave exactly as before).
 */

import type { SymmetryRegion } from '../insights/symmetry'
import {
  type UserProfile, type FitnessLevel, type InjurySeverity, ageBand,
} from './userProfile'

// ── Output shape ───────────────────────────────────────────────────────────

export interface RegionCapacity {
  /** Work capacity vs a reference adult, ~0.5 (frail) … ~1.6 (athlete).
   *  The fatigue engine divides drain by this: higher = more endurance. */
  capacity: number
  /** True if this region is flagged injured/painful — UI shows caution. */
  caution:  boolean
  /** External-load ceiling 0..1 for this region (1 = no restriction). */
  loadCap:  number
}

export interface PersonalizationModel {
  /** Global multiplier on how fast the fatigue battery drains (>1 = sooner). */
  fatigueGainMul:  number
  /** Global multiplier on how fast it recharges at rest (>1 = faster). */
  recoveryRateMul: number
  /** Effort calibration: scales the intensity the engine *perceives* for a
   *  given motion. Deconditioned users read higher effort for the same move. */
  effortScale:     number
  /** Per-region capacity + caution + load ceiling. */
  region: Record<SymmetryRegion, RegionCapacity>
  /** Suggested rep-target multiplier vs the default (10). */
  repScale:        number
  /** Suggested intensity ceiling 0..1 (how hard we let the plan push). */
  intensityScale:  number
  /** Suggested inter-set rest multiplier (older/deconditioned rest longer). */
  restScale:       number
  /** Plain-language "why" lines, surfaced to the user for trust. */
  rationale:       string[]
  /** False when derived from defaults (guest / no profile). */
  personalized:    boolean
}

const ALL_REGIONS: SymmetryRegion[] = [
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'neck', 'trunk',
]

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

// ── Component curves ─────────────────────────────────────────────────────────

/** Age → {fatigue-gain, recovery, capacity, rest} multipliers. */
function ageFactors(age: number | null) {
  switch (ageBand(age)) {
    case 'youth':        return { gain: 0.92, recovery: 1.18, capacity: 1.02, rest: 0.9 }
    case 'young_adult':  return { gain: 0.95, recovery: 1.12, capacity: 1.05, rest: 0.95 }
    case 'adult':        return { gain: 1.00, recovery: 1.00, capacity: 1.00, rest: 1.0 }
    case 'midlife':      return { gain: 1.12, recovery: 0.88, capacity: 0.92, rest: 1.15 }
    case 'senior':       return { gain: 1.30, recovery: 0.74, capacity: 0.80, rest: 1.4 }
    default:             return { gain: 1.00, recovery: 1.00, capacity: 1.00, rest: 1.0 }
  }
}

/** Fitness level → multipliers. The dominant lever for "hard". */
function fitnessFactors(level: FitnessLevel) {
  switch (level) {
    case 'sedentary':    return { gain: 1.28, recovery: 0.82, capacity: 0.70, effort: 1.25, reps: 0.7, intensity: 0.55 }
    case 'beginner':     return { gain: 1.12, recovery: 0.92, capacity: 0.85, effort: 1.10, reps: 0.85, intensity: 0.70 }
    case 'intermediate': return { gain: 1.00, recovery: 1.00, capacity: 1.00, effort: 1.00, reps: 1.0, intensity: 0.85 }
    case 'advanced':     return { gain: 0.88, recovery: 1.10, capacity: 1.25, effort: 0.90, reps: 1.15, intensity: 0.95 }
    case 'athlete':      return { gain: 0.78, recovery: 1.22, capacity: 1.45, effort: 0.82, reps: 1.3, intensity: 1.0 }
  }
}

/** Body composition → capacity/gain nudge. muscleIndex & bodyFat are 0..1 / %. */
function compositionFactors(muscleIndex: number | null, bodyFatPct: number | null) {
  let capacity = 1, gain = 1
  if (muscleIndex != null) {
    // muscleIndex 0.5 → -12% capacity, 1.0 → +18% capacity.
    capacity *= clamp(0.85 + muscleIndex * 0.35, 0.8, 1.25)
    gain     *= clamp(1.1 - muscleIndex * 0.22, 0.85, 1.15)
  }
  if (bodyFatPct != null) {
    // A higher fat fraction adds a small cardiometabolic fatigue cost.
    const over = clamp((bodyFatPct - 18) / 30, 0, 1)   // 18% ≈ neutral
    gain *= 1 + over * 0.18
  }
  return { capacity, gain }
}

function severityLoadCap(s: InjurySeverity): number {
  return s === 'severe' ? 0.35 : s === 'moderate' ? 0.6 : 0.8
}
function severityGain(s: InjurySeverity): number {
  // Injured tissue should read fatigue earlier so we back off sooner.
  return s === 'severe' ? 1.6 : s === 'moderate' ? 1.3 : 1.12
}

// ── The default (guest) model — equals the legacy constants ──────────────────

export function defaultPersonalization(): PersonalizationModel {
  const region = {} as Record<SymmetryRegion, RegionCapacity>
  for (const r of ALL_REGIONS) region[r] = { capacity: 1, caution: false, loadCap: 1 }
  return {
    fatigueGainMul: 1, recoveryRateMul: 1, effortScale: 1,
    region, repScale: 1, intensityScale: 0.85, restScale: 1,
    rationale: [], personalized: false,
  }
}

// ── Build the model from a profile ───────────────────────────────────────────

export function buildPersonalization(profile: UserProfile | null): PersonalizationModel {
  if (!profile || !profile.onboarded) return defaultPersonalization()

  const a = ageFactors(profile.ageYears)
  const f = fitnessFactors(profile.fitnessLevel)
  const c = compositionFactors(profile.composition.muscleIndex, profile.composition.bodyFatPct)

  const fatigueGainMul  = clamp(a.gain * f.gain * c.gain, 0.6, 2.0)
  const recoveryRateMul = clamp(a.recovery * f.recovery, 0.5, 1.6)
  const effortScale     = clamp(f.effort * (a.capacity < 1 ? 1.08 : 1), 0.7, 1.5)
  const baseCapacity    = clamp(a.capacity * f.capacity * c.capacity, 0.45, 1.7)

  // Per-region capacity starts at the global capacity, then injuries and the
  // worst length-asymmetry knock specific regions down.
  const region = {} as Record<SymmetryRegion, RegionCapacity>
  for (const r of ALL_REGIONS) region[r] = { capacity: baseCapacity, caution: false, loadCap: 1 }

  for (const inj of profile.injuries) {
    const cur = region[inj.region]
    if (!cur) continue
    cur.caution = true
    cur.loadCap = Math.min(cur.loadCap, severityLoadCap(inj.severity))
    cur.capacity = clamp(cur.capacity / severityGain(inj.severity), 0.3, 1.7)
  }

  // Measured-baseline hook: a flagged length-asymmetry region is treated as the
  // weaker side and gets a small capacity haircut so it fatigues a touch sooner
  // (prompting the user to favour it), consistent with the symmetry coaching.
  const asym = profile.scan.asymRegion
  if (asym && region[asym] && !region[asym].caution) {
    region[asym].capacity = clamp(region[asym].capacity * 0.9, 0.3, 1.7)
  }

  const rationale = buildRationale(profile, { fatigueGainMul, recoveryRateMul, baseCapacity })

  return {
    fatigueGainMul,
    recoveryRateMul,
    effortScale,
    region,
    repScale:       clamp(f.reps, 0.6, 1.4),
    intensityScale: clamp(f.intensity * (a.capacity < 0.9 ? 0.9 : 1), 0.4, 1.0),
    restScale:      clamp(a.rest * (profile.fitnessLevel === 'sedentary' ? 1.2 : 1), 0.8, 1.8),
    rationale,
    personalized:   true,
  }
}

function buildRationale(
  p: UserProfile,
  m: { fatigueGainMul: number; recoveryRateMul: number; baseCapacity: number },
): string[] {
  const out: string[] = []
  const band = ageBand(p.ageYears)
  if (p.ageYears != null) {
    if (band === 'senior')      out.push(`Age ${p.ageYears}: pacing reps and lengthening rest; fatigue is read earlier to keep you safe.`)
    else if (band === 'midlife') out.push(`Age ${p.ageYears}: slightly conservative recovery between efforts.`)
    else if (band === 'young_adult' || band === 'youth') out.push(`Age ${p.ageYears}: faster modeled recovery, so back-to-back sets are fine.`)
  }
  out.push(`Fitness level "${p.fitnessLevel}" sets your baseline work capacity (×${m.baseCapacity.toFixed(2)}).`)
  if (p.composition.muscleIndex != null) {
    out.push(`Body scan: ${p.composition.build ?? 'average'} build, ~${p.composition.bodyFatPct?.toFixed(0)}% body fat — used to set fatigue resistance.`)
  }
  if (p.injuries.length) {
    const names = p.injuries.map((i) => prettyRegion(i.region)).join(', ')
    out.push(`Protecting: ${names} — load is capped and these get a caution flag.`)
  }
  if (m.fatigueGainMul > 1.15) out.push('Overall: you fatigue sooner than average, so the plan is built to accumulate volume gradually.')
  else if (m.fatigueGainMul < 0.9) out.push('Overall: strong fatigue resistance — you can handle higher volume.')
  return out
}

export function prettyRegion(r: SymmetryRegion): string {
  const map: Record<SymmetryRegion, string> = {
    left_shoulder: 'Left shoulder', right_shoulder: 'Right shoulder',
    left_elbow: 'Left arm', right_elbow: 'Right arm',
    left_hip: 'Left hip/glute', right_hip: 'Right hip/glute',
    left_knee: 'Left thigh', right_knee: 'Right thigh',
    left_ankle: 'Left calf', right_ankle: 'Right calf',
    neck: 'Neck', trunk: 'Core / trunk',
  }
  return map[r] ?? r
}

/**
 * Personalised rep / hold prescription for an exercise, given the model.
 * Pure helper used by the exercise panel + program copy so a beginner and an
 * athlete don't see the same "10 reps".
 */
export function prescribe(model: PersonalizationModel, baseReps = 10): {
  reps: number; restSec: number; intensityPct: number
} {
  return {
    reps: Math.max(4, Math.round(baseReps * model.repScale)),
    restSec: Math.round(45 * model.restScale),
    intensityPct: Math.round(model.intensityScale * 100),
  }
}
