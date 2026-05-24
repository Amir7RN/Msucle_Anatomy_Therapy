/**
 * muscleActivation.ts
 *
 * Map current joint-angle measurements to per-muscle activation intensity
 * (0..1). Used by the Live Activation Overlay during exercise guidance so
 * the body silhouette glows on the muscles actually firing for the user's
 * current pose.
 *
 * Activation model
 *  - Each muscle has one or more "primary" joints + a function (flexor /
 *    extensor / abductor / rotator).
 *  - Activation rises when the joint is moving INTO that function's
 *    direction AND the joint angle is in a band where that muscle is
 *    mechanically advantaged.
 *  - This is a rough kinesiology approximation, not an EMG simulation —
 *    designed to be educational + visually interesting, not clinical.
 */

import type { FormSnapshot } from './biofeedback'
import type { SymmetryRegion } from '../insights/symmetry'

export interface MuscleActivation {
  /** Muscle id key used by colour overrides. */
  muscleId: string
  /** Body region for the silhouette colouring. */
  region:   SymmetryRegion
  /** 0..1 estimated activation intensity. */
  level:    number
}

/**
 * Lookup table per (joint label, angle band) -> active muscles.
 * Labels match FormCheck.label strings produced by biofeedback.ts.
 *
 * The band check is intentionally loose — we want to LIGHT UP a region as
 * soon as the user enters the working zone, not require precise targets.
 */
interface ActivationRule {
  label:      string            // matches FormSnapshot detail.label substring (case-insensitive)
  minDeg:     number
  maxDeg:     number
  /** Peak-activation midpoint within the band — gives the gaussian a centre. */
  peakDeg:    number
  /** Muscles that fire and their relative weight (0..1). */
  muscles:    Array<{ muscleId: string; region: SymmetryRegion; weight: number }>
}

const RULES: ActivationRule[] = [
  // ── Elbow flexion / extension ───────────────────────────────────────────
  {
    label:   'elbow flex',
    minDeg:  10, maxDeg: 170, peakDeg: 90,
    muscles: [
      { muscleId: 'biceps_brachii',  region: 'right_elbow', weight: 1.0 },
      { muscleId: 'brachialis',      region: 'right_elbow', weight: 0.8 },
      { muscleId: 'brachioradialis', region: 'right_elbow', weight: 0.5 },
    ],
  },

  // ── Shoulder flexion (arm forward) ──────────────────────────────────────
  {
    label:   'shoulder flex',
    minDeg:  20, maxDeg: 180, peakDeg: 90,
    muscles: [
      { muscleId: 'deltoid_anterior', region: 'right_shoulder', weight: 1.0 },
      { muscleId: 'pectoralis_major', region: 'trunk',          weight: 0.6 },
      { muscleId: 'serratus_anterior',region: 'trunk',          weight: 0.4 },
    ],
  },

  // ── Shoulder abduction (arm out to side) ────────────────────────────────
  {
    label:   'shoulder abduc',
    minDeg:  15, maxDeg: 180, peakDeg: 90,
    muscles: [
      { muscleId: 'deltoid_lateral', region: 'right_shoulder', weight: 1.0 },
      { muscleId: 'supraspinatus',   region: 'right_shoulder', weight: 0.7 },  // dominant 0-30°
      { muscleId: 'trapezius_upper', region: 'neck',           weight: 0.4 },
    ],
  },

  // ── Shoulder external rotation ─────────────────────────────────────────
  {
    label:   'shoulder extern',
    minDeg:  10, maxDeg: 90, peakDeg: 45,
    muscles: [
      { muscleId: 'infraspinatus',     region: 'right_shoulder', weight: 1.0 },
      { muscleId: 'teres_minor',       region: 'right_shoulder', weight: 0.8 },
      { muscleId: 'deltoid_posterior', region: 'right_shoulder', weight: 0.5 },
    ],
  },

  // ── Knee flexion ────────────────────────────────────────────────────────
  {
    label:   'knee flex',
    minDeg:  15, maxDeg: 135, peakDeg: 90,
    muscles: [
      { muscleId: 'biceps_femoris',    region: 'right_knee', weight: 1.0 },
      { muscleId: 'semitendinosus',    region: 'right_knee', weight: 0.9 },
      { muscleId: 'semimembranosus',   region: 'right_knee', weight: 0.8 },
      { muscleId: 'gastrocnemius',     region: 'right_ankle', weight: 0.4 },
    ],
  },

  // ── Hip flexion ─────────────────────────────────────────────────────────
  {
    label:   'hip flex',
    minDeg:  20, maxDeg: 120, peakDeg: 75,
    muscles: [
      { muscleId: 'iliacus',           region: 'right_hip', weight: 1.0 },
      { muscleId: 'psoas_major',       region: 'right_hip', weight: 1.0 },
      { muscleId: 'rectus_femoris',    region: 'right_knee', weight: 0.6 },
      { muscleId: 'sartorius',         region: 'right_hip', weight: 0.4 },
    ],
  },

  // ── Hip abduction ───────────────────────────────────────────────────────
  {
    label:   'hip abduc',
    minDeg:  10, maxDeg: 45, peakDeg: 30,
    muscles: [
      { muscleId: 'gluteus_medius',       region: 'right_hip', weight: 1.0 },
      { muscleId: 'gluteus_minimus',      region: 'right_hip', weight: 0.8 },
      { muscleId: 'tensor_fasciae_latae', region: 'right_hip', weight: 0.6 },
    ],
  },

  // ── Hip extension ───────────────────────────────────────────────────────
  {
    label:   'hip extension',
    minDeg:  10, maxDeg: 30, peakDeg: 20,
    muscles: [
      { muscleId: 'gluteus_maximus',  region: 'right_hip', weight: 1.0 },
      { muscleId: 'biceps_femoris',   region: 'right_knee', weight: 0.6 },
      { muscleId: 'semitendinosus',   region: 'right_knee', weight: 0.6 },
    ],
  },

  // ── Trunk extension (Crab Press, Glute Bridge) ──────────────────────────
  {
    label:   'hip extension',   // re-uses same label; both fire
    minDeg:  150, maxDeg: 180, peakDeg: 175,
    muscles: [
      { muscleId: 'erector_spinae',    region: 'trunk', weight: 0.7 },
      { muscleId: 'multifidus',        region: 'trunk', weight: 0.6 },
    ],
  },
]

/** Gaussian falloff centred at peakDeg, full width = (maxDeg - minDeg) */
function bandWeight(deg: number, minDeg: number, maxDeg: number, peakDeg: number): number {
  if (deg < minDeg || deg > maxDeg) return 0
  const sigma = (maxDeg - minDeg) / 4   // ±2σ inside the band
  const x = (deg - peakDeg) / sigma
  return Math.max(0, Math.min(1, Math.exp(-(x * x) / 2)))
}

/**
 * Given the current FormSnapshot from the biofeedback engine, return the
 * estimated activation level for every muscle that should be firing.
 */
export function computeActivation(snapshot: FormSnapshot | null): MuscleActivation[] {
  if (!snapshot || snapshot.details.length === 0) return []
  const acc = new Map<string, MuscleActivation>()

  for (const d of snapshot.details) {
    const labelLc = d.label.toLowerCase()
    for (const rule of RULES) {
      if (!labelLc.includes(rule.label)) continue
      const bw = bandWeight(d.deg, rule.minDeg, rule.maxDeg, rule.peakDeg)
      if (bw < 0.01) continue
      for (const m of rule.muscles) {
        const intensity = bw * m.weight
        const key = m.muscleId
        const prev = acc.get(key)
        if (!prev || prev.level < intensity) {
          acc.set(key, { muscleId: m.muscleId, region: m.region, level: intensity })
        }
      }
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.level - a.level)
}

/**
 * Roll up activations into a region->color map for BodySilhouette.
 * Uses a green→amber→orange gradient based on activation intensity.
 */
export function activationRegionColors(activations: MuscleActivation[]): Partial<Record<SymmetryRegion, string>> {
  const max = new Map<SymmetryRegion, number>()
  for (const a of activations) {
    const cur = max.get(a.region) ?? 0
    if (a.level > cur) max.set(a.region, a.level)
  }
  const out: Partial<Record<SymmetryRegion, string>> = {}
  for (const [region, level] of max) {
    out[region] = activationColor(level)
  }
  return out
}

/** 0..1 -> color. Cool=quiet, hot=firing. */
function activationColor(level: number): string {
  // Interpolate slate → cyan → orange → red.
  const stops = [
    { t: 0.0, c: [71, 85, 105]   }, // slate-600
    { t: 0.2, c: [34, 211, 238]  }, // cyan-400
    { t: 0.6, c: [251, 146, 60]  }, // orange-400
    { t: 1.0, c: [239, 68, 68]   }, // red-500
  ]
  let i = 0
  while (i < stops.length - 1 && level > stops[i + 1].t) i += 1
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)]
  const span = (b.t - a.t) || 1
  const t = (level - a.t) / span
  const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * t)
  const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * t)
  const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * t)
  return `rgb(${r},${g},${bl})`
}
