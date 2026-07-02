/**
 * muscleLoadEstimator.ts
 *
 * Turns parsed Apple Health workouts (appleHealthParser.ts) into a per-muscle-
 * group training-workload summary: 7-day and 28-day rolling averages, an
 * acute:chronic workload ratio (ACWR), and a balance classification per group.
 *
 * This is a fitness/training-load estimate — the same category of feature as
 * Strava's Relative Effort or Whoop's strain/load. It is NOT a medical or
 * diagnostic tool. All user-facing copy uses the project's training-balance
 * vocabulary (see health copy in HealthImportView).
 *
 * ── Sources of truth (no invented numbers) ───────────────────────────────────
 * Base metabolic intensity per activity (MET) is taken from the Compendium of
 * Physical Activities (Ainsworth et al., 2011 update) and cross-checked against
 * ACSM's Guidelines for Exercise Testing and Prescription (10th ed.). Per-group
 * emphasis vectors are seeded from the primary/secondary movers each activity
 * category is characterised by in standard exercise-science / surface-EMG
 * literature. See ACTIVITY_TABLE — every entry carries a `confidence` tag:
 *   - 'estimated'      well-characterised activity (running, cycling, ...)
 *   - 'broad'          composite / ambiguous category (crossTraining, other) —
 *                      a deliberately flat, conservative spread rather than a
 *                      guess at specifics; surfaced in the UI as a "broad
 *                      estimate" badge.
 *
 * Unknown activityKeys fall through to the conservative 'other' profile.
 */

import type { ParsedWorkout } from './appleHealthParser'

// ── Muscle groups ─────────────────────────────────────────────────────────────
// Nine major groups. `muscleIds` are the activation-vocabulary keys the 3D twin
// model colours by (same keys muscleActivation.ts / liveMuscleActivation.ts
// emit), so the health view can reuse the existing model unchanged. `assess`
// is a representative (muscleId, preferred side) whose getMovementsForMuscle()
// is non-empty — used to route a group into the existing AssessmentView.

export type MuscleGroupId =
  | 'chest' | 'back' | 'shoulders' | 'arms' | 'core'
  | 'glutes' | 'quads' | 'hamstrings' | 'calves'

export interface MuscleGroupDef {
  id:       MuscleGroupId
  label:    string
  /** Activation-vocabulary muscle ids that colour on the 3D twin model. */
  muscleIds: string[]
  /** Representative target for routing into the existing assessment flow. */
  assess:   { muscleId: string; muscleName: string }
}

export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  { id: 'chest',      label: 'Chest',
    muscleIds: ['pectoralis_major', 'serratus_anterior'],
    assess: { muscleId: 'pectoralis_major', muscleName: 'Chest' } },
  { id: 'back',       label: 'Back',
    muscleIds: ['latissimus_dorsi', 'trapezius', 'trapezius_upper', 'trapezius_middle', 'trapezius_lower', 'erector_spinae', 'rhomboid_major', 'infraspinatus'],
    assess: { muscleId: 'latissimus_dorsi', muscleName: 'Back' } },
  { id: 'shoulders',  label: 'Shoulders',
    muscleIds: ['deltoid', 'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior', 'supraspinatus'],
    assess: { muscleId: 'deltoid', muscleName: 'Shoulders' } },
  { id: 'arms',       label: 'Arms',
    muscleIds: ['biceps_brachii', 'triceps_brachii', 'brachialis', 'brachioradialis'],
    assess: { muscleId: 'biceps_brachii', muscleName: 'Arms' } },
  { id: 'core',       label: 'Core',
    muscleIds: ['rectus_abdominis', 'external_oblique', 'internal_oblique', 'multifidus'],
    assess: { muscleId: 'rectus_abdominis', muscleName: 'Core' } },
  { id: 'glutes',     label: 'Glutes',
    muscleIds: ['gluteus_maximus', 'gluteus_medius', 'gluteus_minimus', 'tensor_fasciae_latae'],
    assess: { muscleId: 'gluteus_medius', muscleName: 'Glutes' } },
  { id: 'quads',      label: 'Quads',
    muscleIds: ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius', 'sartorius'],
    assess: { muscleId: 'rectus_femoris', muscleName: 'Quads' } },
  { id: 'hamstrings', label: 'Hamstrings',
    muscleIds: ['biceps_femoris', 'semitendinosus', 'semimembranosus'],
    assess: { muscleId: 'biceps_femoris', muscleName: 'Hamstrings' } },
  { id: 'calves',     label: 'Calves',
    muscleIds: ['gastrocnemius', 'soleus', 'tibialis_anterior'],
    assess: { muscleId: 'gastrocnemius', muscleName: 'Calves' } },
]

const GROUP_IDS = MUSCLE_GROUPS.map((g) => g.id)

type EmphasisVec = Partial<Record<MuscleGroupId, number>>

interface ActivityProfile {
  /** Compendium (Ainsworth 2011) MET; used for the fallback intensity factor. */
  met: number
  /** Relative per-group emphasis 0..1 (primary movers ~1.0). */
  emphasis: EmphasisVec
  /** 'estimated' = well-characterised; 'broad' = conservative flat spread. */
  confidence: 'estimated' | 'broad'
}

// Even spread across all nine groups — used for composite/ambiguous categories.
function flat(value: number): EmphasisVec {
  const v: EmphasisVec = {}
  for (const g of GROUP_IDS) v[g] = value
  return v
}

/**
 * Activity -> (MET, per-group emphasis). Keyed by the normalised activityKey
 * from appleHealthParser (HK prefix stripped, first letter lower-cased).
 *
 * MET values: Compendium of Physical Activities (Ainsworth et al., 2011),
 * cross-checked with ACSM Guidelines (10th ed.). Emphasis vectors: primary and
 * secondary movers per activity category from standard exercise-science / EMG
 * references. Composite categories use flat() and are tagged 'broad'.
 */
const ACTIVITY_TABLE: Record<string, ActivityProfile> = {
  running: {
    met: 9.8, confidence: 'estimated',
    emphasis: { quads: 1.0, hamstrings: 0.9, calves: 0.9, glutes: 0.8, core: 0.4, back: 0.2, arms: 0.15, shoulders: 0.1, chest: 0.1 },
  },
  walking: {
    met: 3.5, confidence: 'estimated',
    emphasis: { calves: 0.7, quads: 0.6, hamstrings: 0.5, glutes: 0.5, core: 0.3, back: 0.15 },
  },
  cycling: {
    met: 7.5, confidence: 'estimated',
    emphasis: { quads: 1.0, glutes: 0.7, hamstrings: 0.6, calves: 0.5, core: 0.3, back: 0.2 },
  },
  swimming: {
    met: 7.0, confidence: 'estimated',
    emphasis: { back: 0.9, shoulders: 0.9, chest: 0.6, core: 0.6, arms: 0.5, glutes: 0.4, quads: 0.3, hamstrings: 0.3, calves: 0.2 },
  },
  rowing: {
    met: 7.0, confidence: 'estimated',
    emphasis: { back: 0.9, quads: 0.7, glutes: 0.7, core: 0.6, arms: 0.6, shoulders: 0.6, hamstrings: 0.6, calves: 0.4, chest: 0.3 },
  },
  elliptical: {
    met: 5.0, confidence: 'estimated',
    emphasis: { quads: 0.8, glutes: 0.7, hamstrings: 0.6, calves: 0.6, core: 0.4, back: 0.3, arms: 0.3, shoulders: 0.3, chest: 0.2 },
  },
  traditionalStrengthTraining: {
    met: 5.0, confidence: 'estimated',
    emphasis: { chest: 0.7, back: 0.7, shoulders: 0.7, arms: 0.7, glutes: 0.7, quads: 0.7, core: 0.6, hamstrings: 0.6, calves: 0.4 },
  },
  functionalStrengthTraining: {
    met: 5.5, confidence: 'estimated',
    emphasis: { core: 0.8, glutes: 0.7, shoulders: 0.6, back: 0.6, quads: 0.6, arms: 0.5, hamstrings: 0.5, chest: 0.4, calves: 0.4 },
  },
  highIntensityIntervalTraining: {
    met: 8.0, confidence: 'estimated',
    emphasis: { quads: 0.8, glutes: 0.8, core: 0.7, hamstrings: 0.6, calves: 0.6, shoulders: 0.5, chest: 0.5, arms: 0.5, back: 0.5 },
  },
  yoga: {
    met: 2.5, confidence: 'estimated',
    emphasis: { core: 0.7, shoulders: 0.6, back: 0.6, glutes: 0.5, quads: 0.5, hamstrings: 0.5, arms: 0.4, chest: 0.3, calves: 0.3 },
  },
  pilates: {
    met: 3.0, confidence: 'estimated',
    emphasis: { core: 1.0, glutes: 0.5, back: 0.5, hamstrings: 0.4, quads: 0.4, shoulders: 0.3 },
  },
  coreTraining: {
    met: 3.8, confidence: 'estimated',
    emphasis: { core: 1.0, back: 0.5, glutes: 0.4, shoulders: 0.3 },
  },
  stairClimbing: {
    met: 8.0, confidence: 'estimated',
    emphasis: { quads: 0.9, glutes: 0.9, hamstrings: 0.6, calves: 0.7, core: 0.3 },
  },
  hiking: {
    met: 6.0, confidence: 'estimated',
    emphasis: { quads: 0.8, glutes: 0.7, calves: 0.7, hamstrings: 0.6, core: 0.4, back: 0.3 },
  },
  jumpRope: {
    met: 11.0, confidence: 'estimated',
    emphasis: { calves: 1.0, quads: 0.6, hamstrings: 0.5, glutes: 0.5, core: 0.4, shoulders: 0.4 },
  },
  // ── Composite / ambiguous categories: conservative flat spread ──────────────
  crossTraining: { met: 6.0, confidence: 'broad', emphasis: flat(0.5) },
  mixedCardio:   { met: 6.0, confidence: 'broad', emphasis: flat(0.5) },
  other:         { met: 4.0, confidence: 'broad', emphasis: flat(0.4) },
}

function profileFor(activityKey: string): ActivityProfile {
  return ACTIVITY_TABLE[activityKey] ?? ACTIVITY_TABLE.other
}

// ── Intensity factor ──────────────────────────────────────────────────────────
// Prefer average heart rate when the export carries it. Without an age we can't
// compute true %HRR, so we map avg HR onto a moderate->hard band anchored at
// population-typical zone boundaries (~100 bpm easy, ~160 bpm hard). When HR is
// absent we fall back to the activity's Compendium MET.

const HR_EASY = 100
const HR_HARD = 160

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function intensityFactor(w: ParsedWorkout, activityMet: number): number {
  if (w.avgHeartRateBpm != null && w.avgHeartRateBpm > 40) {
    const zone = clamp((w.avgHeartRateBpm - HR_EASY) / (HR_HARD - HR_EASY), 0, 1)
    return 0.6 + zone * 0.9 // 0.6 (easy) .. 1.5 (hard)
  }
  // MET fallback: ~0.4 (very light) .. ~1.3 (vigorous).
  return clamp(activityMet / 8, 0.4, 1.3)
}

// ── Per-day, per-group load ───────────────────────────────────────────────────

const DAY_MS = 86_400_000
const dayKey = (iso: string) => iso.slice(0, 10)

export interface WorkoutLoad {
  workout: ParsedWorkout
  /** duration_min * intensity_factor. */
  loadW: number
  intensity: number
  confidence: 'estimated' | 'broad'
  /** load distributed across groups (loadW * emphasis). */
  groupLoad: EmphasisVec
}

/** Step 2-4: compute per-workout intensity, load, and group distribution. */
export function computeWorkoutLoads(workouts: ParsedWorkout[]): WorkoutLoad[] {
  return workouts.map((w) => {
    const prof = profileFor(w.activityKey)
    const intensity = intensityFactor(w, prof.met)
    const loadW = w.durationMin * intensity
    const groupLoad: EmphasisVec = {}
    for (const g of GROUP_IDS) {
      const e = prof.emphasis[g] ?? 0
      if (e > 0) groupLoad[g] = loadW * e
    }
    return { workout: w, loadW, intensity, confidence: prof.confidence, groupLoad }
  })
}

// ── Classification ────────────────────────────────────────────────────────────

export type LoadClass = 'low' | 'balanced' | 'elevated' | 'high'

/** Fixed labels per project style rules (Step 8). */
export const CLASS_LABEL: Record<LoadClass, string> = {
  low:      'Needs attention',
  balanced: 'Balanced',
  elevated: 'Elevated',
  high:     'High load',
}

/** ACWR -> class. Thresholds per spec:
 *  <0.8 low · 0.8-1.3 balanced · 1.3-1.5 elevated · >1.5 high. */
export function classifyAcwr(acwr: number): LoadClass {
  if (acwr < 0.8) return 'low'
  if (acwr <= 1.3) return 'balanced'
  if (acwr <= 1.5) return 'elevated'
  return 'high'
}

export interface MuscleGroupSummary {
  group:      MuscleGroupId
  label:      string
  /** Mean daily load over the last 7 days. */
  load7day:   number
  /** Mean daily load over the last 28 days. */
  load28day:  number
  /** load7day / load28day, or null when there isn't enough chronic history. */
  acwr:       number | null
  classification: LoadClass
  /** 'broad' when the recent load is dominated by broad-estimate activities. */
  confidence: 'estimated' | 'broad'
  /** 0..1 value fed to the 3D model colour ramp (low=cool/neutral, high=hot). */
  renderLevel: number
}

export interface MuscleLoadResult {
  referenceDate: string          // ISO day the windows are anchored to
  groups:        MuscleGroupSummary[]
  /** Total workouts that contributed to the 28-day window. */
  workoutsInWindow: number
}

/**
 * Map an ACWR + class to the 0..1 level the twin model's colour ramp expects.
 * Mirrors the existing intensity convention: low engagement sits at the cool/
 * neutral (near-baseline) end, high load at the hot end.
 */
function renderLevelFor(cls: LoadClass, acwr: number | null): number {
  if (acwr == null || cls === 'low') return 0.05 // neutral / cool
  if (cls === 'balanced') {
    // 0.8..1.3 -> 0.25..0.45
    return 0.25 + clamp((acwr - 0.8) / 0.5, 0, 1) * 0.2
  }
  if (cls === 'elevated') {
    // 1.3..1.5 -> 0.6..0.75
    return 0.6 + clamp((acwr - 1.3) / 0.2, 0, 1) * 0.15
  }
  // high: 1.5..2.5+ -> 0.85..1.0
  return clamp(0.85 + (acwr - 1.5) / 1.0 * 0.15, 0.85, 1)
}

/**
 * Step 4 (5-7): aggregate per-workout group loads into 7/28-day rolling means,
 * ACWR, and a class per muscle group.
 *
 * @param referenceMs anchor for the windows (defaults to now). The 7-day window
 *        is (ref-7d, ref]; the 28-day window is (ref-28d, ref].
 */
export function estimateMuscleLoad(
  workouts: ParsedWorkout[],
  referenceMs: number = Date.now(),
): MuscleLoadResult {
  const loads = computeWorkoutLoads(workouts)
  const refDay = new Date(referenceMs)
  const ref = Date.UTC(refDay.getUTCFullYear(), refDay.getUTCMonth(), refDay.getUTCDate()) + DAY_MS - 1
  const win7 = ref - 7 * DAY_MS
  const win28 = ref - 28 * DAY_MS

  // Accumulate per-group summed load within each window, plus a broad-estimate
  // load share (to decide the confidence badge) over the recent 7-day window.
  const sum7: Record<string, number> = {}
  const sum28: Record<string, number> = {}
  const broad7: Record<string, number> = {}
  const daysWith28 = new Set<string>()
  let workoutsInWindow = 0

  for (const wl of loads) {
    const t = new Date(wl.workout.startDate).getTime()
    if (!(t > win28 && t <= ref)) continue
    workoutsInWindow++
    daysWith28.add(dayKey(wl.workout.startDate))
    const in7 = t > win7
    for (const g of GROUP_IDS) {
      const v = wl.groupLoad[g] ?? 0
      if (v === 0) continue
      sum28[g] = (sum28[g] ?? 0) + v
      if (in7) {
        sum7[g] = (sum7[g] ?? 0) + v
        if (wl.confidence === 'broad') broad7[g] = (broad7[g] ?? 0) + v
      }
    }
  }

  const groups: MuscleGroupSummary[] = MUSCLE_GROUPS.map((def) => {
    const g = def.id
    const load7day = (sum7[g] ?? 0) / 7
    const load28day = (sum28[g] ?? 0) / 28
    // ACWR needs a meaningful chronic baseline; with none, the group reads as
    // low engagement (needs attention) rather than a divide-by-zero spike.
    const acwr = load28day > 1e-6 ? load7day / load28day : null
    const classification = acwr == null ? 'low' : classifyAcwr(acwr)
    const recent7 = sum7[g] ?? 0
    const confidence: 'estimated' | 'broad' =
      recent7 > 0 && (broad7[g] ?? 0) / recent7 > 0.5 ? 'broad' : 'estimated'
    return {
      group: g,
      label: def.label,
      load7day,
      load28day,
      acwr,
      classification,
      confidence,
      renderLevel: renderLevelFor(classification, acwr),
    }
  })

  return {
    referenceDate: new Date(ref - DAY_MS + 1).toISOString().slice(0, 10),
    groups,
    workoutsInWindow,
  }
}

/** Lookup helper for the UI / assessment routing. */
export function groupDef(id: MuscleGroupId): MuscleGroupDef {
  return MUSCLE_GROUPS.find((g) => g.id === id)!
}
