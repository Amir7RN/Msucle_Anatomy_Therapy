import React from 'react'
import { SearchBar } from '../controls/SearchBar'
import { FilterPanel } from '../controls/FilterPanel'
import { StructureTree } from '../controls/StructureTree'
import { useStructureSearch } from '../../hooks/useStructureSearch'

function ResultCount() {
  const results = useStructureSearch()
  return (
    <span className="text-[10px] text-slate-400 dark:text-slate-500">
      {results.length} structure{results.length !== 1 ? 's' : ''}
    </span>
  )
}

export function LeftSidebar() {
  return (
    <aside className="w-64 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 overflow-hidden">
      {/* Search */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-700/80">
        <SearchBar />
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-700/80">
        <FilterPanel />
      </div>

      {/* Structure list header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700/80">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Structures
        </span>
        <ResultCount />
      </div>

      {/* Scrollable structure tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <StructureTree />
      </div>
    </aside>
  )
}
