/**
 * MuscleActivationRadars.tsx
 *
 * Four compact spider/radar plots of live muscle activation, one per body
 * section (head/neck, trunk, upper limb, lower limb). Replaces the churning
 * bar list: each spoke is a muscle and its radius is how hard that muscle is
 * working right now, so you read the whole "activation shape" of a section at a
 * glance and the dark/empty model space is summarised compactly.
 *
 * Pure SVG. Driven by the engine's LiveMuscleActivation[].
 */

import React from 'react'
import type { LiveMuscleActivation } from '../../lib/movement/liveMuscleActivation'

interface Axis { id: string; label: string }
interface Section { title: string; axes: Axis[] }

const SECTIONS: Section[] = [
  {
    title: 'Head / Neck',
    axes: [
      { id: 'sternocleidomastoid', label: 'SCM' },
      { id: 'splenius_capitis',    label: 'Splenius' },
      { id: 'trapezius_upper',     label: 'Up Trap' },
      { id: 'scalenus',            label: 'Scalene' },
    ],
  },
  {
    title: 'Trunk',
    axes: [
      { id: 'rectus_abdominis', label: 'Rectus Ab' },
      { id: 'external_oblique', label: 'Oblique' },
      { id: 'erector_spinae',   label: 'Erectors' },
      { id: 'multifidus',       label: 'Multifidus' },
      { id: 'latissimus_dorsi', label: 'Lats' },
      { id: 'pectoralis_major', label: 'Pec' },
    ],
  },
  {
    title: 'Upper limb',
    axes: [
      { id: 'deltoid_anterior',  label: 'Delt Ant' },
      { id: 'deltoid_lateral',   label: 'Delt Lat' },
      { id: 'deltoid_posterior', label: 'Delt Post' },
      { id: 'biceps_brachii',    label: 'Biceps' },
      { id: 'triceps_brachii',   label: 'Triceps' },
      { id: 'infraspinatus',     label: 'Infra' },
      { id: 'supraspinatus',     label: 'Supra' },
      { id: 'brachioradialis',   label: 'Brachiorad' },
    ],
  },
  {
    title: 'Lower limb',
    axes: [
      { id: 'gluteus_maximus',  label: 'Glute Max' },
      { id: 'gluteus_medius',   label: 'Glute Med' },
      { id: 'rectus_femoris',   label: 'Rec Fem' },
      { id: 'vastus_lateralis', label: 'Vastus' },
      { id: 'biceps_femoris',   label: 'Hamstring' },
      { id: 'gastrocnemius',    label: 'Gastroc' },
      { id: 'soleus',           label: 'Soleus' },
      { id: 'tibialis_anterior',label: 'Tib Ant' },
      { id: 'iliacus',          label: 'Iliopsoas' },
    ],
  },
]

function heat(level: number): string {
  if (level < 0.33) return '#22d3ee'
  if (level < 0.66) return '#f59e0b'
  return '#ef4444'
}

export function MuscleActivationRadars({ activations }: { activations: LiveMuscleActivation[] }) {
  // muscleId → max activation level across regions/sides.
  const byId = new Map<string, number>()
  for (const a of activations) {
    const prev = byId.get(a.muscleId) ?? 0
    if (a.level > prev) byId.set(a.muscleId, a.level)
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SECTIONS.map((s) => (
        <Spider key={s.title} section={s} byId={byId} />
      ))}
    </div>
  )
}

function Spider({ section, byId, size = 116 }: { section: Section; byId: Map<string, number>; size?: number }) {
  const cx = size / 2, cy = size / 2 + 4
  const R = size / 2 - 22
  const n = section.axes.length
  const pt = (i: number, frac: number) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2
    const rr = R * Math.max(0.04, Math.min(1, frac))
    return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)] as const
  }
  const vals = section.axes.map((a) => byId.get(a.id) ?? 0.08)
  const poly = section.axes.map((_, i) => pt(i, vals[i]).join(',')).join(' ')
  const peak = Math.max(...vals)

  return (
    <div className="rounded-md bg-slate-900/50 p-0.5">
      <div className="text-center text-[8px] font-medium uppercase tracking-wide text-slate-400">{section.title}</div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full">
        {[0.5, 1].map((g) => (
          <polygon key={g}
            points={section.axes.map((_, i) => pt(i, g).join(',')).join(' ')}
            fill="none" stroke="#334155" strokeWidth={1} strokeDasharray={g === 1 ? '' : '2 2'} />
        ))}
        {section.axes.map((a, i) => {
          const [ex, ey] = pt(i, 1)
          const [lx, ly] = pt(i, 1.26)
          return (
            <g key={a.id}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#1e293b" strokeWidth={0.8} />
              <text x={lx} y={ly} fontSize="6" fill="#94a3b8"
                textAnchor={lx < cx - 3 ? 'end' : lx > cx + 3 ? 'start' : 'middle'} dominantBaseline="middle">
                {a.label}
              </text>
            </g>
          )
        })}
        <polygon points={poly} fill={`${heat(peak)}33`} stroke={heat(peak)} strokeWidth={1.2} />
        {section.axes.map((_, i) => {
          const [x, y] = pt(i, vals[i])
          return <circle key={i} cx={x} cy={y} r={1.8} fill={heat(vals[i])} />
        })}
      </svg>
    </div>
  )
}
