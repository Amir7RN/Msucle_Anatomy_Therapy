/**
 * bodySegments.ts  (De Leva anthropometrics)
 *
 * Scientific body-segment inertia model for the Live Muscle Twin, so the twin
 * moves with real mass, centre-of-mass and momentum instead of like a weightless
 * balloon.
 *
 * Source: P. de Leva (1996), "Adjustments to Zatsiorsky-Seluyanov's segment
 * inertia parameters", J. Biomechanics 29(9):1223-1230 — the standard
 * sex-specific table of, per segment:
 *   • relative mass        (fraction of total body mass)
 *   • CoM longitudinal pos (fraction of segment length, from the proximal end)
 *   • radius of gyration   (fraction of segment length, transverse axis — the
 *                           axis a limb swings about at its joint)
 *
 * Segment lengths come from the classic stature fractions (Drillis & Contini /
 * Winter). From these we derive each segment's mass (kg), CoM offset, and moment
 * of inertia about its PROXIMAL JOINT (parallel-axis: I = m·(k·L)² + m·(d·L)²),
 * which is exactly the inertia that resists the joint rotating — what gives the
 * limb its momentum on screen.
 *
 * The twin has no separate hand/foot mesh, so the hand is folded into the
 * forearm and the foot into the shank as rigid composites (masses summed, CoM
 * and inertia combined about the proximal joint). The folded fractions still sum
 * to 1.0 over the twin's segments.
 */

export type Sex = 'male' | 'female'

export type BodySegmentId =
  | 'head' | 'trunk'
  | 'upperArmL' | 'upperArmR'
  | 'forearmL' | 'forearmR'
  | 'thighL' | 'thighR'
  | 'shankL' | 'shankR'

/** Limb-family key used for the momentum/agility profile (L/R share one). */
export type SegmentFamily = 'head' | 'trunk' | 'upperArm' | 'forearm' | 'thigh' | 'shank'

interface DLParam { m: number; com: number; k: number; len: number }
//  m   = mass / total body mass
//  com = CoM from proximal end, as fraction of segment length
//  k   = transverse radius of gyration, as fraction of segment length
//  len = segment length as fraction of standing height
const DELEVA: Record<Sex, Record<'head'|'trunk'|'upperarm'|'forearm'|'hand'|'thigh'|'shank'|'foot', DLParam>> = {
  male: {
    head:     { m: 0.0694, com: 0.5002, k: 0.303, len: 0.130 },
    trunk:    { m: 0.4346, com: 0.5138, k: 0.328, len: 0.288 },
    upperarm: { m: 0.0271, com: 0.5772, k: 0.269, len: 0.186 },
    forearm:  { m: 0.0162, com: 0.4574, k: 0.265, len: 0.146 },
    hand:     { m: 0.0061, com: 0.7900, k: 0.513, len: 0.108 },
    thigh:    { m: 0.1416, com: 0.4095, k: 0.329, len: 0.245 },
    shank:    { m: 0.0433, com: 0.4459, k: 0.249, len: 0.246 },
    foot:     { m: 0.0137, com: 0.4415, k: 0.245, len: 0.152 },
  },
  female: {
    head:     { m: 0.0668, com: 0.4841, k: 0.330, len: 0.130 },
    trunk:    { m: 0.4257, com: 0.4964, k: 0.320, len: 0.288 },
    upperarm: { m: 0.0255, com: 0.5754, k: 0.260, len: 0.186 },
    forearm:  { m: 0.0138, com: 0.4559, k: 0.257, len: 0.146 },
    hand:     { m: 0.0056, com: 0.7474, k: 0.454, len: 0.108 },
    thigh:    { m: 0.1478, com: 0.3612, k: 0.364, len: 0.245 },
    shank:    { m: 0.0481, com: 0.4416, k: 0.267, len: 0.246 },
    foot:     { m: 0.0129, com: 0.4014, k: 0.279, len: 0.152 },
  },
}

export interface SegmentMass {
  id:    BodySegmentId
  family: SegmentFamily
  /** Mass in kg for the given body mass. */
  kg:    number
  /** Fraction of total body mass (0..1). */
  frac:  number
  /** Segment length in cm for the given height. */
  lengthCm: number
  /** CoM distance from the proximal joint, cm. */
  comCm: number
  /** Moment of inertia about the proximal joint, kg·m². */
  inertia: number
}

export interface BodyMassModel {
  totalKg:  number
  heightCm: number
  sex:      Sex
  segments: SegmentMass[]
  /** Per-family angular "agility" multiplier (≈0.7 heavy … 1.3 light) used by
   *  the renderer to give heavier limbs more momentum. Sex-structural. */
  agility:  Record<SegmentFamily, number>
}

export const WEIGHT_MIN_KG = 25
export const WEIGHT_MAX_KG = 250
export const HEIGHT_MIN_CM = 120
export const HEIGHT_MAX_CM = 230

export const DEFAULT_WEIGHT_KG = 75
export const DEFAULT_HEIGHT_CM = 175
export const DEFAULT_SEX: Sex = 'male'

export function clampWeight(kg: number): number {
  if (!isFinite(kg)) return DEFAULT_WEIGHT_KG
  return Math.max(WEIGHT_MIN_KG, Math.min(WEIGHT_MAX_KG, kg))
}
export function clampHeight(cm: number): number {
  if (!isFinite(cm)) return DEFAULT_HEIGHT_CM
  return Math.max(HEIGHT_MIN_CM, Math.min(HEIGHT_MAX_CM, cm))
}

/** Inertia of a single segment about its proximal joint (kg·m²). */
function inertiaProximal(m: number, L: number, p: DLParam): number {
  return m * ((p.k * L) ** 2 + (p.com * L) ** 2)
}

const FAMILY_LABEL: Record<SegmentFamily, string> = {
  head: 'Head + neck', trunk: 'Trunk', upperArm: 'Upper arm',
  forearm: 'Forearm + hand', thigh: 'Thigh', shank: 'Shank + foot',
}

/**
 * Build the full per-segment mass/CoM/inertia model for a body. Inputs are
 * clamped to a plausible adult range first.
 */
export function buildBodyMassModel(weightKg: number, heightCm: number, sex: Sex = DEFAULT_SEX): BodyMassModel {
  const totalKg = clampWeight(weightKg)
  const cm      = clampHeight(heightCm)
  const H       = cm / 100                       // metres
  const T       = DELEVA[sex]

  // Composite limb segments (about their proximal joint).
  const mU = totalKg * T.upperarm.m
  const Lu = T.upperarm.len * H
  const Iu = inertiaProximal(mU, Lu, T.upperarm)

  // forearm + hand about the elbow
  const mF = totalKg * T.forearm.m, mHa = totalKg * T.hand.m
  const Lf = T.forearm.len * H,     Lh  = T.hand.len * H
  const If = inertiaProximal(mF, Lf, T.forearm)
  const dHand = Lf + T.hand.com * Lh
  const Ih = mHa * ((T.hand.k * Lh) ** 2 + dHand ** 2)
  const mFH = mF + mHa
  const Ifh = If + Ih
  const comFH = (mF * T.forearm.com * Lf + mHa * dHand) / mFH

  const mT = totalKg * T.thigh.m
  const Lt = T.thigh.len * H
  const It = inertiaProximal(mT, Lt, T.thigh)

  // shank + foot about the knee
  const mS = totalKg * T.shank.m, mFt = totalKg * T.foot.m
  const Ls = T.shank.len * H,     Lft = T.foot.len * H
  const Is = inertiaProximal(mS, Ls, T.shank)
  const dFoot = Ls + 0.5 * Lft                   // foot CoM roughly below the knee + half foot
  const Ift = mFt * ((T.foot.k * Lft) ** 2 + dFoot ** 2)
  const mSF = mS + mFt
  const Isf = Is + Ift
  const comSF = (mS * T.shank.com * Ls + mFt * dFoot) / mSF

  const mHead = totalKg * T.head.m
  const Lhead = T.head.len * H
  const Ihead = inertiaProximal(mHead, Lhead, T.head)
  const mTrunk = totalKg * T.trunk.m
  const Ltrunk = T.trunk.len * H
  const Itrunk = inertiaProximal(mTrunk, Ltrunk, T.trunk)

  const mk = (id: BodySegmentId, family: SegmentFamily, kg: number, frac: number, Lcm: number, comCmV: number, I: number): SegmentMass =>
    ({ id, family, kg: +kg.toFixed(2), frac, lengthCm: +Lcm.toFixed(1), comCm: +comCmV.toFixed(1), inertia: +I.toFixed(4) })

  const segments: SegmentMass[] = [
    mk('head', 'head', mHead, T.head.m, T.head.len * cm, T.head.com * T.head.len * cm, Ihead),
    mk('trunk', 'trunk', mTrunk, T.trunk.m, T.trunk.len * cm, T.trunk.com * T.trunk.len * cm, Itrunk),
    mk('upperArmL', 'upperArm', mU, T.upperarm.m, T.upperarm.len * cm, T.upperarm.com * T.upperarm.len * cm, Iu),
    mk('upperArmR', 'upperArm', mU, T.upperarm.m, T.upperarm.len * cm, T.upperarm.com * T.upperarm.len * cm, Iu),
    mk('forearmL', 'forearm', mFH, T.forearm.m + T.hand.m, (T.forearm.len + T.hand.len) * cm, comFH * 100, Ifh),
    mk('forearmR', 'forearm', mFH, T.forearm.m + T.hand.m, (T.forearm.len + T.hand.len) * cm, comFH * 100, Ifh),
    mk('thighL', 'thigh', mT, T.thigh.m, T.thigh.len * cm, T.thigh.com * T.thigh.len * cm, It),
    mk('thighR', 'thigh', mT, T.thigh.m, T.thigh.len * cm, T.thigh.com * T.thigh.len * cm, It),
    mk('shankL', 'shank', mSF, T.shank.m + T.foot.m, (T.shank.len + T.foot.len) * cm, comSF * 100, Isf),
    mk('shankR', 'shank', mSF, T.shank.m + T.foot.m, (T.shank.len + T.foot.len) * cm, comSF * 100, Isf),
  ]

  // Agility = how quickly a limb tracks, inversely from its joint inertia
  // (heavier ⇒ more momentum ⇒ a touch slower). Normalised to the upper arm and
  // gently bounded so nothing feels sluggish or twitchy.
  const Iref = Iu
  const ag = (I: number) => Math.max(0.7, Math.min(1.3, Math.pow(Iref / Math.max(I, 1e-6), 0.25)))
  const agility: Record<SegmentFamily, number> = {
    head: ag(Ihead), trunk: ag(Itrunk), upperArm: 1, forearm: ag(Ifh), thigh: ag(It), shank: ag(Isf),
  }

  return { totalKg, heightCm: cm, sex, segments, agility }
}

/** Friendly family label (for any compact read-out). */
export function familyLabel(f: SegmentFamily): string { return FAMILY_LABEL[f] }

/**
 * A single 0.8..1.25 "heaviness" factor the renderer uses to tune the vertical
 * jump/landing dynamics (heavier ⇒ stiffer, lands harder, floats less).
 */
export function heavinessFactor(weightKg: number): number {
  const kg = clampWeight(weightKg)
  const f  = Math.cbrt(kg / DEFAULT_WEIGHT_KG)
  return Math.max(0.8, Math.min(1.25, f))
}
