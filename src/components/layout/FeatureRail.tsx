/**
 * FeatureRail.tsx
 *
 * Slim launcher above the AI Diagnosis chat in the left sidebar.
 *
 * The platform's feature set (Live Muscle Twin, Movement/Remote Assessment,
 * AI Program, Symmetry Report) now lives on the public landing page as
 * clickable cards that deep-link back into the app (?feature=<key>). So here
 * we keep only what a user needs *while inside the atlas*: the tap-to-start
 * prompt for the pain flow, and their profile.
 */

import React from 'react'
import { User, ChevronRight } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'

interface FeatureDef {
  key:      string
  label:    string
  tagline:  string
  icon:     React.ReactNode
  /** Gradient for the icon tile. */
  tile:     string
  /** Tone classes for border/glow/text accents. */
  glow:     string
  text:     string
  action:   (s: ReturnType<typeof useAtlasStore.getState>) => void
}

const FEATURES: FeatureDef[] = [
  {
    key: 'profile',
    label: 'My Profile',
    tagline: 'Your body, measured & remembered',
    icon: <User size={15} />,
    tile: 'from-emerald-400 to-teal-600',
    glow: 'hover:border-emerald-400/50 hover:shadow-[0_0_24px_rgba(52,211,153,0.18)]',
    text: 'group-hover:text-emerald-300',
    action: (s) => s.setProfileOpen(true),
  },
]

export function FeatureRail() {
  return (
    <div className="flex-shrink-0 border-b border-slate-700/60 bg-gradient-to-b from-slate-950 to-slate-900 p-2">
      {/* Primary flow on the atlas page: tap the body. */}
      <div className="mb-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2.5 py-1.5 text-[10px] leading-snug text-cyan-200/90">
        <span className="font-semibold text-cyan-300">In pain? Tap where it hurts</span>{' '}
        on the body for likely sources &amp; exercises.
      </div>
      <div className="space-y-1.5">
        {FEATURES.map((f) => (
          <FeatureCard key={f.key} def={f} />
        ))}
      </div>
    </div>
  )
}

function FeatureCard({ def }: { def: FeatureDef }) {
  return (
    <button
      onClick={() => def.action(useAtlasStore.getState())}
      className={`group flex w-full items-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-900/80 p-2 text-left transition-all duration-200 hover:-translate-y-px hover:bg-slate-800/90 ${def.glow}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md transition-transform duration-200 group-hover:scale-110 ${def.tile}`}>
        {def.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[12px] font-semibold text-slate-100 transition-colors ${def.text}`}>
          {def.label}
        </span>
        <span className="block truncate text-[10px] text-slate-500 transition-colors group-hover:text-slate-400">
          {def.tagline}
        </span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-slate-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-slate-300" />
    </button>
  )
}
