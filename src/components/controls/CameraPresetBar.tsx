import React from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import type { CameraPresetKey } from '../../lib/cameraUtils'

// ── Preset definitions ────────────────────────────────────────────────────────

interface PresetDef {
  key:   CameraPresetKey
  label: string
  icon:  string   // simple SVG path string or emoji
  title: string
}

const PRESETS: PresetDef[] = [
  { key: 'front',  label: 'Front',  icon: '⬛', title: 'Anterior view' },
  { key: 'back',   label: 'Back',   icon: '⬛', title: 'Posterior view' },
  { key: 'left',   label: 'Left',   icon: '⬛', title: 'Left lateral view' },
  { key: 'right',  label: 'Right',  icon: '⬛', title: 'Right lateral view' },
  { key: 'top',    label: 'Top',    icon: '⬛', title: 'Superior view' },
  { key: 'bottom', label: 'Bottom', icon: '⬛', title: 'Inferior view' },
]

// SVG icons for each preset
function PresetIcon({ preset }: { preset: CameraPresetKey }) {
  const size = 14

  switch (preset) {
    case 'front':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3"/>
          <path d="M7 20v-2a5 5 0 0 1 10 0v2"/>
          <line x1="12" y1="2" x2="12" y2="5"/>
        </svg>
      )
    case 'back':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3"/>
          <path d="M7 20v-2a5 5 0 0 1 10 0v2"/>
          <line x1="5" y1="12" x2="2" y2="12"/>
          <line x1="19" y1="12" x2="22" y2="12"/>
        </svg>
      )
    case 'left':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      )
    case 'right':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      )
    case 'top':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 15l-6-6-6 6"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      )
    case 'bottom':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      )
    default:
      return null
  }
}

// ── Bar component ─────────────────────────────────────────────────────────────

export function CameraPresetBar() {
  const flyToPreset = useAtlasStore((s) => s.flyToPreset)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wide mr-1">
        Camera:
      </span>
      {PRESETS.map(({ key, label, title }) => (
        <button
          key={key}
          onClick={() => flyToPreset(key)}
          title={title}
          className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        >
          <PresetIcon preset={key} />
          {label}
        </button>
      ))}
      <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500 hidden sm:block">
        Tip: drag=rotate · scroll=zoom · right-drag=pan
      </span>
    </div>
  )
}
