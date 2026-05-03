import React, { useState, useMemo } from 'react'
import { Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react'
import { useAtlasStore, isStructureVisible } from '../../store/atlasStore'
import { useStructureSearch } from '../../hooks/useStructureSearch'
import { clsx } from '../../lib/clsx'
import type { StructureMetadata } from '../../lib/types'
import { REGION_LABELS } from '../../lib/structureMapper'

// ── Region label colours ──────────────────────────────────────────────────────

const REGION_COLORS: Record<string, string> = {
  head_neck:  'text-purple-500',
  trunk:      'text-amber-500',
  upper_limb: 'text-blue-500',
  lower_limb: 'text-green-500',
}

// ── Single structure row ──────────────────────────────────────────────────────

function StructureRow({ meta }: { meta: StructureMetadata }) {
  const selectedId  = useAtlasStore((s) => s.selectedId)
  const hoveredId   = useAtlasStore((s) => s.hoveredId)
  const hiddenIds   = useAtlasStore((s) => s.hiddenIds)
  const isolateMode = useAtlasStore((s) => s.isolateMode)
  const setSelected = useAtlasStore((s) => s.setSelected)
  const setHovered  = useAtlasStore((s) => s.setHovered)
  const toggleHidden = useAtlasStore((s) => s.toggleHidden)

  const isSelected = selectedId  === meta.id
  const isHovered  = hoveredId   === meta.id
  const isHidden   = hiddenIds.has(meta.id)
  const visible    = isStructureVisible(meta.id, hiddenIds, isolateMode, selectedId)

  return (
    <div
      className={clsx(
        'group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors select-none',
        isSelected
          ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-medium'
          : isHovered
          ? 'bg-slate-100 dark:bg-slate-700/50'
          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30',
        !visible && 'opacity-40',
      )}
      onClick={() => setSelected(isSelected ? null : meta.id)}
      onMouseEnter={() => setHovered(meta.id)}
      onMouseLeave={() => setHovered(null)}
    >
      {/* visibility toggle button */}
      <button
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-opacity"
        onClick={(e) => { e.stopPropagation(); toggleHidden(meta.id) }}
        aria-label={isHidden ? 'Show' : 'Hide'}
      >
        {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>

      {/* colour dot */}
      <span
        className="flex-shrink-0 w-2 h-2 rounded-full"
        style={{ backgroundColor: isSelected ? '#3b82f6' : '#c0705a' }}
      />

      {/* name */}
      <span className="flex-1 truncate leading-tight">{meta.displayName}</span>

      {/* layer badge */}
      <span className="flex-shrink-0 text-slate-400 text-[10px] hidden group-hover:block">
        {meta.layer.slice(0, 3)}
      </span>
    </div>
  )
}

// ── Region group ──────────────────────────────────────────────────────────────

function RegionGroup({
  region,
  structures,
}: {
  region:     string
  structures: StructureMetadata[]
}) {
  const [open, setOpen] = useState(true)
  const label = REGION_LABELS[region] ?? region

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex items-center gap-1 w-full text-left py-0.5 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors',
          'text-xs font-semibold uppercase tracking-wide',
          REGION_COLORS[region] ?? 'text-slate-500',
        )}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {label}
        <span className="ml-auto font-normal text-slate-400 text-[10px] normal-case tracking-normal">
          {structures.length}
        </span>
      </button>

      {open && (
        <div className="ml-1 border-l border-slate-100 dark:border-slate-700 pl-1 mt-0.5">
          {structures.map((m) => (
            <StructureRow key={m.id} meta={m} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main structure tree ───────────────────────────────────────────────────────

export function StructureTree() {
  const results = useStructureSearch()

  // Group by region, preserving a fixed order
  const REGION_ORDER = ['head_neck', 'trunk', 'upper_limb', 'lower_limb']

  const grouped = useMemo(() => {
    const map = new Map<string, StructureMetadata[]>()
    for (const m of results) {
      const list = map.get(m.region)
      if (list) list.push(m)
      else map.set(m.region, [m])
    }
    return map
  }, [results])

  if (results.length === 0) {
    return (
      <div className="text-xs text-slate-400 dark:text-slate-500 italic px-2 py-4 text-center">
        No structures match the current filters.
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {REGION_ORDER.filter((r) => grouped.has(r)).map((r) => (
        <RegionGroup key={r} region={r} structures={grouped.get(r)!} />
      ))}
      {/* Any extra regions not in the hardcoded order */}
      {Array.from(grouped.entries())
        .filter(([r]) => !REGION_ORDER.includes(r))
        .map(([r, s]) => (
          <RegionGroup key={r} region={r} structures={s} />
        ))
      }
    </div>
  )
}
