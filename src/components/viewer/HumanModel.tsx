/**
 * HumanModel.tsx
 *
 * Loads the real BodyParts3D anatomical GLB and wires up interactive behaviours.
 *
 * ── Model source ──────────────────────────────────────────────────────────────
 * Meshes: BodyParts3D / Anatomography (RIKEN BioResource Center)
 * License: CC BY SA 2.1 JP  https://creativecommons.org/licenses/by-sa/2.1/jp/
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *  GLTFScene   loads GLB, traverses meshes, wires interactions, auto-grounds
 *  HumanModel  top-level — Suspense + error boundary
 *
 * ── NO PRIMITIVE GEOMETRY ────────────────────────────────────────────────────
 *  All geometry comes from the real .glb model.
 *
 * ── GROUNDING ────────────────────────────────────────────────────────────────
 *  After load: compute scene bounding box → shift scene.position.y so the
 *  lowest mesh vertex sits exactly at GRID_Y (the floor grid plane).
 *
 * ── CLICK SELECTION ──────────────────────────────────────────────────────────
 *  ViewerCanvas uses onPointerMissed (not onClick) so canvas-level deselection
 *  never fires when a mesh is hit.  e.stopPropagation() here keeps R3F from
 *  bubbling to parent objects.
 */

import React, { Component, useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ThreeEvent, useFrame } from '@react-three/fiber'
import { useAtlasStore, resolveStructureVisibility } from '../../store/atlasStore'
import { useSceneIndex } from '../../hooks/useSceneIndex'
import { resolveColor, muscleRoughness, MUSCLE_DEFAULT } from '../../lib/colors'
import type { SystemType, LayerType } from '../../lib/types'

// ── Model path ────────────────────────────────────────────────────────────────
export const MODEL_PATH = '/models/human-muscular-system.glb'

// ── Y coordinate of the floor grid in ViewerCanvas ───────────────────────────
const GRID_Y = -0.925

// ─────────────────────────────────────────────────────────────────────────────
//  Procedural muscle-fiber normal map
// ─────────────────────────────────────────────────────────────────────────────
//
// Generates a tiling tangent-space normal map that simulates the parallel
// striations of skeletal muscle fiber bundles.
//
// Encoding (OpenGL / Three.js convention):
//   R = X component  G = Y component  B = Z component
//   Neutral flat surface = (128, 128, 255)
//
// The height field is a sum of:
//  • Primary fibers  — parallel sinusoidal ridges running along V (belly axis)
//    with gentle lateral waviness that varies along V for biological irregularity.
//  • Secondary variation — lower-frequency modulation along the fiber length.
//
// bumpStrength controls the tilt angle of the normals off the surface.
// arctan(0.42) ≈ 23° — enough to show clear fiber definition under directional
// light without over-sharpening on non-ideal UV layouts.
//
function makeMuscleFiberNormalMap(width = 512, height = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  const d   = img.data

  const primaryFreq  = 20    // fiber bundles per UV tile
  const waveAmp      = 0.32  // lateral waviness amplitude
  const secFreq      = 4     // secondary modulation cycles per tile
  const bumpStrength = 0.42  // normal tilt magnitude (larger = more pronounced)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const u = x / width   // tangent-U direction (across fibers)
      const v = y / height  // tangent-V direction (along fiber belly)

      // Primary: striation phase in U, with V-dependent waviness
      const primaryPhase = u * primaryFreq * Math.PI * 2
                         + Math.sin(v * 8.3) * waveAmp * Math.PI
                         + Math.sin(v * 3.7 + 1.2) * waveAmp * 0.5 * Math.PI

      // Secondary: gentle modulation along the fiber length
      const secPhase = v * secFreq * Math.PI * 2 + u * 2.9

      // Normal components (tangent-space, direct parameterisation)
      // nx tilts the normal across fibers (the visible striation effect)
      // ny tilts it slightly along fibers (secondary belly variation)
      const nx  = Math.cos(primaryPhase) * bumpStrength
      const ny  = Math.cos(secPhase) * 0.16 * bumpStrength
      const nz  = 1.0
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)

      // Pack into 0–255 with 0.5 offset (normal map convention)
      d[i]     = Math.round((nx / len * 0.5 + 0.5) * 255)  // R → X
      d[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255)  // G → Y
      d[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255)  // B → Z
      d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 6)   // 3× across UV width · 6× down UV height
  tex.needsUpdate = true
  return tex
}

// ─────────────────────────────────────────────────────────────────────────────
//  Anatomy PBR material factory — stable MeshStandardMaterial
// ─────────────────────────────────────────────────────────────────────────────
//
//  MeshStandardMaterial chosen for stability after transmission + clearcoat
//  caused depth-buffer and "shattered geometry" rendering issues.
//
//  roughness (0.50)    — balanced diffuse/specular for soft anatomical look
//  metalness (0.00)    — zero metalness: pure dielectric, no metallic sheen
//  normalMap (0.15)    — micro-fiber striations, very subtle
//
//  polygonOffset       — critical Z-fighting fix.  Muscle meshes sit extremely
//    factor = -1         close to the body surface mesh.  A negative offset
//    units  = -1         shifts the depth value slightly toward the camera so
//                        muscles always win the depth test against the body.
//
//  depthWrite (true)   — muscles write to the depth buffer (solid objects)
//  depthTest  (true)   — muscles are occluded by nearer geometry (correct)
//  side (FrontSide)    — only the outward-facing surface renders; DoubleSide
//                        would expose the mesh interior, adding to the
//                        jagged / shattered appearance.
//
function buildMuscleMaterial(normalMap: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness:   0.50,
    metalness:   0.00,
    normalMap,
    normalScale: new THREE.Vector2( 0.15, 0.15 ),
    side:        THREE.FrontSide,
    flatShading: false,
    depthWrite:  true,
    depthTest:   true,
  })
  mat.polygonOffset       = true
  mat.polygonOffsetFactor = -1
  mat.polygonOffsetUnits  = -1
  return mat
}

// ─────────────────────────────────────────────────────────────────────────────
//  Material state helper
// ─────────────────────────────────────────────────────────────────────────────

function applyMeshState(
  obj: THREE.Mesh,
  opts: {
    hexColor:        string
    roughness:       number
    isSelected:      boolean
    isHovered:       boolean
    visState:        'visible' | 'ghosted' | 'hidden'
    fiberNormalMap?: THREE.Texture
  },
) {
  const { hexColor, roughness, isSelected, isHovered, visState, fiberNormalMap } = opts

  // ── First-time setup: replace GLB material with anatomy PBR ──────────────
  //  Runs once per mesh.  Handles both single-material and array-material meshes.
  //  Subsequent calls update uniforms only.
  const replaceMat = (existing: THREE.Material) => {
    if (existing.userData?.managed) return existing
    const fresh = fiberNormalMap
      ? buildMuscleMaterial(fiberNormalMap)
      : (() => {
          const m = new THREE.MeshStandardMaterial({
            roughness: 0.50, metalness: 0.00,
            side: THREE.FrontSide, flatShading: false,
            depthWrite: true, depthTest: true,
          })
          m.polygonOffset       = true
          m.polygonOffsetFactor = -1
          m.polygonOffsetUnits  = -1
          return m
        })()
    fresh.userData.managed = true
    return fresh
  }

  if (Array.isArray(obj.material)) {
    obj.material = obj.material.map(replaceMat) as THREE.Material[]
  } else {
    obj.material = replaceMat(obj.material)
  }

  const mat = (Array.isArray(obj.material)
    ? obj.material[0]
    : obj.material) as THREE.MeshStandardMaterial

  // ── Color ─────────────────────────────────────────────────────────────────
  mat.color.set(hexColor)

  // ── PBR ───────────────────────────────────────────────────────────────────
  //  roughness: per-muscle override (0.28 smooth face → 0.75 deep fascia)
  //  metalness: 0 — pure dielectric
  mat.roughness   = roughness
  mat.metalness   = 0.00
  mat.side        = THREE.FrontSide
  mat.flatShading = false
  mat.depthTest   = true

  // ── Polygon offset — confirmed every update ───────────────────────────────
  //  Shifts muscle depth values slightly toward the camera so muscles always
  //  win the depth test against the underlying body surface (Z-fight fix).
  mat.polygonOffset       = true
  mat.polygonOffsetFactor = -1
  mat.polygonOffsetUnits  = -1

  // ── Emissive ───────────────────────────────────────────────────────────────
  //  Selected : deep-blue beacon (#0a2890) — unmistakable interaction cue.
  //  Hovered  : warm-red glow (#902010) — hover preview.
  //  Default  : 3% of own hue — subtle biological warmth.
  if (isSelected) {
    mat.emissive.set('#0a2890')
    mat.emissiveIntensity = 0.35
  } else if (isHovered) {
    mat.emissive.set('#902010')
    mat.emissiveIntensity = 0.28
  } else {
    mat.emissive.set(hexColor)
    mat.emissiveIntensity = 0.03
  }

  // ── Visibility / transparency ──────────────────────────────────────────────
  if (visState === 'hidden') {
    obj.visible     = false
    mat.transparent = false
    mat.opacity     = 1
    mat.depthWrite  = true
  } else if (visState === 'ghosted') {
    obj.visible     = true
    mat.transparent = true
    mat.opacity     = 0.18
    mat.depthWrite  = false
  } else {
    obj.visible     = true
    mat.transparent = false
    mat.opacity     = 1
    mat.depthWrite  = true
  }

  mat.needsUpdate = true
}

// ─────────────────────────────────────────────────────────────────────────────
//  ErrorBoundary
// ─────────────────────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; message?: string }
interface EBProps  { children: React.ReactNode; fallback: React.ReactNode }

class ModelErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error.message }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GLTFScene — the real anatomical model
// ─────────────────────────────────────────────────────────────────────────────

function GLTFScene({ path }: { path: string }) {
  const gltf  = useGLTF(path)
  const scene = gltf.scene

  useSceneIndex(scene)

  // ── Shared procedural fiber normal map (created once, tiled across all muscles) ──
  const fiberNormalMap = useMemo(() => makeMuscleFiberNormalMap(), [])

  // Dispose GPU texture when component unmounts
  useEffect(() => () => { fiberNormalMap.dispose() }, [fiberNormalMap])

  const sceneIndex    = useAtlasStore((s) => s.sceneIndex)
  const selectedId    = useAtlasStore((s) => s.selectedId)
  const hoveredId     = useAtlasStore((s) => s.hoveredId)
  const hiddenIds     = useAtlasStore((s) => s.hiddenIds)
  const hiddenLayers  = useAtlasStore((s) => s.hiddenLayers)
  const ghostedLayers = useAtlasStore((s) => s.ghostedLayers)
  const isolateMode   = useAtlasStore((s) => s.isolateMode)
  const ghostMode     = useAtlasStore((s) => s.ghostMode)
  const setSelected   = useAtlasStore((s) => s.setSelected)
  const setHovered    = useAtlasStore((s) => s.setHovered)
  const setModelStatus = useAtlasStore((s) => s.setModelStatus)

  // ── Geometry quality pass (once after load) ───────────────────────────────
  //
  // Step 1 — deleteAttribute('normal')
  //   The GLB may export hard-edge (split) normals: each triangle corner has
  //   its own normal entry, meaning no vertex is shared across triangles.
  //   This is the direct cause of the "shattered / discrete points" look:
  //   every triangle is a completely independent shard.  Deleting them lets
  //   the later steps build correct smooth normals from scratch.
  //
  // Step 2 — mergeVertices()
  //   Welds duplicate position entries within a positional tolerance of 1e-4
  //   world units (~0.1 mm at human scale).  Converts the disconnected soup
  //   of independent triangles into a single continuous indexed mesh where
  //   neighbouring triangles share edge vertices.  This is the structural fix.
  //
  // Step 3 — computeVertexNormals()
  //   With the mesh now topologically connected, Three.js averages the face
  //   normals at each shared vertex (weighted by face area / angle).
  //   Result: the GPU interpolates smoothly across polygon boundaries —
  //   the surface looks curved and organic rather than faceted.
  //
  // Step 4 — computeTangents()
  //   MikkTSpace tangents for the fiber normal map.
  //   Requires indexed geometry + UV attributes; silently skipped otherwise.
  //
  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.castShadow    = true
      obj.receiveShadow = true

      // Step 1 — wipe existing (possibly split / hard-edge) normals
      if (obj.geometry.attributes.normal) {
        obj.geometry.deleteAttribute('normal')
      }

      // Step 2 — weld duplicate vertices into a continuous mesh
      try {
        obj.geometry = mergeVertices(obj.geometry, 1e-4)
      } catch (_) { /* non-manifold or unusual geometry — skip weld */ }

      // Step 3 — smooth vertex normals on the now-connected geometry
      obj.geometry.computeVertexNormals()

      // Step 4 — tangents for normal map (requires index + UV)
      if (obj.geometry.attributes.uv && obj.geometry.index) {
        try { obj.geometry.computeTangents() } catch (_) { /* skip */ }
      }
    })
  }, [scene])

  // ── Auto-ground: shift scene so lowest vertex sits at floor grid ──────────
  //
  // Computes the world-space bounding box of the entire scene, then offsets
  // scene.position.y so that box.min.y == GRID_Y (-0.925).
  // This makes the feet touch the floor regardless of how the GLB was exported.
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    if (!box.isEmpty()) {
      // box.min.y is in world space (includes current scene.position)
      // We want the new world minimum to equal GRID_Y:
      //   new_min = box.min.y + delta = GRID_Y
      //   delta   = GRID_Y - box.min.y
      scene.position.y += GRID_Y - box.min.y
    }
  }, [scene])   // intentionally once — only re-runs if a different scene loads

  // ── Notify store when model is loaded ────────────────────────────────────
  useEffect(() => {
    setModelStatus('loaded')
  }, [scene, setModelStatus])

  // ── Pre-stamp every mesh with structureId in userData ────────────────────
  //
  // Done once when sceneIndex is populated.  Subsequent pointer events read
  // obj.userData.structureId directly — O(1), no map lookup at click time.
  useEffect(() => {
    if (!sceneIndex.metadataById.size) return
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (obj.userData.structureId) return   // already stamped
      const id = resolveId(sceneIndex, obj.name)
      if (!id) return
      const meta = sceneIndex.metadataById.get(id)
      obj.userData.structureId = id
      if (meta) {
        obj.userData.layer  = meta.layer
        obj.userData.system = meta.system
      }
    })
  }, [scene, sceneIndex])

  // ── Material + visibility update ─────────────────────────────────────────
  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return

      const id = (obj.userData.structureId as string | undefined)
               ?? resolveId(sceneIndex, obj.name)

      const meta       = id ? sceneIndex.metadataById.get(id) : undefined
      const system     = (meta?.system ?? 'muscle') as SystemType
      const layer      = (meta?.layer  ?? obj.userData.layer ?? 'superficial') as LayerType
      const isSelected = id ? selectedId === id : false
      const isHovered  = id ? hoveredId  === id : false

      const visState = id
        ? resolveStructureVisibility(
            id, layer,
            hiddenIds, hiddenLayers, ghostedLayers,
            isolateMode, selectedId, ghostMode,
          )
        : 'visible'

      const hexColor = resolveColor(system, isHovered, isSelected, id, meta?.layer as LayerType | undefined)
      const roughness = muscleRoughness(id)

      applyMeshState(obj, { hexColor, roughness, isSelected, isHovered, visState, fiberNormalMap })
    })
  }, [scene, sceneIndex, selectedId, hoveredId, hiddenIds, hiddenLayers, ghostedLayers, isolateMode, ghostMode, fiberNormalMap])

  // ── Pointer handlers ──────────────────────────────────────────────────────
  //
  // CRITICAL: e.stopPropagation() stops R3F bubbling within the 3D scene.
  // Canvas-level deselection is handled by onPointerMissed in ViewerCanvas —
  // which fires ONLY when no mesh is hit — so these handlers are the sole
  // source of selection changes on mesh clicks.

  function handlePointerOver(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    const obj = e.object as THREE.Mesh
    const id  = (obj.userData.structureId as string | undefined)
              ?? resolveId(sceneIndex, obj.name)
    if (id) {
      setHovered(id)
      document.body.style.cursor = 'pointer'
    }
  }

  function handlePointerOut(_e: ThreeEvent<PointerEvent>) {
    setHovered(null)
    document.body.style.cursor = 'default'
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    const obj = e.object as THREE.Mesh
    const id  = (obj.userData.structureId as string | undefined)
              ?? resolveId(sceneIndex, obj.name)
    if (id) {
      // Toggle: clicking selected muscle deselects it
      setSelected(selectedId === id ? null : id)
    }
    // If id is undefined (unlabeled part), do nothing — keep current selection
  }

  return (
    <primitive
      object={scene}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  )
}

// ── Resolve structureId from mesh name ────────────────────────────────────────
function resolveId(
  index: { idByMeshName: Map<string, string> },
  meshName: string,
): string | undefined {
  return (
    index.idByMeshName.get(meshName) ??
    index.idByMeshName.get(meshName.toLowerCase())
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  LoadingSpinner — shown via Suspense while GLB downloads
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSpinner() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z -= delta * 2
  })
  return (
    <mesh ref={ref} position={[0, 0, 0]}>
      <torusGeometry args={[0.10, 0.018, 12, 48]} />
      <meshStandardMaterial color="#3b82f6" roughness={0.3} metalness={0.0} />
    </mesh>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  ModelNotFound
// ─────────────────────────────────────────────────────────────────────────────

function ModelNotFound() {
  const setModelStatus = useAtlasStore((s) => s.setModelStatus)
  useEffect(() => { setModelStatus('placeholder') }, [setModelStatus])
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
//  HumanModel — public API
// ─────────────────────────────────────────────────────────────────────────────

interface HumanModelProps {
  modelExists: boolean | null
  modelPath?:  string
}

export function HumanModel({ modelExists, modelPath }: HumanModelProps) {
  if (modelExists === false) return <ModelNotFound />

  const resolvedPath = modelPath ?? MODEL_PATH

  return (
    <ModelErrorBoundary fallback={<ModelNotFound />}>
      <React.Suspense fallback={<LoadingSpinner />}>
        <GLTFScene path={resolvedPath} />
      </React.Suspense>
    </ModelErrorBoundary>
  )
}
