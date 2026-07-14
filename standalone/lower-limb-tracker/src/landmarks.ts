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
 *
 * World-coordinate channel (wx / wy / wz)
 * ───────────────────────────────────────
 * MediaPipe's pose_landmarker_heavy model also produces a separate set of
 * "world landmarks" — the same joints expressed as 3-D positions in METRES,
 * hip-midpoint at the origin, gravity-aligned (Y down). Unlike the 2-D image
 * landmarks they're roughly invariant to the user's rotation around their own
 * vertical axis: a 90° elbow flexion measures ~90° whether the user faces the
 * camera dead-on or stands at a 30° angle. Image-space angles foreshorten in
 * that case and read as low as 70°.
 *
 * The world-coords are PASSED THROUGH on every landmark as optional fields.
 * `jointAngleDeg` and `vectorVerticalAngleDeg` below transparently use them
 * when available and fall back to 2-D image coords otherwise, so existing
 * call sites get the accuracy boost with no signature change.
 */

export interface Landmark {
  x: number
  y: number
  z: number
  visibility: number
  /** World-space coords (metres, hip-centered, gravity-down).  Optional —
   *  present when the caller passes through MediaPipe's worldLandmarks output. */
  wx?: number
  wy?: number
  wz?: number
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

/** True when ALL three landmarks carry a world-coord triple. */
function has3D(a: Landmark, b: Landmark, c?: Landmark): boolean {
  if (a.wx === undefined || b.wx === undefined) return false
  if (c && c.wx === undefined) return false
  return true
}

/**
 * Angle (in degrees) at vertex B formed by A-B-C.
 *
 * Prefers 3-D world coordinates (metres, gravity-aligned) when all three
 * landmarks carry them — this is what unlocks accurate elbow / knee / hip
 * angles when the user is rotated relative to the camera (the dominant
 * accuracy problem with a single webcam).
 *
 * Falls back to 2-D image-space if any world coord is missing, preserving
 * the old behaviour for partially-occluded frames.
 *
 * Range: 0–180.
 */
export function jointAngleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  if (has3D(a, b, c)) {
    // 3-D vector angle — invariant to camera rotation around the user.
    const v1x = a.wx! - b.wx!, v1y = a.wy! - b.wy!, v1z = a.wz! - b.wz!
    const v2x = c.wx! - b.wx!, v2y = c.wy! - b.wy!, v2z = c.wz! - b.wz!
    const dot = v1x * v2x + v1y * v2y + v1z * v2z
    const mag = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z) + 1e-9
    const cos = Math.max(-1, Math.min(1, dot / mag))
    return (Math.acos(cos) * 180) / Math.PI
  }
  // 2-D fallback — projects the limb onto the image plane.  Underestimates
  // angles whose joints have depth separation (limb pointing toward camera).
  const v1x = a.x - b.x, v1y = a.y - b.y
  const v2x = c.x - b.x, v2y = c.y - b.y
  const dot = v1x * v2x + v1y * v2y
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-9
  const cos = Math.max(-1, Math.min(1, dot / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Angle of the vector A→B with respect to vertical, in degrees.
 * 0° = straight up, 90° = pointing right (image / camera-X), 180° = down.
 *
 * Uses 3-D world coords when available.  In MediaPipe's world space Y points
 * down (gravity-aligned), so "up" is −Y.  The sign of the returned angle
 * tracks camera-X (the world wx axis), matching the old 2-D semantics where
 * positive = user's right / image right.
 *
 * Falls back to 2-D image coords if either landmark lacks a world triple.
 */
export function vectorVerticalAngleDeg(from: Landmark, to: Landmark): number {
  if (has3D(from, to)) {
    const dx = to.wx! - from.wx!
    const dy = -(to.wy! - from.wy!)   // flip so up is positive
    const dz = to.wz! - from.wz!
    const mag = Math.hypot(dx, dy, dz)
    if (mag < 1e-6) return 0
    // Tilt magnitude: angle between vector and +Y (up) axis.
    const tiltRad = Math.acos(Math.max(-1, Math.min(1, dy / mag)))
    // Preserve the signed semantic of the 2-D version (+ to the user's right
    // when facing the camera).  In world coords +wx is the user's right
    // assuming camera is in front of them, so use sign(dx).
    const sign = dx >= 0 ? 1 : -1
    return sign * (tiltRad * 180) / Math.PI
  }
  // 2-D fallback
  const dx = to.x - from.x
  const dy = -(to.y - from.y)   // image Y grows downward — flip so up is positive
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
