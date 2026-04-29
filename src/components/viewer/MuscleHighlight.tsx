/**
 * MuscleHighlight.tsx
 *
 * Translucent pulsing ellipsoid overlay used by the single-mesh HumanAtlas.
 *
 *  • Color   = #ff4500   (per spec)
 *  • Opacity = 0.6 base, modulated 0.45 → 0.75 at ~1.4 Hz for the pulse
 *  • Geometry = unit sphere scaled to (rx, ry, rz) so each muscle reads
 *    as a clean ellipsoid that hugs the underlying anatomical region.
 *
 * Render discipline (Task 3 — visual consistency)
 *   renderOrder = 6   (above muscles=0/5 and BodySurface=-1)
 *   depthWrite  = false
 *   transparent = true
 *   polygonOffset disabled (we WANT it floating just outside the body)
 *
 * Styling rationale
 *   • ff4500 (OrangeRed) lives in the Orange-Fire family alongside FF8C00 /
 *     CC5500, so it reads as part of the same heatmap palette.
 *   • Emissive boost (intensity 0.6) keeps the highlight legible even when
 *     the body material is the deep #2a2a2a charcoal.
 */

import React, { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { findMuscleEntry, type MuscleSide, type MuscleMapEntry } from '../../lib/muscleMap'

interface Props {
  muscle_id?: string | null
  side?:      MuscleSide
  /** Optional pre-resolved entry (skips the lookup). */
  entry?:     MuscleMapEntry | null
  /** Override the base opacity. */
  baseOpacity?: number
}

const HIGHLIGHT_COLOR     = '#ff4500'
const PULSE_BASE_OPACITY  = 0.60
const PULSE_FREQ          = 8.8        // rad/s ≈ 1.4 Hz
const PULSE_AMPLITUDE     = 0.15       // ±0.15 around base

export function MuscleHighlight({ muscle_id, side, entry, baseOpacity = PULSE_BASE_OPACITY }: Props) {
  const matRef  = useRef<THREE.MeshStandardMaterial>(null)

  const resolved = entry ?? (muscle_id ? findMuscleEntry(muscle_id, side) : null)

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const t = clock.elapsedTime
    matRef.current.opacity =
      baseOpacity + PULSE_AMPLITUDE * Math.sin(t * PULSE_FREQ)
    // Modulate emissive intensity in lockstep so the glow pulses too.
    matRef.current.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * PULSE_FREQ))
  })

  if (!resolved) return null

  return (
    <mesh
      position={resolved.pos}
      scale={resolved.radii}
      renderOrder={6}
      raycast={() => null}              /* never block clicks to the body */
    >
      <sphereGeometry args={[1, 24, 16]} />
      <meshStandardMaterial
        ref={matRef}
        color={HIGHLIGHT_COLOR}
        emissive={HIGHLIGHT_COLOR}
        emissiveIntensity={0.5}
        roughness={0.4}
        metalness={0.0}
        transparent
        opacity={baseOpacity}
        depthWrite={false}
        depthTest={true}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}
