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
  const setSelected = useAtlasStore((s) => s.setSelected)
  const setHovered = useAtlasStore((s) => s.setHovered)
  const setDiagnosticPulse = useAtlasStore((s) => s.setDiagnosticPulse)
  const setCandidateMuscles = useAtlasStore((s) => s.setCandidateMuscles)

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
    setSelected(meshId)
    closeDrawer()
  }

  const handleGroupHover = (entry: GroupedContribution) => {
    const ids = [...new Set(entry.muscles.flatMap((m) => filterMeshIdsBySide(m.meshIds, clickVec)))]
    setCandidateMuscles(ids)
  }

  return (
    <section className="border-b border-slate-200 dark:border-slate-700 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400">Likely Sources</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Zones: {result.clickedZones.join(', ')}</p>
        </div>
        <button onClick={closeDrawer} aria-label="Close" className="text-xs text-neutral-400 hover:text-white">✕</button>
      </header>

      <ul className="space-y-1.5">
        {grouped.map((entry) => {
          const isSingle = entry.muscles.length === 1

          return (
            <li key={entry.id} className="rounded-md border border-neutral-800/80">
              {/* Row header — clickable if single muscle, hover-only if group */}
              <div
                role={isSingle ? 'button' : undefined}
                tabIndex={isSingle ? 0 : undefined}
                onMouseEnter={() => isSingle ? handleHoverMuscle(entry.muscles[0]) : handleGroupHover(entry)}
                onMouseLeave={handleHoverOut}
                onClick={isSingle ? () => handleSelectMuscle(entry.muscles[0]) : undefined}
                onKeyDown={isSingle ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectMuscle(entry.muscles[0]) } : undefined}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-800 ${isSingle ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{entry.label}</div>
                  {!isSingle && (
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">{entry.muscles.length} muscles</div>
                  )}
                </div>
                <span className="w-9 text-right text-xs tabular-nums text-neutral-200">
                  {Math.round(entry.probability * 100)}%
                </span>
              </div>

              {/* Expanded sub-list for groups */}
              {!isSingle && (
                <ul className="mb-1 ml-2 mr-1 space-y-1 border-l border-neutral-800 pl-2">
                  {entry.muscles.map((muscle) => (
                    <li key={muscle.muscle_id}>
                      <button
                        onMouseEnter={() => handleHoverMuscle(muscle)}
                        onMouseLeave={handleHoverOut}
                        onClick={() => handleSelectMuscle(muscle)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left transition-colors hover:bg-neutral-800"
                      >
                        <span className="truncate text-xs">{muscle.common_name}</span>
                        <span className="w-9 text-right text-[11px] tabular-nums text-neutral-300">
                          {Math.round(muscle.probability * 100)}%
                        </span>
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
