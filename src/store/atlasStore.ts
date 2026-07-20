import { create } from 'zustand'
import type { SceneIndex, ActiveFilters, ModelStatus, LayerType } from '../lib/types'
import { buildMetadataOnlyIndex } from '../lib/anatomyIndex'
import type { CameraPresetKey } from '../lib/cameraUtils'
import type { DiagnosticResult } from '../lib/diagnostic'

// ── Per-limb pose transform ──────────────────────────────────────────────────

export interface LimbTransform {
  offsetX: number; offsetY: number; offsetZ: number
  rotXDeg: number; rotYDeg: number; rotZDeg: number
  scaleX:  number; scaleY:  number; scaleZ:  number
}

export const DEFAULT_LIMB_TRANSFORM: LimbTransform = {
  offsetX: 0, offsetY: 0, offsetZ: 0,
  rotXDeg: 0, rotYDeg: 0, rotZDeg: 0,
  scaleX:  1, scaleY:  1, scaleZ:  1,
}

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
  /** The last source list the user tapped into, stashed while they view one
   *  muscle so "Back to pain sources" can restore the exact list (and its
   *  leader-line cards) instead of dumping them on the raw body. */
  savedDiagnostic:      DiagnosticResult | null
  savedCandidates:      string[]

  // Meshy single-mesh anatomical base
  useMeshyModel:        boolean
  showMuscleDebug:      boolean

  // Triage chat panel
  triageOpen:           boolean

  // Movement Assessment full-screen
  movementOpen:         boolean
  // Live 3D Muscle-Activation Twin full-screen
  twinOpen:             boolean
  // Personal profile + camera body-scan full-screen (personalization hub)
  profileOpen:          boolean
  /** Number of full-screen overlay modals currently open. When > 0,
   *  the 3D canvas chrome (Movement Screen launcher, schematic overlay,
   *  diagnostic toggle, status badges) is hidden so the modal is the
   *  visual focus. */
  modalOpenCount:       number
  /** When set to a non-null value, the AppHeader-mounted modal of
   *  that kind opens. This lets buttons placed elsewhere in the UI
   *  (e.g. on-canvas FeatureLauncher) trigger header-owned modals
   *  without prop drilling. Consumers clear it back to null after
   *  handling. */
  featureModalToOpen:   null | 'battery' | 'program' | 'symmetry' | 'remote' | 'health'

  // Muscle-overlay calibration onto the Meshy body — non-uniform scale
  muscleOverlayScaleX:  number
  muscleOverlayScaleY:  number
  muscleOverlayScaleZ:  number
  muscleOverlayOffsetX: number
  muscleOverlayOffsetY: number
  muscleOverlayOffsetZ: number

  // Per-limb 9-DOF pose calibration — translate XYZ + rotate XYZ + scale XYZ
  // applied around the shoulder / hip pivot, with appropriate L/R mirroring.
  armTransform: LimbTransform
  legTransform: LimbTransform
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
  /** One-tap select + isolate straight from the candidate list: selects the
   *  mesh, drops into isolate mode, and clears the diagnostic schematic in a
   *  single action so the muscle is highlighted alone with no extra step. */
  isolateMuscle:   (meshId: string) => void
  /** Persistent "Exit" from the isolated view — returns to the full, tappable
   *  body in one click: leaves isolate mode, clears the selection and any
   *  diagnostic candidates, so the user can immediately tap a new spot. */
  exitIsolateToModel: () => void
  /** Return from an isolated muscle to the source list it was picked from —
   *  restores the stashed diagnostic result + candidates so the leader-line
   *  cards reappear. Falls back to exitIsolateToModel when nothing is stashed. */
  backToSources: () => void

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

  toggleMeshyModel:     () => void
  toggleMuscleDebug:    () => void
  toggleTriage:         () => void
  setTriageOpen:        (open: boolean) => void
  toggleMovement:       () => void
  setMovementOpen:      (open: boolean) => void
  toggleTwin:           () => void
  setTwinOpen:          (open: boolean) => void
  toggleProfile:        () => void
  setProfileOpen:       (open: boolean) => void
  pushModal:            () => void
  popModal:             () => void
  setFeatureModalToOpen: (key: null | 'battery' | 'program' | 'symmetry' | 'remote' | 'health') => void

  setMuscleOverlayScaleX:  (v: number) => void
  setMuscleOverlayScaleY:  (v: number) => void
  setMuscleOverlayScaleZ:  (v: number) => void
  setMuscleOverlayOffsetX: (v: number) => void
  setMuscleOverlayOffsetY: (v: number) => void
  setMuscleOverlayOffsetZ: (v: number) => void
  setArmTransform:         (patch: Partial<LimbTransform>) => void
  setLegTransform:         (patch: Partial<LimbTransform>) => void
  resetMuscleOverlay:      () => void
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
  savedDiagnostic:       null,
  savedCandidates:       [],
  diagnosticSubMuscleId: null,

  useMeshyModel:         true,    // overlay 52-mesh muscles onto male-normal.glb
  showMuscleDebug:       false,
  triageOpen:            false,
  movementOpen:          false,
  twinOpen:              false,
  profileOpen:           false,
  modalOpenCount:        0,
  featureModalToOpen:    null,
  // Baked calibration values — tuned so the 52-mesh muscles align with
  // the male-normal.glb ghost body without needing the slider panel open.
  muscleOverlayScaleX:   1.090,
  muscleOverlayScaleY:   1.000,
  muscleOverlayScaleZ:   1.090,
  muscleOverlayOffsetX:  0.000,
  muscleOverlayOffsetY:  0.000,
  muscleOverlayOffsetZ: -0.064,
  armTransform: {
    offsetX: 0.110, offsetY: -0.110, offsetZ: 0.000,
    rotXDeg: 0.0,   rotYDeg:  0.0,   rotZDeg: 5.5,
    scaleX:  1.000, scaleY:   1.105, scaleZ:  1.000,
  },
  legTransform: {
    offsetX: 0.060, offsetY:  0.000, offsetZ: 0.000,
    rotXDeg: 0.0,   rotYDeg:  0.0,   rotZDeg: 5.5,
    scaleX:  1.000, scaleY:   1.000, scaleZ:  1.000,
  },

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

  // One-tap: pick a candidate → highlight it alone. Selection and isolation
  // are the same action, and the diagnostic schematic is cleared so nothing
  // else competes for attention on the model.
  isolateMuscle: (meshId) =>
    set((s) => ({
      selectedId:            meshId,
      isolateMode:           true,
      hoveredId:             null,
      diagnosticSubMuscleId: null,
      // Stash the list we came from so it can be restored on "back".
      savedDiagnostic:       s.diagnosticResult ?? s.savedDiagnostic,
      savedCandidates:       s.candidateMuscles.length ? s.candidateMuscles : s.savedCandidates,
      diagnosticResult:      null,
      diagnosticPulseId:     null,
      candidateMuscles:      [],
    })),

  // Back to the full tappable body in one click — a clean reset that also drops
  // any stashed source list, so the very next tap starts fresh.
  exitIsolateToModel: () =>
    set({
      isolateMode:           false,
      selectedId:            null,
      hoveredId:             null,
      diagnosticSubMuscleId: null,
      diagnosticResult:      null,
      diagnosticPulseId:     null,
      candidateMuscles:      [],
      savedDiagnostic:       null,
      savedCandidates:       [],
    }),

  backToSources: () =>
    set((s) => {
      // Nothing stashed (e.g. muscle was tapped directly, not via a list) —
      // fall back to a plain return to the full body.
      if (!s.savedDiagnostic) {
        return {
          isolateMode:           false,
          selectedId:            null,
          hoveredId:             null,
          diagnosticSubMuscleId: null,
          diagnosticResult:      null,
          diagnosticPulseId:     null,
          candidateMuscles:      [],
        }
      }
      return {
        isolateMode:           false,
        selectedId:            null,
        hoveredId:             null,
        diagnosticSubMuscleId: null,
        diagnosticResult:      s.savedDiagnostic,
        candidateMuscles:      s.savedCandidates,
        diagnosticPulseId:     null,
      }
    }),

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
      savedDiagnostic:    null,
      savedCandidates:    [],
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
      savedDiagnostic:   null,
      savedCandidates:   [],
    })),
  setDiagnostic:      (result) => set({ diagnosticResult: result }),
  setDiagnosticPulse: (id)     => set({ diagnosticPulseId: id }),
  setCandidateMuscles: (ids)   => set({ candidateMuscles: ids }),

  toggleMeshyModel:  () => set((s) => ({ useMeshyModel: !s.useMeshyModel,    selectedId: null, hoveredId: null })),
  toggleMuscleDebug: () => set((s) => ({ showMuscleDebug: !s.showMuscleDebug })),
  toggleTriage:      () => set((s) => ({ triageOpen: !s.triageOpen })),
  setTriageOpen:     (open) => set({ triageOpen: open }),
  toggleMovement:    () => set((s) => ({ movementOpen: !s.movementOpen })),
  setMovementOpen:   (open) => set({ movementOpen: open }),
  toggleTwin:        () => set((s) => ({ twinOpen: !s.twinOpen })),
  setTwinOpen:       (open) => set({ twinOpen: open }),
  toggleProfile:     () => set((s) => ({ profileOpen: !s.profileOpen })),
  setProfileOpen:    (open) => set({ profileOpen: open }),
  pushModal:         () => set((s) => ({ modalOpenCount: s.modalOpenCount + 1 })),
  popModal:          () => set((s) => ({ modalOpenCount: Math.max(0, s.modalOpenCount - 1) })),
  setFeatureModalToOpen: (key) => set({ featureModalToOpen: key }),

  setMuscleOverlayScaleX:  (v) => set({ muscleOverlayScaleX:  v }),
  setMuscleOverlayScaleY:  (v) => set({ muscleOverlayScaleY:  v }),
  setMuscleOverlayScaleZ:  (v) => set({ muscleOverlayScaleZ:  v }),
  setMuscleOverlayOffsetX: (v) => set({ muscleOverlayOffsetX: v }),
  setMuscleOverlayOffsetY: (v) => set({ muscleOverlayOffsetY: v }),
  setMuscleOverlayOffsetZ: (v) => set({ muscleOverlayOffsetZ: v }),
  setArmTransform:         (patch) => set((s) => ({ armTransform: { ...s.armTransform, ...patch } })),
  setLegTransform:         (patch) => set((s) => ({ legTransform: { ...s.legTransform, ...patch } })),
  resetMuscleOverlay:      () => set({
    muscleOverlayScaleX:   1.090,
    muscleOverlayScaleY:   1.000,
    muscleOverlayScaleZ:   1.090,
    muscleOverlayOffsetX:  0.000,
    muscleOverlayOffsetY:  0.000,
    muscleOverlayOffsetZ: -0.064,
    armTransform: {
      offsetX: 0.110, offsetY: -0.110, offsetZ: 0.000,
      rotXDeg: 0.0,   rotYDeg:  0.0,   rotZDeg: 5.5,
      scaleX:  1.000, scaleY:   1.105, scaleZ:  1.000,
    },
    legTransform: {
      offsetX: 0.060, offsetY:  0.000, offsetZ: 0.000,
      rotXDeg: 0.0,   rotYDeg:  0.0,   rotZDeg: 5.5,
      scaleX:  1.000, scaleY:   1.000, scaleZ:  1.000,
    },
  }),
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
