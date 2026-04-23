/**
 * BodySurface.tsx — Organic anthropometric skin silhouette  (v2)
 *
 * Geometry improvements over v1:
 *   HANDS   — 5 individual finger capsules + thumb, replacing the single "finger bar"
 *   FEET    — 5 individual toe capsules per foot + distinct heel / arch / forefoot
 *   JOINTS  — smoother sphere radii that blend with adjacent segments
 *   ARMS    — ±0.30 rad tilt (was ±0.28) for a more natural A-pose hang
 *
 * Material:  MeshPhysicalMaterial
 *   clearcoat + clearcoatRoughness give a subtle Fresnel silhouette rim
 *   that reads as "skin surface" under the anatomy-studio lighting rig.
 *   polygonOffset = true, factor +1, units +1  → silhouette always BEHIND muscles
 */

import React, { useMemo } from 'react'
import * as THREE from 'three'

const SKIN_COLOR       = '#E0E0E0'
const SKIN_OPACITY     = 0.30
const SKIN_OPACITY_ARM = 0.24

function mkPts(pairs: [number, number][]): THREE.Vector2[] {
  return pairs.map(([r, y]) => new THREE.Vector2(r, y))
}

const SEG_BODY = 22
const SEG_LIMB = 18
const SEG_THIN = 14

// Finger X offsets in arm group-local space (index → pinky)
const FINGER_X = [-0.026, -0.013, 0, 0.013, 0.026] as const
// Toe X offsets (big toe → little toe, right foot negative x)
const TOE_X_R  = [-0.024, -0.012, 0, 0.012, 0.022] as const
const TOE_X_L  = [ 0.024,  0.012, 0, -0.012, -0.022] as const

function makeSkinMaterial(opacity: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color:              SKIN_COLOR,
    roughness:          0.70,
    metalness:          0.10,
    transparent:        true,
    opacity,
    side:               THREE.FrontSide,
    // depthWrite MUST stay false — skin is a transparent overlay, it must
    // never write depth values that would occlude muscles beneath it.
    depthWrite:         false,
  })
  m.polygonOffset       = true
  m.polygonOffsetFactor = 4
  m.polygonOffsetUnits  = 4
  return m
}

export function BodySurface() {
  // Body-segment material (torso, head, neck, legs) — muscles sit at the surface
  const mat    = useMemo(() => makeSkinMaterial(SKIN_OPACITY),     [])
  // Arm-segment material — arm muscles are ENCLOSED by the silhouette cylinder;
  // a much lower opacity lets biceps / brachialis / forearm muscles show through
  const matArm = useMemo(() => makeSkinMaterial(SKIN_OPACITY_ARM), [])

  // ── Profiles ──────────────────────────────────────────────────────────────

  const neckProfile = useMemo(() => mkPts([
    [0.003, -0.094],
    [0.040, -0.068],
    [0.042, -0.040],
    [0.036, +0.010],
    [0.034, +0.055],
    [0.003, +0.093],
  ]), [])

  const torsoFrontProfile = useMemo(() => mkPts([
    [0.00, -0.30],
    [0.11, -0.26],  // pelvis
    [0.14, -0.12],  // lower ribs
    [0.15, 0.08],   // ribcage widest
    [0.12, 0.24],
    [0.08, 0.33],
    [0.00, 0.36],
  ]), [])

  const limbTaperProfile = useMemo(() => mkPts([
    [0.00, -0.18],
    [0.028, -0.16],
    [0.037, -0.08],
    [0.044, 0.03],
    [0.039, 0.12],
    [0.024, 0.17],
    [0.00, 0.19],
  ]), [])

  const foreLimbProfile = useMemo(() => mkPts([
    [0.00, -0.17],
    [0.018, -0.14],
    [0.030, -0.05],
    [0.034, 0.05],
    [0.027, 0.13],
    [0.014, 0.17],
    [0.00, 0.18],
  ]), [])

  const footProfile = useMemo(() => mkPts([
    [0.00, -0.04],
    [0.038, -0.03],
    [0.055, 0.00],
    [0.070, 0.04],
    [0.054, 0.08],
    [0.036, 0.11],
    [0.00, 0.12],
  ]), [])

  const handProfile = useMemo(() => mkPts([
    [0.00, -0.03],
    [0.025, -0.02],
    [0.037, 0.00],
    [0.042, 0.03],
    [0.031, 0.05],
    [0.020, 0.06],
    [0.00, 0.07],
  ]), [])

  // Shared mesh props for body segments
  const segmentProps = (bodySegmentId: string, material = mat) => ({
    material,
    renderOrder:   1,          // draw AFTER muscles so skin composites on top
    castShadow:    false,
    receiveShadow: false,
    userData:      { isSkinSurface: true, body_segment_id: bodySegmentId },   // PainOverlay skips these in raycasting
  })
  const m = (id: string) => segmentProps(id, mat)
  const ma = (id: string) => segmentProps(id, matArm)

  return (
    <group>

      {/* ── HEAD ─────────────────────────────────────────────────────────── */}
      <mesh {...m('head')} position={[0, 0.575, 0.058]} scale={[0.84, 1, 1]}>
        <sphereGeometry args={[0.090, 22, 18]} />
      </mesh>

      {/* ── NECK ─────────────────────────────────────────────────────────── */}
      <mesh {...m('neck')} position={[0, 0.466, 0.105]} rotation={[0.06, 0, 0]} scale={[1, 1, 0.82]}>
        <latheGeometry args={[neckProfile, SEG_THIN]} />
      </mesh>

      {/* ── TORSO ────────────────────────────────────────────────────────── */}
      <mesh {...m('trunk')} position={[0, 0.066, 0.095]} scale={[1, 1, 0.92]}>
        <latheGeometry args={[torsoFrontProfile, 28]} />
      </mesh>

      {/* ── RIGHT SHOULDER ───────────────────────────────────────────────── */}
      <mesh {...ma('shoulder_r')} position={[-0.164, 0.368, 0.060]} scale={[1.12, 1.06, 0.84]}>
        <sphereGeometry args={[0.058, 16, 12]} />
      </mesh>

      {/*
        ── RIGHT ARM GROUP — ±0.20 rad A-pose tilt ───────────────────────
        All arm meshes use `ma` (SKIN_OPACITY_ARM = 0.18) so the enclosed
        biceps / brachialis / forearm muscles show clearly through the skin.
      */}
      <group position={[-0.164, 0.368, 0.060]} rotation={[0, 0, -0.20]}>
        {/* Upper arm */}
        <mesh {...ma('upper_arm_r')} position={[0, -0.143, 0.010]} scale={[1, 1, 0.78]}>
          <latheGeometry args={[limbTaperProfile, 20]} />
        </mesh>
        {/* Elbow */}
        <mesh {...ma('elbow_r')} position={[0, -0.250, 0.010]}>
          <sphereGeometry args={[0.026, 10, 8]} />
        </mesh>
        {/* Forearm */}
        <mesh {...ma('forearm_r')} position={[0, -0.332, 0.010]} scale={[1, 1, 0.72]}>
          <latheGeometry args={[foreLimbProfile, 18]} />
        </mesh>
        {/* Wrist */}
        <mesh {...ma('wrist_r')} position={[0, -0.501, 0.010]}>
          <sphereGeometry args={[0.017, 8, 6]} />
        </mesh>
        {/* Palm */}
        <mesh {...ma('hand_r')} position={[0.002, -0.546, 0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.65, 0.55]}>
          <latheGeometry args={[handProfile, 16]} />
        </mesh>
        {/* Thumb — radial/lateral side (−X for right arm) */}
        <mesh {...ma('hand_r')} position={[-0.044, -0.528, 0.010]} rotation={[0, 0, 0.60]}>
          <capsuleGeometry args={[0.010, 0.032, 4, 8]} />
        </mesh>
        {/* Four fingers — index to pinky */}
        {FINGER_X.map((fx, fi) => (
          <mesh key={fi} {...ma('hand_r')}
            position={[fx, -0.608 - fi * 0.002, 0.010]}
            rotation={[0.08, 0, 0]}
          >
            <capsuleGeometry args={[0.009 - fi * 0.001, 0.034 - fi * 0.003, 4, 7]} />
          </mesh>
        ))}
      </group>

      {/* ── LEFT SHOULDER ────────────────────────────────────────────────── */}
      <mesh {...ma('shoulder_l')} position={[0.164, 0.368, 0.060]} scale={[1.12, 1.06, 0.84]}>
        <sphereGeometry args={[0.058, 16, 12]} />
      </mesh>

      {/* ── LEFT ARM GROUP (x-mirrored, rotation.z = +0.20) — uses ma ───── */}
      <group position={[0.164, 0.368, 0.060]} rotation={[0, 0, 0.20]}>
        <mesh {...ma('upper_arm_l')} position={[0, -0.143, 0.010]} scale={[1, 1, 0.78]}>
          <latheGeometry args={[limbTaperProfile, 20]} />
        </mesh>
        <mesh {...ma('elbow_l')} position={[0, -0.250, 0.010]}>
          <sphereGeometry args={[0.026, 10, 8]} />
        </mesh>
        <mesh {...ma('forearm_l')} position={[0, -0.332, 0.010]} scale={[1, 1, 0.72]}>
          <latheGeometry args={[foreLimbProfile, 18]} />
        </mesh>
        <mesh {...ma('wrist_l')} position={[0, -0.501, 0.010]}>
          <sphereGeometry args={[0.017, 8, 6]} />
        </mesh>
        <mesh {...ma('hand_l')} position={[0.002, -0.546, 0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.65, 0.55]}>
          <latheGeometry args={[handProfile, 16]} />
        </mesh>
        {/* Thumb — radial side (+X for left arm) */}
        <mesh {...ma('hand_l')} position={[0.044, -0.528, 0.010]} rotation={[0, 0, -0.60]}>
          <capsuleGeometry args={[0.010, 0.032, 4, 8]} />
        </mesh>
        {/* Four fingers */}
        {FINGER_X.map((fx, fi) => (
          <mesh key={fi} {...ma('hand_l')}
            position={[-fx, -0.608 - fi * 0.002, 0.010]}
            rotation={[0.08, 0, 0]}
          >
            <capsuleGeometry args={[0.009 - fi * 0.001, 0.034 - fi * 0.003, 4, 7]} />
          </mesh>
        ))}
      </group>

      {/* ── RIGHT LEG ────────────────────────────────────────────────────── */}
      <mesh {...m('hip_r')} position={[-0.090, -0.048, 0.090]}>
        <sphereGeometry args={[0.028, 10, 8]} />
      </mesh>
      <mesh {...m('thigh_r')} position={[-0.090, -0.324, 0.090]} scale={[1, 1, 0.82]}>
        <latheGeometry args={[limbTaperProfile, 22]} />
      </mesh>
      <mesh {...m('knee_r')} position={[-0.090, -0.538, 0.090]}>
        <sphereGeometry args={[0.034, 10, 8]} />
      </mesh>
      <mesh {...m('shank_r')} position={[-0.084, -0.657, 0.065]} scale={[1, 1, 0.70]}>
        <latheGeometry args={[foreLimbProfile, 20]} />
      </mesh>
      {/* Ankle */}
      <mesh {...m('ankle_r')} position={[-0.084, -0.840, 0.058]}>
        <sphereGeometry args={[0.020, 8, 6]} />
      </mesh>
      <mesh {...m('foot_r')} position={[-0.082, -0.912, 0.038]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.68, 0.90]}>
        <latheGeometry args={[footProfile, 20]} />
      </mesh>
      {/* 5 toes — big toe to little */}
      {TOE_X_R.map((tx, ti) => (
        <mesh key={ti} {...m('foot_r')}
          position={[tx - 0.082, -0.921, 0.170 + ti * 0.001]}
          rotation={[-0.10, 0, 0]}
        >
          <capsuleGeometry args={[0.008 - ti * 0.001, 0.018 - ti * 0.002, 4, 6]} />
        </mesh>
      ))}

      {/* ── LEFT LEG (x-mirrored) ────────────────────────────────────────── */}
      <mesh {...m('hip_l')} position={[0.090, -0.048, 0.090]}>
        <sphereGeometry args={[0.028, 10, 8]} />
      </mesh>
      <mesh {...m('thigh_l')} position={[0.090, -0.324, 0.090]} scale={[1, 1, 0.82]}>
        <latheGeometry args={[limbTaperProfile, 22]} />
      </mesh>
      <mesh {...m('knee_l')} position={[0.090, -0.538, 0.090]}>
        <sphereGeometry args={[0.034, 10, 8]} />
      </mesh>
      <mesh {...m('shank_l')} position={[0.084, -0.657, 0.065]} scale={[1, 1, 0.70]}>
        <latheGeometry args={[foreLimbProfile, 20]} />
      </mesh>
      <mesh {...m('ankle_l')} position={[0.084, -0.840, 0.058]}>
        <sphereGeometry args={[0.020, 8, 6]} />
      </mesh>
      <mesh {...m('foot_l')} position={[0.082, -0.912, 0.038]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.68, 0.90]}>
        <latheGeometry args={[footProfile, 20]} />
      </mesh>
      {TOE_X_L.map((tx, ti) => (
        <mesh key={ti} {...m('foot_l')}
          position={[tx + 0.082, -0.921, 0.170 + ti * 0.001]}
          rotation={[-0.10, 0, 0]}
        >
          <capsuleGeometry args={[0.008 - ti * 0.001, 0.018 - ti * 0.002, 4, 6]} />
        </mesh>
      ))}

    </group>
  )
}
