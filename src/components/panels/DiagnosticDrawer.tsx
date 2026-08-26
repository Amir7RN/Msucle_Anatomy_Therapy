import React from 'react'
import * as THREE from 'three'
import { useAtlasStore } from '../../store/atlasStore'
import {
  filterMeshIdsBySide,
  groupContributions,
  pickSideFromClick,
  type GroupedContribution,
  type MuscleContribution,
  type DiagnosticResult,
} from '../../lib/diagnostic'

interface DiagnosticDrawerProps {
  result: DiagnosticResult | null
  onClose: () => void
}

export function DiagnosticDrawer({ result, onClose }: DiagnosticDrawerProps) {
  const setSelectedFromDiagnostic = useAtlasStore((s) => s.setSelectedFromDiagnostic)
  const setHovered                = useAtlasStore((s) => s.setHovered)
  const setDiagnosticPulse        = useAtlasStore((s) => s.setDiagnosticPulse)
  const setCandidateMuscles       = useAtlasStore((s) => s.setCandidateMuscles)

  if (!result) return null

  const { contributions, clickPoint } = result
  const clickVec = new THREE.Vector3(...clickPoint)
  const grouped = groupContributions(contributions)

  const closeDrawer = () => {
    setDiagnosticPulse(null)
    setCandidateMuscles([])
    onClose()
  }

  if (contributions.length === 0) {
    return (
      <section className="border-b border-slate-200 dark:border-slate-700 p-4">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide">Diagnostic</h3>
          <button onClick={closeDrawer} className="text-xs text-neutral-400 hover:text-white">✕</button>
        </header>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No muscle patterns match this area. Try clicking closer to a known pain zone.
        </p>
      </section>
    )
  }

  const handleHoverMuscle = (c: MuscleContribution) => {
    const meshId = pickSideFromClick(c.meshIds, clickVec)
    if (!meshId) return
    setHovered(meshId)
    setDiagnosticPulse(meshId)
  }

  const handleHoverOut = () => {
    setHovered(null)
    setDiagnosticPulse(null)
  }

  const handleSelectMuscle = (c: MuscleContribution) => {
    const meshId = pickSideFromClick(c.meshIds, clickVec)
    if (!meshId) return
    setDiagnosticPulse(null)
    // Atomically sets selectedId = meshId AND diagnosticSubMuscleId = muscle_id
    // so MetadataPanel can show the correct sub-muscle videos (e.g. deltoid_anterior).
    setSelectedFromDiagnostic(meshId, c.muscle_id)
    closeDrawer()
  }

  const handleGroupHover = (entry: GroupedContribution) => {
    const ids = [...new Set(entry.muscles.flatMap((m) => filterMeshIdsBySide(m.meshIds, clickVec)))]
    setCandidateMuscles(ids)
  }

  // Sorted, and bar widths are RELATIVE to the strongest contributor so the
  // ranking reads instantly even when absolute probabilities are small.
  const sortedGroups = [...grouped].sort((a, b) => b.probability - a.probability)
  const maxProb = Math.max(...sortedGroups.map((e) => e.probability), 1e-6)

  return (
    <section className="border-b border-slate-200 dark:border-slate-700 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400">Pain-pattern matches</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Zones: {result.clickedZones.join(', ')}</p>
        </div>
        <button onClick={closeDrawer} aria-label="Close" className="text-xs text-neutral-400 hover:text-white">✕</button>
      </header>

      {/* Pattern legend: direct = strongest at the clicked spot; referred =
          the sensation pattern radiates there from somewhere else. */}
      <div className="mb-2 flex gap-3 text-[9px] uppercase tracking-wider text-neutral-500">
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-3 rounded-full bg-orange-400" /> direct
        </span>
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-3 rounded-full bg-cyan-400" /> referred pattern
        </span>
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
        Percentages are relative catalogue-match scores, not diagnostic probabilities. Location alone cannot identify the cause of pain.
      </p>

      <ul className="space-y-1.5">
        {sortedGroups.map((entry, rank) => {
          const isSingle = entry.muscles.length === 1
          const top = rank === 0

          return (
            <li key={entry.id} className={`overflow-hidden rounded-md border ${top ? 'border-orange-500/40 bg-orange-500/5' : 'border-neutral-800/80'}`}>
              {/* Row header — clickable if single muscle, hover-only if group */}
              <div
                role={isSingle ? 'button' : undefined}
                tabIndex={isSingle ? 0 : undefined}
                onMouseEnter={() => isSingle ? handleHoverMuscle(entry.muscles[0]) : handleGroupHover(entry)}
                onMouseLeave={handleHoverOut}
                onClick={isSingle ? () => handleSelectMuscle(entry.muscles[0]) : undefined}
                onKeyDown={isSingle ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectMuscle(entry.muscles[0]) } : undefined}
                className={`w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-800 ${isSingle ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums ${top ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                    {rank + 1}
                  </span>
                  <div className="min-w-0 flex-1 truncate text-sm">
                    {entry.label}
                    {!isSingle && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                        {entry.muscles.length} muscles
                      </span>
                    )}
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-200">
                    {Math.round(entry.probability * 100)}%
                  </span>
                </div>
                {/* Relative-likelihood bar */}
                <MuscleBar muscles={entry.muscles} frac={entry.probability / maxProb} />
              </div>

              {/* Expanded sub-list for groups */}
              {!isSingle && (
                <ul className="mb-1 ml-2 mr-1 space-y-1 border-l border-neutral-800 pl-2">
                  {[...entry.muscles].sort((a, b) => b.probability - a.probability).map((muscle) => (
                    <li key={muscle.muscle_id}>
                      <button
                        onMouseEnter={() => handleHoverMuscle(muscle)}
                        onMouseLeave={handleHoverOut}
                        onClick={() => handleSelectMuscle(muscle)}
                        className="w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-neutral-800"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs">{muscle.common_name}</span>
                          <PatternChip matchType={muscle.matchType} />
                          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-neutral-300">
                            {Math.round(muscle.probability * 100)}%
                          </span>
                        </div>
                        <MuscleBar muscles={[muscle]} frac={muscle.probability / maxProb} thin />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Direct-vs-referred chip for a contributor row. */
function PatternChip({ matchType }: { matchType: 'primary' | 'referred' }) {
  return matchType === 'primary' ? (
    <span className="shrink-0 rounded bg-orange-500/15 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-orange-300">direct</span>
  ) : (
    <span className="shrink-0 rounded bg-cyan-500/15 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-cyan-300">referred</span>
  )
}

/**
 * Likelihood bar, coloured by the dominant match type (orange = strongest
 * signal directly at the clicked spot, cyan = referred pattern).
 */
function MuscleBar({ muscles, frac, thin }: { muscles: MuscleContribution[]; frac: number; thin?: boolean }) {
  const primaryShare = muscles.filter((m) => m.matchType === 'primary').length / Math.max(1, muscles.length)
  const color = primaryShare >= 0.5 ? '#fb923c' : '#22d3ee'
  return (
    <div className={`mt-1 w-full overflow-hidden rounded-full bg-neutral-800/80 ${thin ? 'h-0.5' : 'h-1'}`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.max(3, frac * 100)}%`, background: color }}
      />
    </div>
  )
}
