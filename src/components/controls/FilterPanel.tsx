import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { clsx } from '../../lib/clsx'
import { LayerVisibilityPanel } from './LayerVisibilityPanel'

// ── Generic filter chip ───────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label:   string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2 py-0.5 rounded-full text-xs border transition-colors',
        active
          ? 'bg-primary-500 text-white border-primary-500'
          : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-primary-400 hover:text-primary-500',
      )}
    >
      {label}
    </button>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────

function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title:        string
  children:     React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 w-full text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide py-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="flex flex-wrap gap-1 pb-2">{children}</div>}
    </div>
  )
}

// ── Main filter panel ─────────────────────────────────────────────────────────

export function FilterPanel() {
  const activeFilters      = useAtlasStore((s) => s.activeFilters)
  const toggleSystemFilter = useAtlasStore((s) => s.toggleSystemFilter)
  const toggleLayerFilter  = useAtlasStore((s) => s.toggleLayerFilter)
  const toggleRegionFilter = useAtlasStore((s) => s.toggleRegionFilter)
  const toggleSideFilter   = useAtlasStore((s) => s.toggleSideFilter)
  const clearFilters       = useAtlasStore((s) => s.clearFilters)

  const hasActiveFilters =
    activeFilters.systems.length +
    activeFilters.layers.length  +
    activeFilters.regions.length +
    activeFilters.sides.length   > 0

  return (
    <div className="space-y-1">
      {/* ── Search/list filters ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Filters
        </span>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-primary-500 hover:text-primary-600"
          >
            Clear all
          </button>
        )}
      </div>

      <FilterSection title="System">
        {(['muscle','skeleton','nerve','joint'] as const).map((s) => (
          <FilterChip
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1) + 's'}
            active={activeFilters.systems.includes(s)}
            onClick={() => toggleSystemFilter(s)}
          />
        ))}
      </FilterSection>

      <FilterSection title="Layer (list)">
        {(['superficial','intermediate','deep'] as const).map((l) => (
          <FilterChip
            key={l}
            label={l.charAt(0).toUpperCase() + l.slice(1)}
            active={activeFilters.layers.includes(l)}
            onClick={() => toggleLayerFilter(l)}
          />
        ))}
      </FilterSection>

      <FilterSection title="Region">
        <FilterChip
          label="Head / Neck"
          active={activeFilters.regions.includes('head_neck')}
          onClick={() => toggleRegionFilter('head_neck')}
        />
        <FilterChip
          label="Trunk"
          active={activeFilters.regions.includes('trunk')}
          onClick={() => toggleRegionFilter('trunk')}
        />
        <FilterChip
          label="Upper Limb"
          active={activeFilters.regions.includes('upper_limb')}
          onClick={() => toggleRegionFilter('upper_limb')}
        />
        <FilterChip
          label="Lower Limb"
          active={activeFilters.regions.includes('lower_limb')}
          onClick={() => toggleRegionFilter('lower_limb')}
        />
      </FilterSection>

      <FilterSection title="Side" defaultOpen={false}>
        {(['left','right','bilateral'] as const).map((s) => (
          <FilterChip
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            active={activeFilters.sides.includes(s)}
            onClick={() => toggleSideFilter(s)}
          />
        ))}
      </FilterSection>

      {/* ── 3D Layer visibility (separate from list filter) ──────────────── */}
      <div className="border-t border-slate-100 dark:border-slate-700/60 pt-2 mt-1">
        <LayerVisibilityPanel />
      </div>
    </div>
  )
}
