/**
 * HealthImportView.tsx
 *
 * "Import Health Data" - full-screen modal opened from the Remote Assessment
 * section of the sidebar FeatureRail (same open/close pattern as
 * FullBodyAssessmentView: featureModalToOpen -> AppHeader-owned state).
 *
 * Upload an Apple Health "Export All Health Data" zip, parse <Workout> elements
 * in a Web Worker (client-side only), preview the extracted history, then render
 * the ACWR-based training-balance map on the reused 3D twin model.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, HeartPulse, UploadCloud, RotateCcw, ChevronDown, ChevronRight, Box } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { parseHealthZip, type ParseProgress } from '../../lib/health/parseHealthZip'
import type { HealthParseResult, ParsedWorkout } from '../../lib/health/appleHealthParser'
import { estimateMuscleLoad, type MuscleLoadResult } from '../../lib/health/muscleLoadEstimator'
import { HealthBalanceView } from './HealthBalanceView'
import { PractitionerClientsView } from './PractitionerClientsView'

interface Props {
  open: boolean
  onClose: () => void
}

type Phase = 'idle' | 'parsing' | 'done' | 'balance' | 'error'

export function HealthImportView({ open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ParseProgress>({ percent: 0, workoutsFound: 0 })
  const [result, setResult] = useState<HealthParseResult | null>(null)
  const [load, setLoad] = useState<MuscleLoadResult | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [practOpen, setPractOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Hide 3D canvas chrome while open (same convention as the other modals).
  useEffect(() => {
    if (!open) return
    const { pushModal, popModal } = useAtlasStore.getState()
    pushModal()
    return () => popModal()
  }, [open])

  // Reset when re-opened.
  useEffect(() => {
    if (!open) {
      setPhase('idle')
      setProgress({ percent: 0, workoutsFound: 0 })
      setResult(null)
      setLoad(null)
      setError('')
      setDragOver(false)
    }
  }, [open])

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    if (!/\.zip$/i.test(file.name)) {
      setError('Please choose the .zip file exported by the Health app.')
      setPhase('error')
      return
    }
    setPhase('parsing')
    setProgress({ percent: 0, workoutsFound: 0 })
    setError('')
    try {
      const res = await parseHealthZip(file, setProgress)
      setResult(res)
      setLoad(estimateMuscleLoad(res.workouts))
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.')
      setPhase('error')
    }
  }

  if (!open) return null

  // Practitioner path: view a connected client's shared summary.
  if (practOpen) {
    return <PractitionerClientsView open={true} onClose={() => setPractOpen(false)} />
  }

  // Training-balance view uses the full-screen twin layout (its own header),
  // so it renders outside the upload card.
  if (phase === 'balance' && result) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col bg-[#040609] text-white">
        <header className="relative flex items-center gap-2 border-b border-white/10 bg-black/60 px-4 py-2 backdrop-blur-xl">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-400/10 ring-1 ring-rose-400/30">
            <HeartPulse size={14} className="text-rose-300" />
          </span>
          <span className="text-sm font-semibold tracking-wide">Import Health Data</span>
          <span className="ml-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300 ring-1 ring-rose-500/30">
            Training balance
          </span>
        </header>
        <HealthBalanceView parse={result} onClose={onClose} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/95 text-white">
      <div className="m-auto w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <HeartPulse size={16} className="text-rose-400" />
            <h2 className="text-base font-semibold">Import Health Data</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {phase === 'idle' && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload your Apple Health export to see your training balance
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                handleFile(e.dataTransfer.files?.[0])
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                dragOver
                  ? 'border-rose-400 bg-rose-500/10'
                  : 'border-slate-700 bg-slate-950/50 hover:border-rose-500/50'
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
                <UploadCloud size={22} />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-100">
                  Upload your Apple Health export (.zip)
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Drag &amp; drop, or click to choose a file
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-400">How to export:</span> on your iPhone,
              open the Health app, tap your profile picture, then &quot;Export All Health Data&quot;.
              Your export is processed entirely on this device - only the computed per-muscle
              workload summary is saved to your account.
            </div>
            <button
              onClick={() => setPractOpen(true)}
              className="w-full rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 text-left text-[11px] text-violet-200 transition-colors hover:border-violet-400/50 hover:bg-violet-500/10"
            >
              <span className="font-semibold">Practitioner?</span> View the training balance a client
              has shared with you.
            </button>
          </div>
        )}

        {phase === 'parsing' && (
          <div className="mt-8 space-y-4 pb-4">
            <div className="text-sm text-slate-200">Reading your export...</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-rose-400 transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
              <span>{progress.percent}%</span>
              <span>{progress.workoutsFound} workouts found</span>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-6 space-y-4 pb-2">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-200">
              {error}
            </div>
            <button
              onClick={() => setPhase('idle')}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
            >
              <RotateCcw size={12} /> Try again
            </button>
          </div>
        )}

        {phase === 'done' && result && (
          <ResultPreview
            result={result}
            canRender={!!load && result.workouts.length > 0}
            onSeeBalance={() => setPhase('balance')}
            onRestart={() => setPhase('idle')}
          />
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
//  Parsed-data preview (sanity-check view before load estimation is wired in)
// -----------------------------------------------------------------------------

function ResultPreview({
  result, canRender, onSeeBalance, onRestart,
}: {
  result: HealthParseResult
  canRender: boolean
  onSeeBalance: () => void
  onRestart: () => void
}) {
  const [showRaw, setShowRaw] = useState(false)
  const { workouts, skipped, parseMs } = result

  const byActivity = useMemo(() => {
    const map = new Map<string, { count: number; minutes: number }>()
    for (const w of workouts) {
      const cur = map.get(w.activityKey) ?? { count: 0, minutes: 0 }
      cur.count++
      cur.minutes += w.durationMin
      map.set(w.activityKey, cur)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].minutes - a[1].minutes)
  }, [workouts])

  const first = workouts[0]
  const last = workouts[workouts.length - 1]
  const recent = useMemo(() => [...workouts].slice(-15).reverse(), [workouts])
  const fmtDay = (iso: string) => iso.slice(0, 10)

  return (
    <div className="mt-5 space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Workouts" value={String(workouts.length)} />
        <Stat label="Date range" value={first ? `${fmtDay(first.startDate)} - ${fmtDay(last.startDate)}` : '-'} small />
        <Stat label="Skipped entries" value={String(skipped)} />
        <Stat label="Parse time" value={`${(parseMs / 1000).toFixed(1)} s`} />
      </div>

      {workouts.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400">
          No workouts were found in this export. Workouts recorded with an Apple Watch or the
          iPhone Fitness app appear as Workout entries - this export does not contain any.
        </div>
      ) : (
        <>
          {/* Activity breakdown */}
          <section>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              Activity types
            </div>
            <div className="mt-1 divide-y divide-slate-800 rounded-md border border-slate-800">
              {byActivity.map(([key, v]) => (
                <div key={key} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-slate-100">{key}</span>
                  <span className="w-16 text-right text-slate-400 tabular-nums">{v.count}x</span>
                  <span className="w-20 text-right text-slate-400 tabular-nums">{Math.round(v.minutes)} min</span>
                </div>
              ))}
            </div>
          </section>

          {/* Recent workouts */}
          <section>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              Most recent workouts
            </div>
            <div className="mt-1 overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-1.5 font-semibold">Date</th>
                    <th className="px-3 py-1.5 font-semibold">Activity</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Duration</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Avg HR</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Energy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {recent.map((w, i) => (
                    <WorkoutRow key={`${w.startDate}_${i}`} w={w} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Raw structure preview */}
          <section>
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
            >
              {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Parsed data structure (first 3 entries)
            </button>
            {showRaw && (
              <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-300">
                {JSON.stringify(workouts.slice(0, 3), null, 2)}
              </pre>
            )}
          </section>
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-700 pt-3">
        <button
          onClick={onRestart}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
        >
          <RotateCcw size={12} /> Import a different file
        </button>
        {canRender && (
          <button
            onClick={onSeeBalance}
            className="flex items-center gap-1.5 rounded-md bg-rose-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-400"
          >
            <Box size={12} /> See training balance
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function WorkoutRow({ w }: { w: ParsedWorkout }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-3 py-1.5 text-slate-300 tabular-nums">{w.startDate.slice(0, 10)}</td>
      <td className="px-3 py-1.5 text-slate-100">{w.activityKey}</td>
      <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{Math.round(w.durationMin)} min</td>
      <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">
        {w.avgHeartRateBpm === null ? '-' : `${Math.round(w.avgHeartRateBpm)} bpm`}
      </td>
      <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">
        {w.totalEnergyBurnedKcal === null ? '-' : `${Math.round(w.totalEnergyBurnedKcal)} kcal`}
      </td>
    </tr>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-bold text-slate-100 tabular-nums ${small ? 'text-[11px]' : 'text-lg'}`}>
        {value}
      </div>
    </div>
  )
}
