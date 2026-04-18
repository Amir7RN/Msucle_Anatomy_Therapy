import React, { useState } from 'react'
import { Eye, EyeOff, Ghost, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { clsx } from '../../lib/clsx'
import type { LayerType } from '../../lib/types'

// ── Layer definitions ─────────────────────────────────────────────────────────

interface LayerDef {
  key:         LayerType
  label:       string
  description: string
  color:       string   // Tailwind text class
  dotColor:    string   // inline style hex
}

const LAYERS: LayerDef[] = [
  {
    key:         'superficial',
    label:       'Superficial',
    description: 'Outermost muscles visible beneath skin',
    color:       'text-rose-500',
    dotColor:    '#f43f5e',
  },
  {
    key:         'intermediate',
    label:       'Intermediate',
    description: 'Mid-depth layer beneath superficial',
    color:       'text-orange-500',
    dotColor:    '#f97316',
  },
  {
    key:         'deep',
    label:       'Deep',
    description: 'Deepest layer, closest to bone',
    color:       'text-amber-600',
    dotColor:    '#d97706',
  },
]

// ── Single layer row ──────────────────────────────────────────────────────────

function LayerRow({ def }: { def: LayerDef }) {
  const hiddenLayers   = useAtlasStore((s) => s.hiddenLayers)
  const ghostedLayers  = useAtlasStore((s) => s.ghostedLayers)
  const sceneIndex     = useAtlasStore((s) => s.sceneIndex)
  const toggleHide     = useAtlasStore((s) => s.toggleHideLayer)
  const toggleGhost    = useAtlasStore((s) => s.toggleGhostLayer)

  const isHidden  = hiddenLayers.has(def.key)
  const isGhosted = ghostedLayers.has(def.key)

  // Count structures in this layer
  const count = sceneIndex.idsByLayer.get(def.key)?.length ?? 0

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-2 py-1.5 rounded transition-colors',
        isHidden
          ? 'opacity-40 bg-slate-50 dark:bg-slate-800/40'
          : isGhosted
          ? 'bg-blue-50/40 dark:bg-blue-950/20'
          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30',
      )}
    >
      {/* Colour indicator dot */}
      <span
        className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: isHidden ? '#64748b' : def.dotColor }}
      />

      {/* Layer name + count */}
      <div className="flex-1 min-w-0">
        <span
          className={clsx(
            'text-xs font-medium',
            isHidden
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : isGhosted
              ? 'text-slate-500 dark:text-slate-400'
              : def.color,
          )}
        >
          {def.label}
        </span>
        <span className="ml-1.5 text-[10px] text-slate-400 dark:text-slate-500">
          {count}
        </span>
      </div>

      {/* Ghost toggle — semi-transparent */}
      <button
        title={isGhosted ? 'Un-ghost layer' : 'Ghost layer (semi-transparent)'}
        onClick={() => toggleGhost(def.key)}
        className={clsx(
          'flex-shrink-0 p-0.5 rounded transition-colors',
          isGhosted
            ? 'text-blue-500 bg-blue-100 dark:bg-blue-900/30'
            : 'text-slate-300 dark:text-slate-600 hover:text-blue-400 dark:hover:text-blue-400',
        )}
      >
        {/* Ghost icon — use a semi-filled eye to represent ghost */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" strokeDasharray="2 2" />
        </svg>
      </button>

      {/* Eye toggle — fully hide/show */}
      <button
        title={isHidden ? 'Show layer' : 'Hide layer'}
        onClick={() => toggleHide(def.key)}
        className={clsx(
          'flex-shrink-0 p-0.5 rounded transition-colors',
          isHidden
            ? 'text-slate-500 bg-slate-100 dark:bg-slate-700/50'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300',
        )}
      >
        {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function LayerVisibilityPanel() {
  const [open, setOpen] = useState(true)
  const hiddenLayers  = useAtlasStore((s) => s.hiddenLayers)
  const ghostedLayers = useAtlasStore((s) => s.ghostedLayers)
  const showAllLayers = useAtlasStore((s) => s.showAllLayers)

  const hasAnyLayerState = hiddenLayers.size > 0 || ghostedLayers.size > 0

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Layer Visibility
        </button>
        {hasAnyLayerState && (
          <button
            onClick={showAllLayers}
            title="Restore all layers"
            className="flex items-center gap-0.5 text-[10px] text-primary-500 hover:text-primary-600 transition-colors"
          >
            <RotateCcw size={10} />
            Reset
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-0.5">
          {LAYERS.map((def) => (
            <LayerRow key={def.key} def={def} />
          ))}

          {/* Legend */}
          <div className="mt-1.5 px-2 flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <Eye size={10} /> = hide/show
            </span>
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" strokeDasharray="2 2" /></svg>
              = ghost
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
