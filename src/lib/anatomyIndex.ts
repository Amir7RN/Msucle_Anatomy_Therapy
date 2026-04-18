import * as THREE from 'three'
import type { StructureMetadata, SceneIndex } from './types'
import rawData from '../data/structures.json'

// Cast the imported JSON to our typed array once at module load
const ALL_STRUCTURES = rawData as StructureMetadata[]

// ── Normalisation helpers ─────────────────────────────────────────────────────

/** Lowercase + replace separators with underscores */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-\.]+/g, '_')
}

/**
 * Strip known mesh-name prefixes that modelling tools often prepend.
 * e.g.  "Body_Biceps_Brachii_R"  → "Biceps_Brachii_R"
 *        "Msh_Biceps_R"          → "Biceps_R"
 *        "SM_Biceps"             → "Biceps"
 */
const STRIP_PREFIXES = ['body_', 'msh_', 'sm_', 'mesh_', 'obj_', 'geo_', 'grp_']

function stripPrefix(s: string): string {
  const lower = s.toLowerCase()
  for (const p of STRIP_PREFIXES) {
    if (lower.startsWith(p)) return s.slice(p.length)
  }
  return s
}

// ── Metadata-only index (available without a loaded 3D scene) ─────────────────

/** Build the full metadata map, keyed by id. Called once at startup. */
export function buildMetadataMap(): Map<string, StructureMetadata> {
  const map = new Map<string, StructureMetadata>()
  for (const s of ALL_STRUCTURES) map.set(s.id, s)
  return map
}

/**
 * Build a mesh-name → structureId reverse index from metadata alone.
 * Covers four name variants for every entry in meshNames[]:
 *   1. exact case
 *   2. lowercased
 *   3. prefix-stripped original
 *   4. prefix-stripped + lowercased
 */
function buildMeshNameIndex(): Map<string, string> {
  const map = new Map<string, string>()

  for (const s of ALL_STRUCTURES) {
    for (const name of s.meshNames) {
      const stripped = stripPrefix(name)
      map.set(name,                 s.id)
      map.set(norm(name),           s.id)
      map.set(stripped,             s.id)
      map.set(norm(stripped),       s.id)
    }
  }
  return map
}

// ── Group helpers ─────────────────────────────────────────────────────────────

function addToGroup(map: Map<string, string[]>, key: string, id: string) {
  const list = map.get(key)
  if (list) {
    list.push(id)
  } else {
    map.set(key, [id])
  }
}

function buildGroupIndexes() {
  const idsBySystem = new Map<string, string[]>()
  const idsByLayer  = new Map<string, string[]>()
  const idsByRegion = new Map<string, string[]>()
  const idsBySide   = new Map<string, string[]>()

  for (const s of ALL_STRUCTURES) {
    addToGroup(idsBySystem, s.system,  s.id)
    addToGroup(idsByLayer,  s.layer,   s.id)
    addToGroup(idsByRegion, s.region,  s.id)
    addToGroup(idsBySide,   s.side,    s.id)
  }
  return { idsBySystem, idsByLayer, idsByRegion, idsBySide }
}

// ── Full scene index (requires a loaded THREE scene) ─────────────────────────

/**
 * Traverse the loaded Three.js scene ONCE and produce a complete SceneIndex.
 *
 * Mesh → structure matching priority (highest first):
 *   1. mesh.userData.structureId  — set directly in Blender or export pipeline
 *   2. mesh.name exact match      — meshNames[] entry in structures.json
 *   3. mesh.name lowercased       — case-insensitive exact
 *   4. prefix-stripped mesh.name  — strips Body_, Msh_, SM_, etc.
 *   5. prefix-stripped + lowered  — combined
 *
 * Unmapped meshes are logged as warnings in the console so they are easy
 * to find and add to structures.json without touching code.
 */
export function buildSceneIndex(scene: THREE.Object3D): SceneIndex {
  const meshById     = new Map<string, THREE.Mesh>()
  const meshByName   = new Map<string, THREE.Mesh>()
  const idByMeshName = buildMeshNameIndex()
  const metadataById = buildMetadataMap()
  const { idsBySystem, idsByLayer, idsByRegion, idsBySide } = buildGroupIndexes()

  const unmapped: string[] = []
  let totalMeshes = 0

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    totalMeshes++

    meshByName.set(obj.name, obj)

    // ── Strategy 1: userData override (highest priority) ──────────────────
    const userDataId = obj.userData.structureId as string | undefined
    if (userDataId && metadataById.has(userDataId)) {
      meshById.set(userDataId, obj)
      idByMeshName.set(obj.name, userDataId)
      return
    }

    // ── Strategy 2-5: name-based lookup ───────────────────────────────────
    const stripped = stripPrefix(obj.name)
    const structureId =
      idByMeshName.get(obj.name) ??
      idByMeshName.get(norm(obj.name)) ??
      idByMeshName.get(stripped) ??
      idByMeshName.get(norm(stripped))

    if (structureId) {
      meshById.set(structureId, obj)
      // Ensure forward lookup covers this exact mesh.name too
      if (!idByMeshName.has(obj.name)) {
        idByMeshName.set(obj.name, structureId)
      }
    } else if (obj.name && obj.name !== '') {
      unmapped.push(obj.name)
    }
  })

  // ── Console report ────────────────────────────────────────────────────────
  const mapped = meshById.size
  console.info(
    `[AnatomyIndex] Scene traversal complete — ${totalMeshes} meshes, ` +
    `${mapped} mapped, ${unmapped.length} unmapped.`
  )
  if (unmapped.length > 0) {
    console.warn(
      `[AnatomyIndex] ${unmapped.length} unmapped mesh(es). ` +
      `Add their names to structures.json → meshNames[] or set mesh.userData.structureId in your export pipeline.\n` +
      `Unmapped: ${unmapped.slice(0, 30).join(', ')}` +
      (unmapped.length > 30 ? ` …and ${unmapped.length - 30} more` : '')
    )
  }

  return {
    meshById,
    meshByName,
    metadataById,
    idByMeshName,
    idsBySystem,
    idsByLayer,
    idsByRegion,
    idsBySide,
    allIds: Array.from(metadataById.keys()),
  }
}

/**
 * Build a SceneIndex without an actual THREE scene (metadata only).
 * Used in mock/placeholder mode.
 */
export function buildMetadataOnlyIndex(): SceneIndex {
  const idByMeshName = buildMeshNameIndex()
  const metadataById = buildMetadataMap()
  const { idsBySystem, idsByLayer, idsByRegion, idsBySide } = buildGroupIndexes()

  return {
    meshById:    new Map(),
    meshByName:  new Map(),
    metadataById,
    idByMeshName,
    idsBySystem,
    idsByLayer,
    idsByRegion,
    idsBySide,
    allIds: Array.from(metadataById.keys()),
  }
}

/** Convenience: get metadata for a given structure id */
export function getMetadata(index: SceneIndex, id: string): StructureMetadata | undefined {
  return index.metadataById.get(id)
}

/** Resolve a mesh.name → structure id using the index (5-strategy fallback) */
export function resolveId(index: SceneIndex, meshName: string): string | undefined {
  const stripped = stripPrefix(meshName)
  return (
    index.idByMeshName.get(meshName) ??
    index.idByMeshName.get(norm(meshName)) ??
    index.idByMeshName.get(stripped) ??
    index.idByMeshName.get(norm(stripped))
  )
}

export { ALL_STRUCTURES }
