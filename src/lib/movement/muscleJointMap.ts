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
//  Measurement helpers — all return degrees in 0..180 with 0 = neutral
// ─────────────────────────────────────────────────────────────────────────────

/** Shoulder abduction / flexion — gravity-relative.
 *
 *  Old version computed hip-to-shoulder-to-elbow.  That measures arm angle
 *  relative to the same-side TRUNK, so a slight lean (e.g. looking up at the
 *  camera) tilts the trunk axis and SUBTRACTS that tilt from the reported
 *  ROM.  A user with the arm visibly straight up read ~144° instead of 180°.
 *
 *  New version measures the upper-arm vector's angle from the GRAVITY axis
 *  (MediaPipe world Y, gravity-aligned).  Body lean is irrelevant — what
 *  matters is how far the elbow has travelled from "hanging by the side"
 *  toward "pointed at the ceiling".
 *
 *    arm hanging by side  : elbow directly below shoulder → 0°
 *    arm horizontal       : elbow level with shoulder     → 90°
 *    arm fully overhead   : elbow directly above shoulder → 180°
 *
 *  2D fallback uses image-space Y (image Y grows downward = gravity dir).
 *  Both abduction and flexion use the same calculation in a single-camera
 *  view; the user is told to raise OUT vs IN by the spoken cue, not the
 *  measurement.
 */
function measureShoulderAbduction(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL = side === 'L' ? LM.L_ELBOW    : LM.R_ELBOW
  if (!visAnchor(lms, SH)) return null
  if (!vis(lms, EL))       return null
  const sh = lms[SH], el = lms[EL]

  // Prefer 3-D world coords when available — they are gravity-aligned and
  // independent of camera angle / body lean.
  if (sh.wx !== undefined && el.wx !== undefined) {
    const dx = el.wx - sh.wx
    const dy = el.wy! - sh.wy!     // +y = downward (gravity direction)
    const dz = el.wz! - sh.wz!
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-6) return 0
    // cos(angle from gravity) = dy / len.
    //   dy positive (elbow below shoulder)  → cos=+1 → 0°  (arm down)
    //   dy negative (elbow above shoulder)  → cos=-1 → 180° (arm overhead)
    const cosG = dy / len
    return (Math.acos(Math.max(-1, Math.min(1, cosG))) * 180) / Math.PI
  }

  // 2-D fallback: image Y is also the gravity direction (grows downward).
  const dx2 = el.x - sh.x
  const dy2 = el.y - sh.y          // +y = elbow below shoulder
  const len2 = Math.hypot(dx2, dy2)
  if (len2 < 1e-6) return 0
  const cosG2 = dy2 / len2
  return (Math.acos(Math.max(-1, Math.min(1, cosG2))) * 180) / Math.PI
}

/** Shoulder flexion (forward raise) uses the same gravity-relative measurement
 *  as abduction; the spoken cue distinguishes raise-forward vs raise-out. */
const measureShoulderFlexion = measureShoulderAbduction

/** Shoulder external rotation at 90° abduction: angle of the forearm
 *  relative to vertical when the elbow is at shoulder height. */
function measureShoulderER(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const SH  = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL  = side === 'L' ? LM.L_ELBOW : LM.R_ELBOW
  const WR  = side === 'L' ? LM.L_WRIST : LM.R_WRIST
  if (!visAnchor(lms, SH, EL)) return null
  if (!vis(lms, WR))           return null
  // Elbow→wrist vector vertical angle: 0° = pointing straight up (full ER),
  // 180° = pointing straight down (full IR).  We map to ER degrees.
  const v = vectorVerticalAngleDeg(lms[EL], lms[WR])
  // 0 → 90° ER, 90 → 0° (neutral), 180 → -90° (IR).
  // Clamp to 0..90 for ER measurement.
  return Math.max(0, Math.min(90, 90 - Math.abs(v)))
}

/** Elbow flexion: angle at the elbow (shoulder→elbow→wrist).
 *  180° straight ≈ 0° flex; 30° fully bent ≈ 150° flex.  Returns "how much
 *  flexed from straight" so 0 = neutral, 150 = fully flexed.
 *
 *  Visibility tiering — we require the SHOULDER and ELBOW (the angle's
 *  vertex chain) to have ≥0.25 visibility, but we accept the WRIST at
 *  ≥0.10.  Shoulder + elbow positions almost never drop low because they're
 *  near the centre of frame; wrists routinely dip into the 0.15-0.25 band
 *  when the hand is above the head, which is precisely the pose users
 *  perform during this test.  The CameraView EMA smoother keeps the wrist
 *  position stable even when visibility is fluctuating, so the angle stays
 *  accurate.
 */
function measureElbowFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const EL = side === 'L' ? LM.L_ELBOW : LM.R_ELBOW
  const WR = side === 'L' ? LM.L_WRIST : LM.R_WRIST
  if (!visAnchor(lms, SH, EL)) return null
  if (!vis(lms, WR))           return null
  const ang = jointAngleDeg(lms[SH], lms[EL], lms[WR])
  return Math.max(0, 180 - ang)
}

/** Hip flexion (standing knee raise): angle between trunk vertical
 *  (hip→shoulder) and the thigh (hip→knee). */
function measureHipFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const SH = side === 'L' ? LM.L_SHOULDER : LM.R_SHOULDER
  const HIP = side === 'L' ? LM.L_HIP : LM.R_HIP
  const KN = side === 'L' ? LM.L_KNEE : LM.R_KNEE
  if (!vis(lms, SH, HIP, KN)) return null
  // Angle at hip — bigger angle = thigh closer to chest = more flexion
  const ang = jointAngleDeg(lms[SH], lms[HIP], lms[KN])
  return Math.max(0, 180 - ang)
}

/** Hip abduction: angle between trunk vertical and the thigh in the frontal plane. */
function measureHipAbduction(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const HIP_THIS = side === 'L' ? LM.L_HIP : LM.R_HIP
  const HIP_OTHER = side === 'L' ? LM.R_HIP : LM.L_HIP
  const KN = side === 'L' ? LM.L_KNEE : LM.R_KNEE
  if (!vis(lms, HIP_THIS, HIP_OTHER, KN)) return null
  return jointAngleDeg(lms[HIP_OTHER], lms[HIP_THIS], lms[KN])
}

/** Knee flexion: 0 = straight, increases as the knee bends. */
function measureKneeFlexion(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  const HIP = side === 'L' ? LM.L_HIP : LM.R_HIP
  const KN  = side === 'L' ? LM.L_KNEE : LM.R_KNEE
  const AN  = side === 'L' ? LM.L_ANKLE : LM.R_ANKLE
  if (!vis(lms, HIP, KN, AN)) return null
  const ang = jointAngleDeg(lms[HIP], lms[KN], lms[AN])
  return Math.max(0, 180 - ang)
}

/** Cervical rotation: nose offset relative to mid-shoulder, normalised by ear-spread. */
function measureCervicalRotation(lms: LandmarkSet, side: 'L' | 'R'): number | null {
  if (!vis(lms, LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER)) return null
  const midShX = (lms[LM.L_SHOULDER].x + lms[LM.R_SHOULDER].x) / 2
  const earSpread = Math.abs(lms[LM.L_EAR].x - lms[LM.R_EAR].x) + 1e-6
  const noseShift = (lms[LM.NOSE].x - midShX) / earSpread
  const deg = Math.atan(noseShift * 2) * 180 / Math.PI
  // For 'L' side rotation, head turns LEFT (camera right because mirrored).
  // We just report the absolute rotation angle.
  return side === 'L' ? Math.max(0, -deg) : Math.max(0, deg)
}

/** Trunk flexion (forward fold): angle between hip→shoulder and vertical. */
function measureTrunkFlexion(lms: LandmarkSet, _side: 'L' | 'R'): number | null {
  if (!vis(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP)) return null
  const midSh = { x: (lms[LM.L_SHOULDER].x + lms[LM.R_SHOULDER].x) / 2, y: (lms[LM.L_SHOULDER].y + lms[LM.R_SHOULDER].y) / 2, z: 0, visibility: 1 }
  const midHip = { x: (lms[LM.L_HIP].x + lms[LM.R_HIP].x) / 2, y: (lms[LM.L_HIP].y + lms[LM.R_HIP].y) / 2, z: 0, visibility: 1 }
  return Math.abs(vectorVerticalAngleDeg(midHip, midSh))
}

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
  gastrocnemius:    ['knee_flexion'],
  soleus:           ['knee_flexion'],
  popliteus:        ['knee_flexion'],
  tibialis_anterior:['knee_flexion'],
}

/** Helper: get the JointMovement objects for a muscle_id. */
export function getMovementsForMuscle(muscleId: string): JointMovement[] {
  const ids = MUSCLE_TO_MOVEMENTS[muscleId] ?? []
  return ids.map((id) => JOINT_MOVEMENTS[id]).filter(Boolean)
}
