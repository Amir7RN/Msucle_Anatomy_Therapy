import React from 'react'
import { SearchBar } from '../controls/SearchBar'
import { FilterPanel } from '../controls/FilterPanel'
import { StructureTree } from '../controls/StructureTree'
import { TriageChat } from '../triage/TriageChat'
import { useStructureSearch } from '../../hooks/useStructureSearch'
import { useAtlasStore } from '../../store/atlasStore'

function ResultCount() {
  const results = useStructureSearch()
  return (
    <span className="text-[10px] text-slate-400 dark:text-slate-500">
      {results.length} structure{results.length !== 1 ? 's' : ''}
    </span>
  )
}

export function LeftSidebar() {
  const triageOpen    = useAtlasStore((s) => s.triageOpen)
  const setTriageOpen = useAtlasStore((s) => s.setTriageOpen)

  return (
    <aside className="w-64 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 overflow-hidden">
      {/* Search — always visible */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-700/80 flex-shrink-0">
        <SearchBar />
      </div>

      {triageOpen ? (
        /* When triage is open: fill the remaining sidebar space with the chat */
        <TriageChat
          open={triageOpen}
          onClose={() => setTriageOpen(false)}
          inline
        />
      ) : (
        /* Normal view: filters + structure tree */
        <>
          <div className="p-3 border-b border-slate-100 dark:border-slate-700/80 flex-shrink-0">
            <FilterPanel />
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700/80 flex-shrink-0">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Structures
            </span>
            <ResultCount />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <StructureTree />
          </div>
        </>
      )}
    </aside>
  )
}
