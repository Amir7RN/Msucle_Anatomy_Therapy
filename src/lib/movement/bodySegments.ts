/**
 * bodySegments.ts
 *
 * Scientific body-mass distribution for the Live Muscle Twin.
 *
 * The twin used to behave like a weightless balloon — every segment had the
 * same (zero) inertia, so a jump shot the whole model up and it floated back
 * down with no sense of weight. Real bodies don't do that: ~50% of your mass is
 * trunk, a leg is ~16%, an arm ~5%. Giving each segment its true share of the
 * user's body mass lets the physics (jump settle, landing damping) feel weighty
 * and lets us show the user a real per-segment mass breakdown.
 *
 * Fractions are the classic Winter table (D.A. Winter, *Biomechanics and Motor
 * Control of Human Movement*, 4th ed., 2009, Table 4.1), segment mass as a
 * fraction of TOTAL body mass. Where the twin has no separate hand/foot mesh we
 * fold the hand into the forearm and the foot into the shank, and the neck into
 * the head, so the fractions below still sum to exactly 1.0 over the twin's
 * segments.
 *
 *   head(+neck) .081 + trunk .497
 *   + 2·upperArm .028 + 2·forearm(+hand) .022
 *   + 2·thigh .100   + 2·shank(+foot) .061
 *   = .578 + .056 + .044 + .200 + .122 = 1.000
 *
 * Segment LENGTHS as a fraction of standing height come from the same source
 * (Table 4.1) and are used only for the informational read-out — the rendered
 * geometry itself comes from the GLB.
 */

export type BodySegmentId =
  | 'head' | 'trunk'
  | 'upperArmL' | 'upperArmR'
  | 'forearmL' | 'forearmR'
  | 'thighL' | 'thighR'
  | 'shankL' | 'shankR'

/** Segment mass as a fraction of total body mass (Winter 2009, folded). */
export const MASS_FRACTION: Record<BodySegmentId, number> = {
  head:      0.081,   // head + neck
  trunk:     0.497,   // thorax + abdomen + pelvis
  upperArmL: 0.028, upperArmR: 0.028,
  forearmL:  0.022, forearmR:  0.022,  // forearm + hand
  thighL:    0.100, thighR:    0.100,
  shankL:    0.061, shankR:    0.061,  // leg + foot
}

/** Segment length as a fraction of standing height (Winter 2009). */
export const LENGTH_FRACTION: Record<BodySegmentId, number> = {
  head:      0.130,
  trunk:     0.288,
  upperArmL: 0.186, upperArmR: 0.186,
  forearmL:  0.254, forearmR:  0.254,  // forearm 0.146 + hand 0.108
  thighL:    0.245, thighR:    0.245,
  shankL:    0.285, shankR:    0.285,  // shank 0.246 + foot height contribution
}

/** Friendly labels for the read-out. */
export const SEGMENT_LABEL: Record<BodySegmentId, string> = {
  head: 'Head + neck', trunk: 'Trunk',
  upperArmL: 'Upper arm (L)', upperArmR: 'Upper arm (R)',
  forearmL: 'Forearm + hand (L)', forearmR: 'Forearm + hand (R)',
  thighL: 'Thigh (L)', thighR: 'Thigh (R)',
  shankL: 'Shank + foot (L)', shankR: 'Shank + foot (R)',
}

export const SEGMENT_IDS: BodySegmentId[] = [
  'head', 'trunk', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR',
  'thighL', 'thighR', 'shankL', 'shankR',
]

export interface SegmentMass {
  id:    BodySegmentId
  label: string
  /** Mass in kg for the given body mass. */
  kg:    number
  /** Fraction of total body mass (0..1). */
  frac:  number
  /** Segment length in cm for the given height (informational). */
  lengthCm: number
}

export interface BodyMassModel {
  /** Total body mass actually used (kg), after clamping to a sane range. */
  totalKg:  number
  /** Height actually used (cm), after clamping. */
  heightCm: number
  segments: SegmentMass[]
}

/** Plausible adult bounds so a typo can't blow up the physics. */
export const WEIGHT_MIN_KG = 25
export const WEIGHT_MAX_KG = 250
export const HEIGHT_MIN_CM = 120
export const HEIGHT_MAX_CM = 230

/** Default assumptions when the user hasn't entered their numbers yet. */
export const DEFAULT_WEIGHT_KG = 75
export const DEFAULT_HEIGHT_CM = 175

export function clampWeight(kg: number): number {
  if (!isFinite(kg)) return DEFAULT_WEIGHT_KG
  return Math.max(WEIGHT_MIN_KG, Math.min(WEIGHT_MAX_KG, kg))
}
export function clampHeight(cm: number): number {
  if (!isFinite(cm)) return DEFAULT_HEIGHT_CM
  return Math.max(HEIGHT_MIN_CM, Math.min(HEIGHT_MAX_CM, cm))
}

/**
 * Build the full per-segment mass/length breakdown for a given body mass and
 * height. Inputs are clamped to a plausible adult range first.
 */
export function buildBodyMassModel(weightKg: number, heightCm: number): BodyMassModel {
  const totalKg  = clampWeight(weightKg)
  const h        = clampHeight(heightCm)
  const segments: SegmentMass[] = SEGMENT_IDS.map((id) => ({
    id,
    label:    SEGMENT_LABEL[id],
    kg:       +(MASS_FRACTION[id] * totalKg).toFixed(2),
    frac:     MASS_FRACTION[id],
    lengthCm: +(LENGTH_FRACTION[id] * h).toFixed(1),
  }))
  return { totalKg, heightCm: h, segments }
}

/**
 * A single 0..1 "heaviness" factor the renderer uses to tune jump/landing
 * dynamics. 1.0 ≈ an average 75 kg adult; a 50 kg person is lighter and springs
 * a touch higher/softer, a 110 kg person is heavier and lands harder with less
 * float. Kept gentle (≈0.8..1.25) so the twin never feels sluggish or twitchy.
 */
export function heavinessFactor(weightKg: number): number {
  const kg = clampWeight(weightKg)
  const f  = Math.cbrt(kg / DEFAULT_WEIGHT_KG)   // cube-root → gentle scaling
  return Math.max(0.8, Math.min(1.25, f))
}
