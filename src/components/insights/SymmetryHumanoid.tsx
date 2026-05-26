/**
 * SymmetryHumanoid.tsx
 *
 * 3D body view for the Symmetry Report.  Re-uses the same body GLB the
 * main atlas uses as a faint translucent shell, with colored sphere
 * markers floating at each joint - red for risk, amber for watch, green
 * for balanced.  No muscle meshes; we only need the body silhouette here
 * because the symmetry data is per-joint.
 */

import React, { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { SymmetryRegion } from '../../lib/insights/symmetry'

const BODY_PATH = `${import.meta.env.BASE_URL}models/male-normal-opt.glb`

interface Props {
  /** Map from region -> hex color (computed by the symmetry engine). */
  regionColors: Partial<Record<SymmetryRegion, string>>
}

// Hard-coded joint positions in the body's centred local space. After the
// Body component centres the GLB on origin and scales it 1.4x, the body
// extends roughly y -1.4 ... +1.4 (head to feet) and x +-0.6 (arms by sides).
// Positions in world units AFTER the body is centred + scaled 0.95x. The
// scaled body spans roughly y -0.95 .. +0.95 (head at top, feet at bottom).
// Joint positions in the body's normalised coordinate space.  Body height
// is 2.0 (feet at y=-1.0, head crown at y=+1.0).  Anatomical fractions
// here are based on standard human proportions (Vitruvian-ish):
//   crown=1.00  neck=0.78  shoulder=0.72  hip=0.06  knee=-0.45  ankle=-0.93
// Width: shoulders ~0.20, hips ~0.12, knees ~0.10, ankles ~0.10 (half-width).
const JOINTS: Array<{ region: SymmetryRegion; pos: [number, number, number] }> = [
  { region: 'neck',            pos: [ 0.00,  0.74, 0.05] },
  { region: 'trunk',           pos: [ 0.00,  0.28, 0.10] },
  { region: 'left_shoulder',   pos: [-0.22,  0.62, 0.06] },
  { region: 'right_shoulder',  pos: [ 0.22,  0.62, 0.06] },
  { region: 'left_elbow',      pos: [-0.30,  0.26, 0.06] },
  { region: 'right_elbow',     pos: [ 0.30,  0.26, 0.06] },
  { region: 'left_hip',        pos: [-0.11,  0.02, 0.06] },
  { region: 'right_hip',       pos: [ 0.11,  0.02, 0.06] },
  { region: 'left_knee',       pos: [-0.09, -0.46, 0.06] },
  { region: 'right_knee',      pos: [ 0.09, -0.46, 0.06] },
  { region: 'left_ankle',      pos: [-0.09, -0.88, 0.06] },
  { region: 'right_ankle',     pos: [ 0.09, -0.88, 0.06] },
]

useGLTF.preload(BODY_PATH, true, true)

export function SymmetryHumanoid({ regionColors }: Props) {
  return (
    <div className="w-full h-[440px] rounded-md bg-gradient-to-b from-slate-900 to-black ring-1 ring-slate-800 overflow-hidden">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        camera={{ position: [0, 0, 4.6], fov: 30, near: 0.1, far: 100 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={0.7} />
        <directionalLight position={[-3, 2, 3]} intensity={0.3} color="#a5f3fc" />
        <Suspense fallback={null}>
          <Body />
          {JOINTS.map((j) => (
            <JointMarker
              key={j.region}
              position={j.pos}
              color={regionColors[j.region] ?? '#475569'}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  )
}

// Body is normalised to a known fixed height (2.0 world units, feet at
// y=-1.0, head at y=+1.0) so the hardcoded JOINTS positions below
// reliably land on the right anatomical landmark regardless of what
// coordinate system the source GLB uses.
const BODY_TARGET_HEIGHT = 2.0
const BODY_FEET_Y        = -1.0     // bottom of bbox lands here

function Body() {
  const { scene } = useGLTF(BODY_PATH, true, true) as any
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    // First pass: compute the raw bbox + size.
    const box1   = new THREE.Box3().setFromObject(c)
    const size   = box1.getSize(new THREE.Vector3())
    // Scale so the body's HEIGHT (Y extent) becomes BODY_TARGET_HEIGHT.
    const s = size.y > 0 ? BODY_TARGET_HEIGHT / size.y : 1
    c.scale.setScalar(s)
    // Recompute bbox after scaling.
    const box2   = new THREE.Box3().setFromObject(c)
    const centre = box2.getCenter(new THREE.Vector3())
    const minY   = box2.min.y
    // Place horizontal centre at x=0 and z=0, and shift so the FEET sit
    // exactly at y = BODY_FEET_Y.  After this transform, joints can be
    // placed at predictable Y values relative to the body.
    c.position.x -= centre.x
    c.position.z -= centre.z
    c.position.y += BODY_FEET_Y - minY
    const skin = new THREE.MeshStandardMaterial({
      color:        '#d9b08c',
      roughness:    0.7,
      metalness:    0.0,
      transparent:  true,
      opacity:      0.16,
      depthWrite:   false,
      side:         THREE.FrontSide,
    })
    c.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = skin
        obj.renderOrder = 0
      }
    })
    return c
  }, [scene])
  return <primitive object={cloned} />
}

function JointMarker({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh renderOrder={998}>
        <sphereGeometry args={[0.075, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthTest={false} />
      </mesh>
      <mesh renderOrder={999}>
        <sphereGeometry args={[0.05, 24, 24]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  )
}
