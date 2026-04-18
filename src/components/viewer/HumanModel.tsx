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

import React, { Component, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
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
//  Material state helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply full visual state to a mesh in one pass.
 *
 * - Clones material once per mesh (lazy, cached in userData.managed).
 * - Per-muscle roughness from colors.ts (tendons smoother than bellies).
 * - Emissive blue highlight for selection, warm red for hover.
 * - Transparency for ghost state.
 */
function applyMeshState(
  obj: THREE.Mesh,
  opts: {
    hexColor:    string
    roughness:   number
    isSelected:  boolean
    isHovered:   boolean
    visState:    'visible' | 'ghosted' | 'hidden'
  },
) {
  const { hexColor, roughness, isSelected, isHovered, visState } = opts

  // Clone once per mesh so we never share material across meshes
  if (!Array.isArray(obj.material)) {
    const mat = obj.material as THREE.MeshStandardMaterial
    if (!mat.userData?.managed) {
      const cloned       = mat.clone() as THREE.MeshStandardMaterial
      cloned.userData.managed = true
      obj.material       = cloned
    }
  }

  const mat = (Array.isArray(obj.material)
    ? obj.material[0]
    : obj.material) as THREE.MeshStandardMaterial

  // ── Color ────────────────────────────────────────────────────────────────
  mat.color.set(hexColor)

  // ── PBR — wet biological tissue ──────────────────────────────────────────
  mat.roughness   = roughness
  // metalness 0.04: very low, but enough to activate PBR specular reflection
  // This simulates the slight wet sheen of fresh muscle tissue without
  // looking metallic. Zero metalness = completely matte, which looks dry.
  mat.metalness   = 0.04
  mat.side        = THREE.FrontSide
  mat.flatShading = false   // smooth normals from real anatomical mesh

  // ── Emissive — selection / hover highlight ───────────────────────────────
  if (isSelected) {
    mat.emissive.set('#0a2890')
    mat.emissiveIntensity = 0.35
  } else if (isHovered) {
    mat.emissive.set('#902010')
    mat.emissiveIntensity = 0.28
  } else {
    mat.emissive.set('#000000')
    mat.emissiveIntensity = 0
  }

  // ── Visibility / transparency ─────────────────────────────────────────────
  if (visState === 'hidden') {
    obj.visible     = false
    mat.transparent = false
    mat.opacity     = 1
    mat.depthWrite  = true
  } else if (visState === 'ghosted') {
    obj.visible     = true
    mat.transparent = true
    mat.opacity     = 0.18   // slightly more visible on dark background
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

  // ── Shadow casting (once after load) ──────────────────────────────────────
  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.castShadow    = true
      obj.receiveShadow = true
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

      applyMeshState(obj, { hexColor, roughness, isSelected, isHovered, visState })
    })
  }, [scene, sceneIndex, selectedId, hoveredId, hiddenIds, hiddenLayers, ghostedLayers, isolateMode, ghostMode])

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
