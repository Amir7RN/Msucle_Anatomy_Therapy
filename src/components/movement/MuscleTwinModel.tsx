/**
 * MuscleTwinModel.tsx  (v3)
 *
 * Segment-rigged, pose-driven, activation-coloured render of the muscular GLB.
 *
 * v3 realism rig
 * ──────────────
 *   • PELVIS is the fixed root. The TRUNK leans on top of it (forward/back/side,
 *     derived from spine-vs-gravity → no yaw spin). Arms/neck/head are children
 *     of the trunk so they follow the lean. Thighs/shanks are children of the
 *     PELVIS, so they stay grounded when the trunk moves and only move when the
 *     leg itself moves.
 *   • FOREARM folded into the arm (poseRig), so the arm is one connected
 *     segment that can't detach at the elbow.
 *   • Body-relative FK: each segment's measured anatomical direction is rebuilt
 *     in the model's anatomical frame and applied so segments connect and the
 *     model mimics the user. Upper segments are additionally rotated by the
 *     trunk lean; lower segments are not (grounding).
 */

import React, { Suspense, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { LiveMuscleActivation } from '../../lib/movement/liveMuscleActivation'
import {
  SEGMENT_ORDER, SEGMENT_PARENT, UPPER_SEGMENTS, segmentForMesh,
  type SegmentId, type BoneDirs,
} from '../../lib/movement/poseRig'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`

const SLERP    = 0.3
const BASELINE = 0.12

const MAX_ANGLE: Partial<Record<SegmentId, number>> = {
  trunk: 45, neck: 55, head: 45,
  upperArmR: 175, upperArmL: 175,
  thighR: 130, thighL: 130,
  shankR: 150, shankL: 150,
}

interface Props {
  activationsRef: MutableRefObject<LiveMuscleActivation[]>
  boneDirsRef:    MutableRefObject<BoneDirs>
}

export function MuscleTwinModel({ activationsRef, boneDirsRef }: Props) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{ background: 'transparent' }}
      camera={{ position: [0, 0.1, 3.4], fov: 42, near: 0.1, far: 100 }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]}  intensity={0.8} />
      <directionalLight position={[-3, 2, 3]} intensity={0.4} color="#a5f3fc" />
      <Suspense fallback={null}>
        <Rig activationsRef={activationsRef} boneDirsRef={boneDirsRef} />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(MODEL_PATH, true, true)

// ─────────────────────────────────────────────────────────────────────────────

interface MeshDesc { mat: THREE.MeshStandardMaterial; stem: string; side: 'L' | 'R' | 'C' }
interface RigData {
  outer:   THREE.Group
  groups:  Partial<Record<SegmentId, THREE.Group>>
  neutral: Partial<Record<SegmentId, THREE.Vector3>>
  meshes:  MeshDesc[]
  axes:    { right: THREE.Vector3; up: THREE.Vector3; ant: THREE.Vector3 }
}

function Rig({ activationsRef, boneDirsRef }: Props) {
  const { scene } = useGLTF(MODEL_PATH, true, true) as any
  const rig = useMemo<RigData>(() => buildRig(scene), [scene])

  const worldQuat = useRef<Record<string, THREE.Quaternion>>({})
  const lastBody  = useRef<Record<string, THREE.Quaternion>>({})
  const tmpTarget = useRef(new THREE.Vector3())
  const tmpDesired = useRef(new THREE.Quaternion())
  const tmpLocal  = useRef(new THREE.Quaternion())
  const IDENT     = useRef(new THREE.Quaternion())

  // Lazily init persistent quaternions.
  for (const seg of SEGMENT_ORDER) {
    if (!worldQuat.current[seg]) worldQuat.current[seg] = new THREE.Quaternion()
    if (!lastBody.current[seg])  lastBody.current[seg]  = new THREE.Quaternion()
  }

  useFrame((state) => {
    const dirs = boneDirsRef.current || {}
    const t = state.clock.elapsedTime
    const { right, up, ant } = rig.axes

    // 1. Refresh each segment's body-relative rotation from fresh pose dirs.
    for (const seg of SEGMENT_ORDER) {
      const neutral = rig.neutral[seg]
      const d = dirs[seg]
      if (!neutral || !d) continue
      tmpTarget.current.set(0, 0, 0)
        .addScaledVector(right, d.x).addScaledVector(up, d.y).addScaledVector(ant, d.z)
      if (tmpTarget.current.lengthSq() > 1e-6) {
        tmpTarget.current.normalize()
        lastBody.current[seg].setFromUnitVectors(neutral, tmpTarget.current)
      }
    }
    const leanRot = lastBody.current['trunk']

    // 2. Top-down: desired world orientation → local (relative to parent).
    for (const seg of SEGMENT_ORDER) {
      const group = rig.groups[seg]
      if (!group) continue
      const parent = SEGMENT_PARENT[seg]
      const parentWQ = parent ? worldQuat.current[parent] : IDENT.current

      const desired = tmpDesired.current
      if (seg === 'pelvis')            desired.identity()
      else if (seg === 'trunk')        desired.copy(leanRot)
      else if (UPPER_SEGMENTS.has(seg)) desired.copy(leanRot).multiply(lastBody.current[seg])
      else                              desired.copy(lastBody.current[seg])   // lower: grounded

      tmpLocal.current.copy(parentWQ).invert().multiply(desired)
      clampQuat(tmpLocal.current, MAX_ANGLE[seg] ?? 160, IDENT.current)
      group.quaternion.slerp(tmpLocal.current, SLERP)
      worldQuat.current[seg].copy(desired)
    }

    // 3. Activation → colour.
    const acts = activationsRef.current || []
    for (const md of rig.meshes) {
      let level = BASELINE
      for (const a of acts) {
        if (actStem(a.muscleId) !== md.stem) continue
        const aSide = a.region.startsWith('left') ? 'L' : a.region.startsWith('right') ? 'R' : 'C'
        if (aSide !== 'C' && md.side !== 'C' && aSide !== md.side) continue
        if (a.level > level) level = a.level
      }
      paint(md.mat, level, t)
    }
  })

  return <primitive object={rig.outer} />
}

function clampQuat(q: THREE.Quaternion, maxDeg: number, ident: THREE.Quaternion): void {
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)))
  const max = (maxDeg * Math.PI) / 180
  if (angle > max && angle > 1e-4) q.slerpQuaternions(ident, q.clone(), max / angle)
}

// ── Rig construction ──────────────────────────────────────────────────────────

function buildRig(scene: THREE.Object3D): RigData {
  const cloned = scene.clone(true)
  cloned.position.set(0, 0, 0); cloned.scale.set(1, 1, 1); cloned.rotation.set(0, 0, 0)
  cloned.updateMatrixWorld(true)

  const bySeg: Partial<Record<SegmentId, THREE.Mesh[]>> = {}
  const meshes: MeshDesc[] = []
  cloned.traverse((o: THREE.Object3D) => {
    if (!(o instanceof THREE.Mesh)) return
    const seg = segmentForMesh(o.name)
    if (seg) (bySeg[seg] ??= []).push(o)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6b5b4a'), roughness: 0.6, metalness: 0.0,
      emissive: new THREE.Color('#000000'), emissiveIntensity: 0.15,
    })
    o.material = mat
    meshes.push({ mat, stem: meshStem(o.name), side: meshSide(o.name) })
  })

  const box = (segs: SegmentId[]) => {
    const b = new THREE.Box3(); let any = false
    for (const s of segs) for (const m of (bySeg[s] ?? [])) { b.expandByObject(m); any = true }
    return any ? b : null
  }
  const topC = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2)
  const botC = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2)
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  const bUAr = box(['upperArmR']), bUAl = box(['upperArmL'])
  const bThR = box(['thighR']),    bThL = box(['thighL'])
  const bShR = box(['shankR']),    bShL = box(['shankL'])
  const bTrunk = box(['trunk']),   bPelv = box(['pelvis'])
  const bNeck = box(['neck']),     bHead = box(['head'])

  const shoulderR = bUAr ? topC(bUAr) : V(-0.18, 1.35, 0), armEndR = bUAr ? botC(bUAr) : V(-0.2, 0.8, 0)
  const shoulderL = bUAl ? topC(bUAl) : V(0.18, 1.35, 0),  armEndL = bUAl ? botC(bUAl) : V(0.2, 0.8, 0)
  const hipR = bThR ? topC(bThR) : V(-0.1, 0.9, 0),        kneeR = bThR ? botC(bThR) : V(-0.1, 0.5, 0)
  const hipL = bThL ? topC(bThL) : V(0.1, 0.9, 0),         kneeL = bThL ? botC(bThL) : V(0.1, 0.5, 0)
  const ankleR = bShR ? botC(bShR) : V(-0.1, 0.1, 0),      ankleL = bShL ? botC(bShL) : V(0.1, 0.1, 0)
  const pelvisC = hipR.clone().add(hipL).multiplyScalar(0.5)
  const neckBase = bTrunk ? topC(bTrunk) : V(0, 1.4, 0)
  const lumbar   = pelvisC.clone().lerp(neckBase, 0.12)
  const headBase = bNeck ? topC(bNeck) : V(0, 1.55, 0)
  const headTop  = bHead ? topC(bHead) : V(0, 1.75, 0)

  const pivots: Record<SegmentId, THREE.Vector3> = {
    pelvis: pelvisC, trunk: lumbar, neck: neckBase, head: headBase,
    upperArmR: shoulderR, upperArmL: shoulderL,
    thighR: hipR, shankR: kneeR, thighL: hipL, shankL: kneeL,
  }
  const distal: Record<SegmentId, THREE.Vector3> = {
    pelvis: neckBase, trunk: neckBase, neck: headBase, head: headTop,
    upperArmR: armEndR, upperArmL: armEndL,
    thighR: kneeR, shankR: ankleR, thighL: kneeL, shankL: ankleL,
  }

  // Model anatomical axes from geometry (Gram-Schmidt).
  const up = neckBase.clone().sub(pelvisC); if (up.lengthSq() < 1e-6) up.set(0, 1, 0); up.normalize()
  const right = shoulderR.clone().sub(shoulderL)
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.addScaledVector(up, -right.dot(up)).normalize()
  const ant = new THREE.Vector3().crossVectors(right, up).normalize()

  const groups: Partial<Record<SegmentId, THREE.Group>> = {}
  const neutral: Partial<Record<SegmentId, THREE.Vector3>> = {}
  for (const seg of SEGMENT_ORDER) {
    const g = new THREE.Group(); g.name = `seg_${seg}`; groups[seg] = g
    const d = distal[seg].clone().sub(pivots[seg])
    neutral[seg] = d.lengthSq() > 1e-9 ? d.normalize() : up.clone()
  }
  for (const seg of SEGMENT_ORDER) {
    const g = groups[seg]!
    const parent = SEGMENT_PARENT[seg]
    const parentPivot = parent ? pivots[parent] : new THREE.Vector3(0, 0, 0)
    g.position.copy(pivots[seg]).sub(parentPivot)
    if (parent) groups[parent]!.add(g)
    else        cloned.add(g)
  }
  cloned.updateMatrixWorld(true)
  for (const seg of SEGMENT_ORDER) for (const m of (bySeg[seg] ?? [])) groups[seg]!.attach(m)
  cloned.updateMatrixWorld(true)

  const outer = new THREE.Group()
  outer.add(cloned)
  const full = new THREE.Box3().setFromObject(outer)
  const centre = full.getCenter(new THREE.Vector3())
  const size = full.getSize(new THREE.Vector3())
  cloned.position.sub(centre)
  outer.scale.setScalar(2.4 / Math.max(size.y, 1e-3))

  return { outer, groups, neutral, meshes, axes: { right, up, ant } }
}

// ── Colour ramp ───────────────────────────────────────────────────────────────

const C_BASE = new THREE.Color('#6b5b4a')
const C_MID  = new THREE.Color('#f59e0b')
const C_HOT  = new THREE.Color('#b91c1c')

function paint(mat: THREE.MeshStandardMaterial, level: number, time: number) {
  const t = Math.max(0, Math.min(1, (level - BASELINE) / (1 - BASELINE)))
  if (t < 0.5) mat.color.copy(C_BASE).lerp(C_MID, t / 0.5)
  else         mat.color.copy(C_MID).lerp(C_HOT, (t - 0.5) / 0.5)
  mat.emissive.copy(mat.color)
  const pulse = 1 + 0.12 * t * Math.sin(time * 4)
  mat.emissiveIntensity = (0.12 + t * 1.25) * pulse
}

// ── Name → activation key helpers ──────────────────────────────────────────────

function meshSide(name: string): 'L' | 'R' | 'C' {
  const u = name.toUpperCase()
  return u.endsWith('_R') ? 'R' : u.endsWith('_L') ? 'L' : 'C'
}
function meshStem(name: string): string {
  let s = name.toUpperCase()
  if (s.endsWith('_L') || s.endsWith('_R')) s = s.slice(0, -2)
  return s
}
function actStem(muscleId: string): string {
  let s = muscleId.toUpperCase()
  for (const suf of ['_ANTERIOR', '_LATERAL', '_POSTERIOR', '_UPPER', '_MIDDLE', '_LOWER']) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break }
  }
  return s
}
