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
import { useDiagnosticClickFromStore } from '../../hooks/useDiagnosticClick'
import { resolveColor, muscleColor, muscleRoughness, MUSCLE_DEFAULT } from '../../lib/colors'
import type { SystemType, LayerType } from '../../lib/types'

// ── Model path ────────────────────────────────────────────────────────────────
export const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`

// ── smoothstep helper ─────────────────────────────────────────────────────────
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// ── Tendon-white constant ─────────────────────────────────────────────────────
const TENDON_WHITE = new THREE.Color('#F5F5F5')

// ── Y coordinate of the floor grid in ViewerCanvas ───────────────────────────
const GRID_Y = -0.925

// ── Arm muscles that are clipped by the BodySurface arm segments ──────────────
//
// These five muscles sit on or just inside the arm silhouette and lose the
// depth contest against the skin mesh.  Giving them renderOrder=5 (vs. 0 for
// all other muscles and -1 for BodySurface) ensures they are composited LAST
// in their opacity group and therefore always appear on top.  The tighter
// polygonOffset (-2/-2 vs. the standard -1/-1) gives an additional push
// toward the camera so they "win" even at glancing angles.
//
const ARM_PRIORITY_IDS = new Set<string>([
  'MUSC_BICEPS_BRACHII_R',
  'MUSC_BICEPS_BRACHII_L',
  'MUSC_BRACHIALIS_R',
  'MUSC_BRACHIALIS_L',
  'MUSC_CORACOBRACHIALIS_R',
  'MUSC_CORACOBRACHIALIS_L',
  'MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_R',
  'MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_L',
  'MUSC_EXTENSOR_DIGITORUM_R',
  'MUSC_EXTENSOR_DIGITORUM_L',
])

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
    color:        '#ffffff',   // white base — vertex colors provide the actual hue
    roughness:    0.50,
    metalness:    0.00,
    normalMap,
    normalScale:  new THREE.Vector2( 0.15, 0.15 ),
    vertexColors: true,        // vertex color gradient drives belly↔tendon fading
    side:         THREE.FrontSide,
    flatShading:  false,
    depthWrite:   true,
    depthTest:    true,
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
    hexColor:        string   // resolved display color (may be state-overridden)
    baseColor:       string   // raw muscle color before state processing
    roughness:       number
    isSelected:      boolean
    isHovered:       boolean
    visState:        'visible' | 'ghosted' | 'hidden'
    fiberNormalMap?: THREE.Texture
  },
) {
  const { hexColor, baseColor, roughness, isSelected, isHovered, visState, fiberNormalMap } = opts

  // ── First-time setup: replace GLB material with anatomy PBR ──────────────
  //  Runs once per mesh.  Handles both single-material and array-material meshes.
  //  Subsequent calls update uniforms only.
  const replaceMat = (existing: THREE.Material) => {
    if (existing.userData?.managed) return existing
    const fresh = fiberNormalMap
      ? buildMuscleMaterial(fiberNormalMap)
      : (() => {
          const m = new THREE.MeshStandardMaterial({
            color: '#ffffff', roughness: 0.50, metalness: 0.00,
            vertexColors: true,
            side: THREE.FrontSide, flatShading: false,
            depthWrite: true, depthTest: true,
          })
          m.polygonOffset       = true
          m.polygonOffsetFactor = -1
          m.polygonOffsetUnits  = -1
          return m
        })()

    // ── Vertex color gradient: belly → tendon white ───────────────────────
    //  Uses the pre-computed tendonMask attribute (0=belly, 1=tendon end) that
    //  was stamped onto the geometry during the geometry-quality pass.
    //  Vertex colors = mix(baseColor, #F5F5F5, tendonMask * 0.55).
    //  Because mat.color multiplies with vertex colors at render time:
    //    • Normal state   → mat.color = white  → gradient shows through as-is
    //    • Selected state → mat.color = #CC5500 → belly turns orange-red,
    //                                              tendon ends turn golden yellow
    //                                              → automatic infrared heatmap
    //    • Hovered state  → mat.color = warm peach → subtle warm tint
    const geo = obj.geometry
    const tm  = geo.attributes.tendonMask as THREE.BufferAttribute | undefined
    if (tm) {
      const count  = tm.count
      const cols   = new Float32Array(count * 3)
      const muscle = new THREE.Color(baseColor)
      for (let i = 0; i < count; i++) {
        const mask = tm.getX(i)             // 0 = belly centre, 1 = tendon end
        const c    = muscle.clone().lerp(TENDON_WHITE, mask * 0.55)
        cols[i * 3]     = c.r
        cols[i * 3 + 1] = c.g
        cols[i * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    }

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

  // ── PBR ───────────────────────────────────────────────────────────────────
  mat.roughness   = roughness
  mat.metalness   = 0.00
  mat.side        = THREE.FrontSide
  mat.flatShading = false
  mat.depthTest   = true

  // ── Polygon offset — confirmed every update ───────────────────────────────
  mat.polygonOffset       = true
  mat.polygonOffsetFactor = -1
  mat.polygonOffsetUnits  = -1

  // ── Color × Emissive state logic ──────────────────────────────────────────
  //
  // mat.color MULTIPLIES with vertex colors at render time.
  // Vertex colors = belly (muscle hue) → tendon white at origins/insertions.
  //
  // Selected — Pain Heatmap (infrared scan style):
  //   mat.color = #CC5500 (burnt orange) multiplies with the vertex gradient:
  //     belly vertex (muscle_hue)  × orange = deep orange-red (hot centre)
  //     tendon vertex (#F5F5F5)    × orange = golden yellow   (cool edges)
  //   This is the infrared heatmap effect without any custom shader.
  //   Emissive adds a soft pulsing glow at 0.50 intensity.
  //
  // Hovered — warm preview:
  //   mat.color = warm peach → tints gradient subtly
  //   Emissive = low-level warm red (0.22) for cursor feedback
  //
  // Normal — pure gradient:
  //   mat.color = white → vertex colors pass through unmodified
  //   Emissive = very low (0.025) using base muscle hue for biological warmth
  //
  if (isSelected) {
    mat.color.set('#CC5500')
    mat.emissive.set('#CC5500')
    mat.emissiveIntensity = 0.50
  } else if (isHovered) {
    mat.color.set('#ffe8cc')
    mat.emissive.set('#a03020')
    mat.emissiveIntensity = 0.22
  } else {
    mat.color.set('#ffffff')
    mat.emissive.set(baseColor)
    mat.emissiveIntensity = 0.025
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
  const diagnosticPulseId = useAtlasStore((s) => s.diagnosticPulseId)
  const candidateMuscles = useAtlasStore((s) => s.candidateMuscles)

  // Area-to-Muscle click handler (returns false when diagnosticMode is off,
  // so the legacy Muscle-to-Pain path below runs unchanged).
  const diagnosticClick = useDiagnosticClickFromStore()

  // Pulse effect on drawer-hover — modulates emissive intensity only.
  // applyMeshState overwrites emissiveIntensity on its next run, so no leak.
  useFrame(({ clock }) => {
    if (!diagnosticPulseId && candidateMuscles.length === 0) return
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const structureId = obj.userData.structureId as string | undefined
      const isHoveredPulse = Boolean(diagnosticPulseId && structureId === diagnosticPulseId)
      const isCandidatePulse = Boolean(structureId && candidateMuscles.includes(structureId))
      if (!isHoveredPulse && !isCandidatePulse) return
      const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial
      if (!mat?.emissive) return
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 8.8)
      mat.emissive.set('#FFFFFF')
      mat.emissiveIntensity = isHoveredPulse
        ? 0.7 + 0.8 * pulse
        : 0.45 + 0.5 * pulse
      mat.transparent = true
      mat.opacity = isHoveredPulse ? 1 : 0.92
    })
  })

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

      // Step 5 — tendon mask per vertex
      //   Encodes the belly→tendon gradient shape so the material pass can build
      //   vertex colors without needing any shader injection.
      //
      //   Algorithm: find the longest bbox axis (the muscle's longitudinal axis —
      //   handles horizontal muscles like deltoid and trapezius correctly).
      //   Compute normalised position along that axis (0 = one end, 1 = other end).
      //   bellyMask = smoothstep(0, 0.25, t) × smoothstep(1, 0.75, t) — peaks at
      //   t=0.5 (belly centre), falls to 0 at t=0 and t=1 (origin/insertion).
      //   tendonMask = 1 − bellyMask  (0 = belly, 1 = tendon end).
      {
        const pos  = obj.geometry.attributes.position as THREE.BufferAttribute
        const bbox = new THREE.Box3().setFromBufferAttribute(pos)
        const size = new THREE.Vector3()
        bbox.getSize(size)

        // Longest axis = muscle's longitudinal axis
        let axisIdx = 1  // default Y
        if (size.x >= size.y && size.x >= size.z) axisIdx = 0
        else if (size.z >= size.y && size.z >= size.x) axisIdx = 2
        const axisMin = axisIdx === 0 ? bbox.min.x : axisIdx === 1 ? bbox.min.y : bbox.min.z
        const axisMax = axisIdx === 0 ? bbox.max.x : axisIdx === 1 ? bbox.max.y : bbox.max.z
        const axisRange = axisMax - axisMin

        const n    = pos.count
        const mask = new Float32Array(n)
        for (let i = 0; i < n; i++) {
          const v = axisIdx === 0 ? pos.getX(i) : axisIdx === 1 ? pos.getY(i) : pos.getZ(i)
          const t = axisRange > 1e-4 ? (v - axisMin) / axisRange : 0.5
          mask[i] = 1.0 - smoothstep(0, 0.25, t) * smoothstep(1, 0.75, t)
        }
        obj.geometry.setAttribute('tendonMask', new THREE.BufferAttribute(mask, 1))
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

      const hexColor  = resolveColor(system, isHovered, isSelected, id, meta?.layer as LayerType | undefined)
      const baseColor = muscleColor(id, meta?.layer as LayerType | undefined)
      const roughness = muscleRoughness(id)

      applyMeshState(obj, { hexColor, baseColor, roughness, isSelected, isHovered, visState, fiberNormalMap })

      // ── Arm-priority depth override ───────────────────────────────────────
      //
      // Five anterior-arm muscles lose depth battles against the BodySurface
      // arm silhouette.  renderOrder=5 composites them after all other muscles
      // (renderOrder=0) and after BodySurface (renderOrder=-1).  The tighter
      // polygonOffset pushes their fragments closer to the camera so they win
      // even at grazing angles where the default -1/-1 is not enough.
      if (id && ARM_PRIORITY_IDS.has(id)) {
        obj.renderOrder = 5
        const pMat = Array.isArray(obj.material) ? obj.material[0] : obj.material
        if (pMat instanceof THREE.MeshStandardMaterial) {
          pMat.polygonOffsetFactor = -2
          pMat.polygonOffsetUnits  = -2
          pMat.needsUpdate = true
        }
      } else {
        // Ensure other muscles are reset to default if ID changed
        obj.renderOrder = 0
      }
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
    // Area-to-Muscle path — consumes the click when diagnosticMode is ON.
    if (diagnosticClick?.(e)) return

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
