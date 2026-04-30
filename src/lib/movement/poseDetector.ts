/**
 * poseDetector.ts
 *
 * Thin wrapper around MediaPipe Pose Landmarker.
 *
 * Version pinning
 *   The WASM bundle URL must match the installed JS package version exactly,
 *   or the runtime will load a mismatched WASM and fail with cryptic errors
 *   ("Cannot read property 'XX' of undefined" or similar).  The version
 *   below is read from the installed @mediapipe/tasks-vision module — bump
 *   it when you upgrade the package.
 *
 * GPU → CPU fallback
 *   The 'GPU' delegate uses WebGPU which is NOT available on:
 *     • Older Safari versions
 *     • Some Linux + Firefox combos
 *     • Browsers behind enterprise security policies
 *   We try GPU first, fall back to CPU if creation throws.  CPU is slower
 *   (~15 fps vs 30 fps) but works everywhere.
 *
 * Diagnostics
 *   Every step is console-logged with a [pose] prefix so failures are easy
 *   to spot in DevTools.  Errors thrown from here include the underlying
 *   message verbatim so the UI can show something useful.
 */

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { LandmarkSet } from './landmarks'

// MUST match the version in package.json's @mediapipe/tasks-vision dependency.
const MEDIAPIPE_VERSION = '0.10.35'

const WASM_BASE  = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

let _detector: PoseLandmarker | null = null
let _initPromise: Promise<PoseLandmarker> | null = null

export async function ensureDetector(): Promise<PoseLandmarker> {
  if (_detector) return _detector
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    console.log('[pose] resolving WASM fileset from', WASM_BASE)
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      .catch((e) => { throw new Error(`MediaPipe WASM load failed: ${e?.message ?? e}`) })

    console.log('[pose] downloading model from', MODEL_URL)

    // Try GPU first; on failure fall back to CPU silently.
    let det: PoseLandmarker
    try {
      det = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses:    1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence:  0.5,
        minTrackingConfidence:      0.5,
      })
      console.log('[pose] detector ready (GPU delegate)')
    } catch (gpuErr) {
      console.warn('[pose] GPU delegate failed, falling back to CPU:', gpuErr)
      try {
        det = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses:    1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence:  0.5,
          minTrackingConfidence:      0.5,
        })
        console.log('[pose] detector ready (CPU delegate)')
      } catch (cpuErr) {
        throw new Error(
          `Pose model failed to load. ` +
          `GPU error: ${(gpuErr as Error)?.message ?? gpuErr}. ` +
          `CPU error: ${(cpuErr as Error)?.message ?? cpuErr}.`,
        )
      }
    }
    _detector = det
    return det
  })()

  try {
    return await _initPromise
  } catch (e) {
    _initPromise = null   // allow retry next click
    throw e
  }
}

export function detectVideoFrame(
  detector:  PoseLandmarker,
  video:     HTMLVideoElement,
  timestamp: number,
): LandmarkSet | null {
  const result = detector.detectForVideo(video, timestamp)
  const list = result.landmarks?.[0]
  if (!list || list.length === 0) return null
  return list.map((p) => ({
    x:          p.x,
    y:          p.y,
    z:          p.z ?? 0,
    visibility: p.visibility ?? 0,
  }))
}

export function disposeDetector(): void {
  if (_detector) {
    try { _detector.close() } catch {}
    _detector = null
    _initPromise = null
  }
}
