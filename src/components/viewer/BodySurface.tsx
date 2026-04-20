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

const SKIN_COLOR   = '#1e0e06'
const SKIN_OPACITY = 0.78

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

export function BodySurface() {
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color:              SKIN_COLOR,
      roughness:          0.40,
      metalness:          0.00,
      clearcoat:          0.30,
      clearcoatRoughness: 0.25,
      transparent:        true,
      opacity:            SKIN_OPACITY,
      side:               THREE.FrontSide,
      depthWrite:         false,   // ← must NOT write depth; skin is a transparent
                                   //   overlay and must never block muscles that
                                   //   are geometrically inside the silhouette
    })
    // Positive polygon offset pushes the skin surface away from the camera in
    // depth-buffer space so muscles always win any residual depth tie.
    m.polygonOffset       = true
    m.polygonOffsetFactor = 4
    m.polygonOffsetUnits  = 4
    return m
  }, [])

  // ── Profiles ──────────────────────────────────────────────────────────────

  const neckProfile = useMemo(() => mkPts([
    [0.003, -0.094],
    [0.040, -0.068],
    [0.042, -0.040],
    [0.036, +0.010],
    [0.034, +0.055],
    [0.003, +0.093],
  ]), [])

  const torsoProfile = useMemo(() => mkPts([
    [0.003, -0.347],
    [0.108, -0.282],
    [0.120, -0.212],
    [0.108, -0.116],
    [0.095, -0.008],
    [0.110, +0.108],
    [0.126, +0.226],
    [0.128, +0.296],
    [0.092, +0.336],
    [0.003, +0.347],
  ]), [])

  const upperArmProfile = useMemo(() => mkPts([
    [0.030, -0.173],
    [0.038, -0.112],
    [0.043, -0.044],
    [0.045, +0.026],
    [0.038, +0.100],
    [0.020, +0.148],
    [0.003, +0.172],
  ]), [])

  const forearmProfile = useMemo(() => mkPts([
    [0.003, -0.169],
    [0.014, -0.130],
    [0.022, -0.062],
    [0.028, +0.010],
    [0.030, +0.095],
    [0.030, +0.150],
    [0.030, +0.169],
  ]), [])

  const thighProfile = useMemo(() => mkPts([
    [0.034, -0.276],
    [0.046, -0.160],
    [0.054, -0.040],
    [0.058, +0.096],
    [0.048, +0.208],
    [0.024, +0.258],
    [0.003, +0.276],
  ]), [])

  const shankProfile = useMemo(() => mkPts([
    [0.003, -0.180],
    [0.016, -0.138],
    [0.026, -0.060],
    [0.040, +0.062],
    [0.036, +0.138],
    [0.034, +0.181],
  ]), [])

  const m = {
    material:      mat,
    renderOrder:   1,    // ← draw AFTER all muscles (renderOrder 0) so the skin
                         //   is composited on top as a transparent overlay.
                         //   With depthWrite=false the skin never blocks muscles.
    castShadow:    false,
    receiveShadow: false,
  }

  return (
    <group>

      {/* ── HEAD ─────────────────────────────────────────────────────────── */}
      <mesh {...m} position={[0, 0.575, 0.058]} scale={[0.84, 1, 1]}>
        <sphereGeometry args={[0.090, 22, 18]} />
      </mesh>

      {/* ── NECK ─────────────────────────────────────────────────────────── */}
      <mesh {...m} position={[0, 0.466, 0.105]} rotation={[0.06, 0, 0]} scale={[1, 1, 0.82]}>
        <latheGeometry args={[neckProfile, SEG_THIN]} />
      </mesh>

      {/* ── TORSO ────────────────────────────────────────────────────────── */}
      <mesh {...m} position={[0, 0.068, 0.102]} scale={[1, 1, 0.87]}>
        <latheGeometry args={[torsoProfile, SEG_BODY]} />
      </mesh>

      {/* ── RIGHT SHOULDER ───────────────────────────────────────────────── */}
      <mesh {...m} position={[-0.164, 0.368, 0.060]} scale={[1.10, 1.05, 0.78]}>
        <sphereGeometry args={[0.058, 16, 12]} />
      </mesh>

      {/*
        ── RIGHT ARM GROUP — ±0.20 rad A-pose tilt ───────────────────────
        Pivot at shoulder. Tilt calibrated so the upper-arm silhouette
        overlays the GLB Biceps_R / Triceps_R mesh centres (x≈-0.192).
        Previous value 0.30 rad pushed the arms 2-3 cm too far lateral.
      */}
      <group position={[-0.164, 0.368, 0.060]} rotation={[0, 0, -0.20]}>
        {/* Upper arm */}
        <mesh {...m} position={[0, -0.143, 0.010]} scale={[1, 1, 0.84]}>
          <latheGeometry args={[upperArmProfile, SEG_LIMB]} />
        </mesh>
        {/* Elbow */}
        <mesh {...m} position={[0, -0.250, 0.010]}>
          <sphereGeometry args={[0.026, 10, 8]} />
        </mesh>
        {/* Forearm */}
        <mesh {...m} position={[0, -0.332, 0.010]} scale={[1, 1, 0.78]}>
          <latheGeometry args={[forearmProfile, SEG_THIN]} />
        </mesh>
        {/* Wrist */}
        <mesh {...m} position={[0, -0.501, 0.010]}>
          <sphereGeometry args={[0.017, 8, 6]} />
        </mesh>
        {/* Palm */}
        <mesh {...m} position={[0, -0.546, 0.010]}>
          <boxGeometry args={[0.074, 0.072, 0.026]} />
        </mesh>
        {/* Thumb — radial/lateral side (−X for right arm) */}
        <mesh {...m} position={[-0.044, -0.528, 0.010]} rotation={[0, 0, 0.60]}>
          <capsuleGeometry args={[0.010, 0.032, 4, 8]} />
        </mesh>
        {/* Four fingers — index to pinky */}
        {FINGER_X.map((fx, fi) => (
          <mesh key={fi} {...m}
            position={[fx, -0.608 - fi * 0.002, 0.010]}
            rotation={[0.08, 0, 0]}
          >
            <capsuleGeometry args={[0.009 - fi * 0.001, 0.034 - fi * 0.003, 4, 7]} />
          </mesh>
        ))}
      </group>

      {/* ── LEFT SHOULDER ────────────────────────────────────────────────── */}
      <mesh {...m} position={[0.164, 0.368, 0.060]} scale={[1.10, 1.05, 0.78]}>
        <sphereGeometry args={[0.058, 16, 12]} />
      </mesh>

      {/* ── LEFT ARM GROUP (x-mirrored, rotation.z = +0.20) ─────────────── */}
      <group position={[0.164, 0.368, 0.060]} rotation={[0, 0, 0.20]}>
        <mesh {...m} position={[0, -0.143, 0.010]} scale={[1, 1, 0.84]}>
          <latheGeometry args={[upperArmProfile, SEG_LIMB]} />
        </mesh>
        <mesh {...m} position={[0, -0.250, 0.010]}>
          <sphereGeometry args={[0.026, 10, 8]} />
        </mesh>
        <mesh {...m} position={[0, -0.332, 0.010]} scale={[1, 1, 0.78]}>
          <latheGeometry args={[forearmProfile, SEG_THIN]} />
        </mesh>
        <mesh {...m} position={[0, -0.501, 0.010]}>
          <sphereGeometry args={[0.017, 8, 6]} />
        </mesh>
        <mesh {...m} position={[0, -0.546, 0.010]}>
          <boxGeometry args={[0.074, 0.072, 0.026]} />
        </mesh>
        {/* Thumb — radial side (+X for left arm) */}
        <mesh {...m} position={[0.044, -0.528, 0.010]} rotation={[0, 0, -0.60]}>
          <capsuleGeometry args={[0.010, 0.032, 4, 8]} />
        </mesh>
        {/* Four fingers */}
        {FINGER_X.map((fx, fi) => (
          <mesh key={fi} {...m}
            position={[-fx, -0.608 - fi * 0.002, 0.010]}
            rotation={[0.08, 0, 0]}
          >
            <capsuleGeometry args={[0.009 - fi * 0.001, 0.034 - fi * 0.003, 4, 7]} />
          </mesh>
        ))}
      </group>

      {/* ── RIGHT LEG ────────────────────────────────────────────────────── */}
      <mesh {...m} position={[-0.090, -0.048, 0.090]}>
        <sphereGeometry args={[0.028, 10, 8]} />
      </mesh>
      <mesh {...m} position={[-0.090, -0.324, 0.090]} scale={[1, 1, 0.88]}>
        <latheGeometry args={[thighProfile, SEG_BODY]} />
      </mesh>
      <mesh {...m} position={[-0.090, -0.538, 0.090]}>
        <sphereGeometry args={[0.034, 10, 8]} />
      </mesh>
      <mesh {...m} position={[-0.084, -0.657, 0.065]} scale={[1, 1, 0.80]}>
        <latheGeometry args={[shankProfile, SEG_LIMB]} />
      </mesh>
      {/* Ankle */}
      <mesh {...m} position={[-0.084, -0.840, 0.058]}>
        <sphereGeometry args={[0.020, 8, 6]} />
      </mesh>
      {/* RIGHT FOOT — heel + arch + metatarsal + 5 toes */}
      {/* Heel */}
      <mesh {...m} position={[-0.082, -0.904, -0.020]}>
        <boxGeometry args={[0.058, 0.040, 0.068]} />
      </mesh>
      {/* Mid arch */}
      <mesh {...m} position={[-0.082, -0.916, 0.068]}>
        <boxGeometry args={[0.055, 0.016, 0.112]} />
      </mesh>
      {/* Metatarsal / ball */}
      <mesh {...m} position={[-0.082, -0.920, 0.142]}>
        <boxGeometry args={[0.068, 0.020, 0.036]} />
      </mesh>
      {/* 5 toes — big toe to little */}
      {TOE_X_R.map((tx, ti) => (
        <mesh key={ti} {...m}
          position={[tx - 0.082, -0.921, 0.170 + ti * 0.001]}
          rotation={[-0.10, 0, 0]}
        >
          <capsuleGeometry args={[0.008 - ti * 0.001, 0.018 - ti * 0.002, 4, 6]} />
        </mesh>
      ))}

      {/* ── LEFT LEG (x-mirrored) ────────────────────────────────────────── */}
      <mesh {...m} position={[0.090, -0.048, 0.090]}>
        <sphereGeometry args={[0.028, 10, 8]} />
      </mesh>
      <mesh {...m} position={[0.090, -0.324, 0.090]} scale={[1, 1, 0.88]}>
        <latheGeometry args={[thighProfile, SEG_BODY]} />
      </mesh>
      <mesh {...m} position={[0.090, -0.538, 0.090]}>
        <sphereGeometry args={[0.034, 10, 8]} />
      </mesh>
      <mesh {...m} position={[0.084, -0.657, 0.065]} scale={[1, 1, 0.80]}>
        <latheGeometry args={[shankProfile, SEG_LIMB]} />
      </mesh>
      <mesh {...m} position={[0.084, -0.840, 0.058]}>
        <sphereGeometry args={[0.020, 8, 6]} />
      </mesh>
      {/* LEFT FOOT */}
      <mesh {...m} position={[0.082, -0.904, -0.020]}>
        <boxGeometry args={[0.058, 0.040, 0.068]} />
      </mesh>
      <mesh {...m} position={[0.082, -0.916, 0.068]}>
        <boxGeometry args={[0.055, 0.016, 0.112]} />
      </mesh>
      <mesh {...m} position={[0.082, -0.920, 0.142]}>
        <boxGeometry args={[0.068, 0.020, 0.036]} />
      </mesh>
      {TOE_X_L.map((tx, ti) => (
        <mesh key={ti} {...m}
          position={[tx + 0.082, -0.921, 0.170 + ti * 0.001]}
          rotation={[-0.10, 0, 0]}
        >
          <capsuleGeometry args={[0.008 - ti * 0.001, 0.018 - ti * 0.002, 4, 6]} />
        </mesh>
      ))}

    </group>
  )
}
