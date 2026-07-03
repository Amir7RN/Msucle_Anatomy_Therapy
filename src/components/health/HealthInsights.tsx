/**
 * HealthInsights.tsx
 *
 * Visual-first analysis of the imported Apple Health data, scoped to the
 * comparison windows currently selected in the balance view:
 *
 *   1. Spider/radar — per-muscle-group workload share, recent vs baseline.
 *   2. Weekly training-load trend across the baseline window (recent shaded).
 *   3. Trend cards — gait (walking asymmetry, double support, speed) and
 *      recovery/body (resting HR, HRV, body mass, VO2max) sparklines.
 *   4. A few short, data-derived tips.
 *
 * Everything is inline SVG — no chart library, no text walls.
 */

import React, { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react'
import type { BodyMetricKey, HealthParseResult } from '../../lib/health/appleHealthParser'
import type { MuscleLoadResult } from '../../lib/health/muscleLoadEstimator'
import {
  ageFromProfile, buildTips, weeklyLoadSeries, windowTrend,
  type InsightTip, type TrendSeries,
} from '../../lib/health/healthInsights'

const ROSE = '#fb7185'
const CYAN = '#22d3ee'

interface Props {
  parse: HealthParseResult
  result: MuscleLoadResult
}

export function HealthInsights({ parse, result }: Props) {
  const age = useMemo(() => ageFromProfile(parse.profile), [parse.profile])

  const weekly = useMemo(
    () => weeklyLoadSeries(parse.workouts, result, age),
    [parse.workouts, result, age],
  )

  const trends = useMemo(() => {
    const keys: BodyMetricKey[] = [
      'walkingAsymmetryPct', 'walkingDoubleSupportPct', 'walkingSpeed',
      'restingHeartRate', 'hrvSdnn', 'bodyMass', 'vo2Max',
    ]
    const out: Partial<Record<BodyMetricKey, TrendSeries>> = {}
    for (const k of keys) {
      const t = windowTrend(parse.metrics[k] ?? [], result)
      if (t.points.length >= 2) out[k] = t
    }
    return out
  }, [parse.metrics, result])

  const tips = useMemo(() => buildTips(result, trends), [result, trends])

  return (
    <div className="space-y-4">
      {/* 1. Radar — workload share per group */}
      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <Header title="Workload by muscle group" note="% of total, recent vs baseline" />
        <ShareRadar result={result} />
        <div className="mt-1 flex justify-center gap-4 text-[9px] text-slate-400">
          <span className="flex items-center gap-1"><i className="h-1.5 w-3 rounded-full" style={{ background: ROSE }} /> Recent window</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-3 rounded-full" style={{ background: CYAN }} /> Baseline window</span>
        </div>
      </section>

      {/* 2. Weekly load trend */}
      {weekly.length > 1 && (
        <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <Header title="Training load per week" note="highlighted = recent window" />
          <WeeklyLoadChart data={weekly} />
        </section>
      )}

      {/* 3. Gait + recovery trend cards */}
      <div className="grid grid-cols-2 gap-2">
        <TrendCard label="Walking asymmetry" unit="%" series={trends.walkingAsymmetryPct} lowerBetter />
        <TrendCard label="Double support" unit="%" series={trends.walkingDoubleSupportPct} lowerBetter />
        <TrendCard label="Walking speed" unit="km/h" series={trends.walkingSpeed} />
        <TrendCard label="Resting heart rate" unit="bpm" series={trends.restingHeartRate} lowerBetter />
        <TrendCard label="HRV (SDNN)" unit="ms" series={trends.hrvSdnn} />
        <TrendCard label="Body mass" unit="kg" series={trends.bodyMass} neutral />
        <TrendCard label="VO2 max" unit="" series={trends.vo2Max} />
      </div>

      {/* 4. Tips */}
      {tips.length > 0 && (
        <section className="space-y-1.5">
          {tips.map((t, i) => <TipChip key={i} tip={t} />)}
        </section>
      )}
    </div>
  )
}

function Header({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</span>
      {note && <span className="text-[9px] text-slate-600">{note}</span>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Radar / spider chart — workload share per group
// ─────────────────────────────────────────────────────────────────────────────

function ShareRadar({ result }: { result: MuscleLoadResult }) {
  const groups = result.groups
  const n = groups.length
  const size = 240
  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 34

  const maxShare = Math.max(
    ...groups.map((g) => Math.max(g.sharePctRecent, g.sharePctBaseline)),
    1,
  )
  const pt = (i: number, frac: number): [number, number] => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac]
  }
  const poly = (vals: number[]) =>
    vals.map((v, i) => pt(i, Math.max(0.02, v / maxShare)).map((c) => c.toFixed(1)).join(',')).join(' ')

  const rings = [0.25, 0.5, 0.75, 1]
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[280px]">
      {/* grid */}
      {rings.map((r) => (
        <polygon key={r}
          points={groups.map((_, i) => pt(i, r).map((c) => c.toFixed(1)).join(',')).join(' ')}
          fill="none" stroke="#1e293b" strokeWidth={1} />
      ))}
      {groups.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#1e293b" strokeWidth={1} />
      })}
      {/* baseline polygon */}
      <polygon points={poly(groups.map((g) => g.sharePctBaseline))}
        fill={CYAN + '22'} stroke={CYAN} strokeWidth={1.5} strokeLinejoin="round" />
      {/* recent polygon */}
      <polygon points={poly(groups.map((g) => g.sharePctRecent))}
        fill={ROSE + '2e'} stroke={ROSE} strokeWidth={1.5} strokeLinejoin="round" />
      {/* axis labels with % (recent) */}
      {groups.map((g, i) => {
        const [x, y] = pt(i, 1.22)
        return (
          <text key={g.group} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            className="fill-slate-400" fontSize={8.5}>
            <tspan x={x} dy={-4}>{g.label}</tspan>
            <tspan x={x} dy={9} className="fill-slate-500" fontSize={7.5}>
              {g.sharePctRecent.toFixed(0)}%
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Weekly training-load bars
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyLoadChart({ data }: { data: Array<{ d: string; v: number; inRecent: boolean }> }) {
  const W = 360
  const H = 90
  const pad = 4
  const max = Math.max(...data.map((p) => p.v), 1)
  const bw = (W - pad * 2) / data.length
  const first = data[0]?.d ?? ''
  const last = data[data.length - 1]?.d ?? ''
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="block w-full">
      {data.map((p, i) => {
        const h = Math.max(1, (p.v / max) * (H - 8))
        return (
          <rect key={i}
            x={pad + i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={h} rx={1}
            fill={p.inRecent ? ROSE : '#334155'} opacity={p.inRecent ? 0.95 : 0.8} />
        )
      })}
      <line x1={pad} y1={H} x2={W - pad} y2={H} stroke="#1e293b" strokeWidth={1} />
      <text x={pad} y={H + 11} fontSize={8} className="fill-slate-500">{first}</text>
      <text x={W - pad} y={H + 11} fontSize={8} textAnchor="end" className="fill-slate-500">{last}</text>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Metric trend card (sparkline + change arrow)
// ─────────────────────────────────────────────────────────────────────────────

function TrendCard({
  label, unit, series, lowerBetter, neutral,
}: {
  label: string
  unit: string
  series?: TrendSeries
  /** A falling value is the good direction (e.g. asymmetry, resting HR). */
  lowerBetter?: boolean
  /** No good/bad colouring (e.g. body mass). */
  neutral?: boolean
}) {
  if (!series || series.points.length < 2) return null
  const { points, lastMean, changeFrac } = series

  const W = 150
  const H = 34
  const vals = points.map((p) => p.v)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * W).toFixed(1)},${(H - ((p.v - min) / span) * (H - 4) - 2).toFixed(1)}`)
    .join(' ')

  const dirUp = (changeFrac ?? 0) > 0.03
  const dirDown = (changeFrac ?? 0) < -0.03
  const good = neutral ? null : dirUp ? !lowerBetter : dirDown ? !!lowerBetter : null
  const tone = good == null ? 'text-slate-400' : good ? 'text-emerald-300' : 'text-amber-300'
  const Icon = dirUp ? TrendingUp : dirDown ? TrendingDown : Minus

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon size={11} className={tone} />
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-sm font-bold tabular-nums text-slate-100">
          {lastMean == null ? '—' : Math.round(lastMean * 10) / 10}
        </span>
        <span className="text-[9px] text-slate-500">{unit}</span>
        {changeFrac != null && Math.abs(changeFrac) > 0.005 && (
          <span className={`ml-auto text-[9px] tabular-nums ${tone}`}>
            {changeFrac > 0 ? '+' : ''}{Math.round(changeFrac * 100)}%
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full">
        <path d={path} fill="none" stroke={CYAN} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function TipChip({ tip }: { tip: InsightTip }) {
  const tone = tip.tone === 'good'
    ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-100'
    : tip.tone === 'watch'
    ? 'border-amber-500/25 bg-amber-500/5 text-amber-100'
    : 'border-cyan-500/25 bg-cyan-500/5 text-cyan-100'
  return (
    <div className={`flex items-start gap-1.5 rounded-lg border p-2 text-[10px] leading-snug ${tone}`}>
      <Sparkles size={11} className="mt-0.5 shrink-0 opacity-70" />
      {tip.text}
    </div>
  )
}
