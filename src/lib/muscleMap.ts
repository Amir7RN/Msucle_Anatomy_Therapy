/**
 * muscleMap.ts
 *
 * 52-muscle coordinate map for the single-mesh Meshy anatomical base.
 *
 * Coordinate space  ──────────────────────────────────────────────────────────
 *   • Same world space as painPatterns.ts BODY_ZONES.
 *   • Up      = +Y                       (feet  at y = -0.925)
 *   • Right   = -X (patient right)       (left  = +X)
 *   • Front   = +Z (anterior)            (back  = -Z)
 *   • The Meshy mesh is loaded with HumanAtlas.tsx applying:
 *         scale  = 0.105               (14.933 unit raw  →  1.568 m)
 *         offset = ground feet to y = -0.925
 *     so all coordinates below are written in POST-GROUNDED world units.
 *
 * Identity integrity (Task 3 from the diagnostic spec) ─────────────────────
 *   muscle_id keys here MATCH painDiagnostic.json exactly. They are never
 *   renamed.  Bilateral muscles emit one entry per side (sharing the same
 *   muscle_id with a `side: 'L' | 'R'`); midline muscles (rectus_abdominis,
 *   multifidus) emit a single `side: 'midline'` entry.  pickMuscleAtPoint
 *   uses point.x > 0 → 'L', point.x < 0 → 'R' to disambiguate.
 *
 * Hit radius
 *   • Selection threshold = 0.12 m, per spec.
 *   • If multiple muscles fall within 0.12 m, the one with the highest
 *     `priority` wins; ties break on closest distance.  Priorities reflect
 *     anatomical layering (lateral deltoid sits *over* the supraspinatus,
 *     so deltoid_lateral has higher priority than supraspinatus when the
 *     click is within both).
 */

import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────────
//  Calibration constants (must match HumanAtlas.tsx loading transform)
// ─────────────────────────────────────────────────────────────────────────────

// Calibrated for public/models/male-normal.glb (free3d.com Male Base 88907):
//   raw bbox height = 7.030  →  scale 0.2231 lands it at 1.568 m
// (the previous Meshy file male-body.glb used 0.105; switching that
// constant is the only change required to swap which body GLB is loaded
// alongside MESHY_MODEL_PATH in HumanAtlas.tsx)
export const MESHY_SCALE          = 0.2231
export const MESHY_GROUND_Y       = -0.925                // feet sit on grid
export const MUSCLE_HIT_RADIUS_M  = 0.12

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

export type MuscleSide = 'L' | 'R' | 'midline'

export interface MuscleMapEntry {
  /** muscle_id from painDiagnostic.json — preserved verbatim. */
  muscle_id:   string
  side:        MuscleSide
  /** World-space center, calibrated for the post-grounded Meshy mesh. */
  pos:         [number, number, number]
  /** Translucent-ellipsoid radii (rx, ry, rz) used by MuscleHighlight. */
  radii:       [number, number, number]
  /**
   * Selection priority (default 1).  Higher wins when multiple entries are
   * within MUSCLE_HIT_RADIUS_M of the click.  Used so superficial layers
   * (lateral deltoid) shadow deeper layers (supraspinatus) at the same
   * surface coordinate.
   */
  priority?:   number
}

// ─────────────────────────────────────────────────────────────────────────────
//  Landmarks (proportional fractions of the 1.568 m mesh)
//
//  These constants drive the X/Y values below so a future mesh swap only
//  needs the constants retuned.  Y is expressed as "world Y" already
//  (i.e. floor + fraction × height), so values map 1:1 to the model.
// ─────────────────────────────────────────────────────────────────────────────

const F  = MESHY_GROUND_Y          // floor      = -0.925
const H  = 1.568                   // grounded height
const Y  = (frac: number) => F + frac * H

// X half-widths (positive value; pos.x = ±X for L/R)
const SHOULDER_X = 0.180   // acromion to mid-line
const ARM_X      = 0.215   // mid upper-arm (A-pose drift)
const ELBOW_X    = 0.250
const FOREARM_X  = 0.280
const HAND_X     = 0.310
const HIP_X      = 0.110   // greater trochanter to mid-line
const THIGH_X    = 0.105
const KNEE_X     = 0.100
const CALF_X     = 0.090
const FOOT_X     = 0.080
const SCAPULA_X  = 0.115

// Z (front/back of trunk)
const Z_FRONT     =  0.105
const Z_FRONT_DEEP = 0.060
const Z_BACK      = -0.075
const Z_BACK_DEEP = -0.045
const Z_LATERAL   =  0.020

// ─────────────────────────────────────────────────────────────────────────────
//  Per-muscle radii presets — kept compact; tweak in the table when needed
// ─────────────────────────────────────────────────────────────────────────────

const R_SMALL  : [number, number, number] = [0.045, 0.055, 0.040]
const R_MED    : [number, number, number] = [0.070, 0.075, 0.050]
const R_LARGE  : [number, number, number] = [0.095, 0.110, 0.060]
const R_FLAT_H : [number, number, number] = [0.130, 0.060, 0.045]   // wide flat (lat, ext oblique)
const R_LIMB   : [number, number, number] = [0.045, 0.090, 0.045]   // arm/leg cylinder-ish

// ─────────────────────────────────────────────────────────────────────────────
//  THE 52 MUSCLE COORDINATES
//
//  All 52 muscle_id keys from painDiagnostic.json are present.  Bilateral
//  muscles emit two entries (L + R, mirrored on X).  Coordinates are
//  rough-but-anatomically-faithful and are intended to be tuned visually
//  via the debug-spheres mode in HumanAtlas.tsx (toggle in the store).
// ─────────────────────────────────────────────────────────────────────────────

const bilateral = (
  muscle_id: string,
  pos:       [number, number, number],
  radii:     [number, number, number] = R_MED,
  priority   = 1,
): MuscleMapEntry[] => [
  { muscle_id, side: 'R', pos: [-pos[0], pos[1], pos[2]], radii, priority },
  { muscle_id, side: 'L', pos: [ pos[0], pos[1], pos[2]], radii, priority },
]

const midline = (
  muscle_id: string,
  pos:       [number, number, number],
  radii:     [number, number, number] = R_MED,
  priority   = 1,
): MuscleMapEntry => (
  { muscle_id, side: 'midline', pos, radii, priority }
)

export const MUSCLE_MAP: MuscleMapEntry[] = [
  // ── Neck / head ──────────────────────────────────────────────────────────
  ...bilateral('sternocleidomastoid',     [0.040, Y(0.860), 0.060], R_SMALL, 2),
  ...bilateral('splenius_capitis',        [0.035, Y(0.880), -0.040], R_SMALL),
  ...bilateral('semispinalis_capitis',    [0.020, Y(0.890), -0.045], R_SMALL),

  // ── Shoulder cap (priority 3 so deltoid wins the click on the cap) ───────
  ...bilateral('deltoid_anterior',  [SHOULDER_X + 0.005, Y(0.830),  Z_FRONT], R_MED, 3),
  ...bilateral('deltoid_lateral',   [SHOULDER_X + 0.020, Y(0.825),  Z_LATERAL], R_MED, 3),
  ...bilateral('deltoid_posterior', [SHOULDER_X + 0.005, Y(0.830),  Z_BACK], R_MED, 3),

  // ── Rotator cuff (priority 1 — sits under deltoid) ───────────────────────
  ...bilateral('supraspinatus', [SCAPULA_X, Y(0.840),  Z_BACK_DEEP], R_SMALL),
  ...bilateral('infraspinatus', [SCAPULA_X, Y(0.810),  Z_BACK],      R_MED),
  ...bilateral('teres_minor',   [SCAPULA_X, Y(0.790),  Z_BACK],      R_SMALL),
  ...bilateral('teres_major',   [SCAPULA_X, Y(0.780),  Z_BACK],      R_SMALL),
  ...bilateral('subscapularis', [SCAPULA_X - 0.020, Y(0.810), Z_FRONT_DEEP - 0.010], R_SMALL),

  // ── Upper back / scapular stabilisers ────────────────────────────────────
  ...bilateral('trapezius_upper',   [0.060, Y(0.870),  Z_BACK_DEEP], R_MED),
  ...bilateral('trapezius_middle',  [0.070, Y(0.770),  Z_BACK],      R_MED),
  ...bilateral('trapezius_lower',   [0.050, Y(0.700),  Z_BACK],      R_MED),
  ...bilateral('rhomboid_major',    [0.060, Y(0.770),  Z_BACK_DEEP], R_SMALL),
  ...bilateral('rhomboid_minor',    [0.050, Y(0.820),  Z_BACK_DEEP], R_SMALL),
  ...bilateral('levator_scapulae',  [0.040, Y(0.860),  Z_BACK_DEEP], R_SMALL),

  // ── Chest / trunk anterior ───────────────────────────────────────────────
  ...bilateral('pectoralis_major',  [0.080, Y(0.745),  Z_FRONT], R_MED, 2),
  ...bilateral('serratus_anterior', [0.130, Y(0.700),  Z_LATERAL], R_SMALL),
  midline    ('rectus_abdominis',   [0.000, Y(0.605),  Z_FRONT], R_LARGE),
  ...bilateral('external_oblique',  [0.110, Y(0.620),  Z_LATERAL + 0.020], R_FLAT_H),

  // ── Mid / lower back ─────────────────────────────────────────────────────
  ...bilateral('latissimus_dorsi',     [0.105, Y(0.640),  Z_BACK],      R_FLAT_H),
  ...bilateral('erector_spinae',       [0.040, Y(0.560),  Z_BACK_DEEP], R_MED),
  midline    ('multifidus',            [0.000, Y(0.520),  Z_BACK_DEEP - 0.010], R_SMALL),
  ...bilateral('quadratus_lumborum',   [0.070, Y(0.590),  Z_BACK_DEEP], R_SMALL),

  // ── Hip ──────────────────────────────────────────────────────────────────
  ...bilateral('gluteus_maximus', [HIP_X + 0.015, Y(0.530),  Z_BACK + 0.005], R_LARGE),
  ...bilateral('gluteus_medius',  [HIP_X + 0.030, Y(0.560),  Z_LATERAL - 0.005], R_MED),
  ...bilateral('gluteus_minimus', [HIP_X + 0.025, Y(0.555),  Z_LATERAL - 0.020], R_SMALL),
  ...bilateral('tensor_fasciae_latae', [HIP_X + 0.030, Y(0.565), Z_FRONT_DEEP], R_SMALL),
  ...bilateral('piriformis',      [HIP_X - 0.010, Y(0.540),  Z_BACK_DEEP - 0.010], R_SMALL),
  ...bilateral('iliacus',         [0.060, Y(0.560),  Z_FRONT_DEEP - 0.010], R_SMALL),
  ...bilateral('psoas_major',     [0.040, Y(0.560),  Z_FRONT_DEEP - 0.025], R_SMALL),

  // ── Upper arm ────────────────────────────────────────────────────────────
  ...bilateral('biceps_brachii',  [ARM_X, Y(0.700),  Z_FRONT_DEEP], R_LIMB),
  ...bilateral('triceps_brachii', [ARM_X, Y(0.700),  Z_BACK_DEEP],  R_LIMB),

  // ── Forearm ──────────────────────────────────────────────────────────────
  ...bilateral('brachioradialis',                 [FOREARM_X - 0.005, Y(0.575), Z_FRONT_DEEP], R_LIMB),
  ...bilateral('extensor_carpi_radialis_longus',  [FOREARM_X,         Y(0.585), Z_LATERAL],    R_LIMB),
  ...bilateral('extensor_digitorum',              [FOREARM_X,         Y(0.555), Z_BACK_DEEP],  R_LIMB),
  ...bilateral('flexor_carpi_radialis',           [FOREARM_X - 0.010, Y(0.555), Z_FRONT_DEEP - 0.005], R_LIMB),
  ...bilateral('palmaris_longus',                 [FOREARM_X - 0.020, Y(0.555), Z_FRONT_DEEP - 0.005], R_LIMB),

  // ── Thigh ────────────────────────────────────────────────────────────────
  ...bilateral('rectus_femoris',     [THIGH_X,         Y(0.380),  Z_FRONT_DEEP], R_LIMB),
  ...bilateral('vastus_lateralis',   [THIGH_X + 0.040, Y(0.380),  Z_LATERAL],    R_LIMB),
  ...bilateral('vastus_medialis',    [THIGH_X - 0.030, Y(0.330),  Z_FRONT_DEEP], R_LIMB),
  ...bilateral('vastus_intermedius', [THIGH_X,         Y(0.380),  0.000],         R_LIMB),
  ...bilateral('biceps_femoris',     [THIGH_X + 0.025, Y(0.380),  Z_BACK_DEEP], R_LIMB),
  ...bilateral('semitendinosus',     [THIGH_X - 0.020, Y(0.380),  Z_BACK_DEEP], R_LIMB),
  ...bilateral('semimembranosus',    [THIGH_X - 0.030, Y(0.350),  Z_BACK_DEEP - 0.010], R_LIMB),
  ...bilateral('gracilis',           [THIGH_X - 0.035, Y(0.340),  0.000],          R_LIMB),
  ...bilateral('adductor_longus',    [THIGH_X - 0.020, Y(0.460),  Z_FRONT_DEEP - 0.010], R_LIMB),

  // ── Knee / lower leg ─────────────────────────────────────────────────────
  ...bilateral('popliteus',          [KNEE_X, Y(0.275),  Z_BACK_DEEP], R_SMALL),
  ...bilateral('gastrocnemius',      [CALF_X, Y(0.200),  Z_BACK_DEEP], R_LIMB),
  ...bilateral('soleus',             [CALF_X, Y(0.140),  Z_BACK_DEEP - 0.010], R_LIMB),
  ...bilateral('tibialis_anterior',  [FOOT_X + 0.005, Y(0.180), Z_FRONT_DEEP], R_LIMB),
]

// ─────────────────────────────────────────────────────────────────────────────
//  Side picking — point.x > 0 ⇒ left (per spec, matches existing convention)
//  but accommodates midline entries (no side filtering).
// ─────────────────────────────────────────────────────────────────────────────

function sideMatches(entry: MuscleMapEntry, point: THREE.Vector3): boolean {
  if (entry.side === 'midline') return true
  return entry.side === 'L' ? point.x > 0 : point.x < 0
}

// ─────────────────────────────────────────────────────────────────────────────
//  pickMuscleAtPoint — coordinate-based sub-selection
//
//  Returns the best matching MuscleMapEntry within MUSCLE_HIT_RADIUS_M, or
//  null if the click is outside any muscle's hit sphere.  Tie-break:
//    1. higher priority wins (superficial > deep)
//    2. shorter Euclidean distance wins
// ─────────────────────────────────────────────────────────────────────────────

export function pickMuscleAtPoint(point: THREE.Vector3): MuscleMapEntry | null {
  let best: MuscleMapEntry | null = null
  let bestPriority = -Infinity
  let bestDist = Infinity

  for (const entry of MUSCLE_MAP) {
    if (!sideMatches(entry, point)) continue
    const dx = point.x - entry.pos[0]
    const dy = point.y - entry.pos[1]
    const dz = point.z - entry.pos[2]
    const d  = Math.hypot(dx, dy, dz)
    if (d > MUSCLE_HIT_RADIUS_M) continue
    const pri = entry.priority ?? 1
    if (pri > bestPriority || (pri === bestPriority && d < bestDist)) {
      best = entry
      bestPriority = pri
      bestDist = d
    }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reverse lookup: muscle_id (+ optional side hint) → MuscleMapEntry
//  Used by the diagnostic drawer / sidebar to drive the highlight overlay.
// ─────────────────────────────────────────────────────────────────────────────

export function findMuscleEntry(
  muscle_id: string,
  preferSide?: MuscleSide,
): MuscleMapEntry | null {
  const candidates = MUSCLE_MAP.filter((m) => m.muscle_id === muscle_id)
  if (candidates.length === 0) return null
  if (preferSide) {
    const exact = candidates.find((c) => c.side === preferSide)
    if (exact) return exact
  }
  return candidates[0]
}
