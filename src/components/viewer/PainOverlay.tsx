/**
 * PainOverlay.tsx
 *
 * Soft heatmap pain-referral overlay.
 *
 * Color: pure red → dark orange-red → transparent.
 * No yellow anywhere — maximum green channel is 90/255,
 * which stays solidly in the red-orange range even at full additive accumulation.
 *
 * Pulse: very slow (0.75 Hz), low amplitude (±0.08).
 * Looks like a warm clinical indicator, not a flashing warning light.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame }      from '@react-three/fiber'
import { useAtlasStore } from '../../store/atlasStore'
import { PAIN_PATTERNS, BODY_ZONES } from '../../data/painPatterns'

function makeHeatTexture(): THREE.CanvasTexture {
  const sz   = 256
  const c    = document.createElement('canvas')
  c.width    = sz
  c.height   = sz
  const ctx  = c.getContext('2d')!
  const half = sz / 2
  const g    = ctx.createRadialGradient(half, half, 0, half, half, half)

  // Pure red-to-orange spectrum — no yellow.
  // Green channel stays ≤ 90, preventing any yellow cast even with additive blending.
  g.addColorStop(0.00, 'rgba(218,   8,   0, 0.92)')   // deep crimson core
  g.addColorStop(0.16, 'rgba(215,  28,   0, 0.78)')   // vivid red
  g.addColorStop(0.34, 'rgba(210,  52,   0, 0.54)')   // dark orange-red
  g.addColorStop(0.54, 'rgba(200,  72,   4, 0.28)')   // orange-red mid
  g.addColorStop(0.72, 'rgba(190,  84,   8, 0.10)')   // warm orange (fading)
  g.addColorStop(0.88, 'rgba(175,  88,  12, 0.03)')   // nearly gone
  g.addColorStop(1.00, 'rgba(160,  90,  15, 0.00)')   // transparent edge

  ctx.fillStyle = g
  ctx.fillRect(0, 0, sz, sz)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function surfaceOffset(pos: [number, number, number]): [number, number, number] {
  const [px, py, pz] = pos
  if (py > 0.48) {
    // Head — push outward from skull centre
    const dx = px, dy = py - 0.575, dz = pz - 0.058
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1
    const k = 0.022
    return [px + dx/len*k, py + dy/len*k, pz + dz/len*k]
  }
  if (Math.abs(px) > 0.15 && py > -0.15) {
    // Arms
    const sign = px < 0 ? -1 : 1
    return [px + sign * -0.012, py, pz + 0.012]
  }
  if (Math.abs(px) > 0.07 && py < -0.05) {
    // Legs
    const sign = px < 0 ? -1 : 1
    return [px + sign * -0.010, py, pz + 0.010]
  }
  if (pz > 0.04)  return [px, py, pz + 0.068]   // front torso
  if (pz < 0.00)  return [px, py, pz - 0.040]   // back torso
  return [px, py, pz + 0.026]
}

export function PainOverlay() {
  const selectedId      = useAtlasStore((s) => s.selectedId)
  const showPainOverlay = useAtlasStore((s) => s.showPainOverlay)

  const heatTex = useMemo(() => makeHeatTexture(), [])

  // Core: tight hot-spot
  const matCore = useMemo(() => new THREE.SpriteMaterial({
    map:             heatTex,
    transparent:     true,
    opacity:         0.82,
    depthTest:       false,
    depthWrite:      false,
    blending:        THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), [heatTex])

  // Bloom: wide feathered halo
  const matBloom = useMemo(() => new THREE.SpriteMaterial({
    map:             heatTex,
    transparent:     true,
    opacity:         0.38,
    depthTest:       false,
    depthWrite:      false,
    blending:        THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), [heatTex])

  // Slow, subtle pulse — no hard flashing, no solid-yellow peak
  useFrame(({ clock }) => {
    if (!selectedId || !showPainOverlay) return
    const pulse       = 0.76 + Math.sin(clock.elapsedTime * 0.80) * 0.08
    matCore.opacity   = pulse
    matBloom.opacity  = pulse * 0.46
  })

  useEffect(() => () => {
    heatTex.dispose()
    matCore.dispose()
    matBloom.dispose()
  }, [heatTex, matCore, matBloom])

  if (!selectedId || !showPainOverlay) return null
  const pattern = PAIN_PATTERNS[selectedId]
  if (!pattern) return null

  return (
    <group>
      {pattern.zones.flatMap((zoneKey) => {
        const zone = BODY_ZONES[zoneKey]
        if (!zone) return []

        const [sx, sy, sz] = zone.scale
        const pos = surfaceOffset(zone.pos)

        const footprint = Math.max(sx, sz)
        const coreW  = footprint * 3.4
        const coreH  = sy        * 2.6
        const bloomW = coreW  * 1.72
        const bloomH = coreH  * 1.60

        return [
          <sprite key={`${zoneKey}_c`} position={pos} scale={[coreW, coreH, 1]}
                  material={matCore}  renderOrder={6} />,
          <sprite key={`${zoneKey}_b`} position={pos} scale={[bloomW, bloomH, 1]}
                  material={matBloom} renderOrder={5} />,
        ]
      })}
    </group>
  )
}
