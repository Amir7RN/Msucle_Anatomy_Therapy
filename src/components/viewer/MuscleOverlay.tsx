/**
 * MuscleOverlay.tsx
 *
 * Wraps the legacy 52-mesh HumanModel in a calibration <group> and applies
 * three transform layers on top of each muscle's base local matrix:
 *
 *   1. GLOBAL non-uniform scale + offset    (group attribute on the wrapper)
 *   2. PER-REGION 9-DOF limb transform       (matrix per mesh, in useFrame)
 *      • translate XYZ                       around shoulder/hip pivot
 *      • rotate XYZ                          around shoulder/hip pivot
 *      • scale XYZ                           around shoulder/hip pivot
 *      with appropriate L/R mirroring per axis (see MIRROR_X/Y/Z constants)
 *   3. PER-MUSCLE NORMALIZATION              (entry-by-entry overrides from
 *                                            muscleNormalization.ts)
 *
 * Mirror rules — when the user moves a slider, the effect is symmetric on
 * both sides of the body, but the underlying axis sign flips for some axes:
 *
 *   offsetX  : MIRROR  (positive = both arms outward, away from spine)
 *   offsetY  : SAME    (raise/lower both limbs together)
 *   offsetZ  : SAME    (push forward/back together)
 *   rotXDeg  : SAME    (forward / backward flexion is symmetric)
 *   rotYDeg  : MIRROR  (forward swing must flip sign per side)
 *   rotZDeg  : MIRROR  (open / close in the coronal plane is mirrored)
 *   scaleX/Y/Z: SAME   (lengths/widths are anatomically symmetric)
 */

import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useAtlasStore, type LimbTransform } from '../../store/atlasStore'
import { HumanModel, MODEL_PATH } from './HumanModel'
import { useAnatomyModelProbe } from '../../hooks/useAnatomyModel'
import { MUSCLE_NORMALIZATION } from '../../lib/muscleNormalization'
import { getMuscleRegion, REGION_PIVOTS, type MuscleRegion } from '../../lib/muscleRegions'

// Scratch matrices — reused every frame to avoid GC churn.
const _composed = new THREE.Matrix4()
const _t1       = new THREE.Matrix4()
const _t2       = new THREE.Matrix4()
const _t3       = new THREE.Matrix4()
const _scaleM   = new THREE.Matrix4()
const _rotM     = new THREE.Matrix4()
const _normP    = new THREE.Matrix4()
const _normS    = new THREE.Matrix4()
const _euler    = new THREE.Euler()

const DEG = Math.PI / 180

// Pre-baked region matrix lookup, recomputed when sliders change.
interface RegionMatrices {
  matrix: Record<MuscleRegion, THREE.Matrix4>
}

/** Build the four mirror-aware limb matrices for arm_l/arm_r/leg_l/leg_r. */
function buildLimbMatrix(t: LimbTransform, side: 'L' | 'R', pivot: [number, number, number]): THREE.Matrix4 {
  const sgn = side === 'L' ? +1 : -1     // outward direction along X
  // Mirror per-axis as documented above
  const offX = sgn * t.offsetX
  const offY = t.offsetY
  const offZ = t.offsetZ
  const rotX = t.rotXDeg * DEG
  const rotY = sgn * t.rotYDeg * DEG
  const rotZ = sgn * t.rotZDeg * DEG

  _euler.set(rotX, rotY, rotZ, 'XYZ')

  // Compose: T(pivot+offset) · R · S · T(-pivot)
  _t1.makeTranslation(pivot[0] + offX, pivot[1] + offY, pivot[2] + offZ)
  _rotM.makeRotationFromEuler(_euler)
  _scaleM.makeScale(t.scaleX, t.scaleY, t.scaleZ)
  _t2.makeTranslation(-pivot[0], -pivot[1], -pivot[2])

  const out = new THREE.Matrix4()
  out.copy(_t1).multiply(_rotM).multiply(_scaleM).multiply(_t2)
  return out
}

function MuscleNormalizer() {
  const { scene } = useGLTF(MODEL_PATH)
  const armT = useAtlasStore((s) => s.armTransform)
  const legT = useAtlasStore((s) => s.legTransform)

  // ── Capture base matrix once per mesh ──────────────────────────────────
  useEffect(() => {
    if (!scene) return
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (obj.userData.baseMatrix) return
      obj.updateMatrix()
      obj.userData.baseMatrix = obj.matrix.clone()
      obj.matrixAutoUpdate = false
    })
  }, [scene])

  // ── Build per-region matrices (cheap, ~4 matrices, only on slider change)
  const regionMatrices = useMemo<RegionMatrices>(() => ({
    matrix: {
      head:  new THREE.Matrix4().identity(),
      trunk: new THREE.Matrix4().identity(),
      arm_r: buildLimbMatrix(armT, 'R', REGION_PIVOTS.arm_r),
      arm_l: buildLimbMatrix(armT, 'L', REGION_PIVOTS.arm_l),
      leg_r: buildLimbMatrix(legT, 'R', REGION_PIVOTS.leg_r),
      leg_l: buildLimbMatrix(legT, 'L', REGION_PIVOTS.leg_l),
    },
  }), [armT, legT])

  // ── Per-frame transform composition ────────────────────────────────────
  useFrame(() => {
    if (!scene) return
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const baseMtx = obj.userData.baseMatrix as THREE.Matrix4 | undefined
      if (!baseMtx) return

      const id = obj.userData.structureId as string | undefined
      const region = getMuscleRegion(id ?? '')
      const regionM = regionMatrices.matrix[region]

      _composed.copy(regionM)

      // Per-muscle micro-adjustments (additive position, multiplicative scale)
      const norm = id ? MUSCLE_NORMALIZATION[id] : undefined
      if (norm?.position) {
        _t3.makeTranslation(norm.position[0], norm.position[1], norm.position[2])
        _composed.multiply(_t3)
      }
      if (norm?.scale) {
        _normS.makeScale(norm.scale[0], norm.scale[1], norm.scale[2])
        _composed.multiply(_normS)
      }
      // (_normP unused — left declared for forward-compat)
      void _normP

      _composed.multiply(baseMtx)
      obj.matrix.copy(_composed)
      obj.matrixWorldNeedsUpdate = true
    })
  })

  return null
}

// ─────────────────────────────────────────────────────────────────────────────

export function MuscleOverlay() {
  const sx = useAtlasStore((s) => s.muscleOverlayScaleX)
  const sy = useAtlasStore((s) => s.muscleOverlayScaleY)
  const sz = useAtlasStore((s) => s.muscleOverlayScaleZ)
  const ox = useAtlasStore((s) => s.muscleOverlayOffsetX)
  const oy = useAtlasStore((s) => s.muscleOverlayOffsetY)
  const oz = useAtlasStore((s) => s.muscleOverlayOffsetZ)
  const { modelExists, modelPath } = useAnatomyModelProbe()

  return (
    <group scale={[sx, sy, sz]} position={[ox, oy, oz]}>
      <HumanModel modelExists={modelExists} modelPath={modelPath} />
      <MuscleNormalizer />
    </group>
  )
}
