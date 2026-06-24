/**
 * FeatureLauncher.tsx
 *
 * Prominent on-canvas launcher for the app's three primary features:
 * Assessment (full-body ROM battery), My Program (4-week AI plan), and
 * Symmetry Report.  Sits in the top-right of the 3D canvas so it reads
 * as the main feature surface - the small header buttons feel like
 * settings/profile and these are the things users actually open.
 *
 * Each button just fires a store action; the AppHeader is still the
 * single owner of the modal state so we don't end up with two copies
 * of the same modal mounted at once.
 */

import React from 'react'
import { Activity, Sparkles, Scan, Flame } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'

export function FeatureLauncher() {
  const setFeatureModalToOpen = useAtlasStore((s) => s.setFeatureModalToOpen)
  const setTwinOpen           = useAtlasStore((s) => s.setTwinOpen)
  const modalOpenCount        = useAtlasStore((s) => s.modalOpenCount)
  // Hide while any modal is up so we don't clutter overlay-on-overlay.
  if (modalOpenCount > 0) return null
  return (
    <div className="hidden md:flex absolute right-4 top-4 z-20 flex-col gap-2">
      <FeatureButton
        icon={<Flame size={14} />}
        label="Live Muscle Twin"
        tone="violet"
        onClick={() => setTwinOpen(true)}
      />
      <FeatureButton
        icon={<Activity size={14} />}
        label="Movement Assessment"
        tone="emerald"
        onClick={() => setFeatureModalToOpen('battery')}
      />
      <FeatureButton
        icon={<Sparkles size={14} />}
        label="My AI Program"
        tone="orange"
        onClick={() => setFeatureModalToOpen('program')}
      />
      <FeatureButton
        icon={<Scan size={14} />}
        label="Symmetry Report"
        tone="cyan"
        onClick={() => setFeatureModalToOpen('symmetry')}
      />
    </div>
  )
}

function FeatureButton({
  icon, label, tone, onClick,
}: {
  icon:    React.ReactNode
  label:   string
  tone:    'emerald' | 'orange' | 'cyan' | 'violet'
  onClick: () => void
}) {
  const toneClass =
    tone === 'emerald' ? 'border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/15 ring-emerald-500/20'
    : tone === 'orange' ? 'border-orange-400/50 text-orange-300 hover:bg-orange-500/15 ring-orange-500/20'
    : tone === 'violet' ? 'border-violet-400/50 text-violet-300 hover:bg-violet-500/15 ring-violet-500/20'
    :                     'border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/15 ring-cyan-500/20'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold backdrop-blur-md bg-slate-900/85 ring-1 shadow-lg transition-colors ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  )
}
