/**
 * MuscleTwinView.tsx
 *
 * ZevaHealth's flagship differentiator: a LIVE 3-D MUSCLE TWIN.
 *
 * The user moves in front of a single camera and the 3-D muscular-system atlas
 * lights up — in real time — showing exactly which muscles are working, how
 * hard, and whether they're contracting (concentric) or controlling
 * (eccentric). Alongside it, live ROM dials and a left/right symmetry meter
 * update continuously, in any body orientation (standing, seated, or lying),
 * thanks to the orientation-aware measurement stack.
 *
 * No other single-camera rehab platform (Sword, Hinge, Kaia, …) renders an
 * anatomical digital twin from live pose — they show a stick-figure or a
 * green/red rep counter. This turns ZevaHealth's existing 3-D atlas into a
 * biofeedback mirror: see your own anatomy fire as you move.
 *
 * Fully on-device: landmarks are computed in-browser and never leave it.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Activity, Flame, Sparkles } from 'lucide-react'
import { CameraView } from './CameraView'
import { MuscleActivationViewer } from './MuscleActivationViewer'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { disposeDetector } from '../../lib/movement/poseDetector'
import {
  LiveActivationEngine, summariseAsymmetry,
  type LiveFrame, type LiveMuscleActivation, type AsymmetryRow,
} from '../../lib/movement/liveMuscleActivation'
import type { BodyOrientation } from '../../lib/movement/bodyOrientation'

interface Props {
  open:    boolean
  onClose: () => void
}

// The viewer + HUD refresh at ~12 Hz (every ~80 ms). The 3-D pulse animation
// runs independently in the viewer's render loop, so this is plenty smooth
// while keeping React/R3F reconciliation cheap.
const UI_REFRESH_MS = 80

const ORIENTATION_LABEL: Record<BodyOrientation, string> = {
  standing: 'Standing', seated: 'Seated', supine: 'Lying (back)',
  prone: 'Lying (front)', side_lying: 'Side-lying', unknown: 'Detecting…',
}

export function MuscleTwinView({ open, onClose }: Props) {
  const [active, setActive]         = useState(false)
  const [ready, setReady]           = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [frame, setFrame]           = useState<LiveFrame | null>(null)

  const engineRef   = useRef<LiveActivationEngine | null>(null)
  const lastUiRef   = useRef(0)

  useEffect(() => {
    if (open) {
      setActive(true)
      engineRef.current = new LiveActivationEngine()
    } else {
      setActive(false)
      setReady(false)
      setError(null)
      setFrame(null)
      engineRef.current?.reset()
      engineRef.current = null
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
      disposeDetector()
    }
  }, [open])

  function handleLandmarks(lms: LandmarkSet) {
    const eng = engineRef.current
    if (!eng) return
    const now = performance.now()
    const f = eng.update(lms, now)
    // Throttle React state updates; the engine still runs every frame so
    // velocity/phase stay accurate.
    if (now - lastUiRef.current >= UI_REFRESH_MS) {
      lastUiRef.current = now
      setFrame(f)
    }
  }

  if (!open) return null

  const activations: LiveMuscleActivation[] = frame?.activations ?? []
  const orientation = frame?.orientation.orientation ?? 'unknown'
  const asym = frame ? summariseAsymmetry(frame.readings) : []
  const topMuscles = activations.slice(0, 6)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-slate-950 to-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/70 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">Live Muscle Twin</span>
          <span className="ml-2 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-500/30">
            {ORIENTATION_LABEL[orientation]}
          </span>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-800" title="Close">
          <X size={16} />
        </button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* 3-D atlas — the twin */}
        <div className="relative h-full w-full">
          <MuscleActivationViewer activations={activations} />

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-sm text-slate-300">Starting camera &amp; pose model…</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded border border-red-700 bg-red-950/70 px-3 py-1.5 text-xs text-red-200">
              {error}
            </div>
          )}

          {/* Camera preview (small, bottom-left) with the live skeleton */}
          <div className="absolute bottom-3 left-3 h-44 w-32 overflow-hidden rounded-lg ring-1 ring-slate-700 shadow-xl sm:h-56 sm:w-40">
            <CameraView
              active={active}
              onLandmarks={handleLandmarks}
              onReady={() => setReady(true)}
              onError={(m) => { setError(m); setActive(false) }}
            />
          </div>
        </div>

        {/* Right rail HUD */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-800 bg-black/50 p-3 md:flex">
          <ActivationList muscles={topMuscles} />
          <AsymmetryMeter rows={asym} />
          <p className="mt-auto text-[10px] leading-relaxed text-slate-500">
            Activation is a kinesiology estimate for biofeedback and education,
            not an EMG measurement. Stop any movement that causes pain.
          </p>
        </aside>

        {/* Mobile: condensed activation chips along the bottom */}
        <div className="absolute inset-x-0 bottom-0 flex gap-1.5 overflow-x-auto bg-gradient-to-t from-black/80 to-transparent p-2 md:hidden">
          {topMuscles.map((m) => (
            <MuscleChip key={`${m.muscleId}:${m.region}`} m={m} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Activation list ────────────────────────────────────────────────────────────

function ActivationList({ muscles }: { muscles: LiveMuscleActivation[] }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
        <Flame size={12} /> Working now
      </div>
      {muscles.length === 0 ? (
        <div className="rounded-md bg-slate-900/60 p-3 text-xs text-slate-400">
          Move a limb and watch the muscles light up.
        </div>
      ) : (
        <div className="space-y-1.5">
          {muscles.map((m) => (
            <div key={`${m.muscleId}:${m.region}`} className="rounded-md bg-slate-900/60 p-2">
              <div className="flex items-center justify-between">
                <span className="truncate text-xs font-medium text-slate-100">
                  {prettyMuscle(m.muscleId)}
                </span>
                <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${phaseStyle(m)}`}>
                  {m.role === 'agonist' ? m.phase : m.role}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.round(m.level * 100)}%`, background: heat(m.level) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function MuscleChip({ m }: { m: LiveMuscleActivation }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900/80 px-2 py-1 text-[10px] ring-1 ring-slate-700">
      <span className="h-2 w-2 rounded-full" style={{ background: heat(m.level) }} />
      <span className="text-slate-200">{prettyMuscle(m.muscleId)}</span>
    </div>
  )
}

// ── Asymmetry meter ──────────────────────────────────────────────────────────

function AsymmetryMeter({ rows }: { rows: AsymmetryRow[] }) {
  const flagged = rows.filter((r) => r.asym > 0.12).slice(0, 4)
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
        <Activity size={12} /> Left / Right balance
      </div>
      {flagged.length === 0 ? (
        <div className="rounded-md bg-slate-900/60 p-3 text-xs text-slate-400">
          Move both sides through their range to compare symmetry.
        </div>
      ) : (
        <div className="space-y-2">
          {flagged.map((r) => (
            <div key={r.jointBase} className="rounded-md bg-slate-900/60 p-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-200">{prettyJoint(r.jointBase)}</span>
                <span className={r.asym > 0.2 ? 'text-red-300' : 'text-amber-300'}>
                  {Math.round(r.asym * 100)}% diff
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                <span className="w-8 text-right tabular-nums">{Math.round(r.left)}°</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-slate-800">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600" />
                  <div
                    className="absolute top-0 h-full rounded-full bg-cyan-500/70"
                    style={{
                      left: r.left <= r.right ? 0 : undefined,
                      right: r.left > r.right ? 0 : undefined,
                      width: `${Math.min(100, (Math.min(r.left, r.right) / Math.max(r.left, r.right, 1)) * 50)}%`,
                    }}
                  />
                </div>
                <span className="w-8 tabular-nums">{Math.round(r.right)}°</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function heat(level: number): string {
  // cyan → orange → red as activation rises.
  if (level < 0.33) return '#22d3ee'
  if (level < 0.66) return '#fb923c'
  return '#ef4444'
}

function phaseStyle(m: LiveMuscleActivation): string {
  if (m.role !== 'agonist') return 'bg-slate-700 text-slate-300'
  if (m.phase === 'concentric') return 'bg-emerald-500/20 text-emerald-300'
  if (m.phase === 'eccentric')  return 'bg-amber-500/20 text-amber-300'
  return 'bg-cyan-500/20 text-cyan-300'
}

function prettyMuscle(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function prettyJoint(movementId: string): string {
  return movementId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
