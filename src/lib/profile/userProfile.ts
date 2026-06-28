/**
 * userProfile.ts
 *
 * The single source of truth for WHO the user is — the thing a real physical
 * therapist builds in their head on the first visit and that a one-size
 * template throws away. Everything personalised downstream (fatigue dynamics,
 * effort calibration, exercise prescription, injury caution) is derived from
 * this profile by `personalization.ts`.
 *
 * What it holds
 * ─────────────
 *   • demographics      — age, sex, height, weight
 *   • training history  — self-reported fitness level + goals
 *   • injuries / pain   — regions to protect, with severity
 *   • body composition  — an HONEST camera-scan estimate (with a range), never
 *                          presented as a medical measurement
 *   • scan metrics      — segment symmetry, posture, build ratios
 *
 * Persistence mirrors romHistory.ts: a localStorage bucket namespaced per
 * signed-in user (or an anon bucket for guests), so two accounts never see
 * each other's data. A monotonic version counter lets React re-read on change.
 */

import { getActiveUserId, subscribeROM } from '../movement/romHistory'
import {
  clampWeight, clampHeight,
  DEFAULT_WEIGHT_KG, DEFAULT_HEIGHT_CM, DEFAULT_SEX, type Sex,
} from '../movement/bodySegments'
import type { SymmetryRegion } from '../insights/symmetry'

// ── Vocabulary ───────────────────────────────────────────────────────────────

export type FitnessLevel =
  | 'sedentary'     // little/no regular activity — deconditioned
  | 'beginner'      // new to training, occasionally active
  | 'intermediate'  // trains a few times a week
  | 'advanced'      // trains consistently, experienced
  | 'athlete'       // high training age, competitive capacity

export type TrainingGoal =
  | 'mobility' | 'pain_relief' | 'strength' | 'endurance'
  | 'return_to_activity' | 'general_fitness'

export type InjurySeverity = 'mild' | 'moderate' | 'severe'

export interface InjuryFlag {
  region:   SymmetryRegion
  severity: InjurySeverity
  note?:    string
}

/** Build bucket surfaced to the user in plain language. */
export type BuildClass = 'lean' | 'athletic' | 'average' | 'solid' | 'heavy'

/**
 * Body composition — an ESTIMATE, with an explicit range and confidence.
 * `null` until the user has run a body scan (or entered it manually).
 */
export interface BodyComposition {
  /** Best single-number body-fat estimate (%). */
  bodyFatPct:  number | null
  /** Honest ±range around the estimate (%). */
  bodyFatLow:  number | null
  bodyFatHigh: number | null
  /** Derived fat-free (lean) mass in kg. */
  leanMassKg:  number | null
  /** Fat-free-mass index normalised 0..1 vs a natural reference (a muscularity
   *  proxy: ~0 = very light frame, ~1 = highly muscular). */
  muscleIndex: number | null
  /** Plain-language build bucket. */
  build:       BuildClass | null
  /** 0..1 confidence in the estimate (a single webcam is inherently limited). */
  confidence:  number
  method:      'camera' | 'camera+ai' | 'camera+tape' | 'manual' | null
}

/** Geometric metrics the camera CAN see defensibly (joints, not silhouette). */
export interface BodyScanMetrics {
  /** Shoulder-width / hip-width ratio (V-taper proxy). */
  shoulderHipRatio: number | null
  /** Apparent torso-width / standing-height ratio (a centroid-of-mass proxy). */
  torsoHeightRatio: number | null
  /** Left/right segment-length symmetry, 0..1 (1 = perfectly even). */
  symmetry:         number | null
  /** The single most length-asymmetric region, if any stood out. */
  asymRegion:       SymmetryRegion | null
  /** Posture flags from the side capture. */
  posture: {
    forwardHead:  boolean
    shoulderTilt: number   // |L-R| shoulder height, fraction of torso height
    hipTilt:      number   // |L-R| hip height, fraction of torso height
  } | null
  capturedAt: number | null
}

export interface UserProfile {
  version: 1
  displayName?: string

  // demographics
  ageYears: number | null
  sex:      Sex
  heightCm: number
  weightKg: number

  // training history
  fitnessLevel: FitnessLevel
  goals:        TrainingGoal[]
  injuries:     InjuryFlag[]

  // scan
  composition: BodyComposition
  scan:        BodyScanMetrics

  // meta
  createdAt: number
  updatedAt: number
  /** True once the user has completed (or skipped past) the profile setup. */
  onboarded: boolean
}

// ── Defaults ───────────────────────────────────────────────────────────────

export function blankComposition(): BodyComposition {
  return {
    bodyFatPct: null, bodyFatLow: null, bodyFatHigh: null,
    leanMassKg: null, muscleIndex: null, build: null,
    confidence: 0, method: null,
  }
}

export function blankScan(): BodyScanMetrics {
  return {
    shoulderHipRatio: null, torsoHeightRatio: null,
    symmetry: null, asymRegion: null, posture: null, capturedAt: null,
  }
}

export function defaultProfile(): UserProfile {
  const now = Date.now()
  return {
    version: 1,
    ageYears: null,
    sex: DEFAULT_SEX,
    heightCm: DEFAULT_HEIGHT_CM,
    weightKg: DEFAULT_WEIGHT_KG,
    fitnessLevel: 'beginner',
    goals: [],
    injuries: [],
    composition: blankComposition(),
    scan: blankScan(),
    createdAt: now,
    updatedAt: now,
    onboarded: false,
  }
}

// ── Storage (per-user namespaced, mirroring romHistory) ──────────────────────

const ANON_KEY     = 'muscleAtlas.profile.v1.anon'
const USER_KEY_PFX = 'muscleAtlas.profile.v1.user.'

function activeKey(): string {
  const uid = getActiveUserId()
  return uid ? USER_KEY_PFX + uid : ANON_KEY
}

let cache: UserProfile | null = null
let cacheKey = ''

function sanitize(raw: unknown): UserProfile {
  const base = defaultProfile()
  if (!raw || typeof raw !== 'object') return base
  const p = raw as Partial<UserProfile>
  return {
    ...base,
    ...p,
    sex: p.sex === 'female' ? 'female' : 'male',
    heightCm: clampHeight(p.heightCm ?? base.heightCm),
    weightKg: clampWeight(p.weightKg ?? base.weightKg),
    ageYears: typeof p.ageYears === 'number' && isFinite(p.ageYears)
      ? Math.max(10, Math.min(100, Math.round(p.ageYears))) : null,
    goals: Array.isArray(p.goals) ? p.goals : [],
    injuries: Array.isArray(p.injuries) ? p.injuries : [],
    composition: { ...base.composition, ...(p.composition ?? {}) },
    scan: { ...base.scan, ...(p.scan ?? {}) },
    version: 1,
  }
}

function readStorage(key: string): UserProfile {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultProfile()
    return sanitize(JSON.parse(raw))
  } catch {
    return defaultProfile()
  }
}

// ── Reactive layer ───────────────────────────────────────────────────────────

let version = 0
const subs = new Set<() => void>()
function bump(): void {
  version += 1
  for (const cb of subs) { try { cb() } catch { /* ignore */ } }
}
export function getProfileVersion(): number { return version }
export function subscribeProfile(cb: () => void): () => void {
  subs.add(cb)
  return () => { subs.delete(cb) }
}

// When the signed-in user changes (romHistory swaps buckets on auth), our cache
// key changes too — drop the cache and notify so components re-read the right
// person's profile.
subscribeROM(() => {
  if (cacheKey !== activeKey()) { cache = null; cacheKey = ''; bump() }
})

// ── Public API ───────────────────────────────────────────────────────────────

export function loadProfile(): UserProfile {
  const key = activeKey()
  if (cache && cacheKey === key) return cache
  cache = readStorage(key)
  cacheKey = key
  return cache
}

export function saveProfile(p: UserProfile): UserProfile {
  const key = activeKey()
  const next: UserProfile = { ...p, version: 1, updatedAt: Date.now() }
  cache = next
  cacheKey = key
  try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
  bump()
  return next
}

/** Merge a partial patch into the current profile and persist it. */
export function patchProfile(patch: Partial<UserProfile>): UserProfile {
  const cur = loadProfile()
  return saveProfile({ ...cur, ...patch })
}

/** True once the user has actually filled in / saved their profile. */
export function hasProfile(): boolean {
  return loadProfile().onboarded
}

export function clearProfile(): void {
  const key = activeKey()
  try { localStorage.removeItem(key) } catch { /* ignore */ }
  cache = null; cacheKey = ''
  bump()
}

// ── Display helpers ────────────────────────────────────────────────────────

export const FITNESS_LABEL: Record<FitnessLevel, string> = {
  sedentary: 'Sedentary', beginner: 'Beginner', intermediate: 'Intermediate',
  advanced: 'Advanced', athlete: 'Athlete',
}

export const GOAL_LABEL: Record<TrainingGoal, string> = {
  mobility: 'Mobility', pain_relief: 'Pain relief', strength: 'Strength',
  endurance: 'Endurance', return_to_activity: 'Return to activity',
  general_fitness: 'General fitness',
}

export const BUILD_LABEL: Record<BuildClass, string> = {
  lean: 'Lean', athletic: 'Athletic', average: 'Average',
  solid: 'Solid', heavy: 'Heavy',
}

/** Age band used for coaching copy and the personalization curves. */
export function ageBand(age: number | null): 'youth' | 'young_adult' | 'adult' | 'midlife' | 'senior' | 'unknown' {
  if (age == null) return 'unknown'
  if (age < 18) return 'youth'
  if (age < 30) return 'young_adult'
  if (age < 50) return 'adult'
  if (age < 65) return 'midlife'
  return 'senior'
}
