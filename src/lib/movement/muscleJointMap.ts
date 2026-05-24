/**
 * muscleJointMap.ts
 *
 * Maps each muscle_id to the joints it crosses and the standard functional
 * movements that test its range of motion (ROM).  Each movement has a
 * clinical "able-bodied" reference value the user's measured angle is
 * benchmarked against.
 *
 * References (degrees) drawn from AAOS / Norkin & White goniometry tables:
 *   Shoulder flexion           = 180°
 *   Shoulder abduction         = 180°
 *   Shoulder external rotation = 90°
 *   Shoulder internal rotation = 70°
 *   Elbow flexion              = 150°
 *   Hip  flexion               = 120°
 *   Hip  extension             = 30°
 *   Hip  abduction             = 45°
 *   Knee flexion               = 135°
 *   Ankle dorsiflexion         = 20°
 *   Cervical rotation          = 80° each side
 *   Cervical flexion           = 50°
 *   Cervical extension         = 60°
 *   Trunk flexion              = 80°  (standing forward fold)
 */

import { jointAngleDeg, vectorVerticalAngleDeg, LM, type LandmarkSet } from './landmarks'
import {
  computeAnatomicalFrame,
  worldVec,
  signedAngleInPlane,
  angleBetween,
  angleFromAxisInPlane,
  sub,
  scale,
  midpoint,
  normalize,
  type Vec3,
  type AnatomicalFrame,
} from './anatomicalFrame'

// Soft visibility threshold for ROM measurement.
//
// 0.10 — chosen because MediaPipe's heavy model assigns visibility ≈ 0.15–
// 0.25 to hand landmarks when the wrist is near the top of frame (e.g. arm
// raised, hands above the head — the exact pose the user is in for shoulder
// abduction or elbow flexion screening).  At 0.30 those frames returned
// null and the dial stuck at 0° even though the user was clearly bending
// the joint.  At 0.10 the measurement engages but we still skip totally
// invisible landmarks (visibility = 0 means MediaPipe isn't predicting).
//
// The CameraView already EMA-smooths landmarks, so the per-frame value we
// receive is a low-pass of the last several detections — even noisy frames
// produce a stable angle once smoothed.
const ROM_MIN_VISIBILITY = 0.1

function vis(lms: LandmarkSet, ...idx: number[]): boolean {
  return idx.every((i) => (lms[i]?.visibility ?? 0) >= ROM_MIN_VISIBILITY)
}

/**
 * Stricter visibility check for the "anchor" landmarks that drive a
 * measurement (e.g. shoulder + elbow for an elbow angle).  We hold these
 * to a higher bar because their position determines the joint vertex; the
 * "leaf" landmark (wrist, ankle) only needs to be roughly correct since the
 * EMA smoother in CameraView keeps its last-known position when visibility
 * dips momentarily.
 */
function visAnchor(lms: LandmarkSet, ...idx: number[]): boolean {
  return idx.every((i) => (lms[i]?.visibility ?? 0) >= 0.2)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Neutral-pose verification — used during calibration
//
//  A "true" neutral standing pose has:
//    • Trunk roughly vertical (shoulders aligned over hips)
//    • Arms hanging down at sides — wrists below elbows below shoulders,
//      and wrists close to the hips (not flared out)
//    • Legs straight — knees roughly aligned with hips and ankles
//    • Head facing forward — nose between the ears
//
//  We accept a generous tolerance so users don't have to be perfectly still;
//  the goal is just to anchor a known starting position so subsequent
//  movement is measurable from a sensible zero.
// ─────────────────────────────────────────────────────────────────────────────

export interface NeutralPoseStatus {
  /** True when every required check passes. */
  ok: boolean
  /** Per-check pass/fail map for debug + UI feedback. */
  checks: Array<{ name: string; ok: boolean; hint: string }>
}

/**
 * Verify the user is in a neutral standing pose appropriate for the segment.
 *
 *  • upper_body → arms hanging by sides, trunk vertical
 *  • lower_body → standing tall, legs straight
 *  • neck       → head forward, shoulders level
 *  • trunk      → trunk vertical
 */
export function verifyNeutralPose(
  lms:     LandmarkSet,
  segment: 'upper_body' | 'lower_body' | 'trunk' | 'neck',
): NeutralPoseStatus {
  const checks: NeutralPoseStatus['checks'] = []

  const lShoulder = lms[LM.L_SHOULDER]
  const rShoulder = lms[LM.R_SHOULDER]
  const lHip      = lms[LM.L_HIP]
  const rHip      = lms[LM.R_HIP]

  // Common: both shoulders + both hips visible enough to determine trunk.
  // We use a relaxed 0.3 here so calibration isn't unreasonably strict.
  const coreVisible = visAnchor(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP)
  checks.push({
    name: 'Body in frame',
    ok:   coreVisible,
    hint: 'Step back so both shoulders and hips are visible.',
  })
  if (!coreVisible) return { ok: false, checks }

  // 1. Trunk vertical — mid-shoulder X should be close to mid-hip X.
  // Image x is in [0..1]; a delta of 0.05 (~5% of frame width) is plenty
  // of tolerance for natural sway.
  const midShX = (lShoulder.x + rShoulder.x) / 2
  const midHpX = (lHip.x + rHip.x) / 2
  const trunkVertical = Math.abs(midShX - midHpX) < 0.06
  checks.push({
    name: 'Stand upright',
    ok:   trunkVertical,
    hint: 'Stand tall — align your shoulders over your hips.',
  })

  if (segment === 'upper_body' || segment === 'trunk') {
    // 2. Arms by sides — wrists below shoulders, close to hips.
    const lElbow = lms[LM.L_ELBOW]
    const rElbow = lms[LM.R_ELBOW]
    const lWrist = lms[LM.L_WRIST]
    const rWrist = lms[LM.R_WRIST]

    const armsVisible = (lElbow?.visibility ?? 0) >= 0.2 && (rElbow?.visibility ?? 0) >= 0.2
    checks.push({
      name: 'Arms visible',
      ok:   armsVisible,
      hint: 'Make sure both arms are in frame.',
    })

    if (armsVisible) {
      // Image y grows DOWNWARD, so wrist below shoulder ↔ wrist.y > shoulder.y.
      // We allow a small slop because the body proportions vary per user.
      const armsDown =
        lElbow.y > lShoulder.y - 0.02 &&
        rElbow.y > rShoulder.y - 0.02 &&
        // Wrist (when detected) should also be at or below the elbow.
        // If wrist visibility is low we don't penalise — the elbow position
        // is enough to confirm the arm is hanging, not raised.
        ((lWrist?.visibility ?? 0) < 0.2 || lWrist.y > lElbow.y - 0.02) &&
        ((rWrist?.visibility ?? 0) < 0.2 || rWrist.y > rElbow.y - 0.02)
      checks.push({
        name: 'Arms by your sides',
        ok:   armsDown,
        hint: 'Lower your arms — let them hang naturally beside your body.',
      })
    }
  }

  if (segment === 'lower_body') {
    const lKnee = lms[LM.L_KNEE]
    const rKnee = lms[LM.R_KNEE]
    const legsVisible = (lKnee?.visibility ?? 0) >= 0.2 && (rKnee?.visibility ?? 0) >= 0.2
    checks.push({
      name: 'Legs visible',
      ok:   legsVisible,
      hint: 'Step back so both knees are visible.',
    })

    if (legsVisible) {
      // Knees roughly aligned vertically with hips (not stepping out)
      const kneesUnderHips =
        Math.abs(lKnee.x - lHip.x) < 0.10 &&
        Math.abs(rKnee.x - rHip.x) < 0.10
      checks.push({
        name: 'Legs straight under hips',
        ok:   kneesUnderHips,
        hint: 'Stand tall with feet under your hips.',
      })

      const lAnkle = lms[LM.L_ANKLE]
      const rAnkle = lms[LM.R_ANKLE]
      if ((lAnkle?.visibility ?? 0) >= 0.2 && (rAnkle?.visibility ?? 0) >= 0.2) {
        // Knee angle close to 180° = leg straight
        const lKneeAng = jointAngleDeg(lHip, lKnee, lAnkle)
        const rKneeAng = jointAngleDeg(rHip, rKnee, rAnkle)
        const legsStraight = lKneeAng > 160 && rKneeAng > 160
        checks.push({
          name: 'Knees straight',
          ok:   legsStraight,
          hint: 'Stand with your knees straight.',
        })
      }
    }
  }

  if (segment === 'neck') {
    const nose  = lms[LM.NOSE]
    const lEar  = lms[LM.L_EAR]
    const rEar  = lms[LM.R_EAR]
    const headVisible =
      (nose?.visibility ?? 0) >= 0.3 &&
      (lEar?.visibility ?? 0) >= 0.2 &&
      (rEar?.visibility ?? 0) >= 0.2
    checks.push({
      name: 'Head in frame',
      ok:   headVisible,
      hint: 'Centre your head — both ears should be visible.',
    })
    if (headVisible) {
      // Nose between the ears (head facing forward)
      const earSpread = Math.abs(lEar.x - rEar.x)
      const noseCentered = earSpread < 0.001
        ? false
        : Math.abs(nose.x - (lEar.x + rEar.x) / 2) / earSpread < 0.4
      checks.push({
        name: 'Look straight ahead',
        ok:   noseCentered,
        hint: 'Face the camera — your nose should sit between your ears.',
      })
    }
  }

  return { ok: checks.every((c) => c.ok), checks }
}

export type Side = 'L' | 'R' | 'either'

export interface JointMovement {
  id:         string
  label:      string
  joint:      string
  side:       Side
  reference:  { min: number; ideal: number }
  cue:        string
  measure:    (lms: LandmarkSet, side: 'L' | 'R') => number | null
  /**
   * Body region required in frame for this movement.  Drives the calibration
   * step — if the test is "knee flexion" we don't make the user fit their
   * head into the frame; we only need hip→knee→ankle visible.
   */
  segment:    'upper_body' | 'lower_body' | 'trunk' | 'neck'
  /**
   * Landmark indices that MUST be visible (>0.3 visibility) before the
   * calibration step accepts the pose as ready.  Anything else can be off-frame.
   */
  calibrationLandmarks: number[]
}

// ─────────────────────────────────────────────────────────────────────────────
//  Measurement helpers — goniometric (anatomical plane based).
//
//  Every movement here follows the reference table in
//  `human_joint_measurements.json` (AAOS / Norkin & White goniometry).  We
//  build a body-frame from shoulders + hips each frame, project the relevant
//  body segment into the joint's anatomical plane, and read the angle from
//  the standard goniometric axis. Unlike the old gravity-only approach,
//  these stay accurate when the user is rotated, leaning, or off-axis to
//  the camera — and the same measurement cleanly distinguishes flexion from
//  abduction (which a gravity-only angle cannot).
//
//  Conventions
//    • All angles in degrees, 0 = neutral position, increasing with motion.
//    • Sagittal plane normal  = xAxis (user's lateral axis)
//    • Frontal  plane normal  = zAxis (user's anteroposterior axis)
//    • Transverse plane normal= yAxis (user's superior axis along spine)
//    • Sign convention: positive when the motion follows the standard
//      goniometric direction (flexion / abduction / external rotation
//      etc.). For movements with paired left/right tests we report the
//      unsigned magnitude in the cued direction; out-of-direction motion
//      reads 0 so the assessment doesn't reward the wrong way.
//
//  Unmeasurable with MediaPipe Pose alone (would require MediaPipe Hands):
//    – Wrist flexion / extension
//    – Wrist radial / ulnar deviation
//    – Forearm supination / pronation
//  Those return null with a brief comment so the rest of the registry stays
//  consistent.
// ─────────────────────────────────────────────────────────────────────────────

/** Build a world-vector from a landmark, falling back to image coords if
 *  the world channel isn't populated. Image y is flipped so +y = up. */
function lmVec(lm: { wx?: number; wy?: number; wz?: number; x: number; y: number } | undefined): Vec3 | null {
  if (!lm) return null
  const w = worldVec(lm as any)
  if (w) return w
  return { x: lm.x, y: -lm.y, z: 0 }
}

// ── Shoulder flexion ────────────────────────────────────────────────────────
// Sagittal plane. Arm raised FORWARD. 0° = arm at side, 180° = arm overhead
// in the sagittal plane. Extension reads 0 in this measurement (use the
// shoulder_extension entry for that).
function measureShoulderFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
  if (!visAnchor(lms, SH) || !vis(lms, EL)) return null
  const sh = lmVec(lms[SH])!, el = lmVec(lms[EL])!
  const arm = sub(el, sh)
  // Reference axis: straight DOWN at the side = −yAxis (anatomical inferior).
  const down = scale(frame.yAxis, -1)
  // Signed angle in the sagittal plane (normal = xAxis). Positive when arm
  // rotates from down toward +zAxis (anterior / forward).
  const ang = signedAngleInPlane(arm, down, frame.xAxis)
  return Math.max(0, ang)   // only flexion direction
}

// ── Shoulder extension ─────────────────────────────────────────────────────
// Sagittal plane, opposite direction. Arm reaches BACKWARD. 0..50° normal ROM.
function measureShoulderExtension(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
  if (!visAnchor(lms, SH) || !vis(lms, EL)) return null
  const sh = lmVec(lms[SH])!, el = lmVec(lms[EL])!
  const arm = sub(el, sh)
  const down = scale(frame.yAxis, -1)
  const ang = signedAngleInPlane(arm, down, frame.xAxis)
  return Math.max(0, -ang)  // negative-signed motion = extension
}

// ── Shoulder abduction ─────────────────────────────────────────────────────
// Frontal plane. Arm raised OUT TO THE SIDE. 0° = arm at side, 180° overhead.
function measureShoulderAbduction(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
  if (!visAnchor(lms, SH) || !vis(lms, EL)) return null
  const sh = lmVec(lms[SH])!, el = lmVec(lms[EL])!
  const arm = sub(el, sh)
  const down = scale(frame.yAxis, -1)
  // Frontal plane normal = zAxis. Returns the unsigned angle from straight
  // down within the frontal plane — abduction reads positive whether the
  // raise is to the user's left or right.
  return angleFromAxisInPlane(arm, down, frame.zAxis)
}

// ── Shoulder external rotation (at 90° abduction, 90° elbow flexion) ──────
// Transverse plane. With arm out at 90° + elbow bent 90°, forearm rotates
// upward (external) or downward (internal). We measure how far the forearm
// has rotated AWAY from horizontal-forward.
function measureShoulderER(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
  const WR = side === 'L' ? LM.L_WRIST    : LM.R_WRIST
  if (!visAnchor(lms, SH, EL) || !vis(lms, WR)) return null
  const el = lmVec(lms[EL])!, wr = lmVec(lms[WR])!
  const forearm = sub(wr, el)
  // Rotation axis ≈ the upper arm itself (humerus long axis). Project
  // forearm into the plane perpendicular to the upper arm.
  const sh = lmVec(lms[SH])!
  const arm = normalize(sub(el, sh))
  // Reference direction within that plane: project the body's anterior
  // axis (zAxis) onto the plane to define "forearm pointing forward".
  // Signed angle from forward toward +yAxis (up) = external rotation.
  const ang = signedAngleInPlane(forearm, frame.zAxis, arm)
  // For the user's RIGHT side, external rotation rotates forearm toward
  // the user's right (mediolateral). We just report unsigned ROM
  // magnitude in the "upward" direction (toward +yAxis) — the cue tells
  // the user which way to rotate.
  return Math.max(0, Math.abs(ang))
}

// ── Shoulder internal rotation — same axis, opposite direction ─────────────
function measureShoulderIR(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  // Symmetric ROM around neutral; we report the same magnitude. The cue
  // distinguishes "rotate down" (IR) vs "rotate up" (ER).
  return measureShoulderER(lms, side)
}

// ── Elbow flexion ───────────────────────────────────────────────────────────
// Sagittal plane angle at elbow vertex. 0° = straight (anatomical neutral),
// up to ~150° fully bent. Goniometer axis at lateral epicondyle, stationary
// arm along humerus to acromion, moving arm along radius to styloid.
function measureElbowFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
  const WR = side === 'L' ? LM.L_WRIST    : LM.R_WRIST
  if (!visAnchor(lms, SH, EL) || !vis(lms, WR)) return null
  const ang = jointAngleDeg(lms[SH], lms[EL], lms[WR])  // 0..180 at the elbow
  return Math.max(0, 180 - ang)                          // 0 = straight, 150+ = full flex
}

// ── Hip flexion ─────────────────────────────────────────────────────────────
// Sagittal plane. Thigh raised FORWARD toward chest. 0° = leg at side
// (standing), up to ~120° (knee to chest).
function measureHipFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const HP = side === 'L' ? LM.L_HIP  : LM.R_HIP
  const KN = side === 'L' ? LM.L_KNEE : LM.R_KNEE
  if (!visAnchor(lms, HP) || !vis(lms, KN)) return null
  const hp = lmVec(lms[HP])!, kn = lmVec(lms[KN])!
  const thigh = sub(kn, hp)
  const down  = scale(frame.yAxis, -1)
  const ang   = signedAngleInPlane(thigh, down, frame.xAxis)
  return Math.max(0, ang)
}

// ── Hip extension ──────────────────────────────────────────────────────────
// Sagittal plane, thigh moves BACKWARD. 0..30° normal ROM standing.
function measureHipExtension(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const HP = side === 'L' ? LM.L_HIP  : LM.R_HIP
  const KN = side === 'L' ? LM.L_KNEE : LM.R_KNEE
  if (!visAnchor(lms, HP) || !vis(lms, KN)) return null
  const hp = lmVec(lms[HP])!, kn = lmVec(lms[KN])!
  const thigh = sub(kn, hp)
  const down  = scale(frame.yAxis, -1)
  const ang   = signedAngleInPlane(thigh, down, frame.xAxis)
  return Math.max(0, -ang)
}

// ── Hip abduction ──────────────────────────────────────────────────────────
// Frontal plane. Leg lifted OUT TO THE SIDE. 0..45° normal.
function measureHipAbduction(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const HP = side === 'L' ? LM.L_HIP  : LM.R_HIP
  const KN = side === 'L' ? LM.L_KNEE : LM.R_KNEE
  if (!visAnchor(lms, HP) || !vis(lms, KN)) return null
  const hp = lmVec(lms[HP])!, kn = lmVec(lms[KN])!
  const thigh = sub(kn, hp)
  const down  = scale(frame.yAxis, -1)
  // Frontal plane normal = zAxis. We want abduction (leg out, away from
  // midline) to read positive. The thigh component along +xAxis is the
  // lateral motion; for the user's LEFT leg, lateral motion is −xAxis.
  const ang = signedAngleInPlane(thigh, down, frame.zAxis)
  // Positive sign convention: abduction for both sides.
  return side === 'R' ? Math.max(0, ang) : Math.max(0, -ang)
}

// ── Hip adduction ──────────────────────────────────────────────────────────
// Frontal plane, opposite direction (leg crosses midline). 0..30° normal.
function measureHipAdduction(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const HP = side === 'L' ? LM.L_HIP  : LM.R_HIP
  const KN = side === 'L' ? LM.L_KNEE : LM.R_KNEE
  if (!visAnchor(lms, HP) || !vis(lms, KN)) return null
  const hp = lmVec(lms[HP])!, kn = lmVec(lms[KN])!
  const thigh = sub(kn, hp)
  const down  = scale(frame.yAxis, -1)
  const ang = signedAngleInPlane(thigh, down, frame.zAxis)
  return side === 'R' ? Math.max(0, -ang) : Math.max(0, ang)
}

// ── Hip internal / external rotation ───────────────────────────────────────
// Transverse plane, seated 90/90 (hip + knee both flexed 90°). We measure
// the tibia's angle in the transverse plane. Without seated 90/90 (which the
// camera-standing assessment doesn't enforce) this is a best-effort estimate
// based on the visible foot rotation; reliability drops if the user is not
// in the prescribed position.
function measureHipRotation(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  const KN = side === 'L' ? LM.L_KNEE  : LM.R_KNEE
  const AN = side === 'L' ? LM.L_ANKLE : LM.R_ANKLE
  if (!visAnchor(lms, KN) || !vis(lms, AN)) return null
  const kn = lmVec(lms[KN])!, an = lmVec(lms[AN])!
  const tibia = sub(an, kn)
  // Transverse plane normal = yAxis. Reference = anterior axis (+zAxis).
  const ang = signedAngleInPlane(tibia, frame.zAxis, frame.yAxis)
  return Math.max(0, Math.abs(ang))
}

// ── Knee flexion ───────────────────────────────────────────────────────────
// Sagittal plane angle at knee vertex. 0° = straight, ~135° max.
function measureKneeFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const HP = side === 'L' ? LM.L_HIP   : LM.R_HIP
  const KN = side === 'L' ? LM.L_KNEE  : LM.R_KNEE
  const AN = side === 'L' ? LM.L_ANKLE : LM.R_ANKLE
  if (!vis(lms, HP, KN, AN)) return null
  const ang = jointAngleDeg(lms[HP], lms[KN], lms[AN])
  return Math.max(0, 180 - ang)
}

// ── Ankle dorsiflexion / plantarflexion ────────────────────────────────────
// Sagittal plane. Neutral = foot perpendicular to tibia. Dorsiflexion
// reduces the tibia-foot angle below 90° (toes toward shin), plantarflexion
// increases it above 90° (point toes down). Returns positive degrees of
// motion FROM NEUTRAL in the cued direction.
function measureAnkleDorsiflexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const KN = side === 'L' ? LM.L_KNEE     : LM.R_KNEE
  const AN = side === 'L' ? LM.L_ANKLE    : LM.R_ANKLE
  const FT = side === 'L' ? LM.L_FOOT_IDX : LM.R_FOOT_IDX
  if (!vis(lms, KN, AN, FT)) return null
  const ang = jointAngleDeg(lms[KN], lms[AN], lms[FT])   // 0..180 at ankle
  // Neutral standing ≈ 90°. Dorsiflexion drives angle below 90°.
  return Math.max(0, 90 - ang)
}

function measureAnklePlantarflexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const KN = side === 'L' ? LM.L_KNEE     : LM.R_KNEE
  const AN = side === 'L' ? LM.L_ANKLE    : LM.R_ANKLE
  const FT = side === 'L' ? LM.L_FOOT_IDX : LM.R_FOOT_IDX
  if (!vis(lms, KN, AN, FT)) return null
  const ang = jointAngleDeg(lms[KN], lms[AN], lms[FT])
  return Math.max(0, ang - 90)
}

// ── Cervical flexion / extension ────────────────────────────────────────────
// Sagittal plane. Head vector = midEar − midShoulder. Flexion (chin to
// chest) reads positive; extension (chin up) reads as a separate movement.
function headVector(lms: LandmarkSet): Vec3 | null {
  if (!vis(lms, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER)) return null
  const le = lmVec(lms[LM.L_EAR]), re = lmVec(lms[LM.R_EAR])
  const ls = lmVec(lms[LM.L_SHOULDER]), rs = lmVec(lms[LM.R_SHOULDER])
  if (!le || !re || !ls || !rs) return null
  const midEar = midpoint(le, re)
  const midSh  = midpoint(ls, rs)
  return sub(midEar, midSh)
}

function measureCervicalFlexion(lms: LandmarkSet, _side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  const head  = headVector(lms)
  if (!frame || !head) return null
  // Reference = anatomical UP (yAxis). Sagittal plane normal = xAxis.
  const ang = signedAngleInPlane(head, frame.yAxis, frame.xAxis)
  return Math.max(0, ang)    // positive = forward = flexion
}

function measureCervicalExtension(lms: LandmarkSet, _side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  const head  = headVector(lms)
  if (!frame || !head) return null
  const ang = signedAngleInPlane(head, frame.yAxis, frame.xAxis)
  return Math.max(0, -ang)   // negative = backward = extension
}

function measureCervicalLateralFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  const head  = headVector(lms)
  if (!frame || !head) return null
  // Frontal plane normal = zAxis. Positive sign = tilt toward +xAxis (user's right).
  const ang = signedAngleInPlane(head, frame.yAxis, frame.zAxis)
  return side === 'R' ? Math.max(0, ang) : Math.max(0, -ang)
}

function measureCervicalRotation(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = computeAnatomicalFrame(lms)
  if (!frame) return null
  if (!vis(lms, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER)) return null
  const le = lmVec(lms[LM.L_EAR])!, re = lmVec(lms[LM.R_EAR])!
  // Ear-to-ear vector represents head orientation in the transverse plane.
  const earLine = sub(re, le)
  // Reference = the body's lateral axis (xAxis) — head facing forward.
  const ang = signedAngleInPlane(earLine, frame.xAxis, frame.yAxis)
  return side === 'R' ? Math.max(0, ang) : Math.max(0, -ang)
}

// ── Trunk flexion / extension / lateral / rotation ─────────────────────────
// Trunk movements need a PELVIC frame, not the body frame (which uses the
// spine as its yAxis — so trunk flexion would always read 0). We construct
// a pelvic frame from the hip line + world gravity.

function pelvicFrame(lms: LandmarkSet): AnatomicalFrame | null {
  if (!vis(lms, LM.L_HIP, LM.R_HIP)) return null
  const lh = lmVec(lms[LM.L_HIP]), rh = lmVec(lms[LM.R_HIP])
  if (!lh || !rh) return null
  // Pelvic yAxis = world UP (assumes user is standing). In our convention
  // (+y = up) that's just (0, 1, 0).
  const yAxis: Vec3 = { x: 0, y: 1, z: 0 }
  // Pelvic xAxis = lateral hip line, orthogonalised to yAxis.
  const hipLine = sub(rh, lh)
  const xRaw = sub(hipLine, scale(yAxis, hipLine.y))
  const xAxis = normalize(xRaw)
  const zAxis = normalize({
    x: xAxis.y * yAxis.z - xAxis.z * yAxis.y,
    y: xAxis.z * yAxis.x - xAxis.x * yAxis.z,
    z: xAxis.x * yAxis.y - xAxis.y * yAxis.x,
  })
  return { yAxis, xAxis, zAxis, origin: midpoint(lh, rh), is3D: true }
}

function trunkVector(lms: LandmarkSet): Vec3 | null {
  if (!vis(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP)) return null
  const ls = lmVec(lms[LM.L_SHOULDER])!, rs = lmVec(lms[LM.R_SHOULDER])!
  const lh = lmVec(lms[LM.L_HIP])!,      rh = lmVec(lms[LM.R_HIP])!
  return sub(midpoint(ls, rs), midpoint(lh, rh))
}

function measureTrunkFlexion(lms: LandmarkSet, _side: 'L' | 'R'): number | null {
  const frame = pelvicFrame(lms)
  const tr    = trunkVector(lms)
  if (!frame || !tr) return null
  // Sagittal plane normal = xAxis. Positive sign = forward fold.
  const ang = signedAngleInPlane(tr, frame.yAxis, frame.xAxis)
  return Math.max(0, ang)
}

function measureTrunkExtension(lms: LandmarkSet, _side: 'L' | 'R'): number | null {
  const frame = pelvicFrame(lms)
  const tr    = trunkVector(lms)
  if (!frame || !tr) return null
  const ang = signedAngleInPlane(tr, frame.yAxis, frame.xAxis)
  return Math.max(0, -ang)
}

function measureTrunkLateralFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = pelvicFrame(lms)
  const tr    = trunkVector(lms)
  if (!frame || !tr) return null
  const ang = signedAngleInPlane(tr, frame.yAxis, frame.zAxis)
  return side === 'R' ? Math.max(0, ang) : Math.max(0, -ang)
}

function measureTrunkRotation(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const frame = pelvicFrame(lms)
  if (!frame) return null
  if (!vis(lms, LM.L_SHOULDER, LM.R_SHOULDER)) return null
  const ls = lmVec(lms[LM.L_SHOULDER])!, rs = lmVec(lms[LM.R_SHOULDER])!
  const shoulderLine = sub(rs, ls)
  // Compare shoulder line to pelvic lateral (xAxis) in the transverse plane.
  const ang = signedAngleInPlane(shoulderLine, frame.xAxis, frame.yAxis)
  return side === 'R' ? Math.max(0, ang) : Math.max(0, -ang)
}

// ── Backward-compat: keep `vectorVerticalAngleDeg` symbol used elsewhere ──
//   (unused inside this file now; suppress lint via underscore).
const _kVVAD = vectorVerticalAngleDeg

// ─────────────────────────────────────────────────────────────────────────────
//  Joint movement catalog
// ─────────────────────────────────────────────────────────────────────────────

// Helper landmark sets — keep the per-segment lists tight.
const LMS_UPPER = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW]
const LMS_LOWER = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE]
const LMS_TRUNK = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP]
const LMS_NECK  = [LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER]

export const JOINT_MOVEMENTS: Record<string, JointMovement> = {
  shoulder_abduction:  {
    id: 'shoulder_abduction', joint: 'shoulder', label: 'Shoulder Abduction',
    side: 'either', reference: { min: 150, ideal: 180 },
    cue: 'Raise your arm straight out to the side, all the way overhead.',
    measure: measureShoulderAbduction,
    segment: 'upper_body', calibrationLandmarks: LMS_UPPER,
  },
  shoulder_flexion: {
    id: 'shoulder_flexion', joint: 'shoulder', label: 'Shoulder Flexion',
    side: 'either', reference: { min: 150, ideal: 180 },
    cue: 'Raise your arm straight forward and overhead, like reaching for the sky.',
    measure: measureShoulderFlexion,
    segment: 'upper_body', calibrationLandmarks: LMS_UPPER,
  },
  shoulder_external_rotation: {
    id: 'shoulder_external_rotation', joint: 'shoulder', label: 'Shoulder External Rotation',
    side: 'either', reference: { min: 70, ideal: 90 },
    cue: 'Bring your elbow to shoulder height, bent 90 degrees, then rotate your forearm up and back.',
    measure: measureShoulderER,
    segment: 'upper_body', calibrationLandmarks: [...LMS_UPPER, LM.L_WRIST, LM.R_WRIST],
  },
  elbow_flexion: {
    id: 'elbow_flexion', joint: 'elbow', label: 'Elbow Flexion',
    side: 'either', reference: { min: 130, ideal: 150 },
    cue: 'Bend your elbow as far as you can, bringing your hand toward your shoulder.',
    measure: measureElbowFlexion,
    segment: 'upper_body', calibrationLandmarks: [...LMS_UPPER, LM.L_WRIST, LM.R_WRIST],
  },
  hip_flexion: {
    id: 'hip_flexion', joint: 'hip', label: 'Hip Flexion',
    side: 'either', reference: { min: 100, ideal: 120 },
    cue: 'Standing on one leg, lift the other knee as high as you can toward your chest.',
    measure: measureHipFlexion,
    segment: 'lower_body', calibrationLandmarks: LMS_LOWER,
  },
  hip_abduction: {
    id: 'hip_abduction', joint: 'hip', label: 'Hip Abduction',
    side: 'either', reference: { min: 35, ideal: 45 },
    cue: 'Standing tall, lift one leg straight out to the side as far as you comfortably can.',
    measure: measureHipAbduction,
    segment: 'lower_body', calibrationLandmarks: LMS_LOWER,
  },
  knee_flexion: {
    id: 'knee_flexion', joint: 'knee', label: 'Knee Flexion',
    side: 'either', reference: { min: 110, ideal: 135 },
    cue: 'Standing tall, bend your knee back, bringing your heel toward your glute.',
    measure: measureKneeFlexion,
    segment: 'lower_body', calibrationLandmarks: [...LMS_LOWER, LM.L_ANKLE, LM.R_ANKLE],
  },
  cervical_rotation_left: {
    id: 'cervical_rotation_left', joint: 'cervical', label: 'Neck Rotation Left',
    side: 'L', reference: { min: 60, ideal: 80 },
    cue: 'Look straight ahead, then slowly turn your head to the left as far as comfortable.',
    measure: measureCervicalRotation,
    segment: 'neck', calibrationLandmarks: LMS_NECK,
  },
  cervical_rotation_right: {
    id: 'cervical_rotation_right', joint: 'cervical', label: 'Neck Rotation Right',
    side: 'R', reference: { min: 60, ideal: 80 },
    cue: 'Look straight ahead, then slowly turn your head to the right as far as comfortable.',
    measure: measureCervicalRotation,
    segment: 'neck', calibrationLandmarks: LMS_NECK,
  },
  trunk_flexion: {
    id: 'trunk_flexion', joint: 'trunk', label: 'Trunk Forward Flexion',
    side: 'either', reference: { min: 60, ideal: 80 },
    cue: 'Keeping legs straight, hinge at the hips and fold forward toward the floor.',
    measure: measureTrunkFlexion,
    segment: 'trunk', calibrationLandmarks: LMS_TRUNK,
  },
  // ── New goniometric movements (added in the biomechanics overhaul) ──────
  shoulder_extension: {
    id: 'shoulder_extension', joint: 'shoulder', label: 'Shoulder Extension',
    side: 'either', reference: { min: 40, ideal: 50 },
    cue: 'Stand tall, then reach your arm backward as far as comfortable, keeping the elbow straight.',
    measure: measureShoulderExtension,
    segment: 'upper_body', calibrationLandmarks: LMS_UPPER,
  },
  shoulder_adduction: {
    id: 'shoulder_adduction', joint: 'shoulder', label: 'Shoulder Adduction',
    side: 'either', reference: { min: 30, ideal: 45 },
    cue: 'Raise your arm to the side and then bring it back across the front of your body.',
    measure: measureShoulderAbduction,  // adduction is the return-from-abduction; we use the same plane projection
    segment: 'upper_body', calibrationLandmarks: LMS_UPPER,
  },
  shoulder_internal_rotation: {
    id: 'shoulder_internal_rotation', joint: 'shoulder', label: 'Shoulder Internal Rotation',
    side: 'either', reference: { min: 60, ideal: 70 },
    cue: 'Elbow at your side, bent 90 degrees, rotate your forearm across your stomach.',
    measure: measureShoulderIR,
    segment: 'upper_body', calibrationLandmarks: [...LMS_UPPER, LM.L_WRIST, LM.R_WRIST],
  },
  hip_extension: {
    id: 'hip_extension', joint: 'hip', label: 'Hip Extension',
    side: 'either', reference: { min: 20, ideal: 30 },
    cue: 'Stand tall, then lift one straight leg backward without arching your back.',
    measure: measureHipExtension,
    segment: 'lower_body', calibrationLandmarks: LMS_LOWER,
  },
  hip_adduction: {
    id: 'hip_adduction', joint: 'hip', label: 'Hip Adduction',
    side: 'either', reference: { min: 20, ideal: 30 },
    cue: 'Stand on one leg and bring the other leg across your body to the opposite side.',
    measure: measureHipAdduction,
    segment: 'lower_body', calibrationLandmarks: LMS_LOWER,
  },
  hip_rotation: {
    id: 'hip_rotation', joint: 'hip', label: 'Hip Rotation',
    side: 'either', reference: { min: 30, ideal: 45 },
    cue: 'Seated with knees bent, rotate one foot inward and then outward.',
    measure: measureHipRotation,
    segment: 'lower_body', calibrationLandmarks: [...LMS_LOWER, LM.L_ANKLE, LM.R_ANKLE],
  },
  ankle_dorsiflexion: {
    id: 'ankle_dorsiflexion', joint: 'ankle', label: 'Ankle Dorsiflexion',
    side: 'either', reference: { min: 15, ideal: 20 },
    cue: 'Stand or sit and pull your toes up toward your shin as far as you can.',
    measure: measureAnkleDorsiflexion,
    segment: 'lower_body', calibrationLandmarks: [...LMS_LOWER, LM.L_ANKLE, LM.R_ANKLE, LM.L_FOOT_IDX, LM.R_FOOT_IDX],
  },
  ankle_plantarflexion: {
    id: 'ankle_plantarflexion', joint: 'ankle', label: 'Ankle Plantarflexion',
    side: 'either', reference: { min: 40, ideal: 50 },
    cue: 'Stand or sit and point your toes downward, like pressing a gas pedal.',
    measure: measureAnklePlantarflexion,
    segment: 'lower_body', calibrationLandmarks: [...LMS_LOWER, LM.L_ANKLE, LM.R_ANKLE, LM.L_FOOT_IDX, LM.R_FOOT_IDX],
  },
  cervical_flexion: {
    id: 'cervical_flexion', joint: 'cervical', label: 'Neck Flexion',
    side: 'either', reference: { min: 40, ideal: 50 },
    cue: 'Slowly bring your chin down toward your chest.',
    measure: measureCervicalFlexion,
    segment: 'neck', calibrationLandmarks: LMS_NECK,
  },
  cervical_extension: {
    id: 'cervical_extension', joint: 'cervical', label: 'Neck Extension',
    side: 'either', reference: { min: 50, ideal: 60 },
    cue: 'Slowly tilt your head backward to look at the ceiling.',
    measure: measureCervicalExtension,
    segment: 'neck', calibrationLandmarks: LMS_NECK,
  },
  cervical_lateral_flexion_left: {
    id: 'cervical_lateral_flexion_left', joint: 'cervical', label: 'Neck Side-Bend Left',
    side: 'L', reference: { min: 35, ideal: 45 },
    cue: 'Slowly tilt your head to the left, bringing your left ear toward your left shoulder.',
    measure: measureCervicalLateralFlexion,
    segment: 'neck', calibrationLandmarks: LMS_NECK,
  },
  cervical_lateral_flexion_right: {
    id: 'cervical_lateral_flexion_right', joint: 'cervical', label: 'Neck Side-Bend Right',
    side: 'R', reference: { min: 35, ideal: 45 },
    cue: 'Slowly tilt your head to the right, bringing your right ear toward your right shoulder.',
    measure: measureCervicalLateralFlexion,
    segment: 'neck', calibrationLandmarks: LMS_NECK,
  },
  trunk_extension: {
    id: 'trunk_extension', joint: 'trunk', label: 'Trunk Extension',
    side: 'either', reference: { min: 20, ideal: 30 },
    cue: 'Stand tall with hands on hips, then slowly lean backward without bending your knees.',
    measure: measureTrunkExtension,
    segment: 'trunk', calibrationLandmarks: LMS_TRUNK,
  },
  trunk_lateral_flexion_left: {
    id: 'trunk_lateral_flexion_left', joint: 'trunk', label: 'Trunk Side-Bend Left',
    side: 'L', reference: { min: 25, ideal: 35 },
    cue: 'Stand tall and slide your left hand down the outside of your left thigh.',
    measure: measureTrunkLateralFlexion,
    segment: 'trunk', calibrationLandmarks: LMS_TRUNK,
  },
  trunk_lateral_flexion_right: {
    id: 'trunk_lateral_flexion_right', joint: 'trunk', label: 'Trunk Side-Bend Right',
    side: 'R', reference: { min: 25, ideal: 35 },
    cue: 'Stand tall and slide your right hand down the outside of your right thigh.',
    measure: measureTrunkLateralFlexion,
    segment: 'trunk', calibrationLandmarks: LMS_TRUNK,
  },
  trunk_rotation_left: {
    id: 'trunk_rotation_left', joint: 'trunk', label: 'Trunk Rotation Left',
    side: 'L', reference: { min: 35, ideal: 45 },
    cue: 'Standing tall with hips facing forward, rotate your shoulders to the left as far as possible.',
    measure: measureTrunkRotation,
    segment: 'trunk', calibrationLandmarks: LMS_TRUNK,
  },
  trunk_rotation_right: {
    id: 'trunk_rotation_right', joint: 'trunk', label: 'Trunk Rotation Right',
    side: 'R', reference: { min: 35, ideal: 45 },
    cue: 'Standing tall with hips facing forward, rotate your shoulders to the right as far as possible.',
    measure: measureTrunkRotation,
    segment: 'trunk', calibrationLandmarks: LMS_TRUNK,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Muscle → relevant movements
//  Each muscle gets the 1–2 movements that most directly test its function.
// ─────────────────────────────────────────────────────────────────────────────

export const MUSCLE_TO_MOVEMENTS: Record<string, string[]> = {
  // Shoulder
  // Parent "deltoid" — used when the user selects the whole-deltoid GLB mesh
  // (MUSC_DELTOID_R/L) directly without going through the diagnostic flow.
  // The diagnostic flow sets diagnosticSubMuscleId to deltoid_anterior /
  // _lateral / _posterior; this fallback covers the case where the user
  // clicks the muscle in the 3D viewer or picks it from the list — the
  // mesh ID strips to plain "deltoid" with no sub-suffix, so without this
  // entry the AssessmentView card was hidden entirely.
  deltoid:             ['shoulder_flexion', 'shoulder_abduction', 'shoulder_external_rotation'],
  deltoid_anterior:    ['shoulder_flexion', 'shoulder_abduction'],
  deltoid_lateral:     ['shoulder_abduction'],
  deltoid_posterior:   ['shoulder_abduction', 'shoulder_external_rotation'],
  // Parent "trapezius" — the GLB ships a single MUSC_TRAPEZIUS mesh (no
  // _R/_L), so plain "trapezius" needs to resolve to the full trap test set.
  trapezius:           ['cervical_rotation_left', 'cervical_rotation_right', 'shoulder_abduction', 'shoulder_flexion'],
  // Brachialis & coracobrachialis — single-joint elbow / shoulder flexors
  // that previously had no entry.  Selecting MUSC_BRACHIALIS_R from the
  // list returned an empty assessment card.
  brachialis:          ['elbow_flexion'],
  coracobrachialis:    ['shoulder_flexion'],
  supraspinatus:       ['shoulder_abduction'],
  infraspinatus:       ['shoulder_external_rotation'],
  teres_minor:         ['shoulder_external_rotation'],
  subscapularis:       ['shoulder_external_rotation'],
  teres_major:         ['shoulder_abduction'],
  pectoralis_major:    ['shoulder_flexion', 'shoulder_external_rotation'],
  latissimus_dorsi:    ['shoulder_flexion', 'shoulder_abduction'],
  serratus_anterior:   ['shoulder_flexion'],
  trapezius_upper:     ['cervical_rotation_left', 'cervical_rotation_right'],
  trapezius_middle:    ['shoulder_abduction'],
  trapezius_lower:     ['shoulder_flexion'],
  rhomboid_major:      ['shoulder_abduction'],
  rhomboid_minor:      ['shoulder_abduction'],
  levator_scapulae:    ['cervical_rotation_left', 'cervical_rotation_right'],

  // Arm
  biceps_brachii:                 ['elbow_flexion'],
  triceps_brachii:                ['elbow_flexion'],
  brachioradialis:                ['elbow_flexion'],
  extensor_carpi_radialis_longus: ['elbow_flexion'],
  extensor_digitorum:             ['elbow_flexion'],
  flexor_carpi_radialis:          ['elbow_flexion'],
  palmaris_longus:                ['elbow_flexion'],

  // Trunk / Spine
  rectus_abdominis:    ['trunk_flexion'],
  external_oblique:    ['trunk_flexion'],
  erector_spinae:      ['trunk_flexion'],
  multifidus:          ['trunk_flexion'],
  quadratus_lumborum:  ['trunk_flexion'],

  // Neck
  sternocleidomastoid:    ['cervical_rotation_left', 'cervical_rotation_right'],
  splenius_capitis:       ['cervical_rotation_left', 'cervical_rotation_right'],
  semispinalis_capitis:   ['cervical_rotation_left', 'cervical_rotation_right'],

  // Hip / Glute
  gluteus_maximus:      ['hip_flexion'],
  gluteus_medius:       ['hip_abduction'],
  gluteus_minimus:      ['hip_abduction'],
  tensor_fasciae_latae: ['hip_abduction', 'hip_flexion'],
  piriformis:           ['hip_abduction'],
  iliacus:              ['hip_flexion'],
  psoas_major:          ['hip_flexion'],

  // Thigh
  sartorius:         ['hip_flexion', 'knee_flexion'],
  rectus_femoris:    ['hip_flexion', 'knee_flexion'],
  vastus_lateralis:  ['knee_flexion'],
  vastus_medialis:   ['knee_flexion'],
  vastus_intermedius:['knee_flexion'],
  biceps_femoris:    ['knee_flexion', 'hip_flexion'],
  semitendinosus:    ['knee_flexion'],
  semimembranosus:   ['knee_flexion'],
  gracilis:          ['hip_abduction'],
  adductor_longus:   ['hip_abduction'],

  // Calf
  gastrocnemius:    ['knee_flexion', 'ankle_plantarflexion'],
  soleus:           ['ankle_plantarflexion'],
  popliteus:        ['knee_flexion'],
  tibialis_anterior:['ankle_dorsiflexion'],

  // ── Movements added in the goniometric overhaul ─────────────────────────
  // Spine / posterior chain
  rectus_abdominis_lower:  ['trunk_flexion'],
  internal_oblique:        ['trunk_lateral_flexion_left', 'trunk_lateral_flexion_right', 'trunk_rotation_left', 'trunk_rotation_right'],
  iliocostalis:            ['trunk_extension', 'trunk_lateral_flexion_left', 'trunk_lateral_flexion_right'],
  longissimus:             ['trunk_extension'],
  spinalis:                ['trunk_extension'],

  // Neck deeper coverage
  scalenus:                ['cervical_flexion', 'cervical_lateral_flexion_left', 'cervical_lateral_flexion_right'],
  longus_colli:            ['cervical_flexion'],
  suboccipitals:           ['cervical_extension'],
}

/** Helper: get the JointMovement objects for a muscle_id. */
export function getMovementsForMuscle(muscleId: string): JointMovement[] {
  const ids = MUSCLE_TO_MOVEMENTS[muscleId] ?? []
  return ids.map((id) => JOINT_MOVEMENTS[id]).filter(Boolean)
}
