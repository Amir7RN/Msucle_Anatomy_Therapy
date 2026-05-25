/**
 * MuscleActivationViewer.tsx
 *
 * Small 3D viewer that re-uses the same BodyParts3D GLB as the main atlas
 * (public/models/human-muscular-system.glb) but renders only:
 *   • a faint, low-opacity translucent body shell, AND
 *   • the muscles that are currently firing (or that the exercise targets)
 *     in a pulsing red/orange tint scaled by activation intensity.
 *
 * The viewer is intentionally lightweight: no orbit controls, no schematic
 * markers, no diagnostic system — just a static camera looking at the
 * front of the model so the user immediately sees "ah, the deltoid is
 * blinking" while doing the stretch.
 *
 * Activation source:
 *   • `activations` (live, derived from FormSnapshot)         — primary
 *   • `targetMuscleId` (e.g. "deltoid" passed by the exercise) — fallback
 *     so the viewer still pulses something useful before the user is in
 *     position and the snapshot is null.
 *
 * Mesh resolution:
 *   The GLB uses names like MUSC_DELTOID_R / MUSC_BICEPS_BRACHII_L.  We
 *   uppercase-substring-match the muscle id ("deltoid_anterior" →
 *   "DELTOID") so the lookup tolerates the diagnostic system's many
 *   sub-muscles + L/R suffixes.
 */

import React, { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { MuscleActivation } from '../../lib/movement/muscleActivation'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`

interface Props {
  activations:     MuscleActivation[]
  /** Exercise's target muscle (e.g. "deltoid"). Used when activations is
   *  empty so the viewer still pulses something meaningful. */
  targetMuscleId?: string
}

export function MuscleActivationViewer({ activations, targetMuscleId }: Props) {
  // Normalise everything to UPPERCASE keys for substring matching against
  // mesh names. Deduplicate by stem (deltoid_anterior + deltoid_lateral
  // both collapse to "DELTOID" → match MUSC_DELTOID_R/L).
  const lookup = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activations) {
      const stem = matchStem(a.muscleId)
      if (!stem) continue
      const prev = map.get(stem) ?? 0
      if (a.level > prev) map.set(stem, a.level)
    }
    if (map.size === 0 && targetMuscleId) {
      const stem = matchStem(targetMuscleId)
      if (stem) map.set(stem, 0.6)   // pre-engage glow so the user knows what to target
    }
    return map
  }, [activations, targetMuscleId])

  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      dpr={[1, 2]}
      style={{ background: 'transparent' }}
      camera={{ position: [0, 1.5, 4.2], fov: 30, near: 0.1, far: 100 }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 4]}  intensity={0.7} />
      <directionalLight position={[-3, 2, 3]} intensity={0.35} color="#a5f3fc" />
      <Suspense fallback={null}>
        <ActivationModel lookup={lookup} />
      </Suspense>
    </Canvas>
  )
}

// Pre-load so the GLB is cached and the small overlay viewer mounts
// instantly — useGLTF dedupes across all calls site-wide so it shares the
// asset with the main atlas viewer.
useGLTF.preload(MODEL_PATH, true, true)

// ─────────────────────────────────────────────────────────────────────────────
//  Scene
// ─────────────────────────────────────────────────────────────────────────────

function ActivationModel({ lookup }: { lookup: Map<string, number> }) {
  const { scene } = useGLTF(MODEL_PATH, true, true) as any

  // Clone the scene graph so we don't fight the main atlas viewer for the
  // same Object3D instances. Cloning a GLTF scene preserves names + geometry
  // references and is cheap.
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    return c
  }, [scene])

  // Stash references to the meshes we want to pulse + the corresponding
  // intensity baseline. We use a per-mesh material so the pulse on one
  // doesn't bleed into the others.
  type Targeted = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; intensity: number }
  const targetedRef = useRef<Targeted[]>([])

  // Apply materials whenever the scene OR the lookup changes.
  useMemo(() => {
    const fadedBody = new THREE.MeshStandardMaterial({
      color:        '#e8c8a6',
      roughness:    0.7,
      metalness:    0.0,
      transparent:  true,
      opacity:      0.10,
      depthWrite:   false,
      side:         THREE.FrontSide,
    })

    const targeted: Targeted[] = []

    cloned.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return
      const name = (obj.name || '').toUpperCase()

      // Find the strongest activation stem matching this mesh name.
      let intensity = 0
      for (const [stem, lvl] of lookup) {
        if (name.includes(stem) && lvl > intensity) intensity = lvl
      }

      if (intensity > 0) {
        const mat = new THREE.MeshStandardMaterial({
          color:             new THREE.Color('#dc2626'),  // red-600 base
          emissive:          new THREE.Color('#f97316'),  // orange-500
          emissiveIntensity: 0.6,                          // pulses in frame loop
          roughness:         0.5,
          metalness:         0.0,
          transparent:       true,
          opacity:           0.92,
          depthWrite:        true,
        })
        obj.material = mat
        obj.renderOrder = 2
        targeted.push({ mesh: obj, mat, intensity })
      } else {
        // Everything else is the faded skin shell.
        obj.material = fadedBody
        obj.renderOrder = 0
      }
    })

    targetedRef.current = targeted
  }, [cloned, lookup])

  // Pulse the targeted meshes' emissive intensity in time so the user
  // perceives a "blink" — speed scales with activation level.
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (const { mat, intensity } of targetedRef.current) {
      // Pulse between 0.25 and ~1.3 weighted by activation level.
      const speed = 2.0 + intensity * 3.0
      const phase = (Math.sin(t * speed) + 1) / 2  // 0..1
      mat.emissiveIntensity = 0.25 + phase * (0.6 + intensity)
      mat.opacity           = 0.78 + phase * 0.18
      mat.needsUpdate       = true
    }
  })

  // Ground the model so the camera framing is consistent.
  return (
    <group position={[0, -0.85, 0]} scale={1}>
      <primitive object={cloned} />
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mesh-stem mapping
// ─────────────────────────────────────────────────────────────────────────────
//
// Convert an activation muscle id (e.g. "deltoid_anterior") into the
// substring we should look for in the GLB mesh name (e.g. "DELTOID").
// Sub-muscle suffixes that aren't present in the BodyParts3D model
// (_anterior, _lateral, _posterior, _upper, _middle, _lower) are stripped
// so they all match the parent mesh.
function matchStem(muscleId: string): string | null {
  if (!muscleId) return null
  let s = muscleId.toUpperCase()
  for (const suf of ['_ANTERIOR', '_LATERAL', '_POSTERIOR', '_UPPER', '_MIDDLE', '_LOWER']) {
    if (s.endsWith(suf)) s = s.slice(0, -suf.length)
  }
  return s
}
