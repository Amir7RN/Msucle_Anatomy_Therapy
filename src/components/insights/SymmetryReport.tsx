/**
 * SymmetryReport.tsx
 *
 * Full-screen modal showing the user's left-vs-right symmetry across every
 * assessed joint, with a body-silhouette heatmap, an overall Symmetry
 * Score, and per-joint breakdown. One-tap PNG export via html2canvas.
 */

import React, { useMemo, useRef, useState } from 'react'
import { X, Download, AlertTriangle, Activity } from 'lucide-react'
import {
  computeAllSymmetry,
  regionColors,
  summarize,
  colorForBand,
  type SymmetryScore,
} from '../../lib/insights/symmetry'
import { useROMVersion } from '../../hooks/useROMVersion'
import { BodySilhouette } from './BodySilhouette'

interface Props {
  open:    boolean
  onClose: () => void
}

export function SymmetryReport({ open, onClose }: Props) {
  const romVersion = useROMVersion()
  const scores: SymmetryScore[] = useMemo(
    () => computeAllSymmetry(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [romVersion, open],
  )
  const colors  = useMemo(() => regionColors(scores), [scores])
  const summary = useMemo(() => summarize(scores), [scores])

  const cardRef = useRef<HTMLDivElement | null>(null)
  const [exporting, setExporting] = useState(false)

  async function exportPng() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      // Dynamic import keeps html2canvas out of the initial bundle.
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#05070d',
        scale: 2,
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `zevahealth-symmetry-${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error('[SymmetryReport] export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  if (!open) return null

  const noData = summary.totalMeasured === 0

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header (excluded from PNG via ref scoping below) */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-100">Symmetry Report</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={exporting || noData}
              onClick={exportPng}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
            >
              <Download size={12} />
              {exporting ? 'Exporting…' : 'Save PNG'}
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body — this is the part exported as PNG */}
        <div ref={cardRef} className="p-6 bg-slate-900">

          {/* Brand strip */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-300/10 ring-1 ring-cyan-300/30 text-cyan-200 font-bold text-lg">
                Z
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-100">Zevahealth Symmetry Report</div>
                <div className="text-[10px] text-slate-500">{new Date().toLocaleDateString()}</div>
              </div>
            </div>
            <ScoreBadge score={summary.overallScore} />
          </div>

          {noData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle size={32} className="text-amber-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-200 mb-1">No symmetry data yet</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Complete an assessment on BOTH the left and right side of any
                joint (e.g. left shoulder flexion + right shoulder flexion)
                and your symmetry score will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
              {/* Body silhouette — heatmap */}
              <div className="flex flex-col items-center">
                <BodySilhouette regionColors={colors} width={260} height={520} />
                <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-slate-400">
                  <LegendDot color="#34d399" label="Balanced" />
                  <LegendDot color="#fbbf24" label="Watch" />
                  <LegendDot color="#ef4444" label="Risk" />
                </div>
              </div>

              {/* Per-joint breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  <span>Joint breakdown</span>
                  <span>
                    <span className="text-emerald-400">{summary.goodCount}</span>
                    {' · '}
                    <span className="text-amber-400">{summary.watchCount}</span>
                    {' · '}
                    <span className="text-red-400">{summary.riskCount}</span>
                  </span>
                </div>
                {scores
                  .filter((s) => s.band !== 'incomplete')
                  .map((s) => (
                    <ScoreRow key={s.movementId} score={s} />
                  ))}
                {scores.some((s) => s.band === 'incomplete') && (
                  <details className="mt-3">
                    <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300">
                      Show {scores.filter((s) => s.band === 'incomplete').length} movements with one-sided data
                    </summary>
                    <div className="mt-2 space-y-2">
                      {scores.filter((s) => s.band === 'incomplete').map((s) => (
                        <ScoreRow key={s.movementId} score={s} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}

          {!noData && (
            <p className="mt-5 text-[10px] text-slate-500 leading-relaxed">
              Asymmetry threshold &lt;10% balanced, 10–20% watch, &gt;20% risk
              (NSCA / Sahrmann conventions). General-purpose movement
              insights, not medical advice.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? '#34d399' : score >= 70 ? '#fbbf24' : '#ef4444'
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Symmetry</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>{score}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function ScoreRow({ score }: { score: SymmetryScore }) {
  const tone = colorForBand(score.band)
  const bandLabel =
    score.band === 'good' ? 'Balanced'
    : score.band === 'watch' ? 'Watch'
    : score.band === 'risk' ? 'Risk'
    : 'One-sided'
  return (
    <div className="rounded border border-slate-700 bg-slate-950/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-100 truncate font-medium">{score.label}</span>
        <span
          className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
          style={{ background: tone + '33', color: tone }}
        >
          {bandLabel}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
        <div>
          L peak:{' '}
          <span className="text-slate-200 tabular-nums">
            {score.leftAngle !== null ? `${Math.round(score.leftAngle)}°` : '—'}
          </span>
        </div>
        <div>
          R peak:{' '}
          <span className="text-slate-200 tabular-nums">
            {score.rightAngle !== null ? `${Math.round(score.rightAngle)}°` : '—'}
          </span>
        </div>
        <div className="text-right">
          Δ:{' '}
          <span className="text-slate-200 tabular-nums">
            {score.asymmetryPct !== null ? `${score.asymmetryPct.toFixed(1)}%` : '—'}
          </span>
        </div>
      </div>
      {/* Visual bar showing L vs R */}
      {score.leftAngle !== null && score.rightAngle !== null && (
        <div className="mt-1.5 flex items-center gap-1 h-2">
          <div
            className="rounded-l"
            style={{
              flex: score.leftAngle,
              backgroundColor: '#06b6d4',
              opacity: 0.85,
            }}
          />
          <div
            className="rounded-r"
            style={{
              flex: score.rightAngle,
              backgroundColor: '#fb923c',
              opacity: 0.85,
            }}
          />
        </div>
      )}
    </div>
  )
}
