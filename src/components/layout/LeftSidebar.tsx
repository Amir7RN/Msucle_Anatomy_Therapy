/**
 * LeftSidebar.tsx
 *
 * Sidebar layout: AI Diagnosis chat fills remaining height, Structures
 * section is locked to a fixed pixel height so expanding a category never
 * pushes the chat off-screen.
 */

import React from 'react'
import { TriageChat } from '../triage/TriageChat'
import { StructureTree } from '../controls/StructureTree'
import { useStructureSearch } from '../../hooks/useStructureSearch'
import { useAtlasStore } from '../../store/atlasStore'

function ResultCount() {
  const results = useStructureSearch()
  return (
    <span className="text-[10px] text-slate-500">
      {results.length}
    </span>
  )
}

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

const noop = () => undefined

const chatSlotStyle: React.CSSProperties = {
  flex:      '1 1 0',
  minHeight: 0,
}

const structuresSlotStyle: React.CSSProperties = {
  height:    200,
  maxHeight: 200,
  minHeight: 200,
  flex:      '0 0 200px',
}

export function LeftSidebar() {
  return (
    <aside className="flex flex-col border-r border-slate-700 bg-slate-900 flex-shrink-0 overflow-hidden w-full md:w-[300px] h-full">
      <div className="flex flex-col min-h-0 overflow-hidden" style={chatSlotStyle}>
        <TriageChat open onClose={noop} inline />
      </div>
      <div
        className="hidden md:flex md:flex-col border-t border-slate-700 flex-shrink-0 overflow-hidden"
        style={structuresSlotStyle}
      >
        <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 border-b border-slate-700/60">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            Structures
          </span>
          <ResultCount />
        </div>
        <div className="px-2 py-1.5 flex-shrink-0">
          <MiniSearch />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-1">
          <StructureTree />
        </div>
      </div>
    </aside>
  )
}
