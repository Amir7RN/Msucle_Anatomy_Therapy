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

/**
 * When the export carries a date of birth we personalise the HR band with the
 * Tanaka max-HR estimate (208 - 0.7*age): easy = 55% HRmax, hard = 88% HRmax.
 * Without an age we keep the population-typical 100..160 bpm band.
 */
export function intensityFactor(w: ParsedWorkout, activityMet: number, ageYears?: number | null): number {
  if (w.avgHeartRateBpm != null && w.avgHeartRateBpm > 40) {
    let easy = HR_EASY
    let hard = HR_HARD
    if (ageYears != null && ageYears >= 10 && ageYears <= 100) {
      const hrMax = 208 - 0.7 * ageYears
      easy = hrMax * 0.55
      hard = hrMax * 0.88
    }
    const zone = clamp((w.avgHeartRateBpm - easy) / (hard - easy), 0, 1)
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
export function computeWorkoutLoads(workouts: ParsedWorkout[], ageYears?: number | null): WorkoutLoad[] {
  return workouts.map((w) => {
    const prof = profileFor(w.activityKey)
    const intensity = intensityFactor(w, prof.met, ageYears)
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
  /** Mean daily load over the recent window (default 7 days). */
  loadRecent:   number
  /** Mean daily load over the baseline window (default 28 days). */
  loadBaseline: number
  /** loadRecent / loadBaseline, or null when there isn't enough baseline history. */
  acwr:       number | null
  /** This group's percentage of the TOTAL workload in each window (0..100).
   *  The primary "how much of my training hits this group" number — what the
   *  model colours by and what the row percent shows. */
  sharePctRecent:   number
  sharePctBaseline: number
  classification: LoadClass
  /** 'broad' when the recent load is dominated by broad-estimate activities. */
  confidence: 'estimated' | 'broad'
  /** 0..1 value fed to the 3D model colour ramp (low=cool/neutral, high=hot). */
  renderLevel: number
}

/** Comparison windows, in days. Defaults mirror the classic 7 vs 28 ACWR. */
export interface WindowConfig {
  recentDays:   number
  baselineDays: number
  /** Age (years) for HR-zone personalisation, when the export carries a DOB. */
  ageYears?:    number | null
}

export const DEFAULT_WINDOWS: WindowConfig = { recentDays: 7, baselineDays: 28 }

export interface MuscleLoadResult {
  referenceDate: string          // ISO day the windows are anchored to
  groups:        MuscleGroupSummary[]
  /** Requested windows (what the user selected). */
  recentDays:    number
  baselineDays:  number
  /** Windows actually used — clamped to the available history so a baseline
   *  longer than the data range reports the real range instead of silently
   *  diluting the average. */
  effectiveRecentDays:   number
  effectiveBaselineDays: number
  /** Days of workout history available up to the reference date (0 = none). */
  availableDays: number
  /** Workouts that contributed to each effective window. */
  workoutsInBaseline: number
  workoutsInRecent:   number
}

/**
 * Colour level from a group's SHARE of the total workload, relative to the
 * hardest-worked group (0..1 for the twin ramp: tan -> amber -> red). Share —
 * not the acute:chronic ratio — is what makes a runner's legs glow red and an
 * untouched chest stay neutral; the ratio only says how the last window
 * compares to baseline and goes flat/low for every group at once whenever
 * overall volume dips, which read as "nothing is coloured".
 * Exported so the practitioner view can rebuild levels from stored rows.
 */
export function shareRenderLevel(sharePct: number, maxSharePct: number): number {
  if (sharePct <= 0 || maxSharePct <= 0) return 0.05 // neutral / cool
  return 0.15 + 0.8 * clamp(sharePct / maxSharePct, 0, 1)
}

/** Deprecated ACWR-based level (kept for backwards compatibility). */
export function renderLevelFor(cls: LoadClass, acwr: number | null): number {
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

/** A group is "low engagement / needs attention" when its share of the total
 *  workload is under half of an even split across all groups — a VOLUME test
 *  (never trained ≈ 0%), independent of the recent:baseline ratio. */
export const LOW_SHARE_FRACTION = 0.5

export function isLowShare(sharePct: number, groupCount: number): boolean {
  return sharePct < (100 / groupCount) * LOW_SHARE_FRACTION
}

/**
 * Step 4 (5-7): aggregate per-workout group loads into recent/baseline rolling
 * means, ACWR, and a class per muscle group.
 *
 * @param referenceMs anchor for the windows (defaults to now). The recent
 *        window is (ref-recentDays, ref]; baseline is (ref-baselineDays, ref].
 * @param windows requested comparison windows in days (default 7 vs 28). Each
 *        window is clamped to the available history — asking for a 2-year
 *        baseline against 90 days of data averages over the real 90 days and
 *        reports that via effectiveBaselineDays / availableDays.
 */
export function estimateMuscleLoad(
  workouts: ParsedWorkout[],
  referenceMs: number = Date.now(),
  windows: Partial<WindowConfig> = {},
): MuscleLoadResult {
  const recentDays = Math.max(1, Math.round(windows.recentDays ?? DEFAULT_WINDOWS.recentDays))
  const baselineDays = Math.max(1, Math.round(windows.baselineDays ?? DEFAULT_WINDOWS.baselineDays))

  const loads = computeWorkoutLoads(workouts, windows.ageYears)
  const refDay = new Date(referenceMs)
  const ref = Date.UTC(refDay.getUTCFullYear(), refDay.getUTCMonth(), refDay.getUTCDate()) + DAY_MS - 1

  // Available history: from the earliest workout start to the reference day.
  let earliest = Number.POSITIVE_INFINITY
  for (const wl of loads) {
    const t = new Date(wl.workout.startDate).getTime()
    if (t < earliest) earliest = t
  }
  const availableDays = Number.isFinite(earliest)
    ? Math.max(1, Math.ceil((ref - earliest) / DAY_MS))
    : 0

  // Clamp both windows to the data range (see docblock).
  const effectiveBaselineDays = availableDays > 0 ? Math.min(baselineDays, availableDays) : baselineDays
  const effectiveRecentDays = availableDays > 0 ? Math.min(recentDays, availableDays) : recentDays

  const winRecent = ref - effectiveRecentDays * DAY_MS
  const winBase = ref - effectiveBaselineDays * DAY_MS

  // Accumulate per-group summed load within each window, plus a broad-estimate
  // load share (to decide the confidence badge) over the recent window.
  const sumRecent: Record<string, number> = {}
  const sumBase: Record<string, number> = {}
  const broadRecent: Record<string, number> = {}
  let workoutsInBaseline = 0
  let workoutsInRecent = 0

  for (const wl of loads) {
    const t = new Date(wl.workout.startDate).getTime()
    const inBase = t > winBase && t <= ref
    const inRecent = t > winRecent && t <= ref
    if (!inBase && !inRecent) continue
    if (inBase) workoutsInBaseline++
    if (inRecent) workoutsInRecent++
    for (const g of GROUP_IDS) {
      const v = wl.groupLoad[g] ?? 0
      if (v === 0) continue
      if (inBase) sumBase[g] = (sumBase[g] ?? 0) + v
      if (inRecent) {
        sumRecent[g] = (sumRecent[g] ?? 0) + v
        if (wl.confidence === 'broad') broadRecent[g] = (broadRecent[g] ?? 0) + v
      }
    }
  }

  // Window totals -> per-group workload SHARE (the primary accuracy signal).
  let totRecent = 0
  let totBase = 0
  for (const g of GROUP_IDS) {
    totRecent += sumRecent[g] ?? 0
    totBase += sumBase[g] ?? 0
  }

  const groups: MuscleGroupSummary[] = MUSCLE_GROUPS.map((def) => {
    const g = def.id
    const loadRecent = (sumRecent[g] ?? 0) / effectiveRecentDays
    const loadBaseline = (sumBase[g] ?? 0) / effectiveBaselineDays
    const sharePctRecent = totRecent > 0 ? (100 * (sumRecent[g] ?? 0)) / totRecent : 0
    const sharePctBaseline = totBase > 0 ? (100 * (sumBase[g] ?? 0)) / totBase : 0
    // ACWR needs a meaningful baseline; with none, the group reads as
    // low engagement (needs attention) rather than a divide-by-zero spike.
    const acwr = loadBaseline > 1e-6 ? loadRecent / loadBaseline : null
    // Classification: "needs attention" is a VOLUME call (share far below an
    // even split — e.g. a runner's chest), not a ratio call. Ratio-driven
    // classes (elevated/high spike risk) apply only to adequately-worked
    // groups; a plain lower recent volume on a well-worked group stays
    // "balanced" (the row's trend arrow + ratio still show the dip).
    const lowVolume = isLowShare(Math.max(sharePctRecent, sharePctBaseline), MUSCLE_GROUPS.length)
    const classification: LoadClass =
      acwr == null || lowVolume ? 'low'
      : acwr > 1.5 ? 'high'
      : acwr > 1.3 ? 'elevated'
      : 'balanced'
    const recentSum = sumRecent[g] ?? 0
    const confidence: 'estimated' | 'broad' =
      recentSum > 0 && (broadRecent[g] ?? 0) / recentSum > 0.5 ? 'broad' : 'estimated'
    return {
      group: g,
      label: def.label,
      loadRecent,
      loadBaseline,
      acwr,
      sharePctRecent,
      sharePctBaseline,
      classification,
      confidence,
      renderLevel: 0, // filled below once the max share is known
    }
  })

  // Colour by share relative to the hardest-worked group. When the recent
  // window is empty, fall back to baseline shares so the model still paints.
  const useRecent = totRecent > 0
  const maxShare = Math.max(...groups.map((g) => (useRecent ? g.sharePctRecent : g.sharePctBaseline)), 0)
  for (const g of groups) {
    g.renderLevel = shareRenderLevel(useRecent ? g.sharePctRecent : g.sharePctBaseline, maxShare)
  }

  return {
    referenceDate: new Date(ref - DAY_MS + 1).toISOString().slice(0, 10),
    groups,
    recentDays,
    baselineDays,
    effectiveRecentDays,
    effectiveBaselineDays,
    availableDays,
    workoutsInBaseline,
    workoutsInRecent,
  }
}

/** Lookup helper for the UI / assessment routing. */
export function groupDef(id: MuscleGroupId): MuscleGroupDef {
  return MUSCLE_GROUPS.find((g) => g.id === id)!
}
