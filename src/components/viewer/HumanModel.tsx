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
import { LoopSubdivision } from 'three-subdivide'
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
//  Anatomy PBR material factory  — MeshPhysicalMaterial with clearcoat
// ─────────────────────────────────────────────────────────────────────────────
//
//  MeshPhysicalMaterial features used (NO onBeforeCompile — that caused the
//  v15 black-model regression):
//
//    clearcoat (0.5)            — second specular lobe on top of the base layer.
//                                 Mimics the thin fascial membrane that wraps
//                                 every muscle belly in a wet, reflective sheath.
//                                 This "medical-grade" layer catches highlights
//                                 from different angles, visually hiding polygon
//                                 edges and giving a rounded appearance.
//
//    clearcoatRoughness (0.10)  — fairly polished clearcoat → sharp, tight
//                                 specular peak that reads as "wet tissue."
//
//    roughness (0.30)           — base layer: slight wet sheen.  Lower than v17's
//                                 0.52 so the combined clearcoat+base reads as
//                                 living muscle rather than dry clay.
//
//    metalness (0.04)           — just enough to engage the full PBR specular
//                                 path without a metallic look.
//
//    normalMap / normalScale    — procedural fiber striations at low strength
//                                 (0.20) so they read as surface texture without
//                                 distorting the clearcoat highlight.
//
function buildMuscleMaterial(normalMap: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness:          0.30,
    metalness:          0.04,
    clearcoat:          0.50,
    clearcoatRoughness: 0.10,
    normalMap,
    normalScale:        new THREE.Vector2( 0.20, 0.20 ),
    side:               THREE.FrontSide,
    flatShading:        false,
  })
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
      : new THREE.MeshPhysicalMaterial({
          roughness: 0.30, metalness: 0.04,
          clearcoat: 0.50, clearcoatRoughness: 0.10,
          side: THREE.FrontSide, flatShading: false,
        })
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
    : obj.material) as THREE.MeshPhysicalMaterial

  // ── Color ─────────────────────────────────────────────────────────────────
  mat.color.set(hexColor)

  // ── PBR ───────────────────────────────────────────────────────────────────
  //  roughness: per-muscle override (0.28 smooth face → 0.75 deep fascia)
  //  metalness: low — natural muscle sheen without metallic look
  mat.roughness   = roughness
  mat.metalness   = 0.04
  mat.side        = THREE.FrontSide
  mat.flatShading = false

  // ── Emissive ——————————————————————————————————————————————————————————————
  //  Selected : deep-blue beacon (#0a2890) — unmistakable interaction cue.
  //  Hovered  : warm-red glow (#902010) — hover preview.
  //  Default  : 4% of own hue — subsurface-scattering approximation; the
  //             faint self-glow that distinguishes living tissue from clay.
  if (isSelected) {
    mat.emissive.set('#0a2890')
    mat.emissiveIntensity = 0.35
  } else if (isHovered) {
    mat.emissive.set('#902010')
    mat.emissiveIntensity = 0.28
  } else {
    mat.emissive.set(hexColor)
    mat.emissiveIntensity = 0.04
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
  // Step 1 — Catmull-Clark / Loop subdivision (optional, guarded by poly count)
  //   LoopSubdivision.modify(geo, 1) — one pass, 4× triangle count.
  //   Guard: skip meshes already above SUBDIV_TRIANGLE_LIMIT to avoid a
  //   multi-second stall on dense torso meshes. Most extremity/face muscles
  //   benefit most and are small enough to subdivide quickly.
  //
  // Step 2 — computeVertexNormals()
  //   The single highest-impact smoothing fix. Forces Three.js to blend normals
  //   across the polygon boundary using weighted-angle averaging — turns a
  //   faceted polygon soup into a visually curved surface at zero cost.
  //   Must run AFTER subdivision (which resets normals to flat) and BEFORE
  //   computeTangents() (which reads the normals).
  //
  // Step 3 — computeTangents()
  //   MikkTSpace tangents for the normal map.  Required for MeshPhysicalMaterial
  //   to shade the fiber striations correctly.  Only runs on indexed geometry
  //   with UV attributes; others are skipped.
  //
  const SUBDIV_TRIANGLE_LIMIT = 8_000   // ~32k after one pass — safe for GPU

  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.castShadow    = true
      obj.receiveShadow = true

      const geo = obj.geometry as THREE.BufferGeometry

      // Step 1 — Loop subdivision (skip heavy meshes)
      if (geo.index) {
        const triCount = geo.index.count / 3
        if (triCount < SUBDIV_TRIANGLE_LIMIT) {
          try {
            const subdivided = LoopSubdivision.modify(geo, 1, {
              split:       true,   // split long edges for more even tessellation
              uvSmooth:    false,  // keep UV seams sharp (correct normal-map tiling)
              preserveEdges: false,
              flatOnly:    false,
            })
            obj.geometry = subdivided
          } catch (_) { /* non-manifold edge — skip */ }
        }
      }

      // Step 2 — Smooth vertex normals (works on any geometry after subdivision)
      obj.geometry.computeVertexNormals()

      // Step 3 — MikkTSpace tangents for normal map (indexed + UV required)
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
