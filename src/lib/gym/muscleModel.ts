/**
 * gym/muscleModel.ts
 *
 * Bridges the gym muscle GROUPS to the shared human-muscular-system.glb so the
 * 3D model (home muscle-map + trainer twin) can glow the right meshes.
 *
 * The GLB names meshes MUSC_<NAME>_L/R; MuscleActivationViewer substring-matches
 * an UPPERCASE stem against those names, so we just provide stems per group.
 */

import type { MuscleActivation } from '../movement/muscleActivation'
import type { MuscleGroupId } from './exercises'

export const GROUP_MESH_STEMS: Record<MuscleGroupId, string[]> = {
  chest:     ['PECTORALIS'],
  back:      ['LATISSIMUS', 'TRAPEZIUS', 'ERECTOR_SPINAE', 'TERES', 'RHOMBOID'],
  shoulders: ['DELTOID', 'INFRASPINATUS', 'SUPRASPINATUS'],
  arms:      ['BICEPS_BRACHII', 'TRICEPS_BRACHII', 'BRACHIALIS', 'BRACHIORADIALIS'],
  legs:      ['RECTUS_FEMORIS', 'VASTUS', 'BICEPS_FEMORIS', 'SEMITENDINOSUS', 'SEMIMEMBRANOSUS', 'GLUTEUS', 'GASTROCNEMIUS', 'SOLEUS'],
  core:      ['RECTUS_ABDOMINIS', 'OBLIQUE'],
}

/** Build activation records (consumed by MuscleActivationViewer) for a group. */
export function groupActivations(group: MuscleGroupId | null | undefined, level = 0.85): MuscleActivation[] {
  if (!group) return []
  return GROUP_MESH_STEMS[group].map((stem) => ({ muscleId: stem, region: 'trunk', level }))
}
