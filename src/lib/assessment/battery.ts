/**
 * battery.ts
 *
 * Full-body assessment battery — a curated, ordered sequence of ROM tests
 * grouped by body segment.  Drives the FullBodyAssessmentView, and (because
 * each item carries a canonical primary muscle + a list of related muscles)
 * each measurement is mirror-written into every related muscle's per-joint
 * history.  That way, when the user opens the right panel for "deltoid"
 * after running a shoulder battery, the trend chart shows their battery
 * peaks automatically.
 *
 * Segments
 * ────────
 *  UPPER:  neck · shoulders · arms · trunk
 *  LOWER:  hips · knees · ankles
 *
 * Each segment carries a small set of movements that cover the joint's
 * ROM (flex/ext/abd/add/rot where applicable) on both sides where the
 * movement is paired left+right.
 */

import { JOINT_MOVEMENTS, MUSCLE_TO_MOVEMENTS, type JointMovement } from '../movement/muscleJointMap'

export type SegmentId =
  | 'neck' | 'shoulders' | 'arms' | 'trunk'
  | 'hips' | 'knees' | 'ankles'

export interface SegmentDef {
  id:         SegmentId
  label:      string
  /** 'upper' | 'lower' — grouping for the UI section headers. */
  region:     'upper' | 'lower'
  /** Movement IDs belonging to this segment (from JOINT_MOVEMENTS). */
  movements:  string[]
  /** Canonical primary muscle id for each movement — used as the storage key
   *  when the battery writes the result. */
  primaryMuscle: Record<string, string>
}

export const SEGMENTS: SegmentDef[] = [
  {
    id: 'neck', label: 'Neck', region: 'upper',
    movements: [
      'cervical_flexion', 'cervical_extension',
      'cervical_rotation_left', 'cervical_rotation_right',
      'cervical_lateral_flexion_left', 'cervical_lateral_flexion_right',
    ],
    primaryMuscle: {
      cervical_flexion:                 'sternocleidomastoid',
      cervical_extension:               'suboccipitals',
      cervical_rotation_left:           'sternocleidomastoid',
      cervical_rotation_right:          'sternocleidomastoid',
      cervical_lateral_flexion_left:    'scalenus',
      cervical_lateral_flexion_right:   'scalenus',
    },
  },
  {
    id: 'shoulders', label: 'Shoulders', region: 'upper',
    movements: [
      'shoulder_flexion', 'shoulder_extension',
      'shoulder_abduction', 'shoulder_adduction',
      'shoulder_external_rotation', 'shoulder_internal_rotation',
    ],
    primaryMuscle: {
      shoulder_flexion:             'deltoid',
      shoulder_extension:           'deltoid_posterior',
      shoulder_abduction:           'deltoid',
      shoulder_adduction:           'pectoralis_major',
      shoulder_external_rotation:   'infraspinatus',
      shoulder_internal_rotation:   'subscapularis',
    },
  },
  {
    id: 'arms', label: 'Arms', region: 'upper',
    movements: ['elbow_flexion'],
    primaryMuscle: { elbow_flexion: 'biceps_brachii' },
  },
  {
    id: 'trunk', label: 'Trunk', region: 'upper',
    movements: [
      'trunk_flexion', 'trunk_extension',
      'trunk_lateral_flexion_left', 'trunk_lateral_flexion_right',
      'trunk_rotation_left', 'trunk_rotation_right',
    ],
    primaryMuscle: {
      trunk_flexion:                'rectus_abdominis',
      trunk_extension:              'erector_spinae',
      trunk_lateral_flexion_left:   'quadratus_lumborum',
      trunk_lateral_flexion_right:  'quadratus_lumborum',
      trunk_rotation_left:          'external_oblique',
      trunk_rotation_right:         'external_oblique',
    },
  },
  {
    id: 'hips', label: 'Hips', region: 'lower',
    movements: [
      'hip_flexion', 'hip_extension',
      'hip_abduction', 'hip_adduction',
      'hip_rotation',
    ],
    primaryMuscle: {
      hip_flexion:    'iliacus',
      hip_extension:  'gluteus_maximus',
      hip_abduction:  'gluteus_medius',
      hip_adduction:  'adductor_longus',
      hip_rotation:   'gluteus_medius',
    },
  },
  {
    id: 'knees', label: 'Knees', region: 'lower',
    movements: ['knee_flexion'],
    primaryMuscle: { knee_flexion: 'biceps_femoris' },
  },
  {
    id: 'ankles', label: 'Ankles', region: 'lower',
    movements: ['ankle_dorsiflexion', 'ankle_plantarflexion'],
    primaryMuscle: {
      ankle_dorsiflexion:   'tibialis_anterior',
      ankle_plantarflexion: 'gastrocnemius',
    },
  },
]

export interface BatteryItem {
  /** Movement to run. */
  movement: JointMovement
  /** Side — 'L' or 'R'. For 'either' movements we run BOTH sides as
   *  separate items so the per-side history fills correctly. */
  side: 'L' | 'R'
  /** Muscle id to use as the canonical storage key. */
  muscleId: string
  /** Extra muscle ids whose history this measurement should also fill (so
   *  the right-panel per-muscle trend chart lights up for every related
   *  muscle, not just the primary). Derived from MUSCLE_TO_MOVEMENTS. */
  extraMuscleIds: string[]
  /** Segment the item belongs to (for grouping in the progress UI). */
  segmentId: SegmentId
  /** When true, the coach uses a SHORT cue ("Now repeat with your right
   *  side") instead of the full intro+howTo. Set on the second-of-pair
   *  during full-body battery runs so the user isn't re-lectured on a
   *  motion they just did on the other side. */
  brief: boolean
}

/** Build an ordered queue of measurements for the selected segments. */
export function buildBattery(selected: SegmentId[]): BatteryItem[] {
  const segIds = new Set(selected)
  const out: BatteryItem[] = []
  // Reverse lookup: movementId -> all muscleIds that include it.
  const movementToMuscles = new Map<string, string[]>()
  for (const [muscleId, movs] of Object.entries(MUSCLE_TO_MOVEMENTS)) {
    for (const m of movs) {
      const arr = movementToMuscles.get(m) ?? []
      arr.push(muscleId)
      movementToMuscles.set(m, arr)
    }
  }
  for (const seg of SEGMENTS) {
    if (!segIds.has(seg.id)) continue
    for (const movId of seg.movements) {
      const mv = JOINT_MOVEMENTS[movId]
      if (!mv) continue
      const primary = seg.primaryMuscle[movId] ?? movementToMuscles.get(movId)?.[0] ?? 'unknown'
      const extras  = (movementToMuscles.get(movId) ?? []).filter((x) => x !== primary)
      if (mv.side === 'either') {
        // Run both sides for paired movements. LEFT first, FULL coaching;
        // RIGHT second, BRIEF coaching (so the user doesn't hear the same
        // explanation twice).
        out.push({ movement: mv, side: 'L', muscleId: primary, extraMuscleIds: extras, segmentId: seg.id, brief: false })
        out.push({ movement: mv, side: 'R', muscleId: primary, extraMuscleIds: extras, segmentId: seg.id, brief: true })
      } else if (mv.side === 'L' || mv.side === 'R') {
        out.push({ movement: mv, side: mv.side, muscleId: primary, extraMuscleIds: extras, segmentId: seg.id, brief: false })
      }
    }
  }
  return out
}

/** Estimate of total minutes for a battery — used in the chooser UI. */
export function estimateBatteryMinutes(items: BatteryItem[]): number {
  // Each item: ~3 s calibration + ~7 s explain + ~6 s measure + ~4 s result = ~20 s.
  return Math.max(1, Math.ceil((items.length * 20) / 60))
}
