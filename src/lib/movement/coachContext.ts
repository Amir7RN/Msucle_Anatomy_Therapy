/**
 * coachContext.ts
 *
 * Rolling context engine for the AI coach: turns the raw per-frame
 * FormSnapshot stream into the things an elite human coach actually tracks —
 * TRENDS, STREAKS and MOMENTS — so the LLM's replies can reference what the
 * student's body has been doing over the last half-minute instead of a single
 * frozen frame.
 *
 * What it computes (all O(1) per frame, bounded memory):
 *   • Per-joint TREND — is the angle converging toward the ideal band or
 *     drifting away, measured as a regression slope over a sliding window.
 *     "You've gained 8° in the last 20 seconds" is a fundamentally better cue
 *     than "you're at 112°".
 *   • Form STREAKS — continuous seconds of good/poor form. A 20-second good
 *     streak deserves acknowledgement; 8 seconds of degrading form deserves
 *     an earlier, gentler correction — before frustration sets in.
 *   • MOMENTS — edge events (just entered good form, new session-best angle)
 *     that warrant immediate, specific praise.
 *   • PACING — a suggested interval until the next proactive coach message.
 *     Elite coaches speak MORE when things change and LESS when the student
 *     is in a groove; a fixed timer can't do either.
 *
 * Consumed by ExerciseGuidance (movement coach) — the summary block is
 * injected into the system prompt each turn, and `suggestedIntervalMs()`
 * replaces the fixed proactive cadence.
 */

import type { FormSnapshot } from './biofeedback'

interface JointWindowPoint { t: number; deg: number }

interface JointTrendState {
  window:      JointWindowPoint[]
  sessionBest: number | null      // closest-to-ideal distance seen (deg)
  idealMid:    number
}

export type TrendDirection = 'improving' | 'declining' | 'steady'

export interface JointTrend {
  label:     string
  direction: TrendDirection
  /** Degrees gained toward (＋) / lost from (−) the ideal band over the window. */
  deltaDeg:  number
  current:   number
  status:    'good' | 'low' | 'high'
}

export interface CoachMoment {
  kind: 'entered_good_form' | 'session_best' | 'form_degrading'
  text: string
  at:   number
}

const WINDOW_MS       = 20_000   // trend regression window
const TREND_MIN_DEG   = 3        // |delta| below this = "steady"
const DEGRADE_ALERT_S = 8        // poor-form streak that flags a moment
const MOMENT_TTL_MS   = 30_000   // moments expire — stale praise is worse than none

// Proactive-pacing bounds (ms until the next unprompted coach message).
const PACE_MIN = 18_000
const PACE_MAX = 60_000

export class FormTrendTracker {
  private joints = new Map<string, JointTrendState>()
  private goodSinceMs: number | null = null
  private poorSinceMs: number | null = null
  private lastGood = false
  private moments: CoachMoment[] = []
  private lastT = 0

  /**
   * Feed one smoothed snapshot. `idealFor` resolves a joint label to its
   * target band (the caller owns the exercise definition).
   */
  push(snap: FormSnapshot, tMs: number, idealFor: (label: string) => [number, number] | null): void {
    this.lastT = tMs

    // Streaks + the good-form edge.
    if (snap.good) {
      this.poorSinceMs = null
      if (this.goodSinceMs === null) {
        this.goodSinceMs = tMs
        if (!this.lastGood) {
          this.addMoment({ kind: 'entered_good_form', text: 'Form just clicked into the target zone.', at: tMs })
        }
      }
    } else {
      this.goodSinceMs = null
      if (this.poorSinceMs === null) this.poorSinceMs = tMs
      else if ((tMs - this.poorSinceMs) / 1000 >= DEGRADE_ALERT_S &&
               !this.moments.some((m) => m.kind === 'form_degrading' && tMs - m.at < MOMENT_TTL_MS)) {
        this.addMoment({ kind: 'form_degrading', text: `Form has been off target for ${Math.round((tMs - this.poorSinceMs) / 1000)}s.`, at: tMs })
      }
    }
    this.lastGood = snap.good

    // Per-joint windows.
    for (const d of snap.details) {
      const ideal = idealFor(d.label)
      if (!ideal) continue
      const idealMid = (ideal[0] + ideal[1]) / 2
      let st = this.joints.get(d.label)
      if (!st) { st = { window: [], sessionBest: null, idealMid }; this.joints.set(d.label, st) }
      st.idealMid = idealMid
      st.window.push({ t: tMs, deg: d.deg })
      while (st.window.length > 0 && tMs - st.window[0].t > WINDOW_MS) st.window.shift()

      // Session best = smallest distance to the ideal midpoint.
      const dist = Math.abs(d.deg - idealMid)
      if (st.sessionBest === null || dist < st.sessionBest - 2) {
        const isNewBest = st.sessionBest !== null
        st.sessionBest = dist
        if (isNewBest && d.status === 'good') {
          this.addMoment({ kind: 'session_best', text: `New session-best on ${d.label}: ${Math.round(d.deg)}°.`, at: tMs })
        }
      }
    }
  }

  private addMoment(m: CoachMoment): void {
    this.moments.push(m)
    // Keep only fresh moments, newest last.
    this.moments = this.moments.filter((x) => m.at - x.at < MOMENT_TTL_MS).slice(-4)
  }

  /** Per-joint trend over the sliding window (toward/away from ideal). */
  trends(): JointTrend[] {
    const out: JointTrend[] = []
    for (const [label, st] of this.joints) {
      if (st.window.length < 4) continue
      const first = st.window[0], last = st.window[st.window.length - 1]
      // Progress = reduction in distance-to-ideal across the window.
      const dStart = Math.abs(first.deg - st.idealMid)
      const dEnd   = Math.abs(last.deg  - st.idealMid)
      const delta  = dStart - dEnd    // + = converging on the target
      const direction: TrendDirection =
        delta >  TREND_MIN_DEG ? 'improving' :
        delta < -TREND_MIN_DEG ? 'declining' : 'steady'
      const status: 'good' | 'low' | 'high' =
        dEnd <= TREND_MIN_DEG ? 'good' : last.deg < st.idealMid ? 'low' : 'high'
      out.push({ label, direction, deltaDeg: Math.round(delta), current: Math.round(last.deg), status })
    }
    return out
  }

  /** Seconds of the current good-form streak (0 when not in good form). */
  goodStreakS(): number {
    return this.goodSinceMs === null ? 0 : (this.lastT - this.goodSinceMs) / 1000
  }

  /** Seconds of the current poor-form streak (0 when form is good). */
  poorStreakS(): number {
    return this.poorSinceMs === null ? 0 : (this.lastT - this.poorSinceMs) / 1000
  }

  /** Fresh coach-worthy moments (consumed = cleared, so each fires once). */
  consumeMoments(): CoachMoment[] {
    const fresh = this.moments.filter((m) => this.lastT - m.at < MOMENT_TTL_MS)
    this.moments = []
    return fresh
  }

  /**
   * The prompt block: everything above rendered as compact plain text the
   * system prompt injects verbatim. Kept short — it rides on every call.
   */
  promptBlock(): string {
    const lines: string[] = []
    const trends = this.trends()
    if (trends.length > 0) {
      lines.push('TREND (last 20s):')
      for (const t of trends) {
        const arrow = t.direction === 'improving' ? `gained ${Math.abs(t.deltaDeg)}° toward target`
          : t.direction === 'declining' ? `lost ${Math.abs(t.deltaDeg)}° from target`
          : 'holding steady'
        lines.push(`  • ${t.label}: ${t.current}° (${t.status}) — ${arrow}`)
      }
    }
    const good = this.goodStreakS(), poor = this.poorStreakS()
    if (good >= 5) lines.push(`STREAK: good form held for ${Math.round(good)}s — acknowledge it specifically.`)
    if (poor >= 5) lines.push(`STREAK: form off target for ${Math.round(poor)}s — one gentle, specific fix.`)
    const moments = this.moments.filter((m) => this.lastT - m.at < MOMENT_TTL_MS)
    if (moments.length > 0) {
      lines.push('MOMENTS just now (react to the most recent one):')
      for (const m of moments) lines.push(`  • ${m.text}`)
    }
    return lines.length > 0 ? lines.join('\n') : 'No trend data yet (user just started).'
  }

  /**
   * Human pacing: speak sooner when something is happening (declining form, a
   * fresh moment), later when the student is in a groove. Bounded 18–60 s.
   */
  suggestedIntervalMs(): number {
    const hasFreshMoment = this.moments.some((m) => this.lastT - m.at < 10_000)
    if (hasFreshMoment) return PACE_MIN
    if (this.poorStreakS() >= 5) return PACE_MIN + 4_000
    const declining = this.trends().some((t) => t.direction === 'declining')
    if (declining) return 28_000
    const good = this.goodStreakS()
    // Longer streak → the coach stays out of the way (up to the max).
    return Math.min(PACE_MAX, 35_000 + good * 1_000)
  }

  reset(): void {
    this.joints.clear()
    this.goodSinceMs = null
    this.poorSinceMs = null
    this.lastGood = false
    this.moments = []
    this.lastT = 0
  }
}
