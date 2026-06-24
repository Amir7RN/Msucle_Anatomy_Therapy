/**
 * RomBars.tsx
 *
 * Per-joint range-of-motion bars. Each joint's track length is its NORMAL ROM
 * (from the biomechanics reference); the fill is the user's current angle, with
 * separate Left (cyan) and Right (violet) bars so asymmetry is obvious. A full
 * bar means the joint reached its normal end-range. Answers "what's my range
 * and where am I in it" precisely, as bars rather than a radar.
 */

import React from 'react'
import type { JointLiveReading } from '../../lib/movement/liveMuscleActivation'
import { romFor } from '../../lib/movement/jointReference'

interface Row { id: string; label: string }

const ROWS: Row[] = [
  { id: 'shoulder_flexion',     label: 'Shoulder flexion' },
  { id: 'shoulder_abduction',   label: 'Shoulder abduction' },
  { id: 'elbow_flexion',        label: 'Elbow flexion' },
  { id: 'trunk_flexion',        label: 'Trunk flexion' },
  { id: 'hip_flexion',          label: 'Hip flexion' },
  { id: 'hip_abduction',        label: 'Hip abduction' },
  { id: 'knee_flexion',         label: 'Knee flexion' },
  { id: 'ankle_plantarflexion', label: 'Ankle plantarflex' },
  { id: 'ankle_dorsiflexion',   label: 'Ankle dorsiflex' },
]

export function RomBars({ readings }: { readings: JointLiveReading[] }) {
  const byId = new Map<string, { L?: number; R?: number }>()
  for (const r of readings) {
    const cur = byId.get(r.movementId) ?? {}
    cur[r.side] = Math.max(cur[r.side] ?? 0, r.angle)
    byId.set(r.movementId, cur)
  }
  return (
    <div className="space-y-1.5">
      {ROWS.map((row) => {
        const ref = romFor(row.id)
        const max = ref?.max ?? 120
        const v = byId.get(row.id) ?? {}
        return (
          <div key={row.id}>
            <div className="flex items-center justify-between text-[10px] text-slate-300">
              <span>{row.label}</span>
              <span className="tabular-nums text-slate-500">norm {max}°</span>
            </div>
            <Bar deg={v.L} max={max} color="#22d3ee" tag="L" />
            <Bar deg={v.R} max={max} color="#a78bfa" tag="R" />
          </div>
        )
      })}
      <div className="flex items-center gap-3 pt-0.5 text-[9px] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Left</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" /> Right</span>
        <span>· full bar = normal end-range</span>
      </div>
    </div>
  )
}

function Bar({ deg, max, color, tag }: { deg?: number; max: number; color: string; tag: string }) {
  const pct = deg === undefined ? 0 : Math.max(0, Math.min(1, deg / max)) * 100
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      <span className="w-2 text-[8px] text-slate-500">{tag}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-[9px] tabular-nums text-slate-400">
        {deg === undefined ? '—' : `${Math.round(deg)}°`}
      </span>
    </div>
  )
}
