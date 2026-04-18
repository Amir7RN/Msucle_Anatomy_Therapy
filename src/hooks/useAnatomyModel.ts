import { useEffect, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'

// ── SINGLE source of truth for the model path ─────────────────────────────────
// Keep in sync with HumanModel.tsx MODEL_PATH
export const ANATOMY_MODEL_PATH = '/models/human-muscular-system.glb'

/**
 * Probes the public folder for the GLB file with a HEAD request.
 * Sets modelStatus = 'placeholder' immediately if the file is missing,
 * allowing the 3D canvas to skip the Suspense/GLTF loader and render
 * the mock scene without a failed network round-trip showing errors.
 *
 * Tries /models/human-muscular-system.glb first (primary path),
 * then falls back to the old name for backward compatibility.
 */
export function useAnatomyModelProbe() {
  const setModelStatus = useAtlasStore((s) => s.setModelStatus)
  const [modelExists, setModelExists] = useState<boolean | null>(null)
  const [resolvedPath, setResolvedPath] = useState<string>(ANATOMY_MODEL_PATH)

  useEffect(() => {
    let cancelled = false

    const candidates = [
      '/models/human-muscular-system.glb',
      '/models/human-muscle-atlas.glb',
      '/models/human-muscles.glb',
    ]

    async function probe() {
      for (const path of candidates) {
        try {
          const res = await fetch(path, { method: 'HEAD' })
          if (cancelled) return
          if (res.ok) {
            setModelExists(true)
            setResolvedPath(path)
            // Keep status = 'loading'; GLTFScene will set it to 'loaded'
            return
          }
        } catch {
          // network error or CORS — try next candidate
        }
      }
      if (!cancelled) {
        setModelExists(false)
        setModelStatus('placeholder')
      }
    }

    probe()
    return () => { cancelled = true }
  }, [setModelStatus])

  return { modelExists, modelPath: resolvedPath }
}
