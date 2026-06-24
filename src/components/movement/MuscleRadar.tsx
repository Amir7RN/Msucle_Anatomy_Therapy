/**
 * MuscleRadar.tsx
 *
 * Spider/radar plot of joint range of motion. Each spoke is a joint movement;
 * the outer ring is that joint's NORMAL ROM (from the biomechanics reference),
 * and the filled polygon is where the user is RIGHT NOW (live). It answers the
 * question the user asked — "show the range and where it is" — at a glance,
 * and the per-side dots reveal left/right asymmetry.
 *
 * Pure SVG, no deps. Driven by the live JointLiveReading[] from the engine.
 */

import React from 'react'
import type { JointLiveReading } from '../../lib/movement/liveMuscleActivation'

interface Axis { id: string; label: string }

// Axes match the movements the live engine tracks; order = around the circle.
const AXES: Axis[] = [
  { id: 'shoulder_flexion',     label: 'Sh Flex' },
  { id: 'shoulder_abduction',   label: 'Sh Abd' },
  { id: 'elbow_flexion',        label: 'Elbow' },
  { id: 'trunk_flexion',        label: 'Trunk' },
  { id: 'hip_flexion',          label: 'Hip Flex' },
  { id: 'hip_abduction',        label: 'Hip Abd' },
  { id: 'knee_flexion',         label: 'Knee' },
  { id: 'ankle_plantarflexion', label: 'Ankle' },
]

interface SideVals { L?: { frac: number; deg: number }; R?: { frac: number; deg: number } }

export function MuscleRadar({ readings, size = 230 }: { readings: JointLiveReading[]; size?: number }) {
  const byId = new Map<string, SideVals>()
  for (const r of readings) {
    const cur = byId.get(r.movementId) ?? {}
    const prev = cur[r.side]
    if (!prev || r.romFrac > prev.frac) cur[r.side] = { frac: r.romFrac, deg: r.angle }
    byId.set(r.movementId, cur)
  }

  const cx = size / 2, cy = size / 2
  const R = size / 2 - 30
  const n = AXES.length
  const clampF = (f: number) => Math.max(0, Math.min(1.05, f))

  const pt = (i: number, frac: number) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2
    const rr = R * clampF(frac)
    return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)] as const
  }
  const axisEnd = (i: number, mult = 1) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2
    return [cx + R * mult * Math.cos(ang), cy + R * mult * Math.sin(ang)] as const
  }

  // "Current" polygon = max of L/R per axis.
  const curPoly = AXES.map((a, i) => {
    const v = byId.get(a.id)
    const frac = Math.max(v?.L?.frac ?? 0, v?.R?.frac ?? 0)
    return pt(i, frac).join(',')
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full">
      {/* concentric guide rings: 25/50/75/100% of normal ROM */}
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <polygon
          key={g}
          points={AXES.map((_, i) => pt(i, g).join(',')).join(' ')}
          fill="none"
          stroke={g === 1 ? '#22d3ee55' : '#334155'}
          strokeWidth={g === 1 ? 1.5 : 1}
          strokeDasharray={g === 1 ? '' : '3 3'}
        />
      ))}

      {/* spokes + labels */}
      {AXES.map((a, i) => {
        const [ex, ey] = axisEnd(i)
        const [lx, ly] = axisEnd(i, 1.16)
        return (
          <g key={a.id}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#334155" strokeWidth={1} />
            <text
              x={lx} y={ly}
              fontSize="9" fill="#94a3b8"
              textAnchor={lx < cx - 4 ? 'end' : lx > cx + 4 ? 'start' : 'middle'}
              dominantBaseline="middle"
            >
              {a.label}
            </text>
          </g>
        )
      })}

      {/* current ROM polygon */}
      <polygon points={curPoly} fill="#22d3ee33" stroke="#22d3ee" strokeWidth={1.5} />

      {/* per-side dots (L cyan, R violet) to read asymmetry */}
      {AXES.map((a, i) => {
        const v = byId.get(a.id)
        const dots: React.ReactNode[] = []
        if (v?.L) { const [x, y] = pt(i, v.L.frac); dots.push(<circle key="l" cx={x} cy={y} r={2.6} fill="#22d3ee" />) }
        if (v?.R) { const [x, y] = pt(i, v.R.frac); dots.push(<circle key="r" cx={x} cy={y} r={2.6} fill="#a78bfa" />) }
        return <g key={a.id}>{dots}</g>
      })}

      <text x={cx} y={cy - R - 14} fontSize="8" fill="#22d3ee99" textAnchor="middle">normal range</text>
    </svg>
  )
}
