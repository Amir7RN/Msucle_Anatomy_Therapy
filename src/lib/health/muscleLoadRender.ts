/**
 * muscleLoadRender.ts
 *
 * Bridges the health-data muscle-load summary (muscleLoadEstimator.ts) into the
 * activation vocabulary the existing 3D twin model colours by. This lets the
 * Import Health Data view reuse MuscleTwinModel unchanged — the ONLY difference
 * from the live view is the colour source: instead of live joint-angle
 * intensity, each muscle's level is its group's ACWR-derived renderLevel.
 */

import type { LiveMuscleActivation } from '../movement/liveMuscleActivation'
import type { MuscleLoadResult } from './muscleLoadEstimator'

/**
 * Expand per-group render levels into one activation record per constituent
 * muscle id. region 'trunk' resolves to side 'C' in MuscleTwinModel, so the
 * load colours both the left and right meshes of each muscle (health data has
 * no side information).
 */
export function loadToActivations(result: MuscleLoadResult): LiveMuscleActivation[] {
  const out: LiveMuscleActivation[] = []
  for (const g of result.groups) {
    // Import the group def lazily to avoid a cyclic import at module load.
    for (const muscleId of muscleIdsFor(g.group)) {
      out.push({
        muscleId,
        region: 'trunk',
        level:  g.renderLevel,
        role:   'agonist',
        phase:  'isometric',
        side:   'C',
      })
    }
  }
  return out
}

// Local copy of the group -> muscleId expansion, kept in sync with
// MUSCLE_GROUPS. Imported via a function to avoid a load-order cycle.
import { MUSCLE_GROUPS, type MuscleGroupId } from './muscleLoadEstimator'
function muscleIdsFor(group: MuscleGroupId): string[] {
  return MUSCLE_GROUPS.find((g) => g.id === group)?.muscleIds ?? []
}
