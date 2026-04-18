import * as THREE from 'three'

/** Default camera position for the front anatomical view */
export const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 0.1, 2.8)
export const DEFAULT_CAMERA_TARGET   = new THREE.Vector3(0, 0.1, 0)

/** Camera preset positions for quick anatomical views */
export const CAMERA_PRESETS = {
  front:  { position: new THREE.Vector3(0,    0.1,  2.8), target: new THREE.Vector3(0, 0.1, 0) },
  back:   { position: new THREE.Vector3(0,    0.1, -2.8), target: new THREE.Vector3(0, 0.1, 0) },
  left:   { position: new THREE.Vector3(-2.8, 0.1,  0),   target: new THREE.Vector3(0, 0.1, 0) },
  right:  { position: new THREE.Vector3( 2.8, 0.1,  0),   target: new THREE.Vector3(0, 0.1, 0) },
  top:    { position: new THREE.Vector3(0,    3.2,  0.01), target: new THREE.Vector3(0, 0.1, 0) },
  bottom: { position: new THREE.Vector3(0,   -3.2,  0.01), target: new THREE.Vector3(0, 0.1, 0) },
} as const

export type CameraPresetKey = keyof typeof CAMERA_PRESETS

/**
 * Compute the centre-point and radius of a mesh's bounding sphere.
 * Used when focusing the camera on a selected structure.
 */
export function getMeshBoundingSphere(mesh: THREE.Mesh): THREE.Sphere {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
  const sphere = mesh.geometry.boundingSphere!.clone()
  sphere.applyMatrix4(mesh.matrixWorld)
  return sphere
}

/**
 * Compute a camera position that frames a given bounding sphere.
 * Returns the ideal eye position assuming a 45° half-fov camera.
 */
export function frameSphere(sphere: THREE.Sphere, camera: THREE.PerspectiveCamera): THREE.Vector3 {
  const fovRad = (camera.fov * Math.PI) / 180
  const dist   = sphere.radius / Math.sin(fovRad / 2) * 1.4
  const dir    = camera.position.clone().sub(sphere.center).normalize()
  return sphere.center.clone().addScaledVector(dir, dist)
}

/**
 * Smoothly animate the camera to a new position/target over `duration` ms.
 * Returns a cancel function.
 */
export function animateCamera(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3 },
  targetPosition: THREE.Vector3,
  targetLookAt: THREE.Vector3,
  duration = 600,
): () => void {
  const startPos    = camera.position.clone()
  const startTarget = controls.target.clone()
  const startTime   = performance.now()
  let cancelled     = false

  function easeInOut(t: number) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }

  function tick() {
    if (cancelled) return
    const elapsed = performance.now() - startTime
    const t       = Math.min(elapsed / duration, 1)
    const e       = easeInOut(t)

    camera.position.lerpVectors(startPos, targetPosition, e)
    controls.target.lerpVectors(startTarget, targetLookAt, e)

    if (t < 1) requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
  return () => { cancelled = true }
}
