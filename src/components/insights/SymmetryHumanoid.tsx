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
const JOINTS: Array<{ region: SymmetryRegion; pos: [number, number, number] }> = [
  { region: 'neck',            pos: [ 0.00,  0.93, 0.10] },
  { region: 'trunk',           pos: [ 0.00,  0.20, 0.12] },
  { region: 'left_shoulder',   pos: [-0.36,  0.70, 0.06] },
  { region: 'right_shoulder',  pos: [ 0.36,  0.70, 0.06] },
  { region: 'left_elbow',      pos: [-0.50,  0.18, 0.04] },
  { region: 'right_elbow',     pos: [ 0.50,  0.18, 0.04] },
  { region: 'left_hip',        pos: [-0.18, -0.18, 0.06] },
  { region: 'right_hip',       pos: [ 0.18, -0.18, 0.06] },
  { region: 'left_knee',       pos: [-0.20, -0.78, 0.06] },
  { region: 'right_knee',      pos: [ 0.20, -0.78, 0.06] },
  { region: 'left_ankle',      pos: [-0.22, -1.30, 0.10] },
  { region: 'right_ankle',     pos: [ 0.22, -1.30, 0.10] },
]

useGLTF.preload(BODY_PATH, true, true)

export function SymmetryHumanoid({ regionColors }: Props) {
  return (
    <div className="w-full h-[440px] rounded-md bg-gradient-to-b from-slate-900 to-black ring-1 ring-slate-800 overflow-hidden">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        camera={{ position: [0, 0, 4.0], fov: 38, near: 0.1, far: 100 }}
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
    c.position.sub(centre)
    c.scale.setScalar(1.4)
    c.position.multiplyScalar(1.4)
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
        <sphereGeometry args={[0.085, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthTest={false} />
      </mesh>
      <mesh renderOrder={999}>
        <sphereGeometry args={[0.055, 24, 24]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  )
}
