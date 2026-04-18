import type * as THREE from 'three'

// ── Taxonomy ──────────────────────────────────────────────────────────────────
export type SystemType = 'muscle' | 'skeleton' | 'nerve' | 'joint'
export type LayerType  = 'superficial' | 'intermediate' | 'deep'
export type SideType   = 'left' | 'right' | 'bilateral'
export type RegionType = 'head_neck' | 'trunk' | 'upper_limb' | 'lower_limb'

// ── Core data schema ──────────────────────────────────────────────────────────
export interface StructureMetadata {
  id: string
  displayName: string
  system: SystemType
  layer: LayerType
  side: SideType
  region: RegionType
  synonyms: string[]
  origin: string
  insertion: string
  action: string
  innervation: string
  notes: string
  meshNames: string[]   // all known mesh.name variants that map to this structure
}

// ── Scene index (built once at model load) ────────────────────────────────────
export interface SceneIndex {
  /** structureId → THREE.Mesh (only populated if a real GLB is loaded) */
  meshById: Map<string, THREE.Mesh>
  /** mesh.name (original case) → THREE.Mesh */
  meshByName: Map<string, THREE.Mesh>
  /** structureId → metadata */
  metadataById: Map<string, StructureMetadata>
  /** mesh.name (lowercase) → structureId  */
  idByMeshName: Map<string, string>
  // Group indexes for fast filter queries
  idsBySystem: Map<string, string[]>
  idsByLayer:  Map<string, string[]>
  idsByRegion: Map<string, string[]>
  idsBySide:   Map<string, string[]>
  allIds: string[]
}

// ── Filter / search state ─────────────────────────────────────────────────────
export interface ActiveFilters {
  systems: SystemType[]
  layers:  LayerType[]
  regions: RegionType[]
  sides:   SideType[]
}

// ── Model loading status ──────────────────────────────────────────────────────
export type ModelStatus = 'loading' | 'loaded' | 'error' | 'placeholder'

// ── Mock scene helper types ───────────────────────────────────────────────────
export type MockGeometry = 'box' | 'sphere' | 'cylinder' | 'capsule'

/**
 * muscleType drives the procedural geometry created for placeholder mode:
 *   'belly' – LatheGeometry with sine-profile belly bulge (default, best for limb muscles)
 *   'flat'  – Squashed SphereGeometry for sheet muscles (pec, trap, lat, glutes)
 *   'round' – SphereGeometry for compact rounded muscles (masseter, temporalis)
 */
export type MockMuscleType = 'belly' | 'flat' | 'round'

export interface MockMeshDef {
  /** Must match a structure id in structures.json */
  id: string
  /** Must match one of the meshNames in that structure's record */
  meshName: string
  geometry: MockGeometry
  position: [number, number, number]
  rotation?: [number, number, number]
  /** Direct scale applied to a unit-size primitive */
  scale: [number, number, number]
  /** Controls procedural geometry shape in placeholder mode */
  muscleType?: MockMuscleType
}

export interface BodyPartDef {
  key: string
  geometry: MockGeometry
  position: [number, number, number]
  rotation?: [number, number, number]
  scale: [number, number, number]
}
