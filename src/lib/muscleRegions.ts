/**
 * muscleRegions.ts
 *
 * Classify each legacy GLB structureId into an anatomical region so the
 * MuscleOverlay can apply group-level transforms (rotation around the
 * shoulder/hip pivot + per-limb length stretch) on top of the global
 * non-uniform scale.
 *
 * Five regions:
 *   head    — neck + facial muscles, scapular stabilisers near skull
 *   trunk   — pec, lat, abs, erector, glutes (don't move with limb rotation)
 *   arm_l / arm_r — full upper limb (deltoid + biceps + triceps + forearm)
 *   leg_l / leg_r — full lower limb (quads + hamstrings + calf + ankle)
 *
 * Pivot points are in the legacy-GLB world space (i.e. matched to BODY_ZONES
 * landmarks) — that's the coordinate frame the muscle meshes live in BEFORE
 * the global MuscleOverlay scale/offset is applied.
 */

export type MuscleRegion = 'head' | 'trunk' | 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r'

const HEAD_KEYWORDS = [
  'STERNOCLEIDOMASTOID', 'MASSETER', 'TEMPORALIS', 'FRONTALIS', 'OCCIPITALIS',
  'OCCIPITAL_FRONTALIS', 'ORBICULARIS', 'ZYGOMATICUS', 'BUCCINATOR',
  'PLATYSMA', 'CORRUGATOR', 'MENTALIS', 'PROCERUS',
  'SPLENIUS_CAPITIS', 'SEMISPINALIS_CAPITIS',
]

const ARM_KEYWORDS = [
  'BICEPS_BRACHII', 'TRICEPS_BRACHII', 'BRACHIALIS', 'BRACHIORADIALIS',
  'CORACOBRACHIALIS', 'DELTOID', 'ANCONEUS',
  'EXTENSOR_CARPI', 'EXTENSOR_DIGITORUM', 'EXTENSOR_POLLICIS',
  'FLEXOR_CARPI', 'FLEXOR_DIGITORUM_SUPERFICIALIS', 'FLEXOR_DIGITORUM_PROFUNDUS',
  'FLEXOR_POLLICIS', 'PALMARIS', 'PRONATOR', 'SUPINATOR',
]

const LEG_KEYWORDS = [
  'RECTUS_FEMORIS', 'VASTUS_LATERALIS', 'VASTUS_MEDIALIS', 'VASTUS_INTERMEDIUS',
  'BICEPS_FEMORIS', 'SEMITENDINOSUS', 'SEMIMEMBRANOSUS',
  'GRACILIS', 'ADDUCTOR_', 'SARTORIUS', 'PECTINEUS',
  'TENSOR_FASCIAE_LATAE',
  'GASTROCNEMIUS', 'SOLEUS', 'PLANTARIS', 'POPLITEUS',
  'TIBIALIS_ANTERIOR', 'TIBIALIS_POSTERIOR',
  'PERONEUS', 'FIBULARIS',
  'EXTENSOR_DIGITORUM_LONGUS', 'FLEXOR_DIGITORUM_LONGUS',
  'EXTENSOR_HALLUCIS', 'FLEXOR_HALLUCIS',
]

export function getMuscleRegion(structureId: string | null | undefined): MuscleRegion {
  if (!structureId) return 'trunk'
  const u = structureId.toUpperCase()
  const isLeft  = u.endsWith('_L')

  if (HEAD_KEYWORDS.some((k) => u.includes(k))) return 'head'
  if (ARM_KEYWORDS.some((k) => u.includes(k)))  return isLeft ? 'arm_l' : 'arm_r'
  if (LEG_KEYWORDS.some((k) => u.includes(k)))  return isLeft ? 'leg_l' : 'leg_r'
  return 'trunk'
}

// Pivot points in the legacy-GLB world space.  Tuned visually against
// BODY_ZONES landmarks (shoulder_r at -0.172, 0.352, 0.020 etc).
//
// These are PRE-MuscleOverlay-scale coords because the matrix transform
// happens at the mesh level, before the parent <group scale={...}> kicks in.
export const REGION_PIVOTS: Record<MuscleRegion, [number, number, number]> = {
  head:   [ 0.000,  0.500,  0.000],
  trunk:  [ 0.000,  0.150,  0.000],
  arm_r:  [-0.170,  0.355,  0.020],
  arm_l:  [ 0.170,  0.355,  0.020],
  leg_r:  [-0.090, -0.020,  0.000],
  leg_l:  [ 0.090, -0.020,  0.000],
}
