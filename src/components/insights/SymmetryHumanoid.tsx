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
const JOINTS: Array<{ region: SymmetryRegion; pos: [number, number, number] }> = [
  { region: 'neck',            pos: [ 0.00,  0.63, 0.08] },
  { region: 'trunk',           pos: [ 0.00,  0.14, 0.10] },
  { region: 'left_shoulder',   pos: [-0.24,  0.48, 0.06] },
  { region: 'right_shoulder',  pos: [ 0.24,  0.48, 0.06] },
  { region: 'left_elbow',      pos: [-0.34,  0.12, 0.04] },
  { region: 'right_elbow',     pos: [ 0.34,  0.12, 0.04] },
  { region: 'left_hip',        pos: [-0.13, -0.12, 0.06] },
  { region: 'right_hip',       pos: [ 0.13, -0.12, 0.06] },
  { region: 'left_knee',       pos: [-0.14, -0.53, 0.06] },
  { region: 'right_knee',      pos: [ 0.14, -0.53, 0.06] },
  { region: 'left_ankle',      pos: [-0.15, -0.88, 0.08] },
  { region: 'right_ankle',     pos: [ 0.15, -0.88, 0.08] },
]

useGLTF.preload(BODY_PATH, true, true)

export function SymmetryHumanoid({ regionColors }: Props) {
  return (
    <div className="w-full h-[440px] rounded-md bg-gradient-to-b from-slate-900 to-black ring-1 ring-slate-800 overflow-hidden">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        camera={{ position: [0, 0, 5.6], fov: 32, near: 0.1, far: 100 }}
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

function Body() {
  const { scene } = useGLTF(BODY_PATH, true, true) as any
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const centre = box.getCenter(new THREE.Vector3())
    // Modest scale + bbox-centre so the whole body fits the 440px panel
    // height. Previously 1.4x overflowed the frame.
    c.position.sub(centre)
    c.scale.setScalar(0.95)
    c.position.multiplyScalar(0.95)
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
        <sphereGeometry args={[0.06, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} depthTest={false} />
      </mesh>
      <mesh renderOrder={999}>
        <sphereGeometry args={[0.04, 24, 24]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  )
}
