/**
 * MuscleMap3D.tsx
 *
 * The interactive muscular model that anchors the MoveMate Train home. Renders
 * the shared human-muscular-system.glb with the SAME muscular look as the Live
 * Muscle Twin (tan muscle, warming to amber on the selected group), and is fully
 * rotatable in 3D (OrbitControls). Region labels are anchored ON the body via
 * drei <Html> — they sit on each muscle group and track the model as it rotates,
 * instead of being spread across the page. Hover highlights; click selects.
 *
 * A small error boundary is exported so a WebGL failure degrades to the card grid.
 */

import React, { Component, Suspense, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { GROUP_MESH_STEMS } from '../../lib/gym/muscleModel'
import { muscleGroupById, exercisesForGroup, type MuscleGroupId } from '../../lib/gym/exercises'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`
const GROUP_LIST: MuscleGroupId[] = ['shoulders', 'chest', 'arms', 'back', 'core', 'legs']

interface Props {
  highlight: MuscleGroupId | null
  onHover:   (g: MuscleGroupId | null) => void
  onSelect:  (g: MuscleGroupId) => void
}

export function MuscleModelCanvas({ highlight, onHover, onSelect }: Props) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{ background: 'transparent' }}
      camera={{ position: [0, 0.1, 3.7], fov: 42, near: 0.1, far: 100 }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={0.9} />
      <directionalLight position={[-3, 2, 3]} intensity={0.4} color="#fcd34d" />
      <Suspense fallback={null}>
        <Model highlight={highlight} onHover={onHover} onSelect={onSelect} />
      </Suspense>
      <OrbitControls
        enablePan={false} enableZoom
        minDistance={2.2} maxDistance={6}
        minPolarAngle={Math.PI * 0.12} maxPolarAngle={Math.PI * 0.9}
        autoRotate autoRotateSpeed={0.5}
      />
    </Canvas>
  )
}

useGLTF.preload(MODEL_PATH, true, true)

function Model({ highlight, onHover, onSelect }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { scene } = useGLTF(MODEL_PATH, true, true) as any

  const cloned = useMemo(() => {
    const c = scene.clone(true) as THREE.Object3D
    const box = new THREE.Box3().setFromObject(c)
    const centre = box.getCenter(new THREE.Vector3())
    c.position.sub(centre); c.scale.setScalar(1.5); c.position.multiplyScalar(1.5)
    c.updateMatrixWorld(true)   // parent is null here → matrixWorld == local transform
    return c
  }, [scene])

  // Anchor each group label at the centre of its real meshes (so labels sit on
  // the right muscles regardless of the GLB's coordinate quirks).
  const anchors = useMemo(() => {
    const out: Partial<Record<MuscleGroupId, [number, number, number]>> = {}
    for (const g of GROUP_LIST) {
      const stems = GROUP_MESH_STEMS[g]
      const box = new THREE.Box3(); let any = false
      cloned.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh && stems.some((s) => (o.name || '').toUpperCase().includes(s))) {
          box.expandByObject(o); any = true
        }
      })
      if (any) { const c = box.getCenter(new THREE.Vector3()); out[g] = [c.x, c.y, c.z] }
    }
    return out
  }, [cloned])

  // Re-skin: muscular tan everywhere; the highlighted group glows amber.
  const glowing = useRef<THREE.MeshStandardMaterial[]>([])
  const stems = highlight ? GROUP_MESH_STEMS[highlight] : []
  useMemo(() => {
    const glow: THREE.MeshStandardMaterial[] = []
    cloned.traverse((o: THREE.Object3D) => {
      if (!(o instanceof THREE.Mesh)) return
      const hit = stems.some((s) => (o.name || '').toUpperCase().includes(s))
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hit ? '#9a3412' : '#6b5b4a'),
        emissive: new THREE.Color(hit ? '#f97316' : '#000000'),
        emissiveIntensity: hit ? 1.0 : 0.12,
        roughness: 0.6, metalness: 0,
      })
      o.material = mat
      if (hit) glow.push(mat)
    })
    glowing.current = glow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, highlight])

  useFrame((state) => {
    const phase = (Math.sin(state.clock.elapsedTime * 3) + 1) / 2
    for (const mat of glowing.current) mat.emissiveIntensity = 0.7 + phase * 1.1
  })

  return (
    <group>
      <primitive object={cloned} />
      {GROUP_LIST.map((g) => {
        const a = anchors[g]
        if (!a) return null
        return (
          <Html key={g} position={a} center zIndexRange={[30, 0]}>
            <RegionTag group={g} active={highlight === g} onHover={onHover} onSelect={() => onSelect(g)} />
          </Html>
        )
      })}
    </group>
  )
}

function RegionTag({ group, active, onHover, onSelect }: { group: MuscleGroupId; active: boolean; onHover: (g: MuscleGroupId | null) => void; onSelect: () => void }) {
  const g = muscleGroupById(group)
  const n = exercisesForGroup(group).length
  return (
    <button
      onPointerOver={() => onHover(group)}
      onPointerOut={() => onHover(null)}
      onClick={onSelect}
      className={[
        'flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-lg backdrop-blur transition',
        active
          ? 'border-amber-300 bg-amber-500/40 text-white shadow-[0_0_20px_rgba(251,146,60,0.65)]'
          : 'border-amber-400/40 bg-black/65 text-amber-100 hover:bg-amber-500/30',
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      {g.name}
      <span className="rounded-full bg-black/40 px-1 text-[9px] text-amber-200/80">{n}</span>
    </button>
  )
}

// ── Error boundary so a WebGL/model failure falls back gracefully ────────────
interface EBProps { fallback: ReactNode; children: ReactNode }
export class CanvasErrorBoundary extends Component<EBProps, { failed: boolean }> {
  constructor(props: EBProps) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
