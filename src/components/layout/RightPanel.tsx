import React from 'react'
import { MetadataPanel } from '../panels/MetadataPanel'

export function RightPanel() {
  return (
    <aside className="w-72 flex flex-col border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 overflow-hidden">
      {/* Panel title */}
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Structure Details
        </h2>
      </div>

      {/* Metadata */}
      <div className="flex-1 overflow-hidden">
        <MetadataPanel />
      </div>
    </aside>
  )
}
