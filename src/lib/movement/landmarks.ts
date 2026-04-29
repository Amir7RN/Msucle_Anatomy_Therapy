/**
 * landmarks.ts
 *
 * MediaPipe Pose Landmarker indices and a small set of geometric helpers
 * for computing joint angles, distances, and asymmetries.
 *
 * MediaPipe returns 33 landmarks; we only label the ones we use.  Each
 * landmark has {x, y, z, visibility} where x/y are normalised image
 * coordinates [0..1] and z is approximate depth in metres relative to
 * the hips (negative = closer to camera).
 */

export interface Landmark {
  x: number
  y: number
  z: number
  visibility: number
}

export type LandmarkSet = Landmark[]

// MediaPipe Pose landmark indices (https://developers.google.com/mediapipe)
export const LM = {
  NOSE:        0,
  L_EYE:       2,
  R_EYE:       5,
  L_EAR:       7,
  R_EAR:       8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW:    13,
  R_ELBOW:    14,
  L_WRIST:    15,
  R_WRIST:    16,
  L_HIP:      23,
  R_HIP:      24,
  L_KNEE:     25,
  R_KNEE:     26,
  L_ANKLE:    27,
  R_ANKLE:    28,
  L_HEEL:     29,
  R_HEEL:     30,
  L_FOOT_IDX: 31,
  R_FOOT_IDX: 32,
} as const

/** Visibility threshold below which we treat a landmark as missing. */
export const MIN_VISIBILITY = 0.5

/** Distance between two 2D points in normalised image space. */
export function dist2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Angle (in degrees) at vertex B formed by A-B-C, in 2D image space.
 * Range: 0–180.
 */
export function jointAngleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x, v1y = a.y - b.y
  const v2x = c.x - b.x, v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-9
  const cos = Math.max(-1, Math.min(1, dot / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Angle of the vector A→B with respect to vertical (negative-Y), in degrees.
 * 0° = straight up, 90° = pointing right, 180° = pointing down.
 *
 * Note: image Y grows DOWNWARD, so "up" in the world is negative Y in image
 * coords; we flip the sign accordingly so callers can think in body terms.
 */
export function vectorVerticalAngleDeg(from: Landmark, to: Landmark): number {
  const dx = to.x - from.x
  const dy = -(to.y - from.y)   // flip so up is positive
  // angle from +Y axis, measured clockwise toward +X
  const ang = Math.atan2(dx, dy)
  return (ang * 180) / Math.PI
}

/** Symmetry score [0..1]: 1 = identical, 0 = totally asymmetric. */
export function symmetry(left: number, right: number): number {
  const a = Math.abs(left), b = Math.abs(right)
  const m = Math.max(a, b)
  if (m < 1e-6) return 1
  return 1 - Math.abs(a - b) / m
}

/** Shorthand: are all required landmarks visible enough? */
export function visible(lms: LandmarkSet, ...indices: number[]): boolean {
  return indices.every((i) => (lms[i]?.visibility ?? 0) >= MIN_VISIBILITY)
}
