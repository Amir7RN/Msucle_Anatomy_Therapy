/**
 * DiagnosticDrawer.tsx
 *
 * Task 2 — UI overlay for Area-to-Muscle results.
 *
 *  • Ordered by descending probability (Trapezius 80%, Deltoid 20%, …).
 *  • Hovering a row sets atlasStore.hoveredId AND toggles the diagnosticPulse
 *    flag so the 3D mesh pulses (see note below on the useFrame hook).
 *  • Clicking a row transitions into the existing Muscle-to-Pain flow by
 *    calling setSelected with the mesh ID closest to the original click.
 *
 *  Pulse implementation note
 *  ─────────────────────────
 *  The pulse is emissive-intensity modulation driven by useFrame inside
 *  HumanModel.tsx.  We don't touch the material's base colour, so the
 *  established `originalColor` is preserved (Task 3 — visual consistency).
 *  A minimal patch to HumanModel is listed in the integration notes below.
 */

import React from 'react'
import * as THREE from 'three'
import { useAtlasStore } from '../../store/atlasStore'
import { pickSideFromClick, type MuscleContribution, type DiagnosticResult } from '../../lib/diagnostic'

interface DiagnosticDrawerProps {
  result: DiagnosticResult | null
  onClose: () => void
}

export function DiagnosticDrawer({ result, onClose }: DiagnosticDrawerProps) {
  const setSelected        = useAtlasStore((s) => s.setSelected)
  const setHovered         = useAtlasStore((s) => s.setHovered)
  const setDiagnosticPulse = useAtlasStore((s) => s.setDiagnosticPulse)

  if (!result) return null

  const { contributions, clickPoint } = result
  const clickVec = new THREE.Vector3(...clickPoint)

  if (contributions.length === 0) {
    return (
      <aside className="fixed right-4 top-20 w-80 rounded-lg border border-neutral-700 bg-neutral-900/95 p-4 text-neutral-100 shadow-xl backdrop-blur">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide">Diagnostic</h3>
          <button onClick={onClose} className="text-xs text-neutral-400 hover:text-white">✕</button>
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
    onClose()
  }

  return (
    <aside className="fixed right-4 top-20 w-80 rounded-lg border border-neutral-700 bg-neutral-900/95 p-4 text-neutral-100 shadow-xl backdrop-blur">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-wide">Likely sources</h3>
          <p className="text-[11px] text-neutral-400">Zones: {result.clickedZones.join(', ')}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-xs text-neutral-400 hover:text-white">✕</button>
      </header>

      <ul className="space-y-1.5">
        {contributions.map((c) => (
          <li key={c.muscle_id}>
            <button
              onMouseEnter={() => handleHoverIn(c)}
              onMouseLeave={handleHoverOut}
              onClick={() => handleSelect(c)}
              className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-800"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{c.common_name}</div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {c.matchType === 'primary' ? 'primary zone' : 'referred zone'}
                </div>
              </div>
              <div className="ml-3 flex w-24 items-center gap-2">
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width:           `${Math.round(c.probability * 100)}%`,
                      backgroundColor: c.matchType === 'primary' ? '#FF8C00' : '#B45309',
                    }}
                  />
                </div>
                <span className="w-9 text-right text-xs tabular-nums text-neutral-200">
                  {Math.round(c.probability * 100)}%
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
