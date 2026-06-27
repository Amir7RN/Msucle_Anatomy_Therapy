/**
 * muscleStatus.ts
 *
 * Camera-only "muscle status" layer for the Live Muscle Twin.
 *
 * The activation engine (liveMuscleActivation.ts) answers "which muscle is
 * firing right NOW and how hard". That is instantaneous. This module turns
 * that instantaneous stream into a *status* a gym user actually cares about,
 * using only signals a single camera can see — no EMG, no wearable:
 *
 *   • FATIGUE  — a per-muscle "battery". It drains while a muscle works
 *                (time-under-tension × intensity × external load) and recharges
 *                slowly while it rests. A camera can't read EMG median-frequency
 *                fatigue, but it CAN see the two honest mechanical proxies that
 *                accompany real fatigue: (a) sustained high activation over time
 *                and (b) RANGE COLLAPSE — the user can no longer hit the range
 *                of motion they hit while fresh. We fuse both.
 *
 *   • WORK     — accumulated volume-load proxy = Σ(activation × loadFactor × dt)
 *                per muscle region. This is the relative "tonnage" that drives
 *                growth, and it's what lets the twin say "your chest did 40 %
 *                more work than last session".
 *
 *   • STATE    — fresh → warming → working → fatigued → spent, derived from the
 *                fatigue battery plus whether the muscle is firing right now.
 *
 *   • IMBALANCE — left-vs-right work/activation split per joint pair, the single
 *                most useful thing a camera does that a dumbbell can't.
 *
 * Everything here is a kinesiology *estimate* for biofeedback/coaching, not a
 * clinical measurement. An EMG sleeve or periodic ultrasound would be the
 * ground-truth upgrades and can feed the very same status model.
 */

import type { SymmetryRegion } from '../insights/symmetry'
import type { LiveMuscleActivation, JointLiveReading, LiveFrame, LoadInput } from './liveMuscleActivation'

export type MuscleState = 'fresh' | 'warming' | 'working' | 'fatigued' | 'spent'

export interface RegionStatus {
  region:     SymmetryRegion
  label:      string
  side:       'L' | 'R' | 'C'
  /** 0..1 smoothed activation for this region right now. */
  activation: number
  /** 0..1 fatigue battery (0 = fresh, 1 = spent). */
  fatigue:    number
  /** Accumulated work / volume-load proxy this session (arbitrary units). */
  work:       number
  /** Peak activation seen this session, 0..1. */
  peakActivation: number
  state:      MuscleState
}

export interface ImbalancePair {
  /** Human label, e.g. "Shoulders". */
  label:  string
  joint:  string          // 'shoulder' | 'elbow' | 'hip' | 'knee' | 'ankle'
  left:   number          // work units, left side
  right:  number          // work units, right side
  /** 0..1 asymmetry: |L-R| / max(L,R). 0 = perfectly balanced. */
  asym:   number
  /** Which side is doing less work (the weaker/under-recruited side). */
  weaker: 'L' | 'R' | null
}

export interface MuscleStatusFrame {
  regions:    RegionStatus[]
  imbalances: ImbalancePair[]
  /** Total accumulated work across all regions (session volume-load proxy). */
  totalWork:  number
  /** Highest current fatigue across all regions. */
  maxFatigue: number
  /** Region with the most accumulated work this session, or null. */
  topRegion:  SymmetryRegion | null
  /** Active session time (ms) the user has actually been moving/working. */
  workingMs:  number
}

// ── Tunables (camera-friendly, conservative) ─────────────────────────────────

const WORK_THRESH   = 0.30   // activation above this counts as "working"
const REST_THRESH   = 0.20   // activation below this lets the muscle recover
const FATIGUE_GAIN  = 0.085  // how fast the battery drains under full load (per s)
const RECOVERY_RATE = 0.018  // how fast it recharges at rest (per s) — slow on purpose
const RANGE_GAIN    = 0.20   // extra fatigue per second when range has collapsed
const RANGE_DROP    = 0.78   // current peak ROM below this fraction of fresh peak ⇒ collapse
const LOAD_PER_KG   = 0.06   // external-load contribution to intensity/work
const LOAD_MAX      = 3.0    // cap the load multiplier
const ACT_SMOOTH    = 0.30   // low-pass on per-region activation for the panel

const STATE_SPENT    = 0.85
const STATE_FATIGUED = 0.60
const STATE_WORKING  = 0.45  // activation level that reads as "working right now"
const STATE_WARMING  = 0.20

const REGION_LABEL: Record<SymmetryRegion, string> = {
  left_shoulder: 'L shoulder', right_shoulder: 'R shoulder',
  left_elbow: 'L arm',         right_elbow: 'R arm',
  left_hip: 'L hip/glute',     right_hip: 'R hip/glute',
  left_knee: 'L thigh',        right_knee: 'R thigh',
  left_ankle: 'L calf',        right_ankle: 'R calf',
  neck: 'Neck',                trunk: 'Core / trunk',
}

const ALL_REGIONS: SymmetryRegion[] = [
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'neck', 'trunk',
]

function regionSide(r: SymmetryRegion): 'L' | 'R' | 'C' {
  if (r.startsWith('left'))  return 'L'
  if (r.startsWith('right')) return 'R'
  return 'C'
}

/** Upper-limb regions scale with that hand's external load; others don't. */
function isUpperLimb(r: SymmetryRegion): boolean {
  return r.endsWith('shoulder') || r.endsWith('elbow')
}

/** Map a joint reading's movementId to the joint base used for ROM tracking. */
function jointBaseOf(movementId: string): string | null {
  const id = movementId.toLowerCase()
  if (id.includes('shoulder')) return 'shoulder'
  if (id.includes('elbow'))    return 'elbow'
  if (id.includes('hip'))      return 'hip'
  if (id.includes('knee'))     return 'knee'
  if (id.includes('ankle'))    return 'ankle'
  if (id.includes('neck') || id.includes('cervical')) return 'neck'
  if (id.includes('trunk') || id.includes('lumbar') || id.includes('spine')) return 'trunk'
  return null
}

/** joint base + side → SymmetryRegion. */
function regionOf(jointBase: string, side: 'L' | 'R'): SymmetryRegion | null {
  switch (jointBase) {
    case 'shoulder': return side === 'L' ? 'left_shoulder' : 'right_shoulder'
    case 'elbow':    return side === 'L' ? 'left_elbow'    : 'right_elbow'
    case 'hip':      return side === 'L' ? 'left_hip'      : 'right_hip'
    case 'knee':     return side === 'L' ? 'left_knee'     : 'right_knee'
    case 'ankle':    return side === 'L' ? 'left_ankle'    : 'right_ankle'
    case 'neck':     return 'neck'
    case 'trunk':    return 'trunk'
    default:         return null
  }
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x }

interface RegionAccum {
  activation:     number   // smoothed
  fatigue:        number
  work:           number
  peakActivation: number
  freshPeakRom:   number   // best ROM achieved while still fresh (the baseline)
  curPeakRom:     number   // decaying recent peak ROM
}

function blankAccum(): RegionAccum {
  return { activation: 0, fatigue: 0, work: 0, peakActivation: 0, freshPeakRom: 0, curPeakRom: 0 }
}

/**
 * MuscleStatusEngine — feed it each LiveFrame; it integrates status over the
 * session. Stateful and frame-rate independent (everything scales by dt).
 */
export class MuscleStatusEngine {
  private acc = new Map<SymmetryRegion, RegionAccum>()
  private prevT: number | null = null
  private workingMs = 0

  constructor() {
    for (const r of ALL_REGIONS) this.acc.set(r, blankAccum())
  }

  /**
   * @param frame  output of LiveActivationEngine.update for this tick
   * @param tMs    timestamp (performance.now())
   * @param load   external load the camera/AI saw, kg per hand
   */
  update(frame: LiveFrame, tMs: number, load: LoadInput = {}): MuscleStatusFrame {
    const dt = this.prevT == null ? 0 : Math.min(0.1, Math.max(0, (tMs - this.prevT) / 1000))
    this.prevT = tMs

    // 1. Region activation this frame (max over muscles mapped to the region).
    const instAct = new Map<SymmetryRegion, number>()
    for (const a of frame.activations as LiveMuscleActivation[]) {
      const prev = instAct.get(a.region) ?? 0
      if (a.level > prev) instAct.set(a.region, a.level)
    }

    // 2. Region peak ROM this frame (max romFrac over readings mapped to region).
    const instRom = new Map<SymmetryRegion, number>()
    for (const rd of frame.readings as JointLiveReading[]) {
      if (rd.confidence < 0.3) continue
      const base = jointBaseOf(rd.movementId)
      if (!base) continue
      const reg = regionOf(base, rd.side)
      if (!reg) continue
      const prev = instRom.get(reg) ?? 0
      if (rd.romFrac > prev) instRom.set(reg, rd.romFrac)
    }

    let anyWorking = false

    for (const region of ALL_REGIONS) {
      const a = this.acc.get(region)!
      const rawAct = instAct.get(region) ?? 0

      // Smoothed activation for display.
      a.activation += (rawAct - a.activation) * ACT_SMOOTH
      if (a.activation > a.peakActivation) a.peakActivation = a.activation

      // External-load multiplier (upper-limb regions only).
      const side = regionSide(region)
      let loadFactor = 1
      if (isUpperLimb(region)) {
        const kg = side === 'L' ? (load.leftKg ?? 0) : (load.rightKg ?? 0)
        loadFactor = Math.min(LOAD_MAX, 1 + Math.max(0, kg) * LOAD_PER_KG)
      }

      // Effective intensity drives both work and fatigue.
      const intensity = clamp01(rawAct * (isUpperLimb(region) ? Math.min(loadFactor / LOAD_MAX + 0.4, 1.2) : 1))
      const working = rawAct >= WORK_THRESH

      // ── Work (volume-load proxy): integrate activation × load × time ──────
      if (rawAct >= REST_THRESH) {
        a.work += rawAct * loadFactor * dt
      }

      // ── ROM baseline tracking ─────────────────────────────────────────────
      const rom = instRom.get(region) ?? 0
      // Establish the "fresh" baseline from early reps (while fatigue is low).
      if (rom > a.freshPeakRom && a.fatigue < 0.35) a.freshPeakRom = rom
      // Current peak ROM with slow decay so a momentary low frame doesn't trip it.
      a.curPeakRom = Math.max(rom, a.curPeakRom - 0.15 * dt)

      // ── Fatigue battery ───────────────────────────────────────────────────
      if (working) {
        // Drain proportional to intensity^1.5 (hard efforts cost more).
        a.fatigue += Math.pow(intensity, 1.5) * FATIGUE_GAIN * dt
        // Range-collapse kicker: still pushing but can't reach prior range.
        if (a.freshPeakRom > 0.15 && a.curPeakRom < a.freshPeakRom * RANGE_DROP) {
          const collapse = clamp01((a.freshPeakRom * RANGE_DROP - a.curPeakRom) / (a.freshPeakRom * RANGE_DROP))
          a.fatigue += collapse * RANGE_GAIN * dt
        }
        anyWorking = true
      } else if (rawAct < REST_THRESH) {
        a.fatigue -= RECOVERY_RATE * dt
      }
      a.fatigue = clamp01(a.fatigue)
    }

    if (anyWorking) this.workingMs += dt * 1000

    return this.snapshot()
  }

  /** Current status without advancing time. */
  snapshot(): MuscleStatusFrame {
    const regions: RegionStatus[] = []
    let totalWork = 0
    let maxFatigue = 0
    let topRegion: SymmetryRegion | null = null
    let topWork = -1

    for (const region of ALL_REGIONS) {
      const a = this.acc.get(region)!
      const state = classify(a.activation, a.fatigue)
      regions.push({
        region, label: REGION_LABEL[region], side: regionSide(region),
        activation: a.activation, fatigue: a.fatigue, work: a.work,
        peakActivation: a.peakActivation, state,
      })
      totalWork += a.work
      if (a.fatigue > maxFatigue) maxFatigue = a.fatigue
      if (a.work > topWork) { topWork = a.work; topRegion = region }
    }
    if (topWork <= 0) topRegion = null

    return {
      regions,
      imbalances: this.imbalances(),
      totalWork,
      maxFatigue,
      topRegion,
      workingMs: this.workingMs,
    }
  }

  /** Left-vs-right work split per joint pair. */
  private imbalances(): ImbalancePair[] {
    const pairs: Array<{ joint: string; label: string; l: SymmetryRegion; r: SymmetryRegion }> = [
      { joint: 'shoulder', label: 'Shoulders', l: 'left_shoulder', r: 'right_shoulder' },
      { joint: 'elbow',    label: 'Arms',      l: 'left_elbow',    r: 'right_elbow' },
      { joint: 'hip',      label: 'Hips/glutes', l: 'left_hip',    r: 'right_hip' },
      { joint: 'knee',     label: 'Thighs',    l: 'left_knee',     r: 'right_knee' },
      { joint: 'ankle',    label: 'Calves',    l: 'left_ankle',    r: 'right_ankle' },
    ]
    const out: ImbalancePair[] = []
    for (const p of pairs) {
      const left = this.acc.get(p.l)!.work
      const right = this.acc.get(p.r)!.work
      const m = Math.max(left, right, 1e-6)
      // Only meaningful once some real work has accumulated on the pair.
      if (left + right < 0.5) continue
      const asym = Math.abs(left - right) / m
      out.push({
        label: p.label, joint: p.joint, left, right, asym,
        weaker: asym < 0.05 ? null : left < right ? 'L' : 'R',
      })
    }
    return out.sort((a, b) => b.asym - a.asym)
  }

  /** Compact summary for persisting a finished session. */
  summary(): MuscleSessionSummary {
    const snap = this.snapshot()
    const perRegion: Record<string, { work: number; peakFatigue: number; peakActivation: number }> = {}
    for (const r of snap.regions) {
      if (r.work <= 0 && r.peakActivation <= 0) continue
      perRegion[r.region] = {
        work: round2(r.work),
        peakFatigue: round2(r.fatigue),
        peakActivation: round2(r.peakActivation),
      }
    }
    return {
      at: Date.now(),
      workingMs: Math.round(snap.workingMs),
      totalWork: round2(snap.totalWork),
      topRegion: snap.topRegion,
      imbalances: snap.imbalances.map((p) => ({
        joint: p.joint, label: p.label,
        left: round2(p.left), right: round2(p.right),
        asym: round2(p.asym), weaker: p.weaker,
      })),
      perRegion,
    }
  }

  reset(): void {
    this.acc.clear()
    for (const r of ALL_REGIONS) this.acc.set(r, blankAccum())
    this.prevT = null
    this.workingMs = 0
  }

  /** True once the user has done a meaningful amount of work this session. */
  hasMeaningfulSession(): boolean {
    return this.snapshot().totalWork >= 1.0
  }
}

function classify(activation: number, fatigue: number): MuscleState {
  if (fatigue >= STATE_SPENT)    return 'spent'
  if (fatigue >= STATE_FATIGUED) return 'fatigued'
  if (activation >= STATE_WORKING) return 'working'
  if (activation >= STATE_WARMING || fatigue >= 0.15) return 'warming'
  return 'fresh'
}

function round2(x: number): number { return Math.round(x * 100) / 100 }

// ── Session summary type (shared with the session log) ───────────────────────

export interface MuscleSessionSummary {
  at: number
  workingMs: number
  totalWork: number
  topRegion: SymmetryRegion | null
  imbalances: Array<{ joint: string; label: string; left: number; right: number; asym: number; weaker: 'L' | 'R' | null }>
  perRegion: Record<string, { work: number; peakFatigue: number; peakActivation: number }>
}

// ── Display helpers (used by the panel) ──────────────────────────────────────

export const STATE_META: Record<MuscleState, { label: string; color: string; ring: string }> = {
  fresh:    { label: 'Fresh',    color: '#64748b', ring: 'rgba(100,116,139,0.35)' },
  warming:  { label: 'Warming',  color: '#22d3ee', ring: 'rgba(34,211,238,0.35)' },
  working:  { label: 'Working',  color: '#f59e0b', ring: 'rgba(245,158,11,0.45)' },
  fatigued: { label: 'Fatigued', color: '#f97316', ring: 'rgba(249,115,22,0.5)' },
  spent:    { label: 'Spent',    color: '#dc2626', ring: 'rgba(220,38,38,0.55)' },
}
