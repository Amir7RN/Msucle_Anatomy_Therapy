/**
 * anatomicalFrame.ts
 *
 * Computes a per-frame ANATOMICAL FRAME (right-handed body coordinate system)
 * from the user's pose landmarks, and provides plane-projection helpers used
 * by goniometric measurements.
 *
 * Why a body frame at all?
 * ────────────────────────
 * Goniometry defines every joint angle relative to specific anatomical
 * planes — sagittal (forward/back), frontal (side), transverse (twist) —
 * NOT relative to gravity or the camera. A user leaning forward 20° still
 * has the same shoulder flexion ROM; only the gravity-relative angle
 * changes. Likewise, side-raise vs forward-raise reach the same absolute
 * "180° arm overhead" but differ in which plane the motion lives in.
 *
 * We build the body frame from four hip+shoulder landmarks each frame:
 *   yAxis (superior, +up)   = midShoulder − midHip, normalised
 *   xAxis (lateral, +right) = midRight − midLeft, made orthogonal to yAxis
 *   zAxis (anterior, +out)  = xAxis × yAxis   (right-handed)
 *
 * "Right" / "left" / "up" are USER-CENTRIC (not camera-centric). +x points
 * out the user's right side; +y up along the spine; +z forward through the
 * chest. Plane normals follow naturally:
 *   sagittal plane normal  = xAxis   (left/right axis, perpendicular to sagittal)
 *   frontal  plane normal  = zAxis   (ant/post axis, perpendicular to frontal)
 *   transverse plane normal= yAxis   (vertical axis, perpendicular to transverse)
 *
 * 2-D fallback
 * ────────────
 * When world coords aren't available (early frames before the model warms up,
 * or unsupported builds) the helpers fall back to image-coord measurement
 * using image-y as gravity. Plane separation is impossible in 2-D, so
 * sagittal/frontal/transverse projections collapse to plain 2-D angles —
 * acceptable for upright, camera-facing poses but not for accurate
 * decomposition. The world-coord path is strongly preferred and is what the
 * heavy MediaPipe model produces on every frame in our pipeline.
 */

import type { LandmarkSet, Landmark } from './landmarks'
import { LM } from './landmarks'

export interface Vec3 { x: number; y: number; z: number }

export interface AnatomicalFrame {
  /** Superior axis: up the spine (mid-hip → mid-shoulder), normalised. */
  yAxis: Vec3
  /** Lateral axis: user's right (left side → right side), normalised, orthogonal to yAxis. */
  xAxis: Vec3
  /** Anterior axis: out the chest (yAxis × xAxis, right-handed), normalised. */
  zAxis: Vec3
  /** Origin: midpoint of hips, in world coords (metres). */
  origin: Vec3
  /** True when frame was built from world coords; false for the 2-D fallback. */
  is3D: boolean
  /** 0..1 confidence in the frame. Low when depth (z) looks degenerate or the
   *  torso anchors are barely visible — lets callers down-weight or skip a
   *  measurement instead of trusting a bad frame. Optional for back-compat. */
  quality?: number
}

// ── Vec3 helpers ────────────────────────────────────────────────────────────

export function v3(x: number, y: number, z: number): Vec3 { return { x, y, z } }

export function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }
export function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z } }
export function scale(a: Vec3, s: number): Vec3 { return { x: a.x * s, y: a.y * s, z: a.z * s } }
export function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z }
export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}
export function magnitude(a: Vec3): number { return Math.hypot(a.x, a.y, a.z) }
export function normalize(a: Vec3): Vec3 {
  const m = magnitude(a)
  if (m < 1e-9) return { x: 0, y: 0, z: 0 }
  return { x: a.x / m, y: a.y / m, z: a.z / m }
}

/** Extract a Landmark's world coords as a Vec3 (or null if missing). */
export function worldVec(lm: Landmark | undefined): Vec3 | null {
  if (!lm || lm.wx === undefined || lm.wy === undefined || lm.wz === undefined) return null
  // MediaPipe world: +x = user's right, +y = DOWN, +z = forward through camera.
  // Convert to our convention where +y = UP (just flip sign of y).
  return { x: lm.wx, y: -lm.wy, z: lm.wz }
}

/** Midpoint of two Vec3. */
export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

// ── Frame computation ──────────────────────────────────────────────────────

/**
 * Build the anatomical frame from the four torso anchors. Returns null when
 * any anchor is missing or low-visibility (the resulting frame would be
 * unreliable and downstream measurements would be wrong by tens of degrees).
 */
export function computeAnatomicalFrame(lms: LandmarkSet, minVis = 0.5): AnatomicalFrame | null {
  const ls = lms[LM.L_SHOULDER]
  const rs = lms[LM.R_SHOULDER]
  const lh = lms[LM.L_HIP]
  const rh = lms[LM.R_HIP]
  if (!ls || !rs || !lh || !rh) return null
  if ((ls.visibility ?? 0) < minVis || (rs.visibility ?? 0) < minVis) return null
  if ((lh.visibility ?? 0) < minVis || (rh.visibility ?? 0) < minVis) return null

  const lsW = worldVec(ls), rsW = worldVec(rs)
  const lhW = worldVec(lh), rhW = worldVec(rh)

  if (lsW && rsW && lhW && rhW) {
    // 3-D path: world coords available.
    const midSh = midpoint(lsW, rsW)
    const midHp = midpoint(lhW, rhW)
    const yRaw  = sub(midSh, midHp)         // spine pointing up
    const yAxis = normalize(yRaw)
    // Lateral candidate: shoulders + hips averaged (more stable than shoulders alone).
    const xCand = normalize({
      x: ((rsW.x - lsW.x) + (rhW.x - lhW.x)) / 2,
      y: ((rsW.y - lsW.y) + (rhW.y - lhW.y)) / 2,
      z: ((rsW.z - lsW.z) + (rhW.z - lhW.z)) / 2,
    })
    // Make xAxis orthogonal to yAxis (Gram–Schmidt). This drops any
    // component of the shoulder-line that runs along the spine, which can
    // happen if the user is rotated.
    const xAxis = normalize(sub(xCand, scale(yAxis, dot(xCand, yAxis))))
    // zAxis = xAxis × yAxis → points OUT of the chest (anterior) for an
    // upright, forward-facing user.
    const zAxis = normalize(cross(xAxis, yAxis))
    // Frame quality: torso-anchor visibility × a depth-sanity factor. When the
    // four anchors have almost no z-separation the depth channel is degenerate
    // (MediaPipe gave up on depth — common when lying down), so plane
    // separation is unreliable and we flag the frame as low quality.
    const visQ = Math.min(
      ls.visibility ?? 0, rs.visibility ?? 0, lh.visibility ?? 0, rh.visibility ?? 0,
    )
    const zSpread = Math.max(
      Math.abs(lsW.z - rsW.z), Math.abs(lhW.z - rhW.z),
      Math.abs(midSh.z - midHp.z),
    )
    const depthQ = Math.min(1, zSpread / 0.04 + 0.4)   // 0.4 floor so in-plane poses still measure
    const quality = Math.max(0, Math.min(1, visQ)) * Math.max(0.4, Math.min(1, depthQ))
    return { yAxis, xAxis, zAxis, origin: midHp, is3D: true, quality }
  }

  // 2-D fallback. Image y grows DOWNWARD = gravity direction. We flip the
  // sign on the y-component so yAxis still points "up" in our convention.
  const midShI = { x: (ls.x + rs.x) / 2, y: -((ls.y + rs.y) / 2), z: 0 }
  const midHpI = { x: (lh.x + rh.x) / 2, y: -((lh.y + rh.y) / 2), z: 0 }
  const yAxis = normalize(sub(midShI, midHpI))
  // Lateral axis in 2-D is the shoulder line (we lose any rotation around y).
  const xRaw = { x: rs.x - ls.x, y: -((rs.y - ls.y)), z: 0 }
  const xAxis = normalize(sub(xRaw, scale(yAxis, dot(xRaw, yAxis))))
  // zAxis is unknown in 2-D; we set it to the cross product (will be ±z if
  // body is roughly upright). Projections using zAxis in 2-D should be
  // treated as "frontal-only" approximations.
  const zAxis = normalize(cross(xAxis, yAxis))
  // 2-D fallback can't separate planes and assumes the user is upright (image
  // y = gravity). Flag it as low quality so callers prefer the 3-D path and
  // can refuse plane-decomposed measurements when only this is available.
  return { yAxis, xAxis, zAxis, origin: midHpI, is3D: false, quality: 0.3 }
}

// ── Plane projection helpers ───────────────────────────────────────────────

/** Project v onto a plane defined by its unit normal. */
export function projectOntoPlane(v: Vec3, planeNormal: Vec3): Vec3 {
  const d = dot(v, planeNormal)
  return sub(v, scale(planeNormal, d))
}

/**
 * SIGNED angle (degrees, −180..+180) of vector `v` measured from `reference`,
 * within the plane perpendicular to `planeNormal`. The sign is positive when
 * rotating from reference toward v is counter-clockwise about planeNormal.
 *
 * Both vectors should already lie in (or be projected into) the plane.
 */
export function signedAngleInPlane(v: Vec3, reference: Vec3, planeNormal: Vec3): number {
  const vP = projectOntoPlane(v, planeNormal)
  const rP = projectOntoPlane(reference, planeNormal)
  const a  = magnitude(vP)
  const b  = magnitude(rP)
  if (a < 1e-9 || b < 1e-9) return 0
  const cosA = Math.max(-1, Math.min(1, dot(vP, rP) / (a * b)))
  const ang  = Math.acos(cosA) * 180 / Math.PI            // 0..180
  const sgn  = dot(cross(rP, vP), planeNormal) >= 0 ? 1 : -1
  return sgn * ang
}

/** UNSIGNED angle (degrees, 0..180) between two vectors. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const ma = magnitude(a), mb = magnitude(b)
  if (ma < 1e-9 || mb < 1e-9) return 0
  const c = Math.max(-1, Math.min(1, dot(a, b) / (ma * mb)))
  return Math.acos(c) * 180 / Math.PI
}

/**
 * UNSIGNED angle (degrees, 0..180) of `v` from `axis`, after projecting `v`
 * into the plane perpendicular to `planeNormal`. Convenient for "how far has
 * the arm rotated AWAY from straight-down within the sagittal plane".
 */
export function angleFromAxisInPlane(v: Vec3, axis: Vec3, planeNormal: Vec3): number {
  const vP = projectOntoPlane(v, planeNormal)
  return angleBetween(vP, axis)
}

// ── Gravity ─────────────────────────────────────────────────────────────────
//
// MediaPipe world landmarks are emitted gravity-aligned (raw +y is DOWN). Our
// worldVec() flips that so +y = UP. Therefore "up" in world space is simply
// (0,1,0) and we don't need a separate gravity estimator — but exposing it as
// a named constant keeps gravity-relative code self-documenting and gives us
// one place to swap in a smoothed IMU/estimated gravity later if needed.
export const GRAVITY_UP: Vec3 = { x: 0, y: 1, z: 0 }

// ── Depth reliability ─────────────────────────────────────────────────────────
//
// MediaPipe's z (depth) is its weakest output and degrades badly when the
// subject is non-upright or far from the lens. A 3-D vertex angle that leans on
// z is then LESS accurate than the plain 2-D image-plane angle (this is why the
// gait module deliberately uses 2-D for the side-on walk). `depthReliability`
// scores how much we should trust z for a given set of landmarks: high when
// they are clearly visible and carry a non-trivial z spread, low otherwise.

function lmRaw(lm: Landmark | undefined): { x: number; y: number; z: number; wx?: number; wy?: number; wz?: number; visibility: number } | null {
  return lm ?? null
}

/** 0..1 trust in the depth channel across the given landmark indices. */
export function depthReliability(lms: LandmarkSet, ...idx: number[]): number {
  const pts = idx.map((i) => lmRaw(lms[i])).filter(Boolean) as Landmark[]
  if (pts.length < 2) return 0
  const haveWorld = pts.every((p) => p.wz !== undefined)
  if (!haveWorld) return 0
  const vis = pts.reduce((m, p) => Math.min(m, p.visibility ?? 0), 1)
  // z spread across the chain, in metres.
  let zMin = Infinity, zMax = -Infinity
  for (const p of pts) { const z = p.wz!; if (z < zMin) zMin = z; if (z > zMax) zMax = z }
  const spread = zMax - zMin
  const spreadQ = Math.min(1, spread / 0.15)        // 15 cm of depth = full trust
  return Math.max(0, Math.min(1, vis)) * spreadQ
}

/**
 * Adaptive vertex angle at B for A-B-C.
 *
 * Computes BOTH the 3-D world-coord angle (camera-rotation invariant, but
 * sensitive to noisy z) and the 2-D image-plane angle (exact when the motion
 * is filmed in-plane, wrong when the limb points toward the lens) and blends
 * them by `depthTrust` (0..1). With reliable depth it trusts 3-D; with poor
 * depth it falls back to the in-plane 2-D reading. Returns degrees 0..180.
 *
 * `inPlane` should be true when the camera setup for this movement films the
 * motion in its plane (e.g. side-on for a sagittal motion) — then the 2-D
 * reading is the goniometric truth and we bias toward it on low depth trust.
 */
export function adaptiveVertexAngle(
  a: Landmark, b: Landmark, c: Landmark,
  depthTrust: number,
): number {
  // 2-D image-plane angle.
  const v1x2 = a.x - b.x, v1y2 = a.y - b.y
  const v2x2 = c.x - b.x, v2y2 = c.y - b.y
  const dot2 = v1x2 * v2x2 + v1y2 * v2y2
  const mag2 = Math.hypot(v1x2, v1y2) * Math.hypot(v2x2, v2y2) + 1e-9
  const ang2 = (Math.acos(Math.max(-1, Math.min(1, dot2 / mag2))) * 180) / Math.PI

  // 3-D world-coord angle, when present.
  if (a.wx !== undefined && b.wx !== undefined && c.wx !== undefined) {
    const v1x = a.wx! - b.wx!, v1y = a.wy! - b.wy!, v1z = a.wz! - b.wz!
    const v2x = c.wx! - b.wx!, v2y = c.wy! - b.wy!, v2z = c.wz! - b.wz!
    const dot3 = v1x * v2x + v1y * v2y + v1z * v2z
    const mag3 = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z) + 1e-9
    const ang3 = (Math.acos(Math.max(-1, Math.min(1, dot3 / mag3))) * 180) / Math.PI
    const t = Math.max(0, Math.min(1, depthTrust))
    return t * ang3 + (1 - t) * ang2
  }
  return ang2
}
