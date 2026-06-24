/**
 * MuscleTwinModel.tsx
 *
 * Segment-rigged, pose-driven, activation-coloured render of the muscular-
 * system GLB. The asset has no skeleton/skin, so we build a rigid joint rig at
 * load time: the 52 muscle meshes are grouped into body segments, each segment
 * gets a THREE.Group pivot at its proximal joint, and the groups are nested
 * into a kinematic chain (torso → upper-arm → forearm, torso → thigh → shank,
 * torso → neck → head).
 *
 * Each frame we read the latest pose + activation from refs (so the heavy
 * R3F tree never re-renders) and:
 *   • rotate each segment group so its bone points along the live limb
 *     direction (slerped for smoothness) — the model moves as you move;
 *   • colour each muscle from a calm baseline tone up to deep red by its
 *     activation level (no strobing — it's an envelope-smoothed glow).
 *
 * If a limb isn't visible this frame the segment simply holds its last pose.
 *
 * Mirror / facing: the model is shown facing the viewer like a mirror. If your
 * limbs move to the WRONG side or front/back is reversed, flip MIRROR_X /
 * FORWARD_Z below (one line each) — single-camera depth sign can vary by setup.
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

// Pose→model axis mapping. +y is up in both. Flip these if motion looks mirrored
// or front/back-reversed for your camera setup.
const MIRROR_X  = -1
const FORWARD_Z = -1
const SLERP     = 0.35   // per-frame approach to the target orientation (smoothness)
const BASELINE  = 0.12   // must match the engine's resting tone

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
  outer:       THREE.Group
  groups:      Partial<Record<SegmentId, THREE.Group>>
  neutral:     Partial<Record<SegmentId, THREE.Vector3>>   // bind bone dir, cloned space
  meshes:      MeshDesc[]
}

function Rig({ activationsRef, boneDirsRef }: Props) {
  const { scene } = useGLTF(MODEL_PATH, true, true) as any

  const rig = useMemo<RigData>(() => buildRig(scene), [scene])

  // Persisted per-segment world quaternion (so children inherit parent motion
  // even on frames where the child's own target is missing).
  const worldQuat = useRef<Record<string, THREE.Quaternion>>({})
  const tmpTarget = useRef(new THREE.Vector3())
  const tmpQuat   = useRef(new THREE.Quaternion())
  const tmpLocal  = useRef(new THREE.Quaternion())

  useFrame((state) => {
    const dirs = boneDirsRef.current || {}
    const t = state.clock.elapsedTime

    // ── Pose → segment orientation (top-down so parents resolve first) ──────
    for (const seg of SEGMENT_ORDER) {
      const group = rig.groups[seg]
      const neutral = rig.neutral[seg]
      if (!group || !neutral) continue
      const parent = SEGMENT_PARENT[seg]
      const parentWQ = parent ? worldQuat.current[parent] : undefined

      const d = dirs[seg]
      if (d) {
        // Map pose dir (MediaPipe world, +y up) into model space.
        tmpTarget.current.set(d.x * MIRROR_X, d.y, d.z * FORWARD_Z).normalize()
        // Desired WORLD rotation: rotate the bind bone dir onto the live dir.
        const desiredWQ = tmpQuat.current.setFromUnitVectors(neutral, tmpTarget.current)
        // Convert to the group's LOCAL frame (relative to its parent's world).
        if (parentWQ) {
          tmpLocal.current.copy(parentWQ).invert().multiply(desiredWQ)
        } else {
          tmpLocal.current.copy(desiredWQ)
        }
        group.quaternion.slerp(tmpLocal.current, SLERP)
      }

      // Record this segment's resulting world quaternion for its children.
      const wq = (worldQuat.current[seg] ??= new THREE.Quaternion())
      if (parentWQ) wq.copy(parentWQ).multiply(group.quaternion)
      else          wq.copy(group.quaternion)
    }

    // ── Activation → colour ─────────────────────────────────────────────────
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

// ── Rig construction ──────────────────────────────────────────────────────────

function buildRig(scene: THREE.Object3D): RigData {
  const cloned = scene.clone(true)
  cloned.position.set(0, 0, 0)
  cloned.scale.set(1, 1, 1)
  cloned.rotation.set(0, 0, 0)
  cloned.updateMatrixWorld(true)

  // Index meshes by segment.
  const bySeg: Partial<Record<SegmentId, THREE.Mesh[]>> = {}
  const meshes: MeshDesc[] = []
  cloned.traverse((o: THREE.Object3D) => {
    if (!(o instanceof THREE.Mesh)) return
    const seg = segmentForMesh(o.name)
    if (seg) (bySeg[seg] ??= []).push(o)
    // Per-mesh material + activation key.
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6b5b4a'), roughness: 0.6, metalness: 0.0,
      emissive: new THREE.Color('#000000'), emissiveIntensity: 0.15,
    })
    o.material = mat
    meshes.push({ mat, stem: meshStem(o.name), side: meshSide(o.name) })
  })

  const box = (segs: SegmentId[]) => {
    const b = new THREE.Box3()
    let any = false
    for (const s of segs) for (const m of (bySeg[s] ?? [])) { b.expandByObject(m); any = true }
    return any ? b : null
  }
  const topC = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2)
  const botC = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2)

  // Joint pivots from mesh bounding boxes.
  const bUAr = box(['upperArmR']), bUAl = box(['upperArmL'])
  const bFAr = box(['forearmR']),  bFAl = box(['forearmL'])
  const bThR = box(['thighR']),    bThL = box(['thighL'])
  const bShR = box(['shankR']),    bShL = box(['shankL'])
  const bTorso = box(['torso']),   bNeck = box(['neck']), bHead = box(['head'])

  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
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

  // Build groups, nest by parent (local pos = pivot − parentPivot since the
  // bind pose has no rotation, so world offsets equal local offsets).
  const groups: Partial<Record<SegmentId, THREE.Group>> = {}
  const neutral: Partial<Record<SegmentId, THREE.Vector3>> = {}
  for (const seg of SEGMENT_ORDER) {
    const g = new THREE.Group(); g.name = `seg_${seg}`
    groups[seg] = g
    const dir = distal[seg].clone().sub(pivots[seg])
    neutral[seg] = dir.lengthSq() > 1e-9 ? dir.normalize() : new THREE.Vector3(0, -1, 0)
  }
  for (const seg of SEGMENT_ORDER) {
    const g = groups[seg]!
    const parent = SEGMENT_PARENT[seg]
    const parentPivot = parent ? pivots[parent] : new THREE.Vector3(0, 0, 0)
    g.position.copy(pivots[seg]).sub(parentPivot)
    if (parent) groups[parent]!.add(g)
    else cloned.add(g)
  }
  cloned.updateMatrixWorld(true)

  // Reparent each muscle mesh into its segment group (attach preserves world).
  for (const seg of SEGMENT_ORDER) {
    for (const m of (bySeg[seg] ?? [])) groups[seg]!.attach(m)
  }
  cloned.updateMatrixWorld(true)

  // Wrap, centre, and scale for the camera.
  const outer = new THREE.Group()
  outer.add(cloned)
  const full = new THREE.Box3().setFromObject(outer)
  const centre = full.getCenter(new THREE.Vector3())
  const size = full.getSize(new THREE.Vector3())
  const scale = 2.4 / Math.max(size.y, 1e-3)
  cloned.position.sub(centre)
  outer.scale.setScalar(scale)

  return { outer, groups, neutral, meshes }
}

// ── Colour ramp ───────────────────────────────────────────────────────────────

const C_BASE = new THREE.Color('#6b5b4a')   // calm tan (isometric)
const C_MID  = new THREE.Color('#f59e0b')   // amber
const C_HOT  = new THREE.Color('#b91c1c')   // deep red

function paint(mat: THREE.MeshStandardMaterial, level: number, time: number) {
  // 0 at baseline → 1 at max activation.
  const t = Math.max(0, Math.min(1, (level - BASELINE) / (1 - BASELINE)))
  if (t < 0.5) mat.color.copy(C_BASE).lerp(C_MID, t / 0.5)
  else         mat.color.copy(C_MID).lerp(C_HOT, (t - 0.5) / 0.5)
  mat.emissive.copy(mat.color)
  // Gentle pulse only for hard-working muscles; resting muscles stay steady.
  const pulse = 1 + 0.12 * t * Math.sin(time * 4)
  mat.emissiveIntensity = (0.12 + t * 1.25) * pulse
}

// ── Name → activation key helpers ──────────────────────────────────────────────

function meshSide(name: string): 'L' | 'R' | 'C' {
  const u = name.toUpperCase()
  if (u.endsWith('_R')) return 'R'
  if (u.endsWith('_L')) return 'L'
  return 'C'
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
