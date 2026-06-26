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

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Sparkles, Activity, RefreshCw, Dumbbell, Flame, Scale } from 'lucide-react'
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
import { PoseRigEngine, type BoneDirs } from '../../lib/movement/poseRig'
import { LoadEstimator, type LoadEstimate } from '../../lib/movement/loadEstimator'
import type { BodyOrientation } from '../../lib/movement/bodyOrientation'
import type { Posture } from '../../lib/movement/exercisePose'
import {
  buildBodyMassModel, clampWeight, clampHeight,
  DEFAULT_WEIGHT_KG, DEFAULT_HEIGHT_CM, DEFAULT_SEX, type Sex, type SegmentFamily,
} from '../../lib/movement/bodySegments'

// Persisted so the twin remembers the user's body between sessions (used for the
// De Leva segment-inertia distribution that gives the model real weight).
const LS_WEIGHT = 'muscleTwin.weightKg'
const LS_HEIGHT = 'muscleTwin.heightCm'
const LS_SEX    = 'muscleTwin.sex'
function loadNum(key: string, fallback: number): number {
  try { const v = parseFloat(localStorage.getItem(key) || ''); return isFinite(v) ? v : fallback } catch { return fallback }
}
function loadSex(): Sex {
  try { return localStorage.getItem(LS_SEX) === 'female' ? 'female' : 'male' } catch { return DEFAULT_SEX }
}

/** Map the live orientation classification to a model posture. */
function toPosture(o: BodyOrientation): Posture | null {
  switch (o) {
    case 'standing': return 'standing'
    case 'seated':   return 'seated'
    case 'supine':   return 'supine'
    case 'prone':    return 'prone'
    case 'side_lying': return 'side'
    default: return null
  }
}

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
  const [hasKey, setHasKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [weightKg, setWeightKg] = useState(() => loadNum(LS_WEIGHT, DEFAULT_WEIGHT_KG))
  const [heightCm, setHeightCm] = useState(() => loadNum(LS_HEIGHT, DEFAULT_HEIGHT_CM))
  const [sex, setSex]           = useState<Sex>(() => loadSex())

  const bodyModel = useMemo(() => buildBodyMassModel(weightKg, heightCm, sex), [weightKg, heightCm, sex])

  const engineRef = useRef<LiveActivationEngine | null>(null)
  const poseEngineRef = useRef<PoseRigEngine | null>(null)
  const loadEstRef = useRef<LoadEstimator | null>(null)
  const videoRef   = useRef<HTMLVideoElement | null>(null)
  // Refs read by the 3-D model every frame (no React churn).
  const activationsRef = useRef<LiveMuscleActivation[]>([])
  const boneDirsRef    = useRef<BoneDirs>({})
  const postureRef     = useRef<Posture | null>(null)
  const yawRef         = useRef(0)     // live facing yaw → the twin turns with you
  const rootYRef       = useRef(0)     // live vertical offset → jump / gravity
  const groundedRef    = useRef(true)  // foot-contact flag → crisp landings
  const bodyMassRef    = useRef(bodyModel.totalKg)   // read by the model physics
  const agilityRef     = useRef<Partial<Record<SegmentFamily, number>>>(bodyModel.agility)
  const loadRef        = useRef<LoadInput>({})
  const lastHudRef     = useRef(0)

  // Keep the physics mass + inertia live and persist the user's body.
  useEffect(() => {
    bodyMassRef.current = bodyModel.totalKg
    agilityRef.current = bodyModel.agility
    try {
      localStorage.setItem(LS_WEIGHT, String(bodyModel.totalKg))
      localStorage.setItem(LS_HEIGHT, String(bodyModel.heightCm))
      localStorage.setItem(LS_SEX, bodyModel.sex)
    } catch { /* ignore */ }
  }, [bodyModel])

  useEffect(() => {
    if (open) {
      engineRef.current = new LiveActivationEngine()
      poseEngineRef.current = new PoseRigEngine()
      loadEstRef.current = new LoadEstimator()
      setHasKey(loadEstRef.current.isEnabled())
    } else {
      setReady(false); setError(null); setLoad(null); setLoadErr(null)
      activationsRef.current = []; boneDirsRef.current = {}; loadRef.current = {}
      yawRef.current = 0; rootYRef.current = 0
      engineRef.current?.reset(); engineRef.current = null
      poseEngineRef.current?.reset(); poseEngineRef.current = null
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
      setLoadErr(est.lastError())
    }, 1000)
    return () => window.clearInterval(id)
  }, [open])

  function saveKey() {
    const est = loadEstRef.current
    if (!est) return
    est.setKey(keyInput)
    setHasKey(est.isEnabled())
    setKeyInput('')
    setLoadErr(null)
    void rescanWeight()
  }

  function handleLandmarks(lms: LandmarkSet) {
    const eng = engineRef.current
    if (!eng) return
    const now = performance.now()
    const frame = eng.update(lms, now, loadRef.current)
    activationsRef.current = frame.activations
    // Stabilised rig: removes L/R + front/back flips, and adds facing yaw +
    // jump/squat vertical offset so the twin turns and reacts to gravity.
    const rig = poseEngineRef.current?.update(lms)
    if (rig) {
      boneDirsRef.current = rig.dirs
      yawRef.current = rig.yaw
      rootYRef.current = rig.rootY
      groundedRef.current = rig.grounded
    }
    postureRef.current = toPosture(frame.orientation.orientation)

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

      {/* Mobile = column (model on top, analytics below, scrolls). Desktop = row. */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* 3-D animated twin */}
        <div className="relative h-[42vh] w-full shrink-0 lg:h-auto lg:flex-1">
          <MuscleTwinModel activationsRef={activationsRef} boneDirsRef={boneDirsRef} postureRef={postureRef} yawRef={yawRef} rootYRef={rootYRef} bodyMassRef={bodyMassRef} groundedRef={groundedRef} agilityRef={agilityRef} />

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-sm text-slate-300">Starting camera &amp; pose model…</div>
            </div>
          )}
          {error && (
            <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded border border-red-700 bg-red-950/70 px-3 py-1.5 text-xs text-red-200">{error}</div>
          )}

          {/* Camera preview with the live pose overlay */}
          <div className="absolute bottom-3 left-3 w-28 overflow-hidden rounded-xl ring-1 ring-slate-600 shadow-2xl sm:w-40 lg:w-56">
            <div className="aspect-[3/4] w-full">
              <CameraView
                active={open}
                onLandmarks={handleLandmarks}
                onReady={() => setReady(true)}
                onError={(m) => setError(m)}
                onVideoReady={(v) => { videoRef.current = v }}
              />
            </div>
            <div className="bg-black/70 px-2 py-1 text-[9px] text-slate-300 sm:text-[10px]">Your camera + pose</div>
          </div>

          {/* Colour legend */}
          <div className="absolute left-3 top-3 hidden items-center gap-2 rounded-lg bg-black/55 px-3 py-1.5 text-[10px] text-slate-300 backdrop-blur sm:flex">
            <span>Activation</span>
            <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg,#6b5b4a,#f59e0b,#b91c1c)' }} />
            <span className="text-slate-400">rest → max</span>
          </div>
        </div>

        {/* Analytics — below the model on mobile, a right column on desktop.
            Load spans the top; activation + range-of-motion sit side by side. */}
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-800 bg-black/50 p-3 lg:w-[44rem] lg:border-l lg:border-t-0">
          {/* Body model — De Leva mass/inertia from weight, height, sex */}
          <BodyMassPanel
            weightKg={weightKg} heightCm={heightCm} sex={sex} totalKg={bodyModel.totalKg}
            onWeight={(v) => setWeightKg(clampWeight(v))}
            onHeight={(v) => setHeightCm(clampHeight(v))}
            onSex={setSex}
          />

          {/* AI load */}
          <section className="rounded-lg bg-slate-900/60 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
                <Dumbbell size={12} /> External load (AI)
                {hasKey && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Auto
                  </span>
                )}
              </div>
              <button
                onClick={rescanWeight}
                disabled={!hasKey}
                className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                title="Scan now (it already updates automatically)"
              >
                <RefreshCw size={10} /> Scan now
              </button>
            </div>
            {!hasKey ? (
              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-400">
                  Paste your Anthropic API key to let the camera detect what you're holding and scale activation by load. Stored only on this device.
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="sk-ant-…"
                    className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 outline-none ring-1 ring-slate-700 focus:ring-cyan-500/50"
                  />
                  <button
                    onClick={saveKey}
                    disabled={!keyInput.trim()}
                    className="rounded bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : load ? (
              <div>
                <div className="flex items-baseline gap-2 text-sm text-slate-100">
                  <span className="font-semibold capitalize">{load.item}</span>
                  <span className="text-[11px] text-slate-400">({Math.round(load.confidence * 100)}% conf)</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Left hand {load.leftKg} kg · Right hand {load.rightKg} kg
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">Updates automatically as you pick things up or put them down.</div>
                {loadErr && <div className="mt-1 text-[10px] text-amber-400">Last scan error: {loadErr}</div>}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">
                {loadErr ? <span className="text-amber-400">Scan error: {loadErr}</span> : 'Watching your hands for weights — updates automatically…'}
              </div>
            )}
          </section>

          {/* Activation + ROM side by side */}
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-lg bg-slate-900/60 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
                <Flame size={12} /> Muscle activation
              </div>
              <MuscleActivationRadars activations={hud.activations} />
            </section>

            <section className="rounded-lg bg-slate-900/60 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cyan-300">
                <Activity size={12} /> Range of motion
              </div>
              <RomBars readings={hud.readings} />
            </section>
          </div>

          <p className="text-[10px] leading-relaxed text-slate-500">
            Activation is a kinesiology estimate for biofeedback/education, not EMG.
            Load is estimated from the camera. Stop any movement that causes pain.
          </p>
        </aside>
      </div>
    </div>
  )
}

// ── bits ───────────────────────────────────────────────────────────────────

/**
 * Compact body model: weight + height + sex in, total body mass out. The full
 * De Leva per-segment mass / centre-of-mass / inertia distribution is computed
 * internally and fed to the physics — it isn't listed here (kept deliberately
 * small). Persisted by the parent.
 */
function BodyMassPanel({
  weightKg, heightCm, sex, totalKg, onWeight, onHeight, onSex,
}: {
  weightKg: number; heightCm: number; sex: Sex; totalKg: number
  onWeight: (v: number) => void; onHeight: (v: number) => void; onSex: (s: Sex) => void
}) {
  // Local text state so the user can clear/retype freely; commit on blur/enter.
  const [w, setW] = useState(String(Math.round(weightKg)))
  const [h, setH] = useState(String(Math.round(heightCm)))
  useEffect(() => { setW(String(Math.round(weightKg))) }, [weightKg])
  useEffect(() => { setH(String(Math.round(heightCm))) }, [heightCm])

  return (
    <section className="rounded-lg bg-slate-900/60 px-2.5 py-2">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-cyan-300">
          <Scale size={11} /> Body
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-slate-400">Weight kg</span>
          <input
            type="number" inputMode="decimal" value={w}
            onChange={(e) => setW(e.target.value)} onBlur={() => onWeight(parseFloat(w))}
            onKeyDown={(e) => { if (e.key === 'Enter') onWeight(parseFloat(w)) }}
            className="w-14 rounded bg-slate-800 px-1.5 py-0.5 text-[13px] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-cyan-500/50"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-slate-400">Height cm</span>
          <input
            type="number" inputMode="decimal" value={h}
            onChange={(e) => setH(e.target.value)} onBlur={() => onHeight(parseFloat(h))}
            onKeyDown={(e) => { if (e.key === 'Enter') onHeight(parseFloat(h)) }}
            className="w-14 rounded bg-slate-800 px-1.5 py-0.5 text-[13px] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-cyan-500/50"
          />
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-slate-400">Sex</span>
          <div className="flex overflow-hidden rounded ring-1 ring-slate-700">
            {(['male', 'female'] as Sex[]).map((s) => (
              <button key={s} onClick={() => onSex(s)} title={s}
                className={`px-2 py-0.5 text-[11px] ${sex === s ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                {s === 'male' ? 'M' : 'F'}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[9px] text-slate-400">Total</div>
          <div className="text-base font-semibold leading-none text-cyan-200">{Math.round(totalKg)} kg</div>
        </div>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-slate-500">De Leva segment mass &amp; inertia → real weight and momentum.</p>
    </section>
  )
}

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
