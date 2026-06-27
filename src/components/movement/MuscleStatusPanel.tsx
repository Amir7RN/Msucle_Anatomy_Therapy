/**
 * MuscleStatusPanel.tsx
 *
 * The "muscle status" readout for the Live Muscle Twin — the gym-informative
 * layer on top of raw activation. Shows, from camera only:
 *   • per-muscle STATE (fresh → working → fatigued → spent) + a fatigue battery
 *   • accumulated WORK (volume-load proxy) this session
 *   • left/right IMBALANCE per joint, with a one-line coaching cue
 *   • this-week vs last-week work trend (from the session log)
 *
 * Pure presentational: it just renders the MuscleStatusFrame it is handed.
 */

import React, { useMemo } from 'react'
import { Battery, Scale, TrendingUp, Gauge } from 'lucide-react'
import { STATE_META, type MuscleStatusFrame, type RegionStatus } from '../../lib/movement/muscleStatus'
import { weeklyTrend, sessionsThisWeek, type RegionTrendPoint } from '../../lib/movement/muscleSessionLog'

interface Props { status: MuscleStatusFrame | null }

function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

const REGION_SHORT: Record<string, string> = {
  left_shoulder: 'L sh', right_shoulder: 'R sh', left_elbow: 'L arm', right_elbow: 'R arm',
  left_hip: 'L hip', right_hip: 'R hip', left_knee: 'L thigh', right_knee: 'R thigh',
  left_ankle: 'L calf', right_ankle: 'R calf', neck: 'Neck', trunk: 'Core',
}

function StatePill({ r }: { r: RegionStatus }) {
  const m = STATE_META[r.state]
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
      style={{ color: m.color, background: `${m.color}1f`, boxShadow: `inset 0 0 0 1px ${m.ring}` }}
    >
      {m.label}
    </span>
  )
}

function FatigueBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  )
}

export function MuscleStatusPanel({ status }: Props) {
  // Weekly trend is read once from the persisted session log.
  const trend = useMemo<RegionTrendPoint[]>(() => weeklyTrend(), [])
  const weekCount = useMemo(() => sessionsThisWeek(), [])

  const active = useMemo(() => {
    if (!status) return []
    return status.regions
      .filter((r) => r.work > 0.05 || r.peakActivation > 0.08 || r.fatigue > 0.05)
      .sort((a, b) => b.work - a.work || b.activation - a.activation)
  }, [status])

  const topLabel = status?.topRegion ? REGION_SHORT[status.topRegion] ?? status.topRegion : '—'

  return (
    <section className="rounded-lg bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
          <Gauge size={12} /> Muscle status
        </div>
        {status && (
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span title="Time you were actually working">{fmtTime(status.workingMs)}</span>
            <span title="Session volume-load (relative work units)">{Math.round(status.totalWork)} work</span>
            <span title="Most-worked region">most: <span className="text-slate-200">{topLabel}</span></span>
          </div>
        )}
      </div>

      {/* Per-muscle status rows */}
      {active.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-slate-500">
          Start moving — each muscle fills in as fresh → working → fatigued.
        </div>
      ) : (
        <div className="space-y-1.5">
          {active.map((r) => {
            const m = STATE_META[r.state]
            return (
              <div key={r.region} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] text-slate-300">{REGION_SHORT[r.region] ?? r.label}</span>
                <div className="flex-1">
                  <FatigueBar value={r.fatigue} color={m.color} />
                </div>
                <span className="w-8 shrink-0 text-right text-[9px] tabular-nums text-slate-500" title="Fatigue">{Math.round(r.fatigue * 100)}%</span>
                <span className="w-10 shrink-0 text-right text-[9px] tabular-nums text-slate-500" title="Work this session">{r.work >= 1 ? Math.round(r.work) : r.work.toFixed(1)}</span>
                <StatePill r={r} />
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[8px] text-slate-500">
        <span className="flex items-center gap-1"><Battery size={9} /> bar = fatigue</span>
        {(['fresh', 'working', 'fatigued', 'spent'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATE_META[s].color }} />
            {STATE_META[s].label}
          </span>
        ))}
      </div>

      {/* Imbalance */}
      {status && status.imbalances.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
            <Scale size={11} /> Left / right balance
          </div>
          <div className="space-y-1">
            {status.imbalances.slice(0, 3).map((p) => {
              const pct = Math.round(p.asym * 100)
              const strong = p.weaker === 'L' ? 'right' : 'left'
              return (
                <div key={p.joint} className="flex items-center gap-2 text-[10px]">
                  <span className="w-16 shrink-0 text-slate-300">{p.label}</span>
                  <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-cyan-500/70" style={{ width: `${(p.left / (p.left + p.right || 1)) * 100}%` }} />
                    <div className="h-full bg-amber-500/70" style={{ width: `${(p.right / (p.left + p.right || 1)) * 100}%` }} />
                  </div>
                  <span className={`w-24 shrink-0 text-right ${pct >= 15 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {pct < 5 ? 'balanced' : `${pct}% ${strong}-dom`}
                  </span>
                </div>
              )
            })}
          </div>
          {status.imbalances[0] && status.imbalances[0].asym >= 0.15 && status.imbalances[0].weaker && (
            <div className="mt-1 text-[10px] text-amber-400/90">
              Your {status.imbalances[0].weaker === 'L' ? 'left' : 'right'} side is under-recruited on {status.imbalances[0].label.toLowerCase()} — favour it next set.
            </div>
          )}
        </div>
      )}

      {/* Weekly trend (from prior sessions) */}
      {trend.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
            <TrendingUp size={11} /> This week vs last {weekCount > 0 && <span className="text-slate-600">· {weekCount} session{weekCount === 1 ? '' : 's'}</span>}
          </div>
          <div className="space-y-0.5">
            {trend.slice(0, 4).map((p) => (
              <div key={p.region} className="flex items-center gap-2 text-[10px]">
                <span className="w-16 shrink-0 text-slate-300">{REGION_SHORT[p.region] ?? p.region}</span>
                <span className="flex-1 text-slate-500 tabular-nums">{Math.round(p.thisPeriod)} work</span>
                {p.change == null ? (
                  <span className="text-slate-600">new</span>
                ) : (
                  <span className={p.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {p.change >= 0 ? '+' : ''}{Math.round(p.change * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
