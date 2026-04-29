/**
 * poseDetector.ts
 *
 * Thin wrapper around MediaPipe Pose Landmarker.  Initialises once per
 * page load (the model + WASM bundle is fetched from a CDN), then exposes
 * a synchronous detectForVideo() that returns the latest landmark set.
 *
 * Runs entirely on-device — no images leave the browser.
 */

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { LandmarkSet } from './landmarks'

const WASM_BASE  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.16/wasm'
const MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

let _detector: PoseLandmarker | null = null
let _initPromise: Promise<PoseLandmarker> | null = null

/**
 * Lazily initialise the detector.  Safe to call repeatedly — first call
 * downloads the model, subsequent calls return the cached instance.
 */
export async function ensureDetector(): Promise<PoseLandmarker> {
  if (_detector) return _detector
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    const det = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate:       'GPU',
      },
      runningMode:           'VIDEO',
      numPoses:              1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence:  0.5,
      minTrackingConfidence:      0.5,
    })
    _detector = det
    return det
  })()

  try {
    return await _initPromise
  } catch (e) {
    _initPromise = null
    throw e
  }
}

/**
 * Run detection on a video frame.  Returns the first detected pose's
 * 33 landmarks in normalised image coordinates, or null if nothing
 * was detected this frame.
 */
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

/** Free GPU resources (call when leaving the assessment screen). */
export function disposeDetector(): void {
  if (_detector) {
    try { _detector.close() } catch {}
    _detector = null
    _initPromise = null
  }
}
