import React, { useMemo } from 'react'
import * as THREE from 'three'

const MEDICAL_GREY = '#E0E0E0'
const BODY_OPACITY = 0.30
const LIMB_OPACITY = 0.24

function makeMannequinMaterial(opacity: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: MEDICAL_GREY,
    roughness: 0.70,
    metalness: 0.10,
    transparent: true,
    opacity,
    side: THREE.FrontSide,
    depthWrite: false,
  })

  // Keep body shell behind muscle depth priority.
  mat.polygonOffset = true
  mat.polygonOffsetFactor = 4
  mat.polygonOffsetUnits = 4
  return mat
}

function segmentProps(
  bodySegmentId: string,
  material: THREE.Material,
) {
  return {
    material,
    renderOrder: 1,
    castShadow: false,
    receiveShadow: false,
    userData: {
      isSkinSurface: true,
      body_segment_id: bodySegmentId,
    },
  }
}

export function BodySurface() {
  const bodyMat = useMemo(() => makeMannequinMaterial(BODY_OPACITY), [])
  const limbMat = useMemo(() => makeMannequinMaterial(LIMB_OPACITY), [])

  const m = (id: string) => segmentProps(id, bodyMat)
  const ml = (id: string) => segmentProps(id, limbMat)

  return (
    <group>
      {/* Head + neck */}
      <mesh {...m('head')} position={[0, 0.575, 0.060]} scale={[0.90, 1.0, 0.92]}>
        <sphereGeometry args={[0.088, 32, 24]} />
      </mesh>
      <mesh {...m('neck')} position={[0, 0.472, 0.086]} rotation={[0.03, 0, 0]} scale={[0.72, 1.0, 0.64]}>
        <capsuleGeometry args={[0.048, 0.070, 8, 18]} />
      </mesh>

      {/* Torso (rib cage + waist + pelvis blend) */}
      <mesh {...m('trunk')} position={[0, 0.140, 0.095]} scale={[1.18, 1.30, 0.90]}>
        <capsuleGeometry args={[0.122, 0.340, 10, 28]} />
      </mesh>
      <mesh {...m('pelvis')} position={[0, -0.032, 0.090]} scale={[1.10, 0.86, 0.96]}>
        <sphereGeometry args={[0.124, 24, 18]} />
      </mesh>

      {/* Shoulders */}
      <mesh {...ml('shoulder_r')} position={[-0.170, 0.358, 0.068]} scale={[1.10, 0.98, 0.90]}>
        <sphereGeometry args={[0.060, 18, 14]} />
      </mesh>
      <mesh {...ml('shoulder_l')} position={[0.170, 0.358, 0.068]} scale={[1.10, 0.98, 0.90]}>
        <sphereGeometry args={[0.060, 18, 14]} />
      </mesh>

      {/* Right arm */}
      <group position={[-0.170, 0.352, 0.066]} rotation={[0, 0, -0.19]}>
        <mesh {...ml('upper_arm_r')} position={[0, -0.142, 0.000]} scale={[0.82, 1.0, 0.74]}>
          <capsuleGeometry args={[0.052, 0.198, 8, 20]} />
        </mesh>
        <mesh {...ml('elbow_r')} position={[0, -0.272, 0.000]}>
          <sphereGeometry args={[0.024, 14, 10]} />
        </mesh>
        <mesh {...ml('forearm_r')} position={[0, -0.382, 0.000]} scale={[0.74, 1.0, 0.68]}>
          <capsuleGeometry args={[0.042, 0.196, 8, 18]} />
        </mesh>
        <mesh {...ml('wrist_r')} position={[0, -0.516, 0.002]}>
          <sphereGeometry args={[0.017, 10, 8]} />
        </mesh>
        <mesh {...ml('hand_r')} position={[0.006, -0.560, 0.010]} rotation={[0.26, 0, 0.18]} scale={[1.0, 0.78, 0.60]}>
          <capsuleGeometry args={[0.020, 0.056, 6, 12]} />
        </mesh>
      </group>

      {/* Left arm */}
      <group position={[0.170, 0.352, 0.066]} rotation={[0, 0, 0.19]}>
        <mesh {...ml('upper_arm_l')} position={[0, -0.142, 0.000]} scale={[0.82, 1.0, 0.74]}>
          <capsuleGeometry args={[0.052, 0.198, 8, 20]} />
        </mesh>
        <mesh {...ml('elbow_l')} position={[0, -0.272, 0.000]}>
          <sphereGeometry args={[0.024, 14, 10]} />
        </mesh>
        <mesh {...ml('forearm_l')} position={[0, -0.382, 0.000]} scale={[0.74, 1.0, 0.68]}>
          <capsuleGeometry args={[0.042, 0.196, 8, 18]} />
        </mesh>
        <mesh {...ml('wrist_l')} position={[0, -0.516, 0.002]}>
          <sphereGeometry args={[0.017, 10, 8]} />
        </mesh>
        <mesh {...ml('hand_l')} position={[-0.006, -0.560, 0.010]} rotation={[0.26, 0, -0.18]} scale={[1.0, 0.78, 0.60]}>
          <capsuleGeometry args={[0.020, 0.056, 6, 12]} />
        </mesh>
      </group>

      {/* Right leg */}
      <mesh {...m('hip_r')} position={[-0.090, -0.060, 0.094]} scale={[1.0, 0.88, 0.92]}>
        <sphereGeometry args={[0.032, 14, 10]} />
      </mesh>
      <mesh {...m('thigh_r')} position={[-0.090, -0.328, 0.092]} scale={[0.86, 1.0, 0.78]}>
        <capsuleGeometry args={[0.066, 0.320, 8, 20]} />
      </mesh>
      <mesh {...m('knee_r')} position={[-0.088, -0.545, 0.084]} scale={[1.0, 0.90, 0.90]}>
        <sphereGeometry args={[0.034, 14, 10]} />
      </mesh>
      <mesh {...m('shank_r')} position={[-0.084, -0.705, 0.066]} scale={[0.74, 1.0, 0.70]}>
        <capsuleGeometry args={[0.048, 0.280, 8, 18]} />
      </mesh>
      <mesh {...m('ankle_r')} position={[-0.082, -0.906, 0.050]}>
        <sphereGeometry args={[0.020, 10, 8]} />
      </mesh>
      <mesh {...m('foot_r')} position={[-0.078, -0.948, 0.040]} rotation={[0.08, 0, 0.08]} scale={[1.14, 0.88, 0.86]}>
        <capsuleGeometry args={[0.030, 0.094, 6, 12]} />
      </mesh>

      {/* Left leg */}
      <mesh {...m('hip_l')} position={[0.090, -0.060, 0.094]} scale={[1.0, 0.88, 0.92]}>
        <sphereGeometry args={[0.032, 14, 10]} />
      </mesh>
      <mesh {...m('thigh_l')} position={[0.090, -0.328, 0.092]} scale={[0.86, 1.0, 0.78]}>
        <capsuleGeometry args={[0.066, 0.320, 8, 20]} />
      </mesh>
      <mesh {...m('knee_l')} position={[0.088, -0.545, 0.084]} scale={[1.0, 0.90, 0.90]}>
        <sphereGeometry args={[0.034, 14, 10]} />
      </mesh>
      <mesh {...m('shank_l')} position={[0.084, -0.705, 0.066]} scale={[0.74, 1.0, 0.70]}>
        <capsuleGeometry args={[0.048, 0.280, 8, 18]} />
      </mesh>
      <mesh {...m('ankle_l')} position={[0.082, -0.906, 0.050]}>
        <sphereGeometry args={[0.020, 10, 8]} />
      </mesh>
      <mesh {...m('foot_l')} position={[0.078, -0.948, 0.040]} rotation={[0.08, 0, -0.08]} scale={[1.14, 0.88, 0.86]}>
        <capsuleGeometry args={[0.030, 0.094, 6, 12]} />
      </mesh>
    </group>
  )
}
