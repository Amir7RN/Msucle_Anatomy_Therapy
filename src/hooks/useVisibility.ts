import { useAtlasStore, isStructureVisible } from '../store/atlasStore'

/**
 * Returns visibility state and toggle helpers for a single structure id.
 * Designed to be called once per mesh component.
 */
export function useVisibility(id: string) {
  const hiddenIds    = useAtlasStore((s) => s.hiddenIds)
  const isolateMode  = useAtlasStore((s) => s.isolateMode)
  const selectedId   = useAtlasStore((s) => s.selectedId)
  const toggleHidden = useAtlasStore((s) => s.toggleHidden)

  const visible = isStructureVisible(id, hiddenIds, isolateMode, selectedId)
  const hidden  = hiddenIds.has(id)

  return { visible, hidden, toggleHidden }
}
