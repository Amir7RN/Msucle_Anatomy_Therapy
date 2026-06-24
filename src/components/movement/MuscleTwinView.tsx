/**
 * MuscleTwinView.tsx  (v2)
 *
 * The Live Muscle Twin: a single-camera, on-device biofeedback mirror.
 *
 *   • The 3-D muscular model in the centre ANIMATES with you (segment-rigged
 *     from live pose) and its muscles COLOUR by activation — a calm tan at rest
 *     (everything isometric), warming to amber and deep red as a muscle works.
 *   • A radar/spider plot shows each joint's range of motion and where you are
 *     in it right now, with left/right dots for symmetry.
 *   • Claude vision estimates any weight you're holding so activation scales
 *     with load (a curl with a 10 kg dumbbell lights the biceps far more than
 *     empty-handed). Uses your own Anthropic key; bodyweight if none.
 *   • A larger camera preview so you can actually see your pose overlay.
 *
 * The 3-D model reads pose + activation from refs and animates in its own
 * render loop, so it stays smooth while the HUD updates at a calm cadence.
 */

import React, { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Activity, RefreshCw, Dumbbell, Flame } from 'lucide-react'
import { CameraView } from './CameraView'
import { MuscleTwinModel } from './MuscleTwinModel'
import { MuscleActivationRadars } from './MuscleActivationRadars'
import { RomBars } from './RomBars'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import { disposeDetector } from '../../lib/movement/poseDetector'
import {
  LiveActivationEngine,
  type LiveMuscleActivation, type JointLiveReading, type LoadInput,
} from '../../lib/movement/liveMuscleActivation'
import { poseBoneDirections, type BoneDirs } from '../../lib/movement/poseRig'
import { LoadEstimator, type LoadEstimate } from '../../lib/movement/loadEstimator'
import type { BodyOrientation } from '../../lib/movement/bodyOrientation'

interface Props { open: boolean; onClose: () => void }

const HUD_MS = 120   // HUD refresh cadence (model animates every frame via refs)

const ORIENTATION_LABEL: Record<BodyOrientation, string> = {
  standing: 'Standing', seated: 'Seated', supine: 'Lying (back)',
  prone: 'Lying (front)', side_lying: 'Side-lying', unknown: 'Detecting…',
}

export function MuscleTwinView({ open, onClose }: Props) {
  const [ready, setReady]   = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [hud, setHud]       = useState<{
    readings: JointLiveReading[]
    activations: LiveMuscleActivation[]
    orientation: BodyOrientation
    energy: number
  }>({ readings: [], activations: [], orientation: 'unknown', energy: 0 })
  const [load, setLoad]     = useState<LoadEstimate | null>(null)

  const engineRef = useRef<LiveActivationEngine | null>(null)
  const loadEstRef = useRef<LoadEstimator | null>(null)
  const videoRef   = useRef<HTMLVideoElement | null>(null)
  // Refs read by the 3-D model every frame (no React churn).
  const activationsRef = useRef<LiveMuscleActivation[]>([])
  const boneDirsRef    = useRef<BoneDirs>({})
  const loadRef        = useRef<LoadInput>({})
  const lastHudRef     = useRef(0)

  useEffect(() => {
    if (open) {
      engineRef.current = new LiveActivationEngine()
      loadEstRef.current = new LoadEstimator()
    } else {
      setReady(false); setError(null); setLoad(null)
      activationsRef.current = []; boneDirsRef.current = {}; loadRef.current = {}
      engineRef.current?.reset(); engineRef.current = null
      loadEstRef.current?.reset(); loadEstRef.current = null
      videoRef.current = null
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
      disposeDetector()
    }
  }, [open])

  // Periodic Claude-vision load estimate (debounced internally to ~6 s).
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(async () => {
      const est = loadEstRef.current
      if (!est || !videoRef.current) return
      const r = await est.maybeRefresh(videoRef.current)
      loadRef.current = { leftKg: r.leftKg, rightKg: r.rightKg }
      setLoad(r.at ? r : null)
    }, 1500)
    return () => window.clearInterval(id)
  }, [open])

  function handleLandmarks(lms: LandmarkSet) {
    const eng = engineRef.current
    if (!eng) return
    const now = performance.now()
    const frame = eng.update(lms, now, loadRef.current)
    activationsRef.current = frame.activations
    boneDirsRef.current = poseBoneDirections(lms)

    if (now - lastHudRef.current >= HUD_MS) {
      lastHudRef.current = now
      setHud({
        readings: frame.readings,
        activations: frame.activations,
        orientation: frame.orientation.orientation,
        energy: frame.movementEnergy,
      })
    }
  }

  async function rescanWeight() {
    const est = loadEstRef.current
    if (!est || !videoRef.current) return
    const r = await est.maybeRefresh(videoRef.current, true)
    loadRef.current = { leftKg: r.leftKg, rightKg: r.rightKg }
    setLoad(r.at ? r : null)
  }

  if (!open) return null

  const keyPresent = loadEstRef.current?.isEnabled() ?? false

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-slate-950 to-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/70 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">Live Muscle Twin</span>
          <span className="ml-2 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-500/30">
            {ORIENTATION_LABEL[hud.orientation]}
          </span>
          <MovementPip energy={hud.energy} />
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-800" title="Close"><X size={16} /></button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* 3-D animated twin */}
        <div className="relative h-full w-full">
          <MuscleTwinModel activationsRef={activationsRef} boneDirsRef={boneDirsRef} />

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-sm text-slate-300">Starting camera &amp; pose model…</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded border border-red-700 bg-red-950/70 px-3 py-1.5 text-xs text-red-200">{error}</div>
          )}

          {/* Camera preview — large + clear so the pose overlay is readable */}
          <div className="absolute bottom-4 left-4 w-44 overflow-hidden rounded-xl ring-1 ring-slate-600 shadow-2xl sm:w-60 md:w-72">
            <div className="aspect-[3/4] w-full">
              <CameraView
                active={open}
                onLandmarks={handleLandmarks}
                onReady={() => setReady(true)}
                onError={(m) => setError(m)}
                onVideoReady={(v) => { videoRef.current = v }}
              />
            </div>
            <div className="bg-black/70 px-2 py-1 text-[10px] text-slate-300">Your camera + pose</div>
          </div>

          {/* Colour legend */}
          <div className="absolute left-4 top-4 hidden items-center gap-2 rounded-lg bg-black/55 px-3 py-1.5 text-[10px] text-slate-300 backdrop-blur sm:flex">
            <span>Activation</span>
            <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg,#6b5b4a,#f59e0b,#b91c1c)' }} />
            <span className="text-slate-400">rest → max</span>
          </div>
        </div>

        {/* Right rail */}
        <aside className="hidden w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-800 bg-black/50 p-3 lg:flex">
          {/* AI load */}
          <section className="rounded-lg bg-slate-900/60 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
                <Dumbbell size={12} /> External load (AI)
              </div>
              <button
                onClick={rescanWeight}
                disabled={!keyPresent}
                className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                title="Re-scan the weight you're holding"
              >
                <RefreshCw size={10} /> Re-scan
              </button>
            </div>
            {!keyPresent ? (
              <div className="text-[11px] text-slate-400">
                Add your Anthropic key in AI Chat to auto-detect the weight you're holding.
                Using bodyweight for now.
              </div>
            ) : load ? (
              <div className="text-xs text-slate-200">
                <div className="font-medium">{load.item}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Left {load.leftKg} kg · Right {load.rightKg} kg
                  <span className="ml-1 text-slate-500">({Math.round(load.confidence * 100)}% conf)</span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">Scanning for a weight…</div>
            )}
          </section>

          {/* Muscle activation — four spider plots by body section */}
          <section className="rounded-lg bg-slate-900/60 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
              <Flame size={12} /> Muscle activation
            </div>
            <MuscleActivationRadars activations={hud.activations} />
          </section>

          {/* Range of motion — per-joint bars */}
          <section className="rounded-lg bg-slate-900/60 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
              <Activity size={12} /> Range of motion
            </div>
            <RomBars readings={hud.readings} />
          </section>

          <p className="mt-auto text-[10px] leading-relaxed text-slate-500">
            Activation is a kinesiology estimate for biofeedback/education, not EMG.
            Load is estimated from the camera. Stop any movement that causes pain.
          </p>
        </aside>
      </div>
    </div>
  )
}

// ── bits ───────────────────────────────────────────────────────────────────

function MovementPip({ energy }: { energy: number }) {
  const moving = energy > 0.08
  return (
    <span className="ml-1 flex items-center gap-1 text-[10px] text-slate-400">
      <span className={`h-2 w-2 rounded-full ${moving ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
      {moving ? 'Moving' : 'Still'}
    </span>
  )
}

function prettyJoint(movementId: string): string {
  return movementId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
