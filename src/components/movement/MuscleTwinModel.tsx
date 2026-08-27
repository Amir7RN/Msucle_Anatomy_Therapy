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
import { useGLTF, OrbitControls } from '@react-three/drei'
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
// Floor activation applied to the exercise's target muscle so it always reads
// as "this is the one you're working", even with no live pose yet.
const TARGET_GLOW = 0.5
// The twin is a MIRROR (the user faces it): the user's left side drives the
// model's right and vice-versa. poseRig already mirrors the MOTION; here we
// mirror the ACTIVATION side too so the limb that moves is the limb that lights
// up. Set false for a "facing-partner" (same-anatomical-side) view.
const MIRROR = true
// Per-frame ceiling on how far a segment may rotate (degrees) — a hard slew
// limit on top of the slerp so a single bad pose frame can't fling a limb.
const MAX_STEP_DEG = 13

// Base (unactivated) muscle tone. Warm tan so an idle twin still reads as a
// full anatomical body against the dark panel.
const BASE_HEX = '#7d6550'

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

// The elbow and knee are HINGES, not ball joints: they may only flex about the
// mediolateral axis relative to their parent. Left as free cones (the old
// behaviour) the forearm/shank could swing sideways and twist off a noisy wrist/
// ankle landmark — the "lower arm detached, rotating in space" bug. For these
// segments we strip every off-hinge component so the child stays rigidly anchored
// to the parent's distal pivot and can only bend like a real elbow/knee.
const HINGE_SEGMENTS = new Set<SegmentId>(['forearmR', 'forearmL', 'shankR', 'shankL'])

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
  /** Optional target muscle for the current exercise (atlas id, e.g.
   *  "MUSC_DELTOID_R"). It gets a steady pre-glow so the user can see WHICH
   *  muscle they are working before the pose engine has anything to report. */
  targetMuscleId?: string
  /** Opt-in user camera controls (drag-rotate / pinch-zoom). OFF by default so
   *  the live twin keeps its fixed mirror camera; static views (e.g. the
   *  health-data training-balance map) turn it on. Same OrbitControls setup as
   *  the gym MuscleMap3D. */
  orbit?:         boolean
}

export function MuscleTwinModel({ activationsRef, boneDirsRef, postureRef, yawRef, rootYRef, bodyMassRef, groundedRef, agilityRef, targetMuscleId, orbit }: Props) {
  // Live world-space bounds of the posed twin, published by <Rig> and consumed
  // by <FitCamera> so the WHOLE body always stays inside the panel.
  const fitBoxRef = useRef(new THREE.Box3())
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{ background: 'radial-gradient(circle at 50% 30%, #131a2e 0%, #0a0f1e 55%, #05070d 100%)' }}
      camera={{ position: [0, 0.15, 3.7], fov: 42, near: 0.1, far: 100 }}
    >
      {/* Rich omnidirectional lighting — same as MuscleMap3D so muscles are vivid from every angle */}
      <hemisphereLight args={['#ffe9cf', '#241a12', 0.95]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 4]}  intensity={0.85} color="#fff3e3" />
      <directionalLight position={[-4, 2.5, 2]} intensity={0.5} color="#bfe9ff" />
      <directionalLight position={[0, 3, -6]} intensity={0.5} />
      <directionalLight position={[0, -4, 1]} intensity={0.25} />
      <Ground />
      <Suspense fallback={null}>
        <Rig activationsRef={activationsRef} boneDirsRef={boneDirsRef} postureRef={postureRef}
             yawRef={yawRef} rootYRef={rootYRef} bodyMassRef={bodyMassRef}
             groundedRef={groundedRef} agilityRef={agilityRef} targetMuscleId={targetMuscleId}
             fitBoxRef={fitBoxRef} />
      </Suspense>
      {/* Fixed-camera views auto-frame the twin; orbit views are user-driven. */}
      {!orbit && <FitCamera boxRef={fitBoxRef} />}
      {orbit && (
        <OrbitControls enablePan={false} enableZoom minDistance={2.2} maxDistance={6}
          minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.92}
          enableDamping dampingFactor={0.08} />
      )}
    </Canvas>
  )
}

/**
 * Keeps the ENTIRE posed twin inside the viewport.
 *
 * The panel this renders into is narrow (≈320 px) and its height varies, so a
 * hard-coded camera distance cropped the body — a lying/wide pose or a tall
 * panel would leave only a couple of limbs on screen. Each frame we take the
 * rig's live world bounds and solve the camera distance that fits them in BOTH
 * axes (vertical fov and the aspect-derived horizontal fov), then ease toward
 * it: out quickly (never clip the body), back in gently (no zoom jitter).
 */
const FIT_MARGIN = 1.14
const FIT_MIN_DIST = 2.4
const FIT_MAX_DIST = 9
function FitCamera({ boxRef }: { boxRef: MutableRefObject<THREE.Box3> }) {
  const dist   = useRef(3.7)
  const eyeY   = useRef(0.15)
  const eyeX   = useRef(0)
  const size   = useRef(new THREE.Vector3())
  const centre = useRef(new THREE.Vector3())
  useFrame(({ camera, size: vp }, delta) => {
    const box = boxRef.current
    if (box.isEmpty() || !isFinite(box.min.y) || !isFinite(box.max.y)) return
    const cam = camera as THREE.PerspectiveCamera
    box.getSize(size.current)
    box.getCenter(centre.current)
    const aspect = Math.max(0.25, vp.width / Math.max(1, vp.height))
    const vFov = (cam.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const halfH = (Math.max(size.current.y, 0.1) / 2) * FIT_MARGIN
    const halfW = (Math.max(size.current.x, 0.1) / 2) * FIT_MARGIN
    const need = Math.min(FIT_MAX_DIST, Math.max(FIT_MIN_DIST,
      Math.max(halfH / Math.tan(vFov / 2), halfW / Math.tan(hFov / 2)) + size.current.z / 2 + 0.2))
    const dt = Math.min(0.25, Math.max(1e-3, delta))
    // Exponential easing on TIME, not on frames: the panel canvas shares the
    // GPU with the camera feed, MediaPipe and the reference video, so it can
    // run far below 60 fps - a per-frame fraction would crawl there.
    const k = 1 - Math.exp(-(need > dist.current ? 7 : 1.4) * dt)
    const kc = 1 - Math.exp(-3 * dt)
    dist.current += (need - dist.current) * k
    // Track the body's centre in BOTH axes. A lying/rotated twin swings its
    // centre sideways; without this it slides out of the side of the panel.
    eyeX.current += (centre.current.x - eyeX.current) * kc
    eyeY.current += (centre.current.y - eyeY.current) * kc
    cam.position.set(eyeX.current, eyeY.current, dist.current)
    cam.lookAt(eyeX.current, eyeY.current, 0)
    cam.updateProjectionMatrix()
  })
  return null
}

/** Solid soil-coloured floor so the user can see the ground / grounding. */
function Ground() {
  return (
    <group position={[0, GROUND_Y, 0]}>
      {/* Smaller and darker than the body tone: in the narrow exercise panel a
          wide, warm floor filled a third of the frame and competed with the
          muscles for attention. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 56]} />
        <meshStandardMaterial color="#3d3227" roughness={1} metalness={0} />
      </mesh>
      {/* faint contact ring for depth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.95, 1.0, 48]} />
        <meshBasicMaterial color="#2c241b" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)
const _spin = new THREE.Quaternion()
function postureToQuat(posture: Posture | null | undefined, out: THREE.Quaternion): THREE.Quaternion {
  // Floor postures lay the body down IN THE SCREEN PLANE (roll about Z), so the
  // whole silhouette stays visible to the fixed front camera — rotating about X
  // pointed the body at the lens and reduced it to an edge-on sliver. Which
  // SURFACE faces the viewer is then chosen with a yaw spin, so supine (front),
  // prone (back) and side (lateral) stay anatomically distinguishable.
  switch (posture) {
    case 'supine':
      return out.setFromAxisAngle(AXIS_Z, Math.PI / 2)
    case 'prone':
      return out.setFromAxisAngle(AXIS_Z, -Math.PI / 2)
        .multiply(_spin.setFromAxisAngle(AXIS_Y, Math.PI))          // show the back
    case 'side':
      return out.setFromAxisAngle(AXIS_Z, Math.PI / 2)
        .multiply(_spin.setFromAxisAngle(AXIS_Y, Math.PI / 2))      // lateral view
    default:
      return out.identity()                                          // standing / seated
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

type RigProps = Props & { fitBoxRef?: MutableRefObject<THREE.Box3> }

function Rig({ activationsRef, boneDirsRef, postureRef, yawRef, rootYRef, bodyMassRef, groundedRef, agilityRef, targetMuscleId, fitBoxRef }: RigProps) {
  const { scene } = useGLTF(MODEL_PATH, true, true) as any
  const rig = useMemo<RigData>(() => buildRig(scene), [scene])
  // Target muscle -> mesh stem + (mirrored) side, resolved once per exercise.
  const target = useMemo(() => {
    if (!targetMuscleId) return null
    const raw = meshSide(targetMuscleId)
    return {
      stem: actStem(targetMuscleId),
      side: raw === 'C' ? 'C' : MIRROR ? (raw === 'L' ? 'R' : 'L') : raw,
    } as { stem: string; side: 'L' | 'R' | 'C' }
  }, [targetMuscleId])

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
    // How many 60 fps frames' worth of time this tick covers. Every easing and
    // slew below was tuned per-frame; scaling by this keeps the twin's response
    // identical at 60 fps and stops it crawling (or freezing mid-rotation) when
    // the panel canvas is starved by the camera + pose pipeline.
    const fr = Math.min(4, Math.max(0.2, delta * 60))

    // ── Global orientation: facing yaw ∘ posture tilt (gravity awareness) ──────
    tmpYaw.current.setFromAxisAngle(AXIS_Y, yawRef?.current ?? 0)
    postureToQuat(postureRef?.current, tmpPosture.current)
    tmpOuter.current.copy(tmpPosture.current).multiply(tmpYaw.current)
    rig.outer.quaternion.slerp(tmpOuter.current, Math.min(0.9, 0.15 * fr))

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
      if (HINGE_SEGMENTS.has(seg)) {
        // Hinge: keep only rotation about the mediolateral axis (constant in the
        // parent-local frame), discard sideways swing + axial twist, clamp flexion.
        hingeConstrain(tmpLocal.current, right, MAX_ANGLE[seg] ?? 150, IDENT.current)
      } else {
        clampQuat(tmpLocal.current, MAX_ANGLE[seg] ?? 160, IDENT.current)
      }
      // Inertia/momentum: heavier limbs (low agility) track a touch slower.
      const fam = familyOf(seg)
      const ag = fam ? (agilityRef?.current?.[fam] ?? 1) : 1
      slewQuat(group.quaternion, tmpLocal.current, MAX_STEP_DEG * ag * fr, Math.min(0.85, SLERP * ag * fr))
      // achieved world = parentWorld ∘ achievedLocal
      worldQuat.current[seg].copy(parentWQ).multiply(group.quaternion)
    }

    // ── 3. Ground the model + apply the jump offset (mass-tuned, no overshoot) ─
    rig.outer.updateMatrixWorld(true)
    box.current.setFromObject(rig.outer)
    const prevOuterY = rig.outer.position.y
    if (isFinite(box.current.min.y)) {
      const intrinsicFootY = box.current.min.y - rig.outer.position.y    // foot height sans offset
      const jump = (rootYRef?.current ?? 0) * JUMP_WORLD
      // No display fudge here: <FitCamera> frames whatever the body actually
      // does, so floor poses stay fully visible without being shoved upward.
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
      if (fitBoxRef) {
        // Same bounds, shifted by however far the grounding moved the rig this
        // frame — cheaper and jitter-free vs. a second setFromObject() pass.
        fitBoxRef.current.copy(box.current)
        fitBoxRef.current.min.y += rig.outer.position.y - prevOuterY
        fitBoxRef.current.max.y += rig.outer.position.y - prevOuterY
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
      // Pre-glow the exercise's target muscle so it is identifiable even before
      // the pose engine reports anything; live activation overrides it upward.
      if (target && target.stem === md.stem
          && (target.side === 'C' || md.side === 'C' || target.side === md.side)) {
        level = Math.max(level, TARGET_GLOW)
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
 * Constrain a local rotation to a pure HINGE about `axis` (swing-twist
 * decomposition): project the rotation onto the axis to keep only the flexion
 * component, drop the off-axis swing + twist, then clamp the flexion angle to
 * ±maxDeg. This is what makes the elbow/knee behave like real hinges — the child
 * segment can bend but never swings sideways or twists off its parent pivot.
 */
const _twist = new THREE.Quaternion()
function hingeConstrain(q: THREE.Quaternion, axis: THREE.Vector3, maxDeg: number, ident: THREE.Quaternion): void {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z   // (rotation vector)·axis
  _twist.set(axis.x * d, axis.y * d, axis.z * d, q.w)
  if (_twist.lengthSq() < 1e-8) { q.copy(ident); return }  // rotation ⟂ hinge → no flexion
  _twist.normalize()
  const angle = 2 * Math.acos(Math.min(1, Math.abs(_twist.w)))
  const max = (maxDeg * Math.PI) / 180
  if (angle > max && angle > 1e-4) _twist.slerpQuaternions(ident, _twist.clone(), max / angle)
  q.copy(_twist)
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

/**
 * Split one mesh into a proximal (above `worldY`) and distal (below) mesh by
 * triangle centroid. Vertex positions/normals are baked into world space so the
 * pieces render exactly where the original did, then get identity transforms —
 * `Group.attach` later re-localises them onto their bone. Either piece may be
 * null if all triangles fall on one side of the cut.
 */
function splitMeshAtWorldY(mesh: THREE.Mesh, worldY: number): { proximal: THREE.Mesh | null; distal: THREE.Mesh | null } {
  mesh.updateWorldMatrix(true, false)
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  const posAttr = src.getAttribute('position') as THREE.BufferAttribute
  const norAttr = src.getAttribute('normal') as THREE.BufferAttribute | undefined
  const uvAttr  = src.getAttribute('uv') as THREE.BufferAttribute | undefined
  const mw = mesh.matrixWorld
  const nm = new THREE.Matrix3().getNormalMatrix(mw)

  const proxP: number[] = [], proxN: number[] = [], proxU: number[] = []
  const distP: number[] = [], distN: number[] = [], distU: number[] = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const triCount = Math.floor(posAttr.count / 3)
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3, i1 = t * 3 + 1, i2 = t * 3 + 2
    a.fromBufferAttribute(posAttr, i0).applyMatrix4(mw)
    b.fromBufferAttribute(posAttr, i1).applyMatrix4(mw)
    c.fromBufferAttribute(posAttr, i2).applyMatrix4(mw)
    const above = (a.y + b.y + c.y) / 3 >= worldY
    const P = above ? proxP : distP, N = above ? proxN : distN, U = above ? proxU : distU
    P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    if (norAttr) {
      for (const i of [i0, i1, i2]) {
        n.fromBufferAttribute(norAttr, i).applyMatrix3(nm).normalize()
        N.push(n.x, n.y, n.z)
      }
    }
    if (uvAttr) for (const i of [i0, i1, i2]) U.push(uvAttr.getX(i), uvAttr.getY(i))
  }

  const build = (P: number[], N: number[], U: number[]): THREE.Mesh | null => {
    if (P.length < 9) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    if (N.length === P.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
    else g.computeVertexNormals()
    if (U.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    g.computeBoundingBox(); g.computeBoundingSphere()
    const nMesh = new THREE.Mesh(g, (mesh.material as THREE.MeshStandardMaterial).clone())
    nMesh.name = mesh.name
    return nMesh
  }
  return { proximal: build(proxP, proxN, proxU), distal: build(distP, distN, distU) }
}

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
    // Forearm: render the GLB's OWN forearm meshes (restored). They're segmented
    // to forearmL/R and attached to the forearm group below, so they pivot at the
    // elbow and bend with the arm — the muscular lower arm, no procedural cylinder.
    // The GLB primitives ship with NO normal attribute at all, so three's loader
    // falls back to flat shading and (with the source winding) the model rendered
    // black — which is why it was previously switched to an unlit BasicMaterial.
    // That flattened every muscle into one featureless tan silhouette, so the
    // body read as a couple of shapeless blobs. Recomputing normals from the
    // winding order (exactly what MuscleMap3D does) makes a lit material work,
    // which is what gives each muscle belly its readable 3-D form.
    o.geometry = o.geometry.clone()
    o.geometry.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(BASE_HEX),
      roughness: 0.55, metalness: 0.05,
      emissive: new THREE.Color('#2a1f15'), emissiveIntensity: 0.32,
      side: THREE.DoubleSide,   // correct even where the source winding is flipped
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
  // ELBOW = 30 % DOWN the forearm's own meshes (not its proximal tip). The tip
  // sat too high — the visible bend happened above the real elbow. We split the
  // forearm into a proximal 0.3 stub (welded to the upper arm) and a distal 0.7
  // that actually bends; the hinge sits at the 0.3 seam between them.
  const FOREARM_SPLIT = 0.3
  const elbowR = bFAr ? topC(bFAr).lerp(botC(bFAr), FOREARM_SPLIT) : bUAr ? botC(bUAr) : V(-0.2, 0.95, 0)
  const elbowL = bFAl ? topC(bFAl).lerp(botC(bFAl), FOREARM_SPLIT) : bUAl ? botC(bUAl) : V(0.2, 0.95, 0)
  // Forearm pivots EXACTLY at the elbow (the upper arm's distal point) so it is
  // welded to the upper arm. The GLB has no hand/wrist mesh and only a short,
  // oddly-placed brachioradialis sliver, so deriving the wrist from a mesh box
  // produced the misaligned, detached-looking forearm in the user's render.
  // Instead we estimate the wrist as a clean anthropometric continuation of the
  // upper arm (forearm ≈ 0.85 × upper-arm length), so the rest forearm is
  // COLLINEAR with the upper arm and bends only at the elbow when the user's
  // wrist is actually tracked.
  const forearmTip = (shoulder: THREE.Vector3, elbow: THREE.Vector3): THREE.Vector3 => {
    const axis = elbow.clone().sub(shoulder)
    const len = axis.length()
    if (len < 1e-4) return elbow.clone().add(V(0, -0.28, 0))
    return elbow.clone().addScaledVector(axis.normalize(), len * 0.85)
  }
  const wristR = forearmTip(shoulderR, elbowR)
  const wristL = forearmTip(shoulderL, elbowL)
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

  // ── Forearm split (0.3 / 0.7) ───────────────────────────────────────────────
  // Cut each forearm mesh at the elbow seam (30 % down its length). The proximal
  // 30 % is re-parented onto the UPPER ARM so it stays welded and doesn't swing;
  // the distal 70 % becomes the forearm segment that hinges at the elbow. Without
  // this the whole one-piece forearm rotated about the seam and its top third
  // swung away from the arm.
  const splitPlan: Array<{ seg: SegmentId; up: SegmentId; box: THREE.Box3 | null; y: number }> = [
    { seg: 'forearmR', up: 'upperArmR', box: bFAr, y: elbowR.y },
    { seg: 'forearmL', up: 'upperArmL', box: bFAl, y: elbowL.y },
  ]
  for (const { seg, up: upSeg, box: fbox, y } of splitPlan) {
    if (!fbox) continue
    const originals = bySeg[seg] ?? []
    if (!originals.length) continue
    // Drop the original (whole) forearm entries from the colour list.
    const drop = new Set<THREE.Material>(originals.map((m) => m.material as THREE.Material))
    for (let i = meshes.length - 1; i >= 0; i--) if (drop.has(meshes[i].mat)) meshes.splice(i, 1)

    const distalMeshes: THREE.Mesh[] = []
    for (const m of originals) {
      const parts = splitMeshAtWorldY(m, y)
      m.removeFromParent()
      if (parts.proximal) {
        cloned.add(parts.proximal)
        ;(bySeg[upSeg] ??= []).push(parts.proximal)
        meshes.push({ mat: parts.proximal.material as THREE.MeshStandardMaterial, stem: meshStem(m.name), side: meshSide(m.name) })
      }
      if (parts.distal) {
        cloned.add(parts.distal)
        distalMeshes.push(parts.distal)
        meshes.push({ mat: parts.distal.material as THREE.MeshStandardMaterial, stem: meshStem(m.name), side: meshSide(m.name) })
      }
    }
    bySeg[seg] = distalMeshes
  }
  cloned.updateMatrixWorld(true)

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

  // (Procedural forearm cylinder removed — the GLB's own forearm meshes are
  // shown and rigged to the forearm group above, so the muscular lower arm is
  // back and still bends at the elbow.)
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

const C_BASE = new THREE.Color(BASE_HEX)
const C_MID  = new THREE.Color('#f59e0b')
const C_HOT  = new THREE.Color('#b91c1c')

function paint(mat: THREE.MeshStandardMaterial, level: number, time: number) {
  const t = Math.max(0, Math.min(1, (level - BASELINE) / (1 - BASELINE)))
  if (t < 0.5) mat.color.copy(C_BASE).lerp(C_MID, t / 0.5)
  else         mat.color.copy(C_MID).lerp(C_HOT, (t - 0.5) / 0.5)
  // Emissive carries the activation glow; the lit diffuse term keeps the muscle
  // shape readable, so an idle body is a full tan anatomy rather than a blob.
  mat.emissive.copy(mat.color)
  const pulse = 1 + 0.12 * t * Math.sin(time * 4)
  mat.emissiveIntensity = (0.32 + t * 1.15) * pulse
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
  // Atlas ids arrive as MUSC_DELTOID_R while the GLB meshes are Deltoid_R -
  // normalise both ends so exercise targets actually resolve to a mesh.
  if (s.startsWith('MUSC_')) s = s.slice(5)
  if (s.endsWith('_L') || s.endsWith('_R')) s = s.slice(0, -2)
  for (const suf of ['_ANTERIOR', '_LATERAL', '_POSTERIOR', '_UPPER', '_MIDDLE', '_LOWER']) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break }
  }
  return s
}
