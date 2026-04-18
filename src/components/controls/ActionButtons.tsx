import React from 'react'
import {
  RotateCcw,
  Eye,
  EyeOff,
  Crosshair,
  Ghost,
  Moon,
  Sun,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useAtlasStore } from '../../store/atlasStore'

/**
 * Header action buttons: Reset View, Show All, Hide Selected, Isolate Selected.
 * Also includes Dark Mode and Ghost Mode toggles.
 */
export function ActionButtons() {
  const selectedId      = useAtlasStore((s) => s.selectedId)
  const isolateMode     = useAtlasStore((s) => s.isolateMode)
  const darkMode        = useAtlasStore((s) => s.darkMode)
  const ghostMode       = useAtlasStore((s) => s.ghostMode)
  const resetView       = useAtlasStore((s) => s.resetView)
  const showAll         = useAtlasStore((s) => s.showAll)
  const hideSelected    = useAtlasStore((s) => s.hideSelected)
  const isolateSelected = useAtlasStore((s) => s.isolateSelected)
  const exitIsolate     = useAtlasStore((s) => s.exitIsolate)
  const toggleDarkMode  = useAtlasStore((s) => s.toggleDarkMode)
  const toggleGhostMode = useAtlasStore((s) => s.toggleGhostMode)

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Button
        variant="secondary"
        size="sm"
        icon={<RotateCcw size={13} />}
        onClick={resetView}
        title="Reset camera and clear all visibility overrides"
      >
        Reset
      </Button>

      <Button
        variant="secondary"
        size="sm"
        icon={<Eye size={13} />}
        onClick={showAll}
        title="Show all hidden structures"
      >
        Show All
      </Button>

      <Button
        variant="secondary"
        size="sm"
        icon={<EyeOff size={13} />}
        onClick={hideSelected}
        disabled={!selectedId}
        title="Hide the currently selected structure"
      >
        Hide
      </Button>

      <Button
        variant={isolateMode ? 'primary' : 'secondary'}
        size="sm"
        icon={<Crosshair size={13} />}
        onClick={isolateMode ? exitIsolate : isolateSelected}
        disabled={!selectedId && !isolateMode}
        active={isolateMode}
        title={isolateMode ? 'Exit isolate mode' : 'Isolate selected structure'}
      >
        {isolateMode ? 'Exit Isolate' : 'Isolate'}
      </Button>

      {/* Divider */}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-0.5" />

      <Button
        variant={ghostMode ? 'primary' : 'ghost'}
        size="sm"
        icon={<Ghost size={13} />}
        onClick={toggleGhostMode}
        active={ghostMode}
        title="Ghost mode — make surrounding structures semi-transparent"
      >
        Ghost
      </Button>

      <Button
        variant="ghost"
        size="sm"
        icon={darkMode ? <Sun size={13} /> : <Moon size={13} />}
        onClick={toggleDarkMode}
        title="Toggle dark mode"
      />
    </div>
  )
}
