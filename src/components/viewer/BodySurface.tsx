/**
 * BodySurface.tsx — Refined anthropometric skin silhouette
 *
 * Changes in this version:
 *  1. TORSO    — LatheGeometry profile closes to r=0.003 at BOTH ends → solid,
 *                no open rings, no hollow-shell appearance.
 *  2. SHOULDERS — removed double-sphere (old yoke + cap).  Each shoulder is now
 *                a single scaled ellipsoid that reads as the deltoid mass.
 *  3. JOINTS   — elbow r: 0.042→0.026  hip r: 0.050→0.028  knee r: 0.050→0.034
 *                Proportioned to look integrated, not like toy ball-joints.
 *  4. HANDS    — palm box + thumb capsule + finger-group box.
 *                Clearly reads as a hand at this scale.
 *  5. FEET     — heel block + flat arch bridge + forefoot/toe block.
 *                Reads as a foot with heel, arch and toe region.
 *
 * Opacity raised to 0.74 (from 0.70) for slightly more solid feel.
 * renderOrder −1 keeps silhouette beneath every muscle mesh.
 */

import React, { useMemo } from 'react'
import * as THREE from 'three'

const SKIN_COLOR   = '#2a1408'
const SKIN_OPACITY = 0.74

function mkPts(pairs: [number, number][]): THREE.Vector2[] {
  return pairs.map(([r, y]) => new THREE.Vector2(r, y))
}

const SEG_BODY = 22
const SEG_LIMB = 18
const SEG_THIN = 14

export function BodySurface() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color:       SKIN_COLOR,
    roughness:   0.85,
    metalness:   0.0,
    transparent: true,
    opacity:     SKIN_OPACITY,
    side:        THREE.FrontSide,
    depthWrite:  true,
  }), [])

  // ── Profiles (all close to r≈0.003 at free ends) ─────────────────────────

  // NECK: both ends taper — cranial end blends into head sphere, base into torso
  const neckProfile = useMemo(() => mkPts([
    [0.003, -0.094],
    [0.040, -0.068],
    [0.042, -0.040],   // larynx widest
    [0.036, +0.010],
    [0.034, +0.055],
    [0.003, +0.093],
  ]), [])

  // TORSO: hourglass, CLOSED at both ends → no open rings → looks solid
  // World y: −0.279 (pelvis) → +0.415 (clavicle)  centre 0.068
  const torsoProfile = useMemo(() => mkPts([
    [0.003, -0.347],   // perineal — CLOSED
    [0.108, -0.282],   // lower pelvis
    [0.120, -0.212],   // hip crest — widest
    [0.108, -0.116],   // iliac flare
    [0.095, -0.008],   // waist — narrowest
    [0.110, +0.108],   // lower rib cage
    [0.126, +0.226],   // mid chest
    [0.128, +0.296],   // upper pec
    [0.092, +0.336],   // narrows toward clavicle
    [0.003, +0.347],   // clavicle top — CLOSED
  ]), [])

  // UPPER ARM: shoulder end closes, elbow end r=0.030 (covered by elbow sphere)
  const upperArmProfile = useMemo(() => mkPts([
    [0.030, -0.173],   // elbow end — matches elbow sphere
    [0.038, -0.112],
    [0.043, -0.044],
    [0.045, +0.026],   // biceps belly peak
    [0.038, +0.100],
    [0.020, +0.148],
    [0.003, +0.172],   // shoulder insertion — CLOSED
  ]), [])

  // FOREARM: wrist closes, elbow end r=0.030 matches upper arm / elbow sphere
  const forearmProfile = useMemo(() => mkPts([
    [0.003, -0.169],   // wrist — CLOSED
    [0.014, -0.130],
    [0.022, -0.062],
    [0.028, +0.010],
    [0.030, +0.095],   // widest (brachioradialis bulk)
    [0.030, +0.150],
    [0.030, +0.169],   // elbow end
  ]), [])

  // THIGH: hip closes, knee end r=0.034
  const thighProfile = useMemo(() => mkPts([
    [0.034, -0.276],   // knee end — matches knee sphere
    [0.046, -0.160],
    [0.054, -0.040],
    [0.058, +0.096],   // quad bulk peak
    [0.048, +0.208],
    [0.024, +0.258],
    [0.003, +0.276],   // hip socket — CLOSED
  ]), [])

  // SHANK: knee end r=0.034, ankle closes
  const shankProfile = useMemo(() => mkPts([
    [0.003, -0.180],   // ankle — CLOSED
    [0.016, -0.138],
    [0.026, -0.060],
    [0.040, +0.062],   // gastroc belly peak
    [0.036, +0.138],
    [0.034, +0.181],   // knee end — matches knee sphere
  ]), [])

  const m = {
    material:      mat,
    renderOrder:   -1,
    castShadow:    false,
    receiveShadow: false,
  }

  return (
    <group>

      {/* ── HEAD ─────────────────────────────────────────────────────────────── */}
      <mesh {...m} position={[0, 0.575, 0.058]} scale={[0.84, 1, 1]}>
        <sphereGeometry args={[0.090, 22, 18]} />
      </mesh>

      {/* ── NECK ─────────────────────────────────────────────────────────────── */}
      <mesh {...m} position={[0, 0.466, 0.105]} rotation={[0.06, 0, 0]} scale={[1, 1, 0.82]}>
        <latheGeometry args={[neckProfile, SEG_THIN]} />
      </mesh>

      {/* ── TORSO (fully closed profile → solid appearance) ───────────────────── */}
      <mesh {...m} position={[0, 0.068, 0.102]} scale={[1, 1, 0.87]}>
        <latheGeometry args={[torsoProfile, SEG_BODY]} />
      </mesh>

      {/*
        ── RIGHT SHOULDER ────────────────────────────────────────────────────
        Single deltoid ellipsoid — blends torso edge to arm root.
        Kept at its own position (torso junction), NOT part of the arm axis.
      */}
      <mesh {...m} position={[-0.164, 0.368, 0.060]} scale={[1.10, 1.05, 0.78]}>
        <sphereGeometry args={[0.058, 16, 12]} />
      </mesh>

      {/*
        ── RIGHT ARM GROUP — tilted outward ~16° to align with muscle axis.
        Pivot: shoulder attachment point. All segments in group-local space.
        rotation.z = −0.28 rad swings the forearm/hand outward (−X direction).
      */}
      <group position={[-0.164, 0.368, 0.060]} rotation={[0, 0, -0.28]}>
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
        <mesh {...m} position={[0, -0.555, 0.010]}>
          <boxGeometry args={[0.074, 0.090, 0.026]} />
        </mesh>
        {/* Thumb — radial/lateral side (−X for right arm) */}
        <mesh {...m} position={[-0.038, -0.535, 0.010]} rotation={[0, 0, 0.62]}>
          <capsuleGeometry args={[0.011, 0.034, 4, 8]} />
        </mesh>
        {/* Fingertip bar */}
        <mesh {...m} position={[0, -0.615, 0.010]}>
          <boxGeometry args={[0.072, 0.036, 0.024]} />
        </mesh>
      </group>

      {/* ── LEFT SHOULDER ─────────────────────────────────────────────────────── */}
      <mesh {...m} position={[0.164, 0.368, 0.060]} scale={[1.10, 1.05, 0.78]}>
        <sphereGeometry args={[0.058, 16, 12]} />
      </mesh>

      {/*
        ── LEFT ARM GROUP (x-mirrored, rotation.z = +0.28) ──────────────────
      */}
      <group position={[0.164, 0.368, 0.060]} rotation={[0, 0, 0.28]}>
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
        <mesh {...m} position={[0, -0.555, 0.010]}>
          <boxGeometry args={[0.074, 0.090, 0.026]} />
        </mesh>
        {/* Thumb — radial/lateral side (+X for left arm) */}
        <mesh {...m} position={[0.038, -0.535, 0.010]} rotation={[0, 0, -0.62]}>
          <capsuleGeometry args={[0.011, 0.034, 4, 8]} />
        </mesh>
        {/* Fingertip bar */}
        <mesh {...m} position={[0, -0.615, 0.010]}>
          <boxGeometry args={[0.072, 0.036, 0.024]} />
        </mesh>
      </group>

      {/* ── RIGHT LEG ─────────────────────────────────────────────────────────── */}

      {/*
        Hip connector — reduced r: 0.050 → 0.028.
        Covers the closed tip of the thigh profile (r=0.003 at top).
      */}
      <mesh {...m} position={[-0.090, -0.048, 0.090]}>
        <sphereGeometry args={[0.028, 10, 8]} />
      </mesh>

      {/* Thigh */}
      <mesh {...m} position={[-0.090, -0.324, 0.090]} scale={[1, 1, 0.88]}>
        <latheGeometry args={[thighProfile, SEG_BODY]} />
      </mesh>

      {/*
        Knee — reduced r: 0.050 → 0.034.
        Thigh bottom y=−0.600  Shank top y=−0.476  midpoint=−0.538
      */}
      <mesh {...m} position={[-0.090, -0.538, 0.090]}>
        <sphereGeometry args={[0.034, 10, 8]} />
      </mesh>

      {/* Shank */}
      <mesh {...m} position={[-0.084, -0.657, 0.065]} scale={[1, 1, 0.80]}>
        <latheGeometry args={[shankProfile, SEG_LIMB]} />
      </mesh>

      {/* Ankle */}
      <mesh {...m} position={[-0.084, -0.840, 0.058]}>
        <sphereGeometry args={[0.020, 8, 6]} />
      </mesh>

      {/*
        RIGHT FOOT — three-section foot, not a brick.
        Heel:     taller block, square section, sits on floor (y floor = −0.925)
        Mid-arch: very flat bridge connecting heel to forefoot
        Forefoot: wider, thinner, slight upward tilt (rotation.x = −0.10)
                  reads as ball-of-foot + toe region
      */}
      {/* Heel */}
      <mesh {...m} position={[-0.082, -0.902, -0.016]}>
        <boxGeometry args={[0.060, 0.044, 0.074]} />
      </mesh>
      {/* Arch bridge */}
      <mesh {...m} position={[-0.082, -0.914, 0.072]}>
        <boxGeometry args={[0.058, 0.018, 0.116]} />
      </mesh>
      {/* Forefoot / toes */}
      <mesh {...m} position={[-0.068, -0.918, 0.147]} rotation={[-0.10, 0, 0]}>
        <boxGeometry args={[0.070, 0.022, 0.056]} />
      </mesh>

      {/* ── LEFT LEG (x-mirrored) ─────────────────────────────────────────────── */}
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
      {/* Left foot */}
      <mesh {...m} position={[0.082, -0.902, -0.016]}>
        <boxGeometry args={[0.060, 0.044, 0.074]} />
      </mesh>
      <mesh {...m} position={[0.082, -0.914, 0.072]}>
        <boxGeometry args={[0.058, 0.018, 0.116]} />
      </mesh>
      <mesh {...m} position={[0.068, -0.918, 0.147]} rotation={[-0.10, 0, 0]}>
        <boxGeometry args={[0.070, 0.022, 0.056]} />
      </mesh>

    </group>
  )
}
