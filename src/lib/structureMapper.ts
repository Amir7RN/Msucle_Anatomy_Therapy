/**
 * structureMapper.ts
 * Utilities for mapping between mesh names, structure ids, and metadata.
 * Keeps the caller code lean by centralising the lookup logic.
 */

import type { SceneIndex, StructureMetadata } from './types'

/** Resolve a structure id from a mesh name using the loaded index. */
export function meshNameToId(index: SceneIndex, meshName: string): string | undefined {
  return (
    index.idByMeshName.get(meshName) ??
    index.idByMeshName.get(meshName.toLowerCase())
  )
}

/** Look up the metadata record for a structure id. */
export function idToMetadata(index: SceneIndex, id: string): StructureMetadata | undefined {
  return index.metadataById.get(id)
}

/**
 * Filter the full id list by a set of system / layer / region / side constraints.
 * Any empty array means "no constraint on this dimension".
 */
export function filterIds(
  index: SceneIndex,
  opts: {
    systems?: string[]
    layers?:  string[]
    regions?: string[]
    sides?:   string[]
  },
): string[] {
  let ids = index.allIds

  if (opts.systems && opts.systems.length > 0) {
    const allowed = new Set(opts.systems)
    ids = ids.filter((id) => {
      const s = index.metadataById.get(id)
      return s ? allowed.has(s.system) : false
    })
  }

  if (opts.layers && opts.layers.length > 0) {
    const allowed = new Set(opts.layers)
    ids = ids.filter((id) => {
      const s = index.metadataById.get(id)
      return s ? allowed.has(s.layer) : false
    })
  }

  if (opts.regions && opts.regions.length > 0) {
    const allowed = new Set(opts.regions)
    ids = ids.filter((id) => {
      const s = index.metadataById.get(id)
      return s ? allowed.has(s.region) : false
    })
  }

  if (opts.sides && opts.sides.length > 0) {
    const allowed = new Set(opts.sides)
    ids = ids.filter((id) => {
      const s = index.metadataById.get(id)
      return s ? allowed.has(s.side) : false
    })
  }

  return ids
}

/** Human-readable label for anatomical regions */
export const REGION_LABELS: Record<string, string> = {
  head_neck:   'Head / Neck',
  trunk:       'Trunk',
  upper_limb:  'Upper Limb',
  lower_limb:  'Lower Limb',
}

/** Human-readable label for layers */
export const LAYER_LABELS: Record<string, string> = {
  superficial:  'Superficial',
  intermediate: 'Intermediate',
  deep:         'Deep',
}

/** Human-readable label for sides */
export const SIDE_LABELS: Record<string, string> = {
  left:      'Left',
  right:     'Right',
  bilateral: 'Bilateral',
}

/** Human-readable label for systems */
export const SYSTEM_LABELS: Record<string, string> = {
  muscle:   'Muscles',
  skeleton: 'Skeleton',
  nerve:    'Nerves',
  joints:   'Joints',
}
