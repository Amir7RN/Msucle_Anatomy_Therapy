/**
 * FeatureRail.tsx
 *
 * The platform's feature deck — the five core experiences rendered as rich,
 * clickable cards at the top of the left sidebar, above the AI Diagnosis chat.
 * Replaces both the plain on-canvas FeatureLauncher buttons and the old
 * Structures tree (anatomy browsing lives in the 3D canvas + search already).
 *
 * Design language: each card is a small "portal" — gradient icon tile, name,
 * one-line promise, chevron that slides on hover, and a tone-matched glow so
 * the rail reads as five distinct destinations rather than a settings list.
 */

import React from 'react'
import { Activity, Sparkles, Scan, Flame, User, Video, HeartPulse, ChevronRight } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'

type GroupId = 'setup' | 'measure' | 'understand' | 'train'

interface FeatureDef {
  key:      string
  label:    string
  tagline:  string
  icon:     React.ReactNode
  /** Which journey stage this tool belongs to. */
  group:    GroupId
  /** Gradient for the icon tile. */
  tile:     string
  /** Tone classes for border/glow/text accents. */
  glow:     string
  text:     string
  action:   (s: ReturnType<typeof useAtlasStore.getState>) => void
}

// The 7 tools read as a lot when flat. Grouping them into a 4-step journey
// answers the user's "which do I use, and when" — a clear path instead of a
// wall of equal buttons.
interface GroupDef {
  id:    GroupId
  step:  number
  title: string
  hint:  string
}

const GROUPS: GroupDef[] = [
  { id: 'setup',      step: 1, title: 'Set up',     hint: 'Tell us about your body' },
  { id: 'measure',    step: 2, title: 'Measure',    hint: 'Capture how you move' },
  { id: 'understand', step: 3, title: 'Understand', hint: 'See what it means' },
  { id: 'train',      step: 4, title: 'Train',      hint: 'Follow your plan' },
]

const FEATURES: FeatureDef[] = [
  {
    key: 'profile',
    label: 'My Profile',
    tagline: 'Your body, measured & remembered',
    icon: <User size={15} />,
    group: 'setup',
    tile: 'from-emerald-400 to-teal-600',
    glow: 'hover:border-emerald-400/50 hover:shadow-[0_0_24px_rgba(52,211,153,0.18)]',
    text: 'group-hover:text-emerald-300',
    action: (s) => s.setProfileOpen(true),
  },
  {
    key: 'twin',
    label: 'Live Muscle Twin',
    tagline: 'A 3D you that moves as you move',
    icon: <Flame size={15} />,
    group: 'understand',
    tile: 'from-violet-400 to-fuchsia-600',
    glow: 'hover:border-violet-400/50 hover:shadow-[0_0_24px_rgba(167,139,250,0.20)]',
    text: 'group-hover:text-violet-300',
    action: (s) => s.setTwinOpen(true),
  },
  {
    key: 'battery',
    label: 'Movement Assessment',
    tagline: '6 movements · exact joint deviations',
    icon: <Activity size={15} />,
    group: 'measure',
    tile: 'from-cyan-400 to-blue-600',
    glow: 'hover:border-cyan-400/50 hover:shadow-[0_0_24px_rgba(34,211,238,0.20)]',
    text: 'group-hover:text-cyan-300',
    action: (s) => s.setFeatureModalToOpen('battery'),
  },
  {
    key: 'remote',
    label: 'Remote Assessment',
    tagline: 'Live call · every joint measured',
    icon: <Video size={15} />,
    group: 'measure',
    tile: 'from-rose-400 to-pink-600',
    glow: 'hover:border-rose-400/50 hover:shadow-[0_0_24px_rgba(251,113,133,0.20)]',
    text: 'group-hover:text-rose-300',
    action: (s) => s.setFeatureModalToOpen('remote'),
  },
  {
    key: 'health',
    label: 'Import Health Data',
    tagline: 'Apple Health workouts · training balance',
    icon: <HeartPulse size={15} />,
    group: 'measure',
    tile: 'from-red-400 to-rose-600',
    glow: 'hover:border-red-400/50 hover:shadow-[0_0_24px_rgba(248,113,113,0.20)]',
    text: 'group-hover:text-red-300',
    action: (s) => s.setFeatureModalToOpen('health'),
  },
  {
    key: 'program',
    label: 'My AI Program',
    tagline: '4-week plan built from your deficits',
    icon: <Sparkles size={15} />,
    group: 'train',
    tile: 'from-orange-400 to-red-600',
    glow: 'hover:border-orange-400/50 hover:shadow-[0_0_24px_rgba(251,146,60,0.20)]',
    text: 'group-hover:text-orange-300',
    action: (s) => s.setFeatureModalToOpen('program'),
  },
  {
    key: 'symmetry',
    label: 'Symmetry Report',
    tagline: 'Left vs right, side by side',
    icon: <Scan size={15} />,
    group: 'understand',
    tile: 'from-sky-400 to-indigo-600',
    glow: 'hover:border-sky-400/50 hover:shadow-[0_0_24px_rgba(56,189,248,0.20)]',
    text: 'group-hover:text-sky-300',
    action: (s) => s.setFeatureModalToOpen('symmetry'),
  },
]

export function FeatureRail() {
  return (
    <div className="flex-shrink-0 border-b border-slate-700/60 bg-gradient-to-b from-slate-950 to-slate-900 p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Your toolkit
        </span>
        <span className="flex items-center gap-1 text-[9px] text-slate-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
        </span>
      </div>

      {/* Anchor the whole app: the primary job is on the 3D body. The toolkit
          is the optional deeper journey, so we say so up front. */}
      <div className="mb-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-2.5 py-1.5 text-[10px] leading-snug text-cyan-200/90">
        <span className="font-semibold text-cyan-300">In pain? Tap where it hurts</span>{' '}
        on the body for likely sources &amp; exercises. The steps below go deeper —
        take them in order, or dip in anytime.
      </div>

      {/* Grouped journey: each stage gets a numbered header so 7 tools read as
          a path, not a pile. */}
      <div className="space-y-2.5">
        {GROUPS.map((g) => {
          const items = FEATURES.filter((f) => f.group === g.id)
          if (items.length === 0) return null
          return (
            <div key={g.id} className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[9px] font-bold text-slate-200">
                  {g.step}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  {g.title}
                </span>
                <span className="truncate text-[9px] text-slate-500">· {g.hint}</span>
              </div>
              {items.map((f) => (
                <FeatureCard key={f.key} def={f} />
              ))}
            </div>
          )
        })}
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
