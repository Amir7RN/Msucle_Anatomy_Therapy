import { useEffect } from 'react'
import type * as THREE from 'three'
import { useAtlasStore } from '../store/atlasStore'
import { buildSceneIndex } from '../lib/anatomyIndex'

/**
 * Call this hook once when a real THREE scene graph has been loaded
 * (e.g. from a GLB). It traverses the scene, builds the full SceneIndex,
 * and pushes it into the global store.
 */
export function useSceneIndex(scene: THREE.Object3D | null) {
  const setSceneIndex  = useAtlasStore((s) => s.setSceneIndex)
  const setModelStatus = useAtlasStore((s) => s.setModelStatus)

  useEffect(() => {
    if (!scene) return

    const index = buildSceneIndex(scene)
    setSceneIndex(index)
    setModelStatus('loaded')

    // Cleanup: revert to metadata-only index when the scene is unmounted
    return () => {
      setModelStatus('placeholder')
    }
  }, [scene, setSceneIndex, setModelStatus])
}
