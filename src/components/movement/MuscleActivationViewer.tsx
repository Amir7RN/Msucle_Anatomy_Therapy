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
      camera={{ position: [0, 0, 3.6], fov: 42, near: 0.1, far: 100 }}
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
  // Clone, then center on origin AND apply 1.5x scale. The GLB's natural
  // origin sits somewhere in the upper torso (not at the feet), so we
  // compute the bounding-box centre and shift the model so that centre
  // lands at world (0,0,0). Combined with a camera that looks at origin,
  // this guarantees the body is centred in the box regardless of which
  // axis convention the source GLB uses.
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const centre = box.getCenter(new THREE.Vector3())
    c.position.sub(centre)            // shift so geometry centre = (0,0,0)
    c.scale.setScalar(1.5)            // bigger so muscle pulses are obvious
    c.position.multiplyScalar(1.5)    // apply same scale to the shift
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
          emissiveIntensity: 1.0,                          // pulses in frame loop
          roughness:         0.5,
          metalness:         0.0,
          transparent:       true,
          opacity:           1.0,
          // Disable depth-test so the pulse always wins over the faded
          // skin shell - the glow used to be occluded by skin meshes that
          // happened to render after it, producing a dim/no-pulse result.
          depthTest:         false,
          depthWrite:        false,
        })
        obj.material = mat
        obj.renderOrder = 999     // composite last - always on top
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
  // perceives a "blink" - speed + amplitude scale with activation level.
  // Wide opacity swing (0.55 -> 1.0) so the muscle visibly grows and shrinks,
  // and the emissive colour shifts from orange to yellow at peak so the
  // pulse reads as a glow rather than a dim flicker.
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (const { mat, intensity } of targetedRef.current) {
      const speed = 2.4 + intensity * 3.5
      const phase = (Math.sin(t * speed) + 1) / 2  // 0..1
      // Strong emissive at peak so the glow is unmistakable against the
      // faded body.
      mat.emissiveIntensity = 0.4 + phase * (1.4 + intensity * 1.2)
      mat.opacity           = 0.55 + phase * 0.45
      // Shift emissive colour orange (#f97316) -> yellow (#facc15) at peak
      // so a deltoid blink reads even at a glance.
      const r = 0.976 + (0.980 - 0.976) * phase
      const g = 0.451 + (0.800 - 0.451) * phase
      const b = 0.086 + (0.082 - 0.086) * phase
      mat.emissive.setRGB(r, g, b)
      mat.needsUpdate       = true
    }
  })

  // The cloned scene is already centred + scaled — just drop it in.
  return <primitive object={cloned} />
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
  // Strip the MUSC_ mesh-name prefix when present so a prop value of
  // "MUSC_DELTOID_L" still glows the deltoid in the GLB.
  if (s.startsWith('MUSC_')) s = s.slice(5)
  // Strip _L / _R side suffix so both sides of the body light up for a
  // single-sided exercise target (the body is symmetrical for these
  // visuals; the camera view shows both sides anyway).
  if (s.endsWith('_L') || s.endsWith('_R')) s = s.slice(0, -2)
  // Strip sub-region suffixes so deltoid_anterior, _lateral, _posterior
  // all collapse to DELTOID.
  for (const suf of ['_ANTERIOR', '_LATERAL', '_POSTERIOR', '_UPPER', '_MIDDLE', '_LOWER']) {
    if (s.endsWith(suf)) s = s.slice(0, -suf.length)
  }
  return s
}
