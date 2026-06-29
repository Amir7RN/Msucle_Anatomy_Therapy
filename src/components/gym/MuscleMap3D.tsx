/**
 * MuscleMap3D.tsx
 *
 * The interactive muscular model that anchors the MoveMate Train home. Renders
 * the shared human-muscular-system.glb as a faded body that GLOWS the muscles
 * of the currently-highlighted group, with a gentle idle sway. Region selection
 * itself is handled by the HTML arrow-callouts overlaid in GymApp (precise and
 * reliable), while this canvas gives the "fancy" live-anatomy feedback.
 *
 * A small error boundary is exported so a WebGL failure degrades to the card
 * grid instead of blanking the page.
 */

import React, { Component, Suspense, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { GROUP_MESH_STEMS } from '../../lib/gym/muscleModel'
import type { MuscleGroupId } from '../../lib/gym/exercises'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`

export function MuscleModelCanvas({ highlight }: { highlight: MuscleGroupId | null }) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      dpr={[1, 2]}
      style={{ background: 'transparent' }}
      camera={{ position: [0, 0, 3.8], fov: 42, near: 0.1, far: 100 }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={0.85} />
      <directionalLight position={[-3, 2, 3]} intensity={0.4} color="#fcd34d" />
      <Suspense fallback={null}>
        <Model highlight={highlight} />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(MODEL_PATH, true, true)

function Model({ highlight }: { highlight: MuscleGroupId | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { scene } = useGLTF(MODEL_PATH, true, true) as any
  const groupRef = useRef<THREE.Group>(null)

  const cloned = useMemo(() => {
    const c = scene.clone(true) as THREE.Object3D
    const box = new THREE.Box3().setFromObject(c)
    const centre = box.getCenter(new THREE.Vector3())
    c.position.sub(centre)
    c.scale.setScalar(1.5)
    c.position.multiplyScalar(1.5)
    return c
  }, [scene])

  const glowing = useRef<THREE.MeshStandardMaterial[]>([])
  const stems = highlight ? GROUP_MESH_STEMS[highlight] : []

  // Re-skin meshes whenever the highlighted group changes (same proven pattern
  // as MuscleActivationViewer: faded skin shell + emissive glow on targets).
  useMemo(() => {
    const faded = new THREE.MeshStandardMaterial({
      color: '#e8c8a6', roughness: 0.72, metalness: 0, transparent: true,
      opacity: 0.16, depthWrite: false, side: THREE.FrontSide,
    })
    const glow: THREE.MeshStandardMaterial[] = []
    cloned.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return
      const name = (obj.name || '').toUpperCase()
      const hit = stems.some((s) => name.includes(s))
      if (hit) {
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#f59e0b'), emissive: new THREE.Color('#f97316'),
          emissiveIntensity: 1.0, roughness: 0.45, metalness: 0,
          transparent: true, opacity: 1, depthTest: false, depthWrite: false,
        })
        obj.material = mat; obj.renderOrder = 999; glow.push(mat)
      } else {
        obj.material = faded; obj.renderOrder = 0
      }
    })
    glowing.current = glow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, highlight])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (groupRef.current) groupRef.current.rotation.y = Math.sin(t * 0.22) * 0.32
    const phase = (Math.sin(t * 3) + 1) / 2
    for (const mat of glowing.current) {
      mat.emissiveIntensity = 0.7 + phase * 1.2
      mat.opacity = 0.7 + phase * 0.3
      mat.needsUpdate = true
    }
  })

  return <group ref={groupRef}><primitive object={cloned} /></group>
}

// ── Error boundary so a WebGL/model failure falls back gracefully ────────────
interface EBProps { fallback: ReactNode; children: ReactNode }
export class CanvasErrorBoundary extends Component<EBProps, { failed: boolean }> {
  constructor(props: EBProps) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
