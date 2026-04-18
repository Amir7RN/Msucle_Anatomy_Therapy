import React, { useState } from 'react'
import { Activity } from 'lucide-react'
import { ActionButtons } from '../controls/ActionButtons'
import { CameraPresetBar } from '../controls/CameraPresetBar'
import { useAtlasStore } from '../../store/atlasStore'

export function AppHeader() {
  const modelStatus = useAtlasStore((s) => s.modelStatus)
  const [showPresets, setShowPresets] = useState(false)

  return (
    <header className="flex flex-col border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 z-20">
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 h-14">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-[180px]">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-500">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none">
              Human Muscle Atlas
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-none mt-0.5">
              Interactive Anatomy Viewer
            </p>
          </div>
        </div>

        {/* Action toolbar */}
        <ActionButtons />

        {/* Right: model status + preset toggle */}
        <div className="hidden md:flex items-center gap-3 min-w-[160px] justify-end">
          {/* Camera views toggle */}
          <button
            onClick={() => setShowPresets((v) => !v)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              showPresets
                ? 'border-primary-400 text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-primary-400 hover:text-primary-500'
            }`}
            title="Toggle camera view presets"
          >
            📷 Views
          </button>

          {/* Model status */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                modelStatus === 'loaded'
                  ? 'bg-emerald-400'
                  : modelStatus === 'placeholder'
                  ? 'bg-amber-400'
                  : modelStatus === 'error'
                  ? 'bg-red-400'
                  : 'bg-slate-300 animate-pulse'
              }`}
            />
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {modelStatus === 'loaded'
                ? 'GLB loaded'
                : modelStatus === 'placeholder'
                ? 'Mock mode'
                : modelStatus === 'error'
                ? 'Load error'
                : 'Loading…'}
            </span>
          </div>
        </div>
      </div>

      {/* Camera presets row — shown when toggled */}
      {showPresets && (
        <div className="border-t border-slate-100 dark:border-slate-700/60 px-4 py-2">
          <CameraPresetBar />
        </div>
      )}
    </header>
  )
}
