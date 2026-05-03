/**
 * LeftSidebar.tsx
 *
 * New layout — the sidebar is always split:
 *   80 %  AI Diagnosis chat  (always visible, voice-ready)
 *   20 %  Structures tree    (compact, scrollable, mini search)
 *
 * FilterPanel and LayerVisibilityPanel have been removed — the AI chat
 * is now the primary discovery surface.
 */

import React from 'react'
import { TriageChat } from '../triage/TriageChat'
import { StructureTree } from '../controls/StructureTree'
import { useStructureSearch } from '../../hooks/useStructureSearch'
import { useAtlasStore } from '../../store/atlasStore'

// ── Compact result count ──────────────────────────────────────────────────────
function ResultCount() {
  const results = useStructureSearch()
  return (
    <span className="text-[10px] text-slate-500">
      {results.length}
    </span>
  )
}

// ── Mini search for the structures section ────────────────────────────────────
function MiniSearch() {
  const query    = useAtlasStore((s) => s.searchQuery)
  const setQuery = useAtlasStore((s) => s.setSearchQuery)
  return (
    <input
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search…"
      className="w-full text-[11px] bg-slate-800 text-slate-100 rounded px-2 py-1 border border-slate-700 focus:border-orange-500 focus:outline-none placeholder:text-slate-600"
    />
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────
export function LeftSidebar() {
  return (
    <aside
      className="flex flex-col border-r border-slate-700 bg-slate-900 flex-shrink-0 overflow-hidden w-full md:w-[300px] h-full"
    >
      {/* ── AI Diagnosis — 80 % ─────────────────────────────────────────── */}
      {/* Always open, inline, no close button. */}
      <div className="flex flex-col min-h-0" style={{ flex: 1 }}>
        <TriageChat
          open
          onClose={() => {/* panel is always open — no-op */}}
          inline
        />
      </div>

      {/* ── Structures — 20 % — desktop only (hidden on mobile) ────────── */}
      <div
        className="hidden md:flex flex-col border-t border-slate-700 flex-shrink-0"
        style={{ flex: '0 0 162px' }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 border-b border-slate-700/60">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            Structures
          </span>
          <ResultCount />
        </div>

        {/* Mini search */}
        <div className="px-2 py-1.5 flex-shrink-0">
          <MiniSearch />
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-1.5 pb-1">
          <StructureTree />
        </div>
      </div>
    </aside>
  )
}
