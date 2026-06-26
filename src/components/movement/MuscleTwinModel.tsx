/**
 * MuscleTwinModel.tsx  (v4 — realism rewrite)
 *
 * Segment-rigged, pose-driven, activation-coloured render of the muscular GLB.
 *
 * What changed vs v3 (the issues from the user's recording)
 * ─────────────────────────────────────────────────────────
 *   0. FOREARM BENDS. The forearm (brachioradialis) is its own segment, a child
 *      of the upper arm, driven by the elbow→wrist direction. The elbow now
 *      flexes instead of the arm being one rigid stick.
 *   2/3. NO TANGLING / DETACHING. Every segment is oriented by its own
 *      gravity-referenced world direction (from poseRig v4) and then localised
 *      to its parent, so children stay attached and limbs can't cross or fly
 *      off. Joints are clamped and slew-limited.
 *   "floating". GROUNDED. Each frame we measure the posed model's lowest point
 *      and translate it so the feet rest on the floor — in any posture.
 *   4/5. REAL WEIGHT, NO BALLOON. A jump lifts the model by the user's measured
 *      hip rise and settles with a mass-tuned, non-overshooting follower that
 *      snaps back to the ground on landing (no drift, no bobbing).
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
import { type Posture } from '../../lib/movement/exercisePose'
import { heavinessFactor, DEFAULT_WEIGHT_KG, type SegmentFamily } from '../../lib/movement/bodySegments'

/** Map a rig segment to its De Leva mass family (for inertia/momentum). */
function familyOf(seg: SegmentId): SegmentFamily | null {
  if (seg === 'upperArmL' || seg === 'upperArmR') return 'upperArm'
  if (seg === 'forearmL'  || seg === 'forearmR')  return 'forearm'
  if (seg === 'thighL'    || seg === 'thighR')    return 'thigh'
  if (seg === 'shankL'    || seg === 'shankR')    return 'shank'
  if (seg === 'trunk') return 'trunk'
  if (seg === 'neck' || seg === 'head') return 'head'
  return null
}

const MODEL_PATH = `${import.meta.env.BASE_URL}models/human-muscular-system.glb`

const SLERP    = 0.32
const BASELINE = 0.12
// The twin is a MIRROR (the user faces it): the user's left side drives the
// model's right and vice-versa. poseRig already mirrors the MOTION; here we
// mirror the ACTIVATION side too so the limb that moves is the limb that lights
// up. Set false for a "facing-partner" (same-anatomical-side) view.
const MIRROR = true
// Per-frame ceiling on how far a segment may rotate (degrees) — a hard slew
// limit on top of the slerp so a single bad pose frame can't fling a limb.
const MAX_STEP_DEG = 13

// Where the floor sits (model world units) and how a unit of jump maps to it.
const GROUND_Y     = -1.28
const JUMP_WORLD   = 0.7    // rig rootY (≈1 person-height units) → world units

// Anatomically-bounded joint limits (degrees of LOCAL rotation from neutral,
// i.e. relative to the parent segment). Tight enough that nothing hyper-extends
// off the body; loose enough for full, real range.
const MAX_ANGLE: Partial<Record<SegmentId, number>> = {
  trunk: 42, neck: 55, head: 45,
  upperArmR: 172, upperArmL: 172,
  forearmR: 155, forearmL: 155,     // elbow flexion
  thighR: 115, thighL: 115,
  shankR: 150, shankL: 150,         // knee flexion
}

interface Props {
  activationsRef: MutableRefObject<LiveMuscleActivation[]>
  boneDirsRef:    MutableRefObject<BoneDirs>
  /** Optional posture prior (e.g. the selected exercise's expected posture). */
  postureRef?:    MutableRefObject<Posture | null>
  /** Optional live facing yaw (radians). v4 keeps the twin front-facing, so this
   *  is normally 0; still honoured if a caller sets it. */
  yawRef?:        MutableRefObject<number>
  /** Optional vertical JUMP offset (rig units, ≥0) — lifts the twin on a jump. */
  rootYRef?:      MutableRefObject<number>
  /** Optional body mass (kg) — tunes how weighty the jump/landing feels. */
  bodyMassRef?:   MutableRefObject<number>
  /** Optional ground-contact flag — when true the jump velocity is zeroed and
   *  the model is held firmly on the floor (crisp landings, no drift). */
  groundedRef?:   MutableRefObject<boolean>
  /** Optional per-family angular agility (De Leva inertia) — heavier limbs move
   *  with more momentum. */
  agilityRef?:    MutableRefObject<Partial<Record<SegmentFamily, number>>>
}

export function MuscleTwinModel({ activationsRef, boneDirsRef, postureRef, yawRef, rootYRef, bodyMassRef, groundedRef, agilityRef }: Props) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{ background: 'transparent' }}
      camera={{ position: [0, 0.15, 3.7], fov: 42, near: 0.1, far: 100 }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]}  intensity={0.8} />
      <directionalLight position={[-3, 2, 3]} intensity={0.4} color="#a5f3fc" />
      <Ground />
      <Suspense fallback={null}>
        <Rig activationsRef={activationsRef} boneDirsRef={boneDirsRef} postureRef={postureRef}
             yawRef={yawRef} rootYRef={rootYRef} bodyMassRef={bodyMassRef}
             groundedRef={groundedRef} agilityRef={agilityRef} />
      </Suspense>
    </Canvas>
  )
}

/** Solid soil-coloured floor so the user can see the ground / grounding. */
function Ground() {
  return (
    <group position={[0, GROUND_Y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.8, 56]} />
        <meshStandardMaterial color="#5b4a37" roughness={1} metalness={0} />
      </mesh>
      {/* faint contact ring for depth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.95, 1.0, 48]} />
        <meshBasicMaterial color="#3f3328" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)
function postureToQuat(posture: Posture | null | undefined, out: THREE.Quaternion): THREE.Quaternion {
  switch (posture) {
    case 'supine': return out.setFromAxisAngle(AXIS_X, -Math.PI / 2)   // lie on back
    case 'prone':  return out.setFromAxisAngle(AXIS_X,  Math.PI / 2)   // lie face down
    case 'side':   return out.setFromAxisAngle(AXIS_Z,  Math.PI / 2)   // lie on side
    default:       return out.identity()                              // standing / seated
  }
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

function Rig({ activationsRef, boneDirsRef, postureRef, yawRef, rootYRef, bodyMassRef, groundedRef, agilityRef }: Props) {
  const { scene } = useGLTF(MODEL_PATH, true, true) as any
  const rig = useMemo<RigData>(() => buildRig(scene), [scene])

  const worldQuat  = useRef<Record<string, THREE.Quaternion>>({})  // achieved world per segment
  const desiredW   = useRef<Record<string, THREE.Quaternion>>({})  // desired world per segment
  const tmpTarget  = useRef(new THREE.Vector3())
  const tmpLocal   = useRef(new THREE.Quaternion())
  const tmpPosture = useRef(new THREE.Quaternion())
  const tmpYaw     = useRef(new THREE.Quaternion())
  const tmpOuter   = useRef(new THREE.Quaternion())
  const IDENT      = useRef(new THREE.Quaternion())
  const box        = useRef(new THREE.Box3())
  const groundReady = useRef(false)
  const jumpVel    = useRef(0)
  const prevGrounded = useRef(true)

  // Lazily init persistent quaternions.
  for (const seg of SEGMENT_ORDER) {
    if (!worldQuat.current[seg]) worldQuat.current[seg] = new THREE.Quaternion()
    if (!desiredW.current[seg])  desiredW.current[seg]  = new THREE.Quaternion()
  }

  useFrame((state, delta) => {
    const dirs = boneDirsRef.current || {}
    const t = state.clock.elapsedTime
    const { right, up, ant } = rig.axes

    // ── Global orientation: facing yaw ∘ posture tilt (gravity awareness) ──────
    tmpYaw.current.setFromAxisAngle(AXIS_Y, yawRef?.current ?? 0)
    postureToQuat(postureRef?.current, tmpPosture.current)
    tmpOuter.current.copy(tmpPosture.current).multiply(tmpYaw.current)
    rig.outer.quaternion.slerp(tmpOuter.current, 0.15)

    // ── 1. Each segment's DESIRED world orientation from its own pose dir ──────
    for (const seg of SEGMENT_ORDER) {
      const neutral = rig.neutral[seg]
      const d = dirs[seg]
      if (!neutral) continue
      if (seg === 'pelvis') { desiredW.current[seg].identity(); continue }
      if (!d) continue                         // no fresh dir → keep last desired
      tmpTarget.current.set(0, 0, 0)
        .addScaledVector(right, d.x).addScaledVector(up, d.y).addScaledVector(ant, d.z)
      if (tmpTarget.current.lengthSq() > 1e-6) {
        tmpTarget.current.normalize()
        desiredW.current[seg].setFromUnitVectors(neutral, tmpTarget.current)
      }
    }

    // ── 2. Top-down: desired world → local (relative to parent's ACHIEVED world),
    //       clamp the joint, slew-limit, then accumulate the achieved world so
    //       children hang off where the parent actually is (stays connected). ──
    for (const seg of SEGMENT_ORDER) {
      const group = rig.groups[seg]
      if (!group) continue
      const parent = SEGMENT_PARENT[seg]
      const parentWQ = parent ? worldQuat.current[parent] : IDENT.current

      tmpLocal.current.copy(parentWQ).invert().multiply(desiredW.current[seg])
      clampQuat(tmpLocal.current, MAX_ANGLE[seg] ?? 160, IDENT.current)
      // Inertia/momentum: heavier limbs (low agility) track a touch slower.
      const fam = familyOf(seg)
      const ag = fam ? (agilityRef?.current?.[fam] ?? 1) : 1
      slewQuat(group.quaternion, tmpLocal.current, MAX_STEP_DEG * ag, Math.min(0.5, SLERP * ag))
      // achieved world = parentWorld ∘ achievedLocal
      worldQuat.current[seg].copy(parentWQ).multiply(group.quaternion)
    }

    // ── 3. Ground the model + apply the jump offset (mass-tuned, no overshoot) ─
    rig.outer.updateMatrixWorld(true)
    box.current.setFromObject(rig.outer)
    if (isFinite(box.current.min.y)) {
      const intrinsicFootY = box.current.min.y - rig.outer.position.y    // foot height sans offset
      const jump = (rootYRef?.current ?? 0) * JUMP_WORLD
      const targetY = (GROUND_Y - intrinsicFootY) + jump
      const grounded = groundedRef?.current ?? true
      // The instant the feet make contact, kill the vertical momentum so the
      // model lands exactly when the user does (no floaty overshoot or drift).
      if (grounded && !prevGrounded.current) jumpVel.current = 0
      prevGrounded.current = grounded
      if (!groundReady.current) { rig.outer.position.y = targetY; groundReady.current = true }
      else {
        // Critically-damped spring → weighty, never balloons. Heavier bodies are
        // stiffer (less float, firmer landing); planted feet stiffen further so
        // the model sits solidly on the floor.
        const heavy = heavinessFactor(bodyMassRef?.current ?? DEFAULT_WEIGHT_KG)
        const stiffness = (grounded ? 150 : 90) * heavy
        const damping = 2 * Math.sqrt(stiffness)        // ζ = 1 (no overshoot)
        const dt = Math.min(0.05, Math.max(1e-3, delta))
        const accel = stiffness * (targetY - rig.outer.position.y) - damping * jumpVel.current
        jumpVel.current += accel * dt
        rig.outer.position.y += jumpVel.current * dt
      }
    }

    // ── 4. Activation → colour. ───────────────────────────────────────────────
    const acts = activationsRef.current || []
    for (const md of rig.meshes) {
      let level = BASELINE
      for (const a of acts) {
        if (actStem(a.muscleId) !== md.stem) continue
        const raw = a.region.startsWith('left') ? 'L' : a.region.startsWith('right') ? 'R' : 'C'
        const aSide = raw === 'C' ? 'C' : MIRROR ? (raw === 'L' ? 'R' : 'L') : raw
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

/**
 * Move `current` toward `target` by at most `maxStepDeg` this frame, otherwise
 * by the slerp fraction `frac`. The hard cap stops a single noisy pose frame
 * from teleporting a joint and flinging the limb off the body.
 */
const _slewTo = new THREE.Quaternion()
function slewQuat(current: THREE.Quaternion, target: THREE.Quaternion, maxStepDeg: number, frac: number): void {
  _slewTo.copy(current).invert().multiply(target)               // delta current→target
  const angle = 2 * Math.acos(Math.min(1, Math.abs(_slewTo.w))) // 0..π
  const maxStep = (maxStepDeg * Math.PI) / 180
  const tFrac = angle > 1e-6 ? Math.min(frac, maxStep / angle) : frac
  current.slerp(target, tFrac)
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
    if (o.geometry && !o.geometry.boundingBox) o.geometry.computeBoundingBox()
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
  const boxFrag = (frag: string) => {
    const b = new THREE.Box3(); let any = false
    cloned.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh && o.name.toUpperCase().includes(frag)) { b.expandByObject(o); any = true }
    })
    return any ? b : null
  }
  const topC = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2)
  const botC = (b: THREE.Box3) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2)
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  const bUAr = box(['upperArmR']), bUAl = box(['upperArmL'])
  const bFAr = box(['forearmR']),  bFAl = box(['forearmL'])
  const bThR = box(['thighR']),    bThL = box(['thighL'])
  const bShR = box(['shankR']),    bShL = box(['shankL'])
  const bTrunk = box(['trunk']),   bPelv = box(['pelvis'])
  const bNeck = box(['neck']),     bHead = box(['head'])

  // Limb joints pivot at the TOP-CENTRE of the limb's own muscle box (right at
  // the socket), NOT a lateral/medial edge — so a raised limb rotates about the
  // joint and stays attached, and the legs don't swing across the midline.
  const shoulderR = bUAr ? topC(bUAr) : V(-0.12, 1.35, 0)
  const shoulderL = bUAl ? topC(bUAl) : V(0.12, 1.35, 0)
  const elbowR = bUAr ? botC(bUAr) : V(-0.2, 0.95, 0)
  const elbowL = bUAl ? botC(bUAl) : V(0.2, 0.95, 0)
  // Forearm pivots EXACTLY at the elbow (the upper arm's distal point) so it is
  // welded to the upper arm and can't float off; it ends at the wrist.
  const wristR = bFAr ? botC(bFAr) : V(-0.2, 0.6, 0)
  const wristL = bFAl ? botC(bFAl) : V(0.2, 0.6, 0)
  const hipR = bThR ? topC(bThR) : V(-0.1, 0.9, 0)
  const hipL = bThL ? topC(bThL) : V(0.1, 0.9, 0)
  const kneeR = bThR ? botC(bThR) : V(-0.1, 0.5, 0)
  const kneeL = bThL ? botC(bThL) : V(0.1, 0.5, 0)
  const ankleR = bShR ? botC(bShR) : V(-0.1, 0.1, 0)
  const ankleL = bShL ? botC(bShL) : V(0.1, 0.1, 0)
  const pelvisC = hipR.clone().add(hipL).multiplyScalar(0.5)
  const neckBase = bTrunk ? topC(bTrunk) : V(0, 1.4, 0)
  const lumbar   = pelvisC.clone().lerp(neckBase, 0.12)
  const headBase = bNeck ? topC(bNeck) : V(0, 1.55, 0)
  const headTop  = bHead ? topC(bHead) : V(0, 1.75, 0)

  const pivots: Record<SegmentId, THREE.Vector3> = {
    pelvis: pelvisC, trunk: lumbar, neck: neckBase, head: headBase,
    upperArmR: shoulderR, upperArmL: shoulderL,
    forearmR: elbowR, forearmL: elbowL,
    thighR: hipR, shankR: kneeR, thighL: hipL, shankL: kneeL,
  }
  const distal: Record<SegmentId, THREE.Vector3> = {
    pelvis: neckBase, trunk: neckBase, neck: headBase, head: headTop,
    upperArmR: elbowR, upperArmL: elbowL,
    forearmR: wristR, forearmL: wristL,
    thighR: kneeR, shankR: ankleR, thighL: kneeL, shankL: ankleL,
  }

  // ── Anatomical frame from GEOMETRY (no sign guessing) ───────────────────────
  // up   = pelvis → neck ; ant = erector-spinae(back) → pectoralis(front) ;
  // right = up × ant, sign-checked toward the model's R arm.
  const up = neckBase.clone().sub(pelvisC); if (up.lengthSq() < 1e-6) up.set(0, 1, 0); up.normalize()
  const ant = new THREE.Vector3(0, 0, 1)
  const pecBox = boxFrag('PECTORALIS'), erBox = boxFrag('ERECTOR_SPINAE')
  if (pecBox && erBox) {
    ant.copy(pecBox.getCenter(new THREE.Vector3())).sub(erBox.getCenter(new THREE.Vector3()))
    ant.addScaledVector(up, -ant.dot(up))
    if (ant.lengthSq() < 1e-6) ant.set(0, 0, 1)
    ant.normalize()
  }
  const right = new THREE.Vector3().crossVectors(up, ant).normalize()
  if (right.dot(shoulderR.clone().sub(shoulderL)) < 0) right.multiplyScalar(-1)

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

  // Procedural forearm: the GLB only has the thin brachioradialis sliver, which
  // read as "detached" at the elbow. We add a tapered muscle body spanning
  // elbow→wrist INSIDE the forearm group, so the forearm looks solid and stays
  // welded to the upper arm while bending. It is painted with the forearm
  // (brachioradialis) activation like any other mesh.
  const addForearm = (seg: SegmentId, elbowW: THREE.Vector3, wristW: THREE.Vector3, side: 'L' | 'R') => {
    const g = groups[seg]; if (!g) return
    const a = g.worldToLocal(elbowW.clone())
    const b = g.worldToLocal(wristW.clone())
    const dir = b.clone().sub(a); const len = dir.length()
    if (len < 1e-4) return
    const r = Math.max(0.02, len * 0.13)
    const geo = new THREE.CylinderGeometry(r * 0.7, r, len * 0.94, 14)
    geo.computeBoundingBox()
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6b5b4a'), roughness: 0.6, metalness: 0.0,
      emissive: new THREE.Color('#000000'), emissiveIntensity: 0.15,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    g.add(mesh)
    meshes.push({ mat, stem: 'BRACHIORADIALIS', side })
  }
  addForearm('forearmR', elbowR, wristR, 'R')
  addForearm('forearmL', elbowL, wristL, 'L')
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
