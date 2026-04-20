import { useEffect, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'

// ── SINGLE source of truth for the model path ─────────────────────────────────
//
// import.meta.env.BASE_URL is set by Vite from the `base` config option:
//   • local dev  (`npm run dev`)        → BASE_URL = "/"
//   • GitHub Pages build                → BASE_URL = "/Msucle_Anatomy_Therapy/"
//
// Using BASE_URL here means the path is always correct regardless of where
// the app is served — no hardcoded sub-directory needed in the source.
//
export const ANATOMY_MODEL_PATH =
  `${import.meta.env.BASE_URL}models/human-muscular-system.glb`

/**
 * Probes the public folder for the GLB file with a HEAD request.
 * Sets modelStatus = 'placeholder' immediately if the file is missing,
 * allowing the 3D canvas to skip the Suspense/GLTF loader and render
 * the mock scene without a failed network round-trip showing errors.
 *
 * Tries human-muscular-system.glb first, then falls back to old names.
 */
export function useAnatomyModelProbe() {
  const setModelStatus = useAtlasStore((s) => s.setModelStatus)
  const [modelExists, setModelExists] = useState<boolean | null>(null)
  const [resolvedPath, setResolvedPath] = useState<string>(ANATOMY_MODEL_PATH)

  useEffect(() => {
    let cancelled = false

    const base = import.meta.env.BASE_URL   // '' | '/' | '/Msucle_Anatomy_Therapy/'
    const candidates = [
      `${base}models/human-muscular-system.glb`,
      `${base}models/human-muscle-atlas.glb`,
      `${base}models/human-muscles.glb`,
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
