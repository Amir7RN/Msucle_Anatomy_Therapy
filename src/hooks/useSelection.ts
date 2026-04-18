import { useAtlasStore } from '../store/atlasStore'

/**
 * Returns selection state and callbacks for a single structure id.
 * Designed to be called once per interactive mesh component.
 */
export function useSelection(id: string) {
  const selectedId = useAtlasStore((s) => s.selectedId)
  const hoveredId  = useAtlasStore((s) => s.hoveredId)
  const setSelected = useAtlasStore((s) => s.setSelected)
  const setHovered  = useAtlasStore((s) => s.setHovered)

  const isSelected = selectedId === id
  const isHovered  = hoveredId  === id

  function handleClick(e: { stopPropagation: () => void }) {
    e.stopPropagation()
    setSelected(isSelected ? null : id)
  }

  function handlePointerOver(e: { stopPropagation: () => void }) {
    e.stopPropagation()
    setHovered(id)
  }

  function handlePointerOut() {
    setHovered(null)
  }

  return { isSelected, isHovered, handleClick, handlePointerOver, handlePointerOut }
}
