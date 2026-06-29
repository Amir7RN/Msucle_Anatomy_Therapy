/**
 * MuscleMap3D.tsx
 *
 * The muscular model used across MoveMate Train. It mirrors the Live Muscle
 * Twin EXACTLY — same opaque tan muscle (#6b5b4a), same lights, same soil
 * ground, same camera framing, navy backdrop — with NO transparency. The
 * selected group glows amber.
 *
 *   • MuscleModelCanvas — home explorer: rotatable (OrbitControls), with each
 *     group shown as a BOX + leader-line anchored to its muscle that relocates
 *     as the model turns.
 *   • TwinCanvas — trainer: the same vivid model, glow driven by live activation.
 *
 * CanvasErrorBoundary degrades to the card grid if WebGL fails.
 */

import React, { Component, Suspense, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { GROUP_MESH_STEMS } from '../../lib/gym/muscleModel'
import { muscleGroupById, exercisesForGroup, type MuscleGroupId } from '../../lib/gym/exercises'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`
const GROUP_LIST: MuscleGroupId[] = ['shoulders', 'chest', 'arms', 'back', 'core', 'legs']
const GROUND_Y = -1.2

// Screen-space offset (px) of each label BOX from its muscle anchor, so the
// boxes fan out around the body with a leader line pointing back to the muscle.
const LABEL_OFFSET: Record<MuscleGroupId, [number, number]> = {
  shoulders: [-116, -40],
  chest:     [-130, 4],
  arms:      [-116, 52],
  back:      [116, -40],
  core:      [130, 4],
  legs:      [116, 70],
}

useGLTF.preload(MODEL_PATH, true, true)

// ── Shared scene bits (identical to the Live Muscle Twin) ────────────────────
function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={0.8} />
      <directionalLight position={[-3, 2, 3]} intensity={0.4} color="#a5f3fc" />
    </>
  )
}
function Ground() {
  return (
    <group position={[0, GROUND_Y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.8, 56]} />
        <meshStandardMaterial color="#5b4a37" roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.95, 1.0, 48]} />
        <meshBasicMaterial color="#3f3328" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

const NAVY_BG = 'radial-gradient(circle at 50% 30%, #131a2e 0%, #0a0f1e 55%, #05070d 100%)'

// ── The model (opaque, glow on highlight) ────────────────────────────────────
interface ModelProps {
  highlight: MuscleGroupId | null
  levelRef?: MutableRefObject<number>
  onHover?:  (g: MuscleGroupId | null) => void
  onSelect?: (g: MuscleGroupId) => void
}

function Model({ highlight, levelRef, onHover, onSelect }: ModelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { scene } = useGLTF(MODEL_PATH, true, true) as any

  const cloned = useMemo(() => {
    const c = scene.clone(true) as THREE.Object3D
    const b0 = new THREE.Box3().setFromObject(c)
    const size = b0.getSize(new THREE.Vector3())
    c.scale.setScalar(2.4 / Math.max(size.y, 1e-3))   // same height as the twin
    const b1 = new THREE.Box3().setFromObject(c)
    const ctr = b1.getCenter(new THREE.Vector3())
    c.position.x -= ctr.x
    c.position.z -= ctr.z
    c.position.y += GROUND_Y - b1.min.y               // feet on the ground
    c.updateMatrixWorld(true)
    return c
  }, [scene])

  const anchors = useMemo(() => {
    const out: Partial<Record<MuscleGroupId, [number, number, number]>> = {}
    for (const g of GROUP_LIST) {
      const stems = GROUP_MESH_STEMS[g]
      const box = new THREE.Box3(); let any = false
      cloned.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh && stems.some((s) => (o.name || '').toUpperCase().includes(s))) { box.expandByObject(o); any = true }
      })
      if (any) { const c = box.getCenter(new THREE.Vector3()); out[g] = [c.x, c.y, c.z] }
    }
    return out
  }, [cloned])

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
        emissiveIntensity: hit ? 1.0 : 0.14,
        roughness: 0.6, metalness: 0,
      })
      o.material = mat
      if (hit) glow.push(mat)
    })
    glowing.current = glow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, highlight])

  useFrame((state) => {
    const pulse = (Math.sin(state.clock.elapsedTime * 3) + 1) / 2
    const lvl = levelRef ? levelRef.current : 0.85
    for (const mat of glowing.current) mat.emissiveIntensity = 0.45 + lvl * 1.0 + pulse * 0.45
  })

  const withLabels = !!onSelect
  return (
    <group>
      <primitive object={cloned} />
      {withLabels && GROUP_LIST.map((g) => {
        const a = anchors[g]
        if (!a) return null
        return (
          <Html key={g} position={a} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <RegionTag group={g} active={highlight === g} onHover={onHover!} onSelect={() => onSelect!(g)} />
          </Html>
        )
      })}
    </group>
  )
}

// ── Home explorer canvas (rotatable + box labels) ────────────────────────────
export function MuscleModelCanvas({ highlight, onHover, onSelect }: { highlight: MuscleGroupId | null; onHover: (g: MuscleGroupId | null) => void; onSelect: (g: MuscleGroupId) => void }) {
  return (
    <div className="h-full w-full" style={{ background: NAVY_BG }}>
      <Canvas gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} dpr={[1, 2]}
        camera={{ position: [0, 0.15, 3.7], fov: 42, near: 0.1, far: 100 }}>
        <SceneLights />
        <Ground />
        <Suspense fallback={null}>
          <Model highlight={highlight} onHover={onHover} onSelect={onSelect} />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom minDistance={2.2} maxDistance={6}
          minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.92} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  )
}

// ── Trainer twin canvas (vivid, glow driven by live activation) ──────────────
export function TwinCanvas({ highlight, levelRef, autoRotate = true }: { highlight: MuscleGroupId | null; levelRef?: MutableRefObject<number>; autoRotate?: boolean }) {
  return (
    <div className="h-full w-full" style={{ background: NAVY_BG }}>
      <Canvas gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} dpr={[1, 2]}
        camera={{ position: [0, 0.15, 3.7], fov: 42, near: 0.1, far: 100 }}>
        <SceneLights />
        <Ground />
        <Suspense fallback={null}>
          <Model highlight={highlight} levelRef={levelRef} />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom minDistance={2.2} maxDistance={6}
          minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.92} autoRotate={autoRotate} autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  )
}

// ── Box + leader-line label (anchored on the muscle, relocates on rotate) ────
function RegionTag({ group, active, onHover, onSelect }: { group: MuscleGroupId; active: boolean; onHover: (g: MuscleGroupId | null) => void; onSelect: () => void }) {
  const g = muscleGroupById(group)
  const n = exercisesForGroup(group).length
  const [dx, dy] = LABEL_OFFSET[group]
  return (
    <div style={{ position: 'relative', width: 0, height: 0, pointerEvents: 'none' }}>
      {/* anchor dot on the muscle */}
      <span style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%)' }}
        className={['block rounded-full', active ? 'h-2.5 w-2.5 bg-amber-300 ring-2 ring-amber-300/50' : 'h-2 w-2 bg-amber-400/90 ring-2 ring-amber-400/30'].join(' ')} />
      {/* leader line dot → box */}
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width="1" height="1">
        <line x1={0} y1={0} x2={dx} y2={dy} stroke={active ? 'rgba(252,211,77,0.9)' : 'rgba(251,191,36,0.5)'} strokeWidth={1.5} />
      </svg>
      {/* the box */}
      <button
        onPointerOver={() => onHover(group)} onPointerOut={() => onHover(null)} onClick={onSelect}
        style={{ position: 'absolute', left: dx, top: dy, transform: 'translate(-50%,-50%)', pointerEvents: 'auto' }}
        className={[
          'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-lg backdrop-blur transition',
          active ? 'border-amber-300 bg-amber-500/30 text-white shadow-[0_0_22px_rgba(251,146,60,0.6)]' : 'border-amber-400/40 bg-stone-950/85 text-amber-100 hover:border-amber-300 hover:bg-amber-500/20',
        ].join(' ')}
      >
        {g.name}
        <span className="rounded-full bg-black/40 px-1.5 text-[10px] text-amber-200/80">{n}</span>
      </button>
    </div>
  )
}

// ── Error boundary ────────────────────────────────────────────────────────────
interface EBProps { fallback: ReactNode; children: ReactNode }
export class CanvasErrorBoundary extends Component<EBProps, { failed: boolean }> {
  constructor(props: EBProps) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
