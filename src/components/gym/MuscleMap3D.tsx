/**
 * MuscleMap3D.tsx
 *
 * The muscular model used across MoveMate Train. It mirrors the Live Muscle
 * Twin — same opaque tan muscle (#6b5b4a), same soil ground, navy backdrop —
 * but is lit by an even, omnidirectional rig (hemisphere + balanced fills) so
 * the muscles stay bright and clearly distinguishable at EVERY rotation angle.
 * The Live Muscle Twin only needs front light because it never turns; this one
 * can be dragged around, so a front-only rig used to leave the far side a black
 * silhouette. The selected group glows amber.
 *
 *   • MuscleModelCanvas — home explorer: drag-to-rotate (no auto-spin), with a
 *     clean two-column callout overlay. Each muscle group is a card pinned to
 *     the side with a leader line to its muscle that tracks as the model turns.
 *   • TwinCanvas — trainer: the same vivid model, glow driven by live activation.
 *
 * CanvasErrorBoundary degrades to the card grid if WebGL fails.
 */

import React, {
  Component, Suspense, useEffect, useMemo, useRef,
  type MutableRefObject, type ReactNode,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GROUP_MESH_STEMS } from '../../lib/gym/muscleModel'
import { muscleGroupById, exercisesForGroup, type MuscleGroupId } from '../../lib/gym/exercises'
import type { LiveMuscleActivation } from '../../lib/movement/liveMuscleActivation'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`
const GROUP_LIST: MuscleGroupId[] = ['shoulders', 'chest', 'arms', 'back', 'core', 'legs']
const GROUND_Y = -1.2

// Which side column each group's callout card lives in.
const LEFT_GROUPS:  MuscleGroupId[] = ['shoulders', 'chest', 'arms']
const RIGHT_GROUPS: MuscleGroupId[] = ['back', 'core', 'legs']
const SIDE: Record<MuscleGroupId, 'L' | 'R'> =
  { shoulders: 'L', chest: 'L', arms: 'L', back: 'R', core: 'R', legs: 'R' }

/** Live screen-space projection of each muscle anchor (CSS px, container-local). */
type ProjPoint = { x: number; y: number; vis: boolean }
type ProjMap = Record<MuscleGroupId, ProjPoint>
function emptyProj(): ProjMap {
  const o = {} as ProjMap
  for (const g of GROUP_LIST) o[g] = { x: 0, y: 0, vis: false }
  return o
}

useGLTF.preload(MODEL_PATH, true, true)

// ── Shared scene bits ────────────────────────────────────────────────────────
function SceneLights() {
  return (
    <>
      {/* Even, omnidirectional fill (warm sky / dark soil) — keeps the muscle
          bright and readable from any angle, never a black silhouette. */}
      <hemisphereLight args={['#ffe9cf', '#241a12', 0.95]} />
      <ambientLight intensity={0.4} />
      {/* Warm key — soft, readable shading on the muscle bellies. */}
      <directionalLight position={[3, 5, 4]} intensity={0.85} color="#fff3e3" />
      {/* Cool rim from the opposite side for separation against the navy bg. */}
      <directionalLight position={[-4, 2.5, 2]} intensity={0.5} color="#bfe9ff" />
      {/* Back + under fill so the far/under side is never dark while orbiting. */}
      <directionalLight position={[0, 3, -6]} intensity={0.5} />
      <directionalLight position={[0, -4, 1]} intensity={0.25} />
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
  /** When provided (home explorer), the model projects each group's muscle
   *  anchor into this ref every frame so the HTML overlay can draw leaders. */
  projRef?:  MutableRefObject<ProjMap>
}

function Model({ highlight, levelRef, projRef }: ModelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { scene } = useGLTF(MODEL_PATH, true, true) as any

  const cloned = useMemo(() => {
    const c = scene.clone(true) as THREE.Object3D
    // Recompute normals from winding order — the GLB has inverted vertex normals
    // which makes every face dark under directional lighting. computeVertexNormals()
    // derives normals from the geometry faces (winding correct) so lighting works.
    c.traverse((o: THREE.Object3D) => {
      if (!(o instanceof THREE.Mesh)) return
      o.geometry = o.geometry.clone()
      o.geometry.computeVertexNormals()
    })
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
    const collect = (stems: string[], rightOnly: boolean): THREE.Vector3 | null => {
      const box = new THREE.Box3(); let any = false
      cloned.traverse((o: THREE.Object3D) => {
        if (!(o instanceof THREE.Mesh)) return
        const n = (o.name || '').toUpperCase()
        if (!stems.some((s) => n.includes(s))) return
        if (rightOnly && !n.endsWith('_R')) return
        box.expandByObject(o); any = true
      })
      return any ? box.getCenter(new THREE.Vector3()) : null
    }
    for (const g of GROUP_LIST) {
      // Anchor on ONE side's muscle belly (right) so the dot sits on the actual
      // muscle, not the body midline; fall back to all meshes (e.g. core/abs).
      const c = collect(GROUP_MESH_STEMS[g], true) ?? collect(GROUP_MESH_STEMS[g], false)
      if (c) out[g] = [c.x, c.y, c.z]
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
        emissive: new THREE.Color(hit ? '#f97316' : '#2a1f15'),
        emissiveIntensity: hit ? 1.2 : 0.3,
        roughness: 0.55, metalness: 0.05,
      })
      o.material = mat
      if (hit) glow.push(mat)
    })
    glowing.current = glow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, highlight])

  // Frame loop: pulse the glow AND keep the callout anchors in sync with the
  // live camera angle (projecting each muscle belly to screen space).
  const tmp = useRef(new THREE.Vector3())
  useFrame((state) => {
    const pulse = (Math.sin(state.clock.elapsedTime * 3) + 1) / 2
    const lvl = levelRef ? levelRef.current : 0.85
    for (const mat of glowing.current) mat.emissiveIntensity = 0.45 + lvl * 1.0 + pulse * 0.45

    if (projRef) {
      const w = state.size.width, h = state.size.height
      for (const g of GROUP_LIST) {
        const a = anchors[g]
        const slot = projRef.current[g]
        if (!slot) continue
        if (!a) { slot.vis = false; continue }
        tmp.current.set(a[0], a[1], a[2]).project(state.camera)
        slot.x = (tmp.current.x * 0.5 + 0.5) * w
        slot.y = (-tmp.current.y * 0.5 + 0.5) * h
        slot.vis = tmp.current.z < 1
      }
    }
  })

  return <primitive object={cloned} />
}

// ── Home explorer canvas (drag-to-rotate + side callout cards) ───────────────
export function MuscleModelCanvas({
  highlight, onHover, onSelect,
}: {
  highlight: MuscleGroupId | null
  onHover: (g: MuscleGroupId | null) => void
  onSelect: (g: MuscleGroupId) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const projRef = useRef<ProjMap>(emptyProj())

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" style={{ background: NAVY_BG }}>
      <Canvas gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} dpr={[1, 2]}
        camera={{ position: [0, 0.15, 3.7], fov: 42, near: 0.1, far: 100 }}>
        <SceneLights />
        <Ground />
        <Suspense fallback={null}>
          <Model highlight={highlight} projRef={projRef} />
        </Suspense>
        {/* No autoRotate — the model holds still on the bright front view and
            only turns when the user drags it. */}
        <OrbitControls enablePan={false} enableZoom minDistance={2.2} maxDistance={6}
          minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.92} enableDamping dampingFactor={0.08} />
      </Canvas>

      <CalloutOverlay wrapRef={wrapRef} projRef={projRef} highlight={highlight} onHover={onHover} onSelect={onSelect} />
    </div>
  )
}

// ── Trainer twin canvas (vivid, glow driven by live activation) ──────────────
export function TwinCanvas({
  highlight, levelRef, autoRotate = false,
}: {
  highlight: MuscleGroupId | null
  levelRef?: MutableRefObject<number>
  autoRotate?: boolean
}) {
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
          minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.92}
          enableDamping dampingFactor={0.08} autoRotate={autoRotate} autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  )
}

// ── Callout overlay (two tidy columns + tracking leader lines) ───────────────
//
// Positions (line endpoints, anchor dots) are owned by a single rAF loop that
// writes straight to the DOM, so they stay glued to the muscle as the model
// turns — without any React re-render. React only owns the *styling* that
// reacts to the highlighted group (stroke colour, card emphasis), and never
// touches the imperatively-set geometry, so there's no flicker on hover.
function CalloutOverlay({
  wrapRef, projRef, highlight, onHover, onSelect,
}: {
  wrapRef: MutableRefObject<HTMLDivElement | null>
  projRef: MutableRefObject<ProjMap>
  highlight: MuscleGroupId | null
  onHover: (g: MuscleGroupId | null) => void
  onSelect: (g: MuscleGroupId) => void
}) {
  const lineRefs = useRef<Partial<Record<MuscleGroupId, SVGLineElement | null>>>({})
  const nodeRefs = useRef<Partial<Record<MuscleGroupId, SVGCircleElement | null>>>({})
  const dotRefs  = useRef<Partial<Record<MuscleGroupId, HTMLDivElement | null>>>({})
  const cardRefs = useRef<Partial<Record<MuscleGroupId, HTMLButtonElement | null>>>({})

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const wrap = wrapRef.current
      if (wrap) {
        const cr = wrap.getBoundingClientRect()
        for (const g of GROUP_LIST) {
          const p = projRef.current[g]
          const line = lineRefs.current[g]
          const node = nodeRefs.current[g]
          const dot  = dotRefs.current[g]
          const card = cardRefs.current[g]
          const show = !!p && p.vis && p.x > -40 && p.x < cr.width + 40 && p.y > -40 && p.y < cr.height + 40
          if (!show) {
            if (line) line.style.opacity = '0'
            if (node) node.style.opacity = '0'
            if (dot)  dot.style.opacity  = '0'
            continue
          }
          const mx = p!.x, my = p!.y
          if (dot) { dot.style.transform = `translate(${mx}px, ${my}px)`; dot.style.opacity = '1' }
          if (line && card) {
            const rect = card.getBoundingClientRect()
            const ix = (SIDE[g] === 'L' ? rect.right : rect.left) - cr.left
            const iy = rect.top + rect.height / 2 - cr.top
            line.setAttribute('x1', String(ix)); line.setAttribute('y1', String(iy))
            line.setAttribute('x2', String(mx)); line.setAttribute('y2', String(my))
            line.style.opacity = '1'
            if (node) { node.setAttribute('cx', String(ix)); node.setAttribute('cy', String(iy)); node.style.opacity = '1' }
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [wrapRef, projRef])

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Title */}
      <div className="absolute left-5 top-4 max-w-[60%]">
        <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow">Train by muscle group</h1>
        <p className="mt-1 text-xs text-stone-400">Drag to rotate · tap a group to see its exercises</p>
      </div>

      {/* Leader lines + anchor nodes */}
      <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="mmLeader" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(251,191,36,0.12)" />
            <stop offset="100%" stopColor="rgba(252,211,77,0.85)" />
          </linearGradient>
        </defs>
        {GROUP_LIST.map((g) => {
          const active = highlight === g
          return (
            <g key={g}>
              <line ref={(el) => { lineRefs.current[g] = el; if (el && !el.dataset.init) { el.style.opacity = '0'; el.dataset.init = '1' } }}
                stroke={active ? 'rgba(253,224,71,0.95)' : 'url(#mmLeader)'}
                strokeWidth={active ? 2.2 : 1.4} strokeLinecap="round" />
              <circle ref={(el) => { nodeRefs.current[g] = el; if (el && !el.dataset.init) { el.style.opacity = '0'; el.dataset.init = '1' } }}
                r={active ? 3.6 : 3} fill={active ? '#fde047' : '#fbbf24'} />
            </g>
          )
        })}
      </svg>

      {/* On-body anchor dots */}
      {GROUP_LIST.map((g) => {
        const active = highlight === g
        return (
          <div key={g}
            ref={(el) => { dotRefs.current[g] = el; if (el && !el.dataset.init) { el.style.transform = 'translate(-200px,-200px)'; el.style.opacity = '0'; el.dataset.init = '1' } }}
            className="absolute left-0 top-0">
            <span className={[
              'absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 transition-all',
              active ? 'h-5 w-5 ring-amber-300/60' : 'h-4 w-4 ring-amber-400/30',
            ].join(' ')} />
            <span className={[
              'absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full transition-all',
              active ? 'h-3 w-3 bg-amber-300' : 'h-2.5 w-2.5 bg-amber-400',
            ].join(' ')} />
          </div>
        )
      })}

      {/* Left column cards */}
      <div className="absolute inset-y-0 left-[13%] flex flex-col justify-center gap-4">
        {LEFT_GROUPS.map((g) => (
          <RegionCard key={g} group={g} side="L" active={highlight === g}
            onHover={onHover} onSelect={() => onSelect(g)}
            cardRef={(el) => { cardRefs.current[g] = el }} />
        ))}
      </div>

      {/* Right column cards */}
      <div className="absolute inset-y-0 right-[13%] flex flex-col justify-center gap-4">
        {RIGHT_GROUPS.map((g) => (
          <RegionCard key={g} group={g} side="R" active={highlight === g}
            onHover={onHover} onSelect={() => onSelect(g)}
            cardRef={(el) => { cardRefs.current[g] = el }} />
        ))}
      </div>
    </div>
  )
}

// ── A single polished callout card ───────────────────────────────────────────
function RegionCard({
  group, side, active, onHover, onSelect, cardRef,
}: {
  group: MuscleGroupId
  side: 'L' | 'R'
  active: boolean
  onHover: (g: MuscleGroupId | null) => void
  onSelect: () => void
  cardRef: (el: HTMLButtonElement | null) => void
}) {
  const g = muscleGroupById(group)
  const n = exercisesForGroup(group).length
  return (
    <button
      ref={cardRef}
      onPointerOver={() => onHover(group)} onPointerOut={() => onHover(null)} onClick={onSelect}
      className={[
        'pointer-events-auto group flex w-[150px] items-center gap-2.5 rounded-2xl border px-3 py-2.5 backdrop-blur-md transition-all duration-200',
        side === 'R' ? 'flex-row-reverse text-right' : 'text-left',
        active
          ? 'border-amber-300/80 bg-amber-500/20 shadow-[0_0_26px_rgba(251,146,60,0.5)] scale-[1.05]'
          : 'border-amber-400/25 bg-stone-950/70 hover:border-amber-300/60 hover:bg-amber-500/10',
      ].join(' ')}
    >
      {/* accent chip */}
      <span className={[
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-inner',
        g.accent.from, g.accent.to,
      ].join(' ')}>
        <span className="text-sm font-black">{g.name.charAt(0)}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold text-white">{g.name}</span>
        <span className={['block text-[10px] font-medium', active ? 'text-amber-200' : 'text-stone-400'].join(' ')}>
          {n} exercises
        </span>
      </span>
    </button>
  )
}

// ── Live-activation twin (used in ExerciseTrainer) ─────────────────────────
// Same proven Model approach (no mesh reparenting) so lighting always works.
// Each frame it reads activationsRef and colours every mesh by the strongest
// matching activation: tan at rest → amber → red at peak.

const C_BASE_LT = new THREE.Color('#6b5b4a')
const C_MID_LT  = new THREE.Color('#f59e0b')
const C_HOT_LT  = new THREE.Color('#b91c1c')
const BASELINE_LT = 0.12

function meshStemLT(name: string): string {
  let s = name.toUpperCase()
  if (s.endsWith('_L') || s.endsWith('_R')) s = s.slice(0, -2)
  return s
}
function actStemLT(muscleId: string): string {
  let s = muscleId.toUpperCase()
  for (const suf of ['_ANTERIOR', '_LATERAL', '_POSTERIOR', '_UPPER', '_MIDDLE', '_LOWER']) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break }
  }
  return s
}

interface LiveModelDesc { mat: THREE.MeshStandardMaterial; stem: string }

function LiveModel({ activationsRef }: { activationsRef: import('react').MutableRefObject<LiveMuscleActivation[]> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { scene } = useGLTF(MODEL_PATH, true, true) as any
  const { cloned, meshes } = useMemo(() => {
    const c = scene.clone(true) as THREE.Object3D
    // Recompute normals from winding order to fix inverted-normal black model
    c.traverse((o: THREE.Object3D) => {
      if (!(o instanceof THREE.Mesh)) return
      o.geometry = o.geometry.clone()
      o.geometry.computeVertexNormals()
    })
    const b0 = new THREE.Box3().setFromObject(c)
    const size = b0.getSize(new THREE.Vector3())
    c.scale.setScalar(2.4 / Math.max(size.y, 1e-3))
    const b1 = new THREE.Box3().setFromObject(c)
    const ctr = b1.getCenter(new THREE.Vector3())
    c.position.x -= ctr.x; c.position.z -= ctr.z
    c.position.y += GROUND_Y - b1.min.y
    c.updateMatrixWorld(true)
    const descs: LiveModelDesc[] = []
    c.traverse((o: THREE.Object3D) => {
      if (!(o instanceof THREE.Mesh)) return
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#6b5b4a'), roughness: 0.55, metalness: 0.05,
        emissive: new THREE.Color('#2a1f15'), emissiveIntensity: 0.3,
      })
      o.material = mat
      descs.push({ mat, stem: meshStemLT(o.name || '') })
    })
    return { cloned: c, meshes: descs }
  }, [scene])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const acts = activationsRef.current || []
    for (const { mat, stem } of meshes) {
      let level = BASELINE_LT
      for (const a of acts) {
        if (actStemLT(a.muscleId) === stem && a.level > level) level = a.level
      }
      const v = Math.max(0, Math.min(1, (level - BASELINE_LT) / (1 - BASELINE_LT)))
      if (v < 0.5) mat.color.copy(C_BASE_LT).lerp(C_MID_LT, v / 0.5)
      else         mat.color.copy(C_MID_LT).lerp(C_HOT_LT, (v - 0.5) / 0.5)
      mat.emissive.copy(mat.color)
      mat.emissiveIntensity = (0.3 + v * 1.2) * (1 + 0.12 * v * Math.sin(t * 4))
    }
  })

  return <primitive object={cloned} />
}

export function LiveTwinCanvas({ activationsRef }: { activationsRef: import('react').MutableRefObject<LiveMuscleActivation[]> }) {
  return (
    <div className="h-full w-full" style={{ background: NAVY_BG }}>
      <Canvas gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} dpr={[1, 2]}
        camera={{ position: [0, 0.15, 3.7], fov: 42, near: 0.1, far: 100 }}>
        <SceneLights />
        <Ground />
        <Suspense fallback={null}>
          <LiveModel activationsRef={activationsRef} />
        </Suspense>
      </Canvas>
    </div>
  )
}

// ── Error boundary ────────────────────────────────────────────────────────────────────────────────────
interface EBProps { fallback: ReactNode; children: ReactNode }
export class CanvasErrorBoundary extends Component<EBProps, { failed: boolean }> {
  constructor(props: EBProps) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
