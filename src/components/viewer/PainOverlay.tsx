/**
 * PainOverlay.tsx — Surface-conforming pain referral heatmap  (v3 — DecalGeometry)
 *
 * ── Architecture upgrade: PlaneGeometry → THREE.DecalGeometry ─────────────────
 *
 * Root cause of v2 "flat disc" problem:
 *   PlaneGeometry meshes are fundamentally flat.  Even when their normal is
 *   oriented toward the surface, they are a rigid quad that clips through
 *   curved anatomy — most visibly on the gluteus (large hemisphere), the
 *   oblique muscle ribs (serrated surface), and the deltoid (round shoulder).
 *
 * Fix — DecalGeometry:
 *   For each pain zone, a raycaster shoots from 30 cm outside the body toward
 *   the zone centre.  At the FIRST mesh intersection, DecalGeometry projects a
 *   UV-mapped quad box onto the actual triangles of the hit mesh, clipping them
 *   and building new geometry that perfectly conforms to every local curve —
 *   gluteus roundness, rib serrations, deltoid hemisphere, calf bulge, etc.
 *
 *   depthTest: true  → zones correctly hidden by muscles in front of them
 *   polygonOffset -4 → decal renders just above the surface (no Z-fight)
 *   AdditiveBlending → multiple overlapping zones accumulate naturally
 *
 * Gradient: burnt-orange (#CC5500) core → golden-yellow (#FFD700) at edge → 0%
 * Pulse:    0.40 – 0.60 opacity, 0.80 Hz — soft clinical "infrared scan" feel
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import { useFrame, useThree } from '@react-three/fiber'
import { useAtlasStore } from '../../store/atlasStore'
import { PAIN_PATTERNS, BODY_ZONES } from '../../data/painPatterns'

// ── Radial heat texture — Orange-Fire palette ─────────────────────────────────
//
// Color spec (Merck/clinical heatmap standard):
//   Centre  — Vivid Orange  #FF8C00 (255, 140,   0) — maximum intensity
//   Mid     — Warm Amber    #FFBF00 (255, 191,   0) — mid-range spread
//   Edge    — Transparent peach → fully clear alpha
//
// The two-stop centre keeps the hot core small and crisp, matching the
// Travell & Simons trigger-point zone illustrations.
function makeHeatTexture(): THREE.CanvasTexture {
  const sz  = 512
  const c   = document.createElement('canvas')
  c.width = c.height = sz
  const ctx = c.getContext('2d')!
  const h   = sz / 2
  const g   = ctx.createRadialGradient(h, h, 0, h, h, h)
  g.addColorStop(0.00, 'rgba(255, 140,   0, 0.95)')   // #FF8C00 — vivid orange core
  g.addColorStop(0.12, 'rgba(255, 160,   0, 0.88)')   // bright orange
  g.addColorStop(0.28, 'rgba(255, 191,   0, 0.65)')   // #FFBF00 — warm amber
  g.addColorStop(0.48, 'rgba(255, 210,  60, 0.35)')   // golden fade
  g.addColorStop(0.70, 'rgba(255, 225, 120, 0.12)')   // soft peach
  g.addColorStop(1.00, 'rgba(255, 235, 180, 0.00)')   // fully transparent
  ctx.fillStyle = g
  ctx.fillRect(0, 0, sz, sz)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

// ── Per-decal instance ─────────────────────────────────────────────────────────
interface DecalInst {
  key:      string
  geometry: THREE.BufferGeometry
}

// ── Shared orientation helper (avoids per-zone heap allocation) ────────────────
const _orient = new THREE.Object3D()
const UP_Y    = new THREE.Vector3(0, 1, 0)
const UP_Z    = new THREE.Vector3(0, 0, 1)   // fallback when face normal ≈ ±Y

// ─────────────────────────────────────────────────────────────────────────────
export function PainOverlay() {
  const selectedId      = useAtlasStore((s) => s.selectedId)
  const showPainOverlay = useAtlasStore((s) => s.showPainOverlay)
  const modelStatus     = useAtlasStore((s) => s.modelStatus)
  const { scene: rootScene } = useThree()

  const heatTex = useMemo(() => makeHeatTexture(), [])

  // ── Shared MeshBasicMaterial (all decals share one instance) ─────────────────
  //
  // Layering strategy (v4 — outermost-surface fix):
  //   depthTest   false → heatmap draws over all geometry in its renderOrder group;
  //                        eliminates the "trapped inside geometry" artefact where
  //                        the pulsing glow is occluded by a muscle surface sitting
  //                        just 0.001 units in front of the decal origin.
  //   depthWrite  false → does not corrupt the depth buffer for other passes
  //   AdditiveBlending  → overlapping zones accumulate brightness (not clipping)
  //   polygonOffset -6  → belt-and-suspenders; still prevents Z-fight against the
  //                        host mesh when depthTest is re-enabled during debugging
  //   renderOrder  10   → drawn after all scene geometry (muscles = 0, priority
  //                        arm muscles = 5, BodySurface = -1)
  //
  //   onBeforeCompile   → injects a 5 mm outward normal-expansion in the vertex
  //                        shader (position += normal * 0.005 in local space).
  //                        Creates a microscopic "shell" that clears the surface
  //                        of the host mesh — failsafe against residual depth ties.
  const heatMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map:         heatTex,
      transparent: true,
      opacity:     0.55,
      depthTest:   false,   // ← draw over all geometry; no more "trapped" glow
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    })
    m.polygonOffset       = true
    m.polygonOffsetFactor = -6
    m.polygonOffsetUnits  = -6

    // ── Normal-expansion shell (5 mm outward push) ─────────────────────────
    //
    // Appending `transformed += normal * 0.005` after #include <begin_vertex>
    // pushes every vertex 5 mm along its local normal, creating a thin shell
    // that sits just above the muscle surface the decal was projected onto.
    // This eliminates coplanar Z-fighting independently of polygonOffset.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed += normal * 0.005;`
      )
    }
    m.customProgramCacheKey = () => 'pain-heatmat-v4'

    return m
  }, [heatTex])

  // ── Pulse: 0.40 – 0.60 opacity at 0.80 Hz ───────────────────────────────────
  useFrame(({ clock }) => {
    if (!selectedId || !showPainOverlay) return
    heatMat.opacity = 0.50 + Math.sin(clock.elapsedTime * Math.PI * 1.60) * 0.10
  })

  // ── DecalGeometry build ──────────────────────────────────────────────────────
  //
  // Runs once per selection change.  Algorithm per zone:
  //   1. Compute outward ray direction: from the body Y-spine at zone height
  //      toward the zone centre (gives correct lateral/anterior/posterior aim).
  //   2. Start the ray 30 cm outside the body surface, shoot inward.
  //   3. Gather all visible scene meshes that have position + normal attributes.
  //   4. Take the nearest hit — the outermost surface layer at that zone.
  //   5. Transform the hit face normal to world space.
  //   6. Orient a helper Object3D so its −Z faces along the outward normal,
  //      making the decal's +Z projection direction go INTO the surface.
  //   7. Build DecalGeometry: clips hit-mesh triangles inside the projection
  //      box and maps the heat texture UV — geometry conforms to mesh curvature.
  //
  const decals = useMemo<DecalInst[]>(() => {
    if (!selectedId || !showPainOverlay) return []
    if (modelStatus !== 'loaded')        return []

    const pattern = PAIN_PATTERNS[selectedId]
    if (!pattern) return []

    // ── Gather candidate meshes ──────────────────────────────────────────────
    // Exclude:
    //   • invisible objects (hidden/ghosted)
    //   • our own decal meshes (renderOrder 10) — prevents self-projection
    //   • BodySurface skin primitives (isSkinSurface=true) — the skin silhouette
    //     is a coarse geometric proxy; projecting onto it instead of real muscle
    //     geometry causes wrong-location decals (e.g. a hip zone ray hitting the
    //     hanging arm's wrist capsule at the same y-height as the hip)
    //   • meshes without position + normal attributes (DecalGeometry requires both)
    const candidates: THREE.Mesh[] = []
    rootScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh))          return
      if (!obj.visible)                           return
      if (obj.renderOrder === 10)                 return
      if (obj.userData?.isSkinSurface)            return   // ← skip BodySurface
      const geo = obj.geometry
      if (!geo.attributes.position || !geo.attributes.normal) return
      candidates.push(obj)
    })
    if (candidates.length === 0) return []

    // Ensure world matrices are current (may not have been synced this tick)
    candidates.forEach((m) => m.updateWorldMatrix(true, false))

    const raycaster = new THREE.Raycaster()
    raycaster.near  = 0
    raycaster.far   = 0.70

    const normalMat = new THREE.Matrix3()
    const results: DecalInst[] = []

    for (const zoneKey of pattern.zones) {
      const zone = BODY_ZONES[zoneKey]
      if (!zone) continue

      const zonePos = new THREE.Vector3(zone.pos[0], zone.pos[1], zone.pos[2])

      // ── Outward ray direction ─────────────────────────────────────────────
      // Aim from the body's Y-spine at the zone's height toward the zone centre.
      // This gives the correct lateral direction for arm/leg zones and the
      // correct anterior/posterior direction for torso/back zones.
      const spineRef = new THREE.Vector3(0, zonePos.y, 0)
      const outDir   = new THREE.Vector3().subVectors(zonePos, spineRef)

      // Fallback for zones near the vertical axis (head_vertex, head_occiput, etc.)
      if (outDir.lengthSq() < 0.0004) {
        // Use the zone's position relative to mid-body-height
        outDir.subVectors(zonePos, new THREE.Vector3(0, 0.5, 0))
      }
      outDir.normalize()

      raycaster.set(
        zonePos.clone().addScaledVector(outDir, 0.30),   // origin: 30 cm outside
        outDir.clone().negate(),                           // direction: inward
      )

      const hits = raycaster.intersectObjects(candidates, false)
      if (hits.length === 0) continue

      // ── Proximity filter ──────────────────────────────────────────────────
      //
      // The ray travels outward across the body, so it can hit multiple meshes
      // including ones on the OPPOSITE side.  Classic failure modes:
      //
      //  • lat_hip_l ray (aimed at hip, y≈-0.148) hits the LEFT ARM WRIST at
      //    the same y-height before reaching the actual gluteus muscle — because
      //    the hanging arm is 13 cm further out than the hip in the XZ plane.
      //
      //  • arch_l ray overshoots the left foot and hits the RIGHT heel box
      //    (same y=-0.915, opposite x) at 15 cm from zone centre.
      //
      // Fix: iterate hits in ascending distance order (already sorted by Three.js)
      // and accept the first hit whose surface point lies within 12 cm of the
      // zone centre.  Correct hits are typically 1–5 cm away; cross-body hits
      // are 13+ cm away and get skipped — the next hit in the list is the
      // correct anatomy on the right side.
      //
      const ZONE_HIT_RADIUS = 0.12   // 12 cm acceptance radius
      let hit: THREE.Intersection | undefined
      for (const h of hits) {
        if (!h.face) continue
        if (h.point.distanceTo(zonePos) <= ZONE_HIT_RADIUS) {
          hit = h
          break
        }
      }
      if (!hit || !hit.face) continue

      const hitMesh = hit.object as THREE.Mesh

      // ── Face normal in world space ────────────────────────────────────────
      normalMat.getNormalMatrix(hitMesh.matrixWorld)
      const faceNormal = hit.face.normal
        .clone()
        .applyMatrix3(normalMat)
        .normalize()

      // ── Decal orientation ─────────────────────────────────────────────────
      // Object3D.lookAt makes −Z face the target.
      // Target = hitPoint + faceNormal → −Z faces outward → +Z faces inward.
      // The decal projects along its own +Z, so this places the projection
      // volume "outside" the surface and shoots inward through it — correct.
      const upHint = Math.abs(faceNormal.dot(UP_Y)) > 0.98 ? UP_Z : UP_Y
      _orient.up.copy(upHint)
      _orient.position.copy(hit.point)
      _orient.lookAt(hit.point.clone().add(faceNormal))
      const orientation = new THREE.Euler().copy(_orient.rotation)

      // ── Decal projection box ──────────────────────────────────────────────
      //
      // Zone scale values are half-radii of the pain ellipsoid in world space.
      // Diameter = 2 × scale.  We use a multiplier of 2.4 so the decal is
      // 20 % wider than the anatomical zone, letting the gradient taper fully
      // to transparent before reaching the edge — giving a soft, "embedded"
      // appearance rather than a hard-edged disc.
      //
      // depth (projection box thickness) = footprint × 1.2 — enough to pierce
      // thick curved surfaces (gluteus hemisphere, deltoid, thigh) without
      // projecting so deep that the back face of the mesh gets textured.
      const [sx, sy, sz2] = zone.scale
      const footprint  = Math.max(sx, sz2) * 2.4   // was 5.8 — zone diameter × 1.2
      const depth      = Math.max(footprint, sy * 2) * 1.2
      const decalSize  = new THREE.Vector3(footprint, footprint, depth)

      try {
        const geo = new DecalGeometry(hitMesh, hit.point, orientation, decalSize)
        results.push({ key: zoneKey, geometry: geo })
      } catch (_) {
        // DecalGeometry may throw on degenerate or empty intersections — skip
      }
    }

    return results
  }, [selectedId, showPainOverlay, modelStatus, rootScene])

  // ── Geometry disposal ────────────────────────────────────────────────────────
  // React runs the previous effect's cleanup AFTER committing the next render,
  // so old geometries are freed only after the new ones are already on the GPU.
  useEffect(() => {
    return () => {
      decals.forEach((d) => d.geometry.dispose())
    }
  }, [decals])

  // Dispose shared resources on unmount
  useEffect(() => () => {
    heatTex.dispose()
    heatMat.dispose()
  }, [heatTex, heatMat])

  if (!selectedId || !showPainOverlay || decals.length === 0) return null

  return (
    <group>
      {decals.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={heatMat}
          renderOrder={10}
        />
      ))}
    </group>
  )
}
