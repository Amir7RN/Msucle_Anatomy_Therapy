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
      <aside className="fixed right-4 top-20 w-80 rounded-lg border border-neutral-700 bg-neutral-900/95 p-4 text-neutral-100 shadow-xl backdrop-blur">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide">Diagnostic</h3>
          <button onClick={closeDrawer} className="text-xs text-neutral-400 hover:text-white">✕</button>
        </header>
        <p className="text-xs text-neutral-400">
          No muscle patterns match this area. Try clicking closer to a known pain zone.
        </p>
      </aside>
    )
  }

  const handleHoverIn = (c: MuscleContribution) => {
    const meshId = pickSideFromClick(c.meshIds, clickVec)
    if (!meshId) return
    setHovered(meshId)
    setDiagnosticPulse(meshId)
  }

  const handleHoverOut = () => {
    setHovered(null)
    setDiagnosticPulse(null)
  }

  const handleSelect = (c: MuscleContribution) => {
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
    <aside className="fixed right-4 top-20 w-80 rounded-lg border border-neutral-700 bg-neutral-900/95 p-4 text-neutral-100 shadow-xl backdrop-blur">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-wide">Likely sources</h3>
          <p className="text-[11px] text-neutral-400">Zones: {result.clickedZones.join(', ')}</p>
        </div>
        <button onClick={closeDrawer} aria-label="Close" className="text-xs text-neutral-400 hover:text-white">✕</button>
      </header>

      <ul className="space-y-1.5">
        {grouped.map((entry) => (
          <li key={entry.id} className="rounded-md border border-neutral-800/80">
            <div
              onMouseEnter={() => handleGroupHover(entry)}
              onMouseLeave={handleHoverOut}
              className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-800"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{entry.label}</div>
                {entry.muscles.length > 1 && (
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">{entry.muscles.length} muscles</div>
                )}
              </div>
              <span className="w-9 text-right text-xs tabular-nums text-neutral-200">
                {Math.round(entry.probability * 100)}%
              </span>
            </div>

            {entry.muscles.length > 1 && (
              <ul className="mb-1 ml-2 mr-1 space-y-1 border-l border-neutral-800 pl-2">
                {entry.muscles.map((muscle) => (
                  <li key={muscle.muscle_id}>
                    <button
                      onMouseEnter={() => handleHoverIn(muscle)}
                      onMouseLeave={handleHoverOut}
                      onClick={() => handleSelect(muscle)}
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

            {entry.muscles.length === 1 && (
              <button
                onMouseEnter={() => handleHoverIn(entry.muscles[0])}
                onMouseLeave={handleHoverOut}
                onClick={() => handleSelect(entry.muscles[0])}
                className="mb-1 ml-2 mr-1 w-[calc(100%-0.75rem)] rounded-md border border-neutral-800 px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
              >
                Select muscle
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
