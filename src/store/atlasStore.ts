import { create } from 'zustand'
import type { SceneIndex, ActiveFilters, ModelStatus, LayerType } from '../lib/types'
import { buildMetadataOnlyIndex } from '../lib/anatomyIndex'
import type { CameraPresetKey } from '../lib/cameraUtils'
import type { DiagnosticResult } from '../lib/diagnostic'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AtlasState {
  // Selection
  selectedId: string | null
  hoveredId:  string | null

  // Per-structure visibility
  hiddenIds:   Set<string>
  isolateMode: boolean

  // Layer visibility — independent of per-structure hiding
  hiddenLayers:  Set<LayerType>
  ghostedLayers: Set<LayerType>

  // Search + filter
  searchQuery:   string
  activeFilters: ActiveFilters

  // Scene / model
  sceneIndex:  SceneIndex
  modelStatus: ModelStatus

  // Camera
  cameraResetTrigger: number
  /** Named preset to fly to — cleared after being consumed by CameraController */
  cameraPreset: CameraPresetKey | null

  // UI
  darkMode:        boolean
  ghostMode:       boolean
  showPainOverlay: boolean

  // Area-to-Muscle diagnostic
  diagnosticMode:       boolean
  diagnosticResult:     DiagnosticResult | null
  diagnosticPulseId:    string | null
  candidateMuscles:     string[]
  /** The diagnostic muscle_id (e.g. 'deltoid_anterior') that triggered the
   *  current selection — lets the sidebar show sub-muscle-specific videos even
   *  though selectedId points to the real mesh ('MUSC_DELTOID_R'). Cleared
   *  whenever the user selects by clicking a mesh directly. */
  diagnosticSubMuscleId: string | null

  // ── Actions ───────────────────────────────────────────────────────────────

  setSelected: (id: string | null) => void
  /** Set selection from the diagnostic tool — atomically records the sub-muscle
   *  context (e.g. 'deltoid_anterior') alongside the real mesh ID. */
  setSelectedFromDiagnostic: (meshId: string, subMuscleId: string) => void
  setDiagnosticSubMuscleId: (id: string | null) => void
  setHovered:  (id: string | null) => void

  toggleHidden:    (id: string) => void
  hideSelected:    () =>          void
  showAll:         () =>          void
  isolateSelected: () =>          void
  exitIsolate:     () =>          void

  toggleHideLayer:  (layer: LayerType) => void
  toggleGhostLayer: (layer: LayerType) => void
  showAllLayers:    () =>                void

  resetView:         ()                   => void
  flyToPreset:       (p: CameraPresetKey) => void
  clearCameraPreset: ()                   => void

  setSearchQuery:      (q: string)      => void
  toggleSystemFilter:  (system: string) => void
  toggleLayerFilter:   (layer: string)  => void
  toggleRegionFilter:  (region: string) => void
  toggleSideFilter:    (side: string)   => void
  clearFilters: () => void

  setSceneIndex:  (index: SceneIndex)   => void
  setModelStatus: (status: ModelStatus) => void

  toggleDarkMode:       () => void
  toggleGhostMode:      () => void
  togglePainOverlay:    () => void

  toggleDiagnosticMode: () => void
  setDiagnostic:        (result: DiagnosticResult | null) => void
  setDiagnosticPulse:   (id: string | null) => void
  setCandidateMuscles:  (ids: string[]) => void
}

// ── Initial filter state ──────────────────────────────────────────────────────

const defaultFilters: ActiveFilters = {
  systems: [],
  layers:  [],
  regions: [],
  sides:   [],
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAtlasStore = create<AtlasState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  selectedId:         null,
  hoveredId:          null,
  hiddenIds:          new Set(),
  isolateMode:        false,
  hiddenLayers:       new Set(),
  ghostedLayers:      new Set(),
  searchQuery:        '',
  activeFilters:      defaultFilters,
  sceneIndex:         buildMetadataOnlyIndex(),
  modelStatus:        'loading',
  cameraResetTrigger: 0,
  cameraPreset:       null,
  darkMode:           true,    // default dark — matches professional écorché background
  ghostMode:          false,
  showPainOverlay:    true,

  diagnosticMode:        false,
  diagnosticResult:      null,
  diagnosticPulseId:     null,
  candidateMuscles:      [],
  diagnosticSubMuscleId: null,

  // ── Selection ─────────────────────────────────────────────────────────────
  // Direct mesh click — clears any diagnostic sub-muscle context.
  setSelected: (id) => set({ selectedId: id, diagnosticSubMuscleId: null }),
  // Diagnostic selection — atomically sets both mesh ID and sub-muscle context.
  setSelectedFromDiagnostic: (meshId, subMuscleId) =>
    set({ selectedId: meshId, diagnosticSubMuscleId: subMuscleId }),
  setDiagnosticSubMuscleId: (id) => set({ diagnosticSubMuscleId: id }),
  setHovered:  (id) => set({ hoveredId:  id }),

  // ── Per-structure visibility ──────────────────────────────────────────────
  toggleHidden: (id) =>
    set((s) => {
      const next = new Set(s.hiddenIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { hiddenIds: next }
    }),

  hideSelected: () =>
    set((s) => {
      if (!s.selectedId) return {}
      const next = new Set(s.hiddenIds)
      next.add(s.selectedId)
      return { hiddenIds: next, selectedId: null }
    }),

  showAll: () =>
    set({ hiddenIds: new Set(), isolateMode: false }),

  isolateSelected: () =>
    set((s) => ({ isolateMode: s.selectedId !== null })),

  exitIsolate: () => set({ isolateMode: false }),

  // ── Layer visibility ──────────────────────────────────────────────────────
  toggleHideLayer: (layer) =>
    set((s) => {
      const hidden  = new Set(s.hiddenLayers)
      const ghosted = new Set(s.ghostedLayers)
      if (hidden.has(layer)) {
        hidden.delete(layer)
      } else {
        hidden.add(layer)
        ghosted.delete(layer)
      }
      return { hiddenLayers: hidden, ghostedLayers: ghosted }
    }),

  toggleGhostLayer: (layer) =>
    set((s) => {
      const hidden  = new Set(s.hiddenLayers)
      const ghosted = new Set(s.ghostedLayers)
      if (ghosted.has(layer)) {
        ghosted.delete(layer)
      } else {
        ghosted.add(layer)
        hidden.delete(layer)
      }
      return { hiddenLayers: hidden, ghostedLayers: ghosted }
    }),

  showAllLayers: () =>
    set({ hiddenLayers: new Set(), ghostedLayers: new Set() }),

  // ── Camera ────────────────────────────────────────────────────────────────
  resetView: () =>
    set((s) => ({
      cameraResetTrigger: s.cameraResetTrigger + 1,
      selectedId:         null,
      hoveredId:          null,
      hiddenIds:          new Set(),
      isolateMode:        false,
      hiddenLayers:       new Set(),
      ghostedLayers:      new Set(),
      cameraPreset:       null,
    })),

  flyToPreset: (preset) => set({ cameraPreset: preset }),

  clearCameraPreset: () => set({ cameraPreset: null }),

  // ── Search + filters ──────────────────────────────────────────────────────
  setSearchQuery: (q) => set({ searchQuery: q }),

  toggleSystemFilter: (system) =>
    set((s) => ({
      activeFilters: toggleInArray(s.activeFilters, 'systems', system as never),
    })),

  toggleLayerFilter: (layer) =>
    set((s) => ({
      activeFilters: toggleInArray(s.activeFilters, 'layers', layer as never),
    })),

  toggleRegionFilter: (region) =>
    set((s) => ({
      activeFilters: toggleInArray(s.activeFilters, 'regions', region as never),
    })),

  toggleSideFilter: (side) =>
    set((s) => ({
      activeFilters: toggleInArray(s.activeFilters, 'sides', side as never),
    })),

  clearFilters: () => set({ activeFilters: defaultFilters, searchQuery: '' }),

  // ── Scene ─────────────────────────────────────────────────────────────────
  setSceneIndex:  (index)  => set({ sceneIndex: index }),
  setModelStatus: (status) => set({ modelStatus: status }),

  // ── UI toggles ─────────────────────────────────────────────────────────────
  toggleDarkMode:    () => set((s) => ({ darkMode:        !s.darkMode        })),
  toggleGhostMode:   () => set((s) => ({ ghostMode:       !s.ghostMode       })),
  togglePainOverlay: () => set((s) => ({ showPainOverlay: !s.showPainOverlay })),

  toggleDiagnosticMode: () =>
    set((s) => ({
      diagnosticMode:    !s.diagnosticMode,
      diagnosticResult:  null,
      diagnosticPulseId: null,
      candidateMuscles:  [],
    })),
  setDiagnostic:      (result) => set({ diagnosticResult: result }),
  setDiagnosticPulse: (id)     => set({ diagnosticPulseId: id }),
  setCandidateMuscles: (ids)   => set({ candidateMuscles: ids }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggleInArray<K extends keyof ActiveFilters>(
  filters: ActiveFilters,
  key: K,
  value: ActiveFilters[K][number],
): ActiveFilters {
  const arr = filters[key] as string[]
  const idx = arr.indexOf(value as string)
  const next = idx === -1
    ? [...arr, value as string]
    : arr.filter((_, i) => i !== idx)
  return { ...filters, [key]: next }
}

// ── Derived selectors ─────────────────────────────────────────────────────────

export function isStructureVisible(
  id: string,
  hiddenIds: Set<string>,
  isolateMode: boolean,
  selectedId: string | null,
): boolean {
  if (hiddenIds.has(id)) return false
  if (isolateMode && id !== selectedId) return false
  return true
}

/**
 * Full visibility check including layer state.
 * Returns: 'visible' | 'ghosted' | 'hidden'
 */
export function resolveStructureVisibility(
  id: string,
  layer: LayerType,
  hiddenIds:     Set<string>,
  hiddenLayers:  Set<LayerType>,
  ghostedLayers: Set<LayerType>,
  isolateMode:   boolean,
  selectedId:    string | null,
  ghostMode:     boolean,
): 'visible' | 'ghosted' | 'hidden' {
  if (hiddenIds.has(id))          return 'hidden'
  if (isolateMode && id !== selectedId) return 'hidden'
  if (hiddenLayers.has(layer))    return 'hidden'
  if (ghostedLayers.has(layer) && id !== selectedId) return 'ghosted'
  if (ghostMode && id !== selectedId) return 'ghosted'
  return 'visible'
}
