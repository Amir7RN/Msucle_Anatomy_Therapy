/**
 * poseDetector.ts
 *
 * Thin wrapper around MediaPipe Pose Landmarker.
 *
 * Version pinning
 *   The WASM bundle URL must match the installed @mediapipe/tasks-vision
 *   version exactly, or the runtime will load a mismatched WASM and fail with
 *   cryptic errors. `DEFAULT_WASM_BASE` below is pinned to the version this
 *   package's package.json depends on — if you upgrade that dependency, pass
 *   a matching `wasmBaseUrl` (or bump the default here).
 *
 * GPU → CPU fallback
 *   The 'GPU' delegate uses WebGPU/WebGL which is NOT available on some older
 *   browsers or locked-down environments. We try GPU first (or whatever
 *   `delegate` option is given), falling back to CPU if creation throws. CPU
 *   is slower (~12-18 fps vs ~30 fps) but works everywhere.
 *
 * Self-hosting for production
 *   The defaults point at Google's/jsDelivr's public CDN, which is fine for a
 *   pilot/demo but not ideal for a production embed (an outage or CDN block
 *   on the partner's network would break tracking). Pass `modelUrl`/
 *   `wasmBaseUrl` pointing at your own hosted copies to remove that
 *   dependency — see this package's README for exactly which files to mirror.
 */

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { LandmarkSet } from './landmarks'

// Must match the installed @mediapipe/tasks-vision version in package.json.
const DEFAULT_MEDIAPIPE_VERSION = '0.10.35'
const DEFAULT_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${DEFAULT_MEDIAPIPE_VERSION}/wasm`
// Heavy model = best accuracy (~26 MB, ~12-18 fps on CPU, ~30 fps on GPU).
// Small angle errors compound in goniometric readings, so this package
// defaults to accuracy over raw frame rate — pass a lighter modelUrl
// (MediaPipe also ships "full" and "lite" pose_landmarker variants) if your
// application needs higher throughput more than it needs precision.
const DEFAULT_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task'

export interface PoseDetectorOptions {
  /** Override the pose landmarker .task model asset (self-host for production). */
  modelUrl?: string
  /** Override the MediaPipe WASM fileset base URL (must match your installed
   *  @mediapipe/tasks-vision version). */
  wasmBaseUrl?: string
  /** 'GPU' (default, tried first) or 'CPU'. Falls back to CPU automatically
   *  if GPU creation throws, regardless of what you pass here. */
  delegate?: 'GPU' | 'CPU'
}

/**
 * Create a ready-to-use PoseLandmarker. Each call creates a NEW detector
 * instance (no hidden global singleton) so multiple independent trackers on
 * the same page don't share or fight over state — but note that also means
 * each one re-downloads/re-initialises the ~26 MB model, so most integrations
 * should create exactly one and reuse it (see `LowerLimbTracker`).
 */
export async function createPoseDetector(opts: PoseDetectorOptions = {}): Promise<PoseLandmarker> {
  const wasmBase = opts.wasmBaseUrl ?? DEFAULT_WASM_BASE
  const modelUrl = opts.modelUrl ?? DEFAULT_MODEL_URL
  const preferred = opts.delegate ?? 'GPU'

  const fileset = await FilesetResolver.forVisionTasks(wasmBase)
    .catch((e) => { throw new Error(`MediaPipe WASM load failed: ${e?.message ?? e}`) })

  const baseOptions = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
    // Lenient thresholds so a small/far/partially-occluded subject keeps
    // tracking; per-landmark visibility gating downstream filters out
    // genuinely unreliable joints.
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  })

  try {
    return await PoseLandmarker.createFromOptions(fileset, baseOptions(preferred))
  } catch (primaryErr) {
    if (preferred === 'CPU') {
      throw new Error(`Pose model failed to load (CPU delegate): ${(primaryErr as Error)?.message ?? primaryErr}`)
    }
    try {
      return await PoseLandmarker.createFromOptions(fileset, baseOptions('CPU'))
    } catch (cpuErr) {
      throw new Error(
        `Pose model failed to load. GPU error: ${(primaryErr as Error)?.message ?? primaryErr}. ` +
        `CPU error: ${(cpuErr as Error)?.message ?? cpuErr}.`,
      )
    }
  }
}

export function detectVideoFrame(
  detector: PoseLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
): LandmarkSet | null {
  const result = detector.detectForVideo(video, timestamp)
  const img = result.landmarks?.[0]
  if (!img || img.length === 0) return null

  // World landmarks (metres, hip-centered, gravity-aligned) are emitted in
  // parallel and indexed identically. They're the basis for accurate joint
  // angles when the user is rotated relative to the camera — image-space
  // angles foreshorten in that case, world-space ones do not.
  const world = result.worldLandmarks?.[0]

  return img.map((p, i) => {
    const w = world?.[i]
    return {
      x: p.x,
      y: p.y,
      z: p.z ?? 0,
      visibility: p.visibility ?? 0,
      wx: w ? w.x : undefined,
      wy: w ? w.y : undefined,
      wz: w ? w.z : undefined,
    }
  })
}

export function disposePoseDetector(detector: PoseLandmarker | null): void {
  if (detector) { try { detector.close() } catch { /* already closed */ } }
}
