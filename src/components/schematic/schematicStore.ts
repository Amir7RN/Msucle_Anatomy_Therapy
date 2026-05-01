/**
 * schematicStore.ts
 *
 * Tiny ephemeral store for the Robot-Schematic Triage Display.
 *
 * The in-canvas <SchematicMarkers> projects muscle world-positions to screen
 * coordinates each frame and writes them here.  The out-of-canvas
 * <SchematicOverlay> reads them and renders the leader lines + label boxes.
 *
 * We keep this in its own zustand store (not the main atlasStore) so frame-rate
 * marker updates don't trigger re-renders in unrelated components.
 */

import { create } from 'zustand'

export interface SchematicMarker {
  muscle_id:    string
  /** Display label — "Trapezius (Upper)" etc. */
  common_name:  string
  /** Probability from calculateMuscleContribution, 0..1. */
  probability:  number
  /** matchType from MuscleContribution. */
  matchType:    'primary' | 'referred'
  /** Mesh-relative world position centroid (cached for the SVG). */
  worldPos:     [number, number, number]
  /** Latest projected screen position in pixels. */
  screenX:      number
  screenY:      number
  /** False when the muscle is behind the camera or off-screen. */
  visible:      boolean
}

interface SchematicState {
  /** muscle_id → marker.  Empty when no diagnostic is active. */
  markers: Record<string, SchematicMarker>
  setMarkers: (m: Record<string, SchematicMarker>) => void
  clear: () => void
}

export const useSchematicStore = create<SchematicState>((set) => ({
  markers: {},
  setMarkers: (m) => set({ markers: m }),
  clear:      () => set({ markers: {} }),
}))
