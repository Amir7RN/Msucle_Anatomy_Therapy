/**
 * SchematicMarkers.tsx
 *
 * Lives INSIDE the R3F <Canvas>.  Each frame projects active diagnostic
 * muscle world-positions to screen-space and writes to schematicStore.
 *
 * Side fix: we now pass the click-point to filterMeshIdsBySide so that
 * only the CORRECT side's mesh(es) are used for centroid computation.
 * Previously, both left and right meshes were averaged, placing the tip dot
 * between them (middle of the torso) instead of on the clicked side.
 *
 * Performance: mesh lookups are cached per (muscle_id, side) key.
 */

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useAtlasStore } from '../../store/atlasStore'
import {
  DIAGNOSTIC_TO_MESH_IDS,
  filterMeshIdsBySide,
  type MuscleContribution,
} from '../../lib/diagnostic'
import { useSchematicStore, type SchematicMarker } from './schematicStore'

/** Probability floor for inclusion in the schematic. */
const MIN_PROBABILITY = 0.10

const _box = new THREE.Box3()
const _v3  = new THREE.Vector3()

interface ResolvedTarget {
  muscle_id:    string
  common_name:  string
  probability:  number
  matchType:    'primary' | 'referred'
  /** Side-filtered mesh IDs (only left OR right, matching the click). */
  sideMeshIds:  string[]
  worldPos:     THREE.Vector3
}

export function SchematicMarkers() {
  const { camera, scene, size } = useThree()
  const setMarkers       = useSchematicStore((s) => s.setMarkers)
  const clearMarkers     = useSchematicStore((s) => s.clear)
  const diagnosticResult = useAtlasStore((s) => s.diagnosticResult)

  // Cache: cacheKey → resolved meshes.  Key includes the side so flipping the
  // model (viewing from back) and re-clicking the opposite side doesn't reuse
  // a stale cache entry for the wrong side.
  const meshCacheRef = useRef<Map<string, THREE.Mesh[]>>(new Map())

  // Click point in world space — drives side filtering.
  const clickVec = useMemo<THREE.Vector3 | null>(() => {
    if (!diagnosticResult?.clickPoint) return null
    const [x, y, z] = diagnosticResult.clickPoint
    return new THREE.Vector3(x, y, z)
  }, [diagnosticResult])

  // Build targets once per diagnostic change.
  const targets = useMemo<ResolvedTarget[]>(() => {
    if (!diagnosticResult) return []
    return diagnosticResult.contributions
      .filter((c: MuscleContribution) => c.probability >= MIN_PROBABILITY)
      .map((c) => {
        const allIds  = DIAGNOSTIC_TO_MESH_IDS[c.muscle_id] ?? []
        const sideIds = clickVec
          ? filterMeshIdsBySide(allIds, clickVec)
          : allIds
        return {
          muscle_id:   c.muscle_id,
          common_name: c.common_name,
          probability: c.probability,
          matchType:   c.matchType,
          sideMeshIds: sideIds,
          worldPos:    new THREE.Vector3(),
        }
      })
  }, [diagnosticResult, clickVec])

  // Clear markers when diagnostic is cleared.
  useEffect(() => {
    if (!diagnosticResult) clearMarkers()
  }, [diagnosticResult, clearMarkers])

  // Invalidate mesh cache when the scene changes.
  useEffect(() => { meshCacheRef.current.clear() }, [scene])

  useFrame(() => {
    if (targets.length === 0) return

    const out: Record<string, SchematicMarker> = {}

    for (const t of targets) {
      // Cache key includes the first side mesh ID so changing sides invalidates.
      const cacheKey = `${t.muscle_id}::${t.sideMeshIds[0] ?? ''}`
      let meshes = meshCacheRef.current.get(cacheKey)

      if (!meshes) {
        meshes = []
        const wanted = new Set(t.sideMeshIds)
        scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          const sid = obj.userData?.structureId as string | undefined
          if (sid && wanted.has(sid)) meshes!.push(obj)
        })
        meshCacheRef.current.set(cacheKey, meshes)
      }

      if (meshes.length === 0) continue

      // World-space centroid: average bbox centres of side-correct meshes.
      _v3.set(0, 0, 0)
      let n = 0
      for (const m of meshes) {
        _box.setFromObject(m)
        if (!_box.isEmpty()) {
          _box.getCenter(t.worldPos)
          _v3.add(t.worldPos)
          n += 1
        }
      }
      if (n === 0) continue
      _v3.divideScalar(n)

      // Project to screen-space.
      const proj    = _v3.clone().project(camera)
      const screenX = (proj.x * 0.5 + 0.5) * size.width
      const screenY = (-proj.y * 0.5 + 0.5) * size.height
      const visible = proj.z >= -1 && proj.z <= 1

      out[t.muscle_id] = {
        muscle_id:   t.muscle_id,
        common_name: t.common_name,
        probability: t.probability,
        matchType:   t.matchType,
        worldPos:    [_v3.x, _v3.y, _v3.z],
        screenX, screenY, visible,
      }
    }

    setMarkers(out)
  })

  return null
}
