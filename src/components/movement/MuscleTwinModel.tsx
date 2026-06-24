/**
 * MuscleTwinModel.tsx  (v2)
 *
 * Segment-rigged, pose-driven, activation-coloured render of the muscular GLB.
 * The asset has no skeleton, so at load time we group the 52 muscle meshes into
 * body segments, pivot each at its proximal joint, and nest them into a chain
 * (torso → upper-arm → forearm, torso → thigh → shank, torso → neck → head).
 *
 * v2 fixes (from user feedback on the first cut):
 *   • ANATOMICAL mapping. Pose directions arrive already decomposed into the
 *     user's own frame (right / up / anterior — see poseRig). We rebuild the
 *     target in the MODEL'S anatomical frame (derived from its geometry), so
 *     left=left, abduction=abduction, robust to the user being turned. No more
 *     guessed axis signs / mirrored sides.
 *   • TORSO LOCKED. The root no longer rotates with the spine, so the whole
 *     body stops yaw-spinning in space. Only limbs / neck / head articulate.
 *   • STABLE FOREARM. The forearm is gated on wrist visibility (poseRig) and
 *     its rotation is clamped, so it no longer detaches or flails.
 *   • Per-segment angle clamps + slerp keep everything smooth and plausible.
 */

import React, { Suspense, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { LiveMuscleActivation } from '../../lib/movement/liveMuscleActivation'
import {
  SEGMENT_ORDER, SEGMENT_PARENT, segmentForMesh,
  type SegmentId, type BoneDirs,
} from '../../lib/movement/poseRig'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`

const SLERP    = 0.3    // per-frame approach to target orientation (smoothness)
const BASELINE = 0.12   // resting tone — must match the engine

// Per-segment max deviation from the bind pose (deg) — keeps motion plausible
// and stops any one joint from spinning.
const MAX_ANGLE: Partial<Record<SegmentId, number>> = {
  neck: 55, head: 45,
  upperArmR: 175, upperArmL: 175,
  forearmR: 150, forearmL: 150,
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
  neutral: Partial<Record<SegmentId, THREE.Vector3>>   // bind bone dir, model space
  meshes:  MeshDesc[]
  axes:    { right: THREE.Vector3; up: THREE.Vector3; ant: THREE.Vector3 }
}

function Rig({ activationsRef, boneDirsRef }: Props) {
  const { scene } = useGLTF(MODEL_PATH, true, true) as any
  const rig = useMemo<RigData>(() => buildRig(scene), [scene])

  const worldQuat = useRef<Record<string, THREE.Quaternion>>({})
  const tmpTarget = useRef(new THREE.Vector3())
  const tmpDesired = useRef(new THREE.Quaternion())
  const tmpLocal  = useRef(new THREE.Quaternion())
  const IDENT = useRef(new THREE.Quaternion())

  useFrame((state) => {
    const dirs = boneDirsRef.current || {}
    const t = state.clock.elapsedTime
    const { right, up, ant } = rig.axes

    for (const seg of SEGMENT_ORDER) {
      const group = rig.groups[seg]
      const neutral = rig.neutral[seg]
      if (!group || !neutral) continue
      const parent = SEGMENT_PARENT[seg]
      const parentWQ = parent ? worldQuat.current[parent] : undefined

      // Torso stays upright (locked) so the body doesn't spin in space.
      if (seg !== 'torso') {
        const d = dirs[seg]
        if (d) {
          // Rebuild the target bone direction in MODEL space from the user's
          // anatomical components (x=right, y=up, z=anterior).
          tmpTarget.current.set(0, 0, 0)
            .addScaledVector(right, d.x)
            .addScaledVector(up,    d.y)
            .addScaledVector(ant,   d.z)
          if (tmpTarget.current.lengthSq() > 1e-6) {
            tmpTarget.current.normalize()
            const desiredWQ = tmpDesired.current.setFromUnitVectors(neutral, tmpTarget.current)
            if (parentWQ) tmpLocal.current.copy(parentWQ).invert().multiply(desiredWQ)
            else          tmpLocal.current.copy(desiredWQ)
            clampQuat(tmpLocal.current, MAX_ANGLE[seg] ?? 160, IDENT.current)
            group.quaternion.slerp(tmpLocal.current, SLERP)
          }
        }
      }

      const wq = (worldQuat.current[seg] ??= new THREE.Quaternion())
      if (parentWQ) wq.copy(parentWQ).multiply(group.quaternion)
      else          wq.copy(group.quaternion)
    }

    // Activation → colour.
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

/** Clamp a quaternion's rotation magnitude to maxDeg (slerp from identity). */
function clampQuat(q: THREE.Quaternion, maxDeg: number, ident: THREE.Quaternion): void {
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)))   // radians
  const max = (maxDeg * Math.PI) / 180
  if (angle > max && angle > 1e-4) {
    q.slerpQuaternions(ident, q.clone(), max / angle)
  }
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
  const bFAr = box(['forearmR']),  bFAl = box(['forearmL'])
  const bThR = box(['thighR']),    bThL = box(['thighL'])
  const bShR = box(['shankR']),    bShL = box(['shankL'])
  const bTorso = box(['torso']),   bNeck = box(['neck']), bHead = box(['head'])

  const shoulderR = bUAr ? topC(bUAr) : V(-0.18, 1.35, 0), elbowR = bUAr ? botC(bUAr) : V(-0.2, 1.0, 0)
  const shoulderL = bUAl ? topC(bUAl) : V(0.18, 1.35, 0),  elbowL = bUAl ? botC(bUAl) : V(0.2, 1.0, 0)
  const wristR = bFAr ? botC(bFAr) : V(-0.22, 0.75, 0),    wristL = bFAl ? botC(bFAl) : V(0.22, 0.75, 0)
  const hipR = bThR ? topC(bThR) : V(-0.1, 0.9, 0),        kneeR = bThR ? botC(bThR) : V(-0.1, 0.5, 0)
  const hipL = bThL ? topC(bThL) : V(0.1, 0.9, 0),         kneeL = bThL ? botC(bThL) : V(0.1, 0.5, 0)
  const ankleR = bShR ? botC(bShR) : V(-0.1, 0.1, 0),      ankleL = bShL ? botC(bShL) : V(0.1, 0.1, 0)
  const pelvis = hipR.clone().add(hipL).multiplyScalar(0.5)
  const neckBase = bTorso ? topC(bTorso) : V(0, 1.4, 0)
  const headBase = bNeck ? topC(bNeck) : V(0, 1.55, 0)
  const headTop  = bHead ? topC(bHead) : V(0, 1.75, 0)

  const pivots: Record<SegmentId, THREE.Vector3> = {
    torso: pelvis, neck: neckBase, head: headBase,
    upperArmR: shoulderR, forearmR: elbowR, upperArmL: shoulderL, forearmL: elbowL,
    thighR: hipR, shankR: kneeR, thighL: hipL, shankL: kneeL,
  }
  const distal: Record<SegmentId, THREE.Vector3> = {
    torso: neckBase, neck: headBase, head: headTop,
    upperArmR: elbowR, forearmR: wristR, upperArmL: elbowL, forearmL: wristL,
    thighR: kneeR, shankR: ankleR, thighL: kneeL, shankL: ankleL,
  }

  // Model anatomical axes (Gram-Schmidt from geometry).
  const up = neckBase.clone().sub(pelvis); if (up.lengthSq() < 1e-6) up.set(0, 1, 0); up.normalize()
  let right = shoulderR.clone().sub(shoulderL)              // anatomical left→right
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.addScaledVector(up, -right.dot(up)).normalize()     // orthogonalise to up
  const ant = new THREE.Vector3().crossVectors(right, up).normalize()  // out the chest

  const groups: Partial<Record<SegmentId, THREE.Group>> = {}
  const neutral: Partial<Record<SegmentId, THREE.Vector3>> = {}
  for (const seg of SEGMENT_ORDER) {
    const g = new THREE.Group(); g.name = `seg_${seg}`; groups[seg] = g
    const d = distal[seg].clone().sub(pivots[seg])
    neutral[seg] = d.lengthSq() > 1e-9 ? d.normalize() : new THREE.Vector3(0, -1, 0)
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
