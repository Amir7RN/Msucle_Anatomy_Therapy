/**
 * Public entry point. Most integrators only need:
 *
 *   import { LowerLimbTracker } from '@zeva/lower-limb-tracker'
 *
 * The rest of the exports are here for integrators who want to build their
 * own pipeline from the individual pieces (e.g. a custom drawing/recording
 * layer) instead of using the LowerLimbTracker class directly.
 */

export { LowerLimbTracker } from './tracker'
export type { LowerLimbFrame, LowerLimbTrackerOptions, ConfidenceBand } from './tracker'

export { createPoseDetector, detectVideoFrame, disposePoseDetector } from './poseDetector'
export type { PoseDetectorOptions } from './poseDetector'

export { createLandmarkFilter } from './signalFilter'
export type { LandmarkFilter, FilterCalibration } from './signalFilter'

export {
  measureGaitFrame, GaitGapFiller, GaitStepMachine, summariseGait,
  fillInstantaneousSpeed, buildGaitCsv, renderGaitPlot, downloadText, downloadCanvasPng,
  ANKLE_DEPTH_TRUST_CAP,
} from './gait'
export type { GaitFrameMetrics, GaitSample, GaitSummary, AnkleStats, GapFillResult } from './gait'

export { BaselineCollector, zeroSigned } from './baseline'

export { measurementConfidence, confidenceBand, MeasurementStabilizer } from './confidence'
export type { ConfidenceInputs, StabilizerOutput } from './confidence'

export { LM, jointAngleDeg, vectorVerticalAngleDeg, symmetry, visible, dist2D, MIN_VISIBILITY } from './landmarks'
export type { Landmark, LandmarkSet } from './landmarks'

export {
  computeAnatomicalFrame, depthReliability, adaptiveVertexAngle,
  worldVec, projectOntoPlane, signedAngleInPlane, angleBetween, angleFromAxisInPlane,
} from './anatomicalFrame'
export type { Vec3, AnatomicalFrame } from './anatomicalFrame'
