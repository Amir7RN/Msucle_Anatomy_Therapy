import { useMemo } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import type { StructureMetadata } from '../lib/types'

/** Normalise a string for fuzzy matching: lowercase, no diacritics */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Returns the filtered + searched list of StructureMetadata records.
 * Combines free-text search with the active dimension filters from the store.
 */
export function useStructureSearch(): StructureMetadata[] {
  const sceneIndex    = useAtlasStore((s) => s.sceneIndex)
  const searchQuery   = useAtlasStore((s) => s.searchQuery)
  const activeFilters = useAtlasStore((s) => s.activeFilters)

  return useMemo(() => {
    const query = normalise(searchQuery.trim())

    // Collect all metadata records as an array
    const all = Array.from(sceneIndex.metadataById.values())

    // 1. Text search
    const searched = query.length === 0
      ? all
      : all.filter((s) => {
          if (normalise(s.displayName).includes(query)) return true
          if (normalise(s.id).includes(query)) return true
          if (s.synonyms.some((syn) => normalise(syn).includes(query))) return true
          if (s.meshNames.some((m)   => normalise(m).includes(query)))  return true
          return false
        })

    // 2. Dimension filters (each active filter is an OR within its dimension,
    //    dimensions are ANDed together)
    return searched.filter((s) => {
      if (activeFilters.systems.length > 0 && !activeFilters.systems.includes(s.system as never)) return false
      if (activeFilters.layers.length  > 0 && !activeFilters.layers.includes(s.layer   as never)) return false
      if (activeFilters.regions.length > 0 && !activeFilters.regions.includes(s.region as never)) return false
      if (activeFilters.sides.length   > 0 && !activeFilters.sides.includes(s.side     as never)) return false
      return true
    })
  }, [sceneIndex, searchQuery, activeFilters])
}
