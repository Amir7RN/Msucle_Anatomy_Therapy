/**
 * useDiagnosticClick.ts
 *
 * Updated R3F raycaster click handler for the Area-to-Muscle diagnostic flow.
 *
 * Behavioural contract
 * ────────────────────
 *   • When diagnosticMode is ON:
 *       – Clicks on the body OR any muscle are intercepted.
 *       – We use the ray's world-space intersection point (not the hit mesh's
 *         identity) to resolve a set of BODY_ZONES keys.
 *       – calculateMuscleContribution populates the DiagnosticDrawer.
 *       – Existing setSelected / setHovered are NOT called during the click,
 *         so the current heatmap state is preserved until the user picks a
 *         muscle from the drawer.
 *
 *   • When diagnosticMode is OFF:
 *       – Returns null, so the caller falls through to the legacy
 *         Muscle-to-Pain click path in HumanModel.tsx.
 *
 *   • The hook only reads / writes atlasStore fields and does not touch
 *     renderOrder, polygonOffset, or material state — those remain owned
 *     by HumanModel's applyMeshState pass, preserving Z-fighting safety
 *     and the established Orange-Fire heatmap.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import {
  buildGroupedContributions,
  calculateMuscleContribution,
  findZonesAtPoint,
  loadDiagnosticMuscles,
  type DiagnosticMuscle,
  type DiagnosticResult,
} from '../lib/diagnostic'
import { useAtlasStore } from '../store/atlasStore'

// ─────────────────────────────────────────────────────────────────────────────
//  Catalogue loader hook — one fetch per session, cached inside diagnostic.ts
// ─────────────────────────────────────────────────────────────────────────────

export function useDiagnosticCatalogue(): DiagnosticMuscle[] | null {
  const [catalogue, setCatalogue] = useState<DiagnosticMuscle[] | null>(null)
  useEffect(() => {
    let alive = true
    loadDiagnosticMuscles()
      .then((list) => { if (alive) setCatalogue(list) })
      .catch((err) => console.error('[diagnostic] catalogue load failed:', err))
    return () => { alive = false }
  }, [])
  return catalogue
}

// ─────────────────────────────────────────────────────────────────────────────
//  Click handler factory
// ─────────────────────────────────────────────────────────────────────────────

export interface UseDiagnosticClickOpts {
  /** Extend the store shape with these two fields — see patch notes below. */
  diagnosticMode:    boolean
  setDiagnostic:     (result: DiagnosticResult | null) => void
  catalogue:         DiagnosticMuscle[] | null
}

/**
 * Returns a pointer handler with the R3F signature expected by <primitive>.
 * Returns null when diagnosticMode is off so the parent handler falls through.
 */
export function useDiagnosticClick(
  opts: UseDiagnosticClickOpts,
): ((e: ThreeEvent<MouseEvent>) => boolean) | null {
  const { diagnosticMode, setDiagnostic, catalogue } = opts

  return useCallback(
    (e: ThreeEvent<MouseEvent>): boolean => {
      if (!diagnosticMode || !catalogue) return false

      // ── 1. Ray intersection world point ──────────────────────────────────
      //
      //  R3F already raycast before firing onClick — the nearest hit is in
      //  e.point (world space, accounting for the scene's grounding offset).
      //  We do NOT re-build a Raycaster manually; piggybacking on R3F's pass
      //  is faster and keeps behaviour identical to existing selection.
      const worldPoint: THREE.Vector3 = e.point.clone()

      // ── 2. Resolve to one or more BODY_ZONES keys ────────────────────────
      const clickedZones = findZonesAtPoint(worldPoint)
      if (clickedZones.length === 0) {
        setDiagnostic(null)
        return true   // consumed the click even though we found nothing
      }

      // ── 3. Reverse-map to weighted muscle contributions ─────────────────
      const contributions = calculateMuscleContribution(clickedZones, catalogue)
      const groupedContributions = buildGroupedContributions(contributions)

      setDiagnostic({
        clickedZones,
        clickPoint:    [worldPoint.x, worldPoint.y, worldPoint.z],
        contributions,
        groupedContributions,
      })

      // Stop the event — prevents the legacy Muscle-to-Pain handler in
      // HumanModel.tsx from firing on the same click.
      e.stopPropagation()
      return true
    },
    [diagnosticMode, catalogue, setDiagnostic],
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Convenience hook: wires the handler straight into the store
//
//  Reads `diagnosticMode` and `setDiagnostic` from atlasStore, so the caller
//  in HumanModel.tsx can just do:
//
//      const diagnosticClick = useDiagnosticClickFromStore()
//      function handleClick(e) {
//        if (diagnosticClick?.(e)) return          // consumed the event
//        // …existing muscle selection path…
//      }
// ─────────────────────────────────────────────────────────────────────────────

export function useDiagnosticClickFromStore() {
  const catalogue      = useDiagnosticCatalogue()
  const diagnosticMode = useAtlasStore((s) => s.diagnosticMode)
  const setDiagnostic  = useAtlasStore((s) => s.setDiagnostic)
  return useDiagnosticClick({ diagnosticMode, setDiagnostic, catalogue })
}
