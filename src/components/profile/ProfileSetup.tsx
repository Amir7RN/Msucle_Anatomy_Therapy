/**
 * ProfileSetup.tsx
 *
 * The "first visit" a real PT does — captured once and reused everywhere. The
 * user enters who they are (age, sex, height, weight, training level, goals,
 * any injuries), optionally runs a camera body scan, and sees a live preview of
 * HOW that profile personalises their fatigue model and prescription. Saving it
 * flips on personalization across the whole app (Twin + exercises).
 */

import React, { useMemo, useState } from 'react'
import { X, User, Scan, Check, Activity, ShieldAlert, Sparkles, Trash2, Plus } from 'lucide-react'
import {
  loadProfile, saveProfile, type UserProfile,
  type FitnessLevel, type TrainingGoal, type InjurySeverity, type InjuryFlag,
  FITNESS_LABEL, GOAL_LABEL, BUILD_LABEL, ageBand,
} from '../../lib/profile/userProfile'
import { buildPersonalization, prescribe, prettyRegion } from '../../lib/profile/personalization'
import {
  clampWeight, clampHeight, WEIGHT_MIN_KG, WEIGHT_MAX_KG, HEIGHT_MIN_CM, HEIGHT_MAX_CM,
} from '../../lib/movement/bodySegments'
import type { SymmetryRegion } from '../../lib/insights/symmetry'
import { BodyScanView } from './BodyScanView'
import type { BodyScanResult } from '../../lib/profile/bodyScan'

interface Props { open: boolean; onClose: () => void }

const FITNESS_LEVELS: FitnessLevel[] = ['sedentary', 'beginner', 'intermediate', 'advanced', 'athlete']
const GOALS: TrainingGoal[] = ['mobility', 'pain_relief', 'strength', 'endurance', 'return_to_activity', 'general_fitness']
const REGIONS: SymmetryRegion[] = [
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'neck', 'trunk',
]
const SEVERITIES: InjurySeverity[] = ['mild', 'moderate', 'severe']

export function ProfileSetup({ open, onClose }: Props) {
  // Local working copy, seeded from the stored profile each time we open.
  const [p, setP] = useState<UserProfile>(() => loadProfile())
  const [scanOpen, setScanOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // Re-seed whenever the modal transitions to open.
  React.useEffect(() => { if (open) setP(loadProfile()) }, [open])

  const personalization = useMemo(
    () => buildPersonalization({ ...p, onboarded: true }),
    [p],
  )
  const rx = useMemo(() => prescribe(personalization), [personalization])

  if (!open) return null

  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => setP((cur) => ({ ...cur, [k]: v }))

  const toggleGoal = (g: TrainingGoal) =>
    setP((cur) => ({ ...cur, goals: cur.goals.includes(g) ? cur.goals.filter((x) => x !== g) : [...cur.goals, g] }))

  const addInjury = () => {
    const used = new Set(p.injuries.map((i) => i.region))
    const next = REGIONS.find((r) => !used.has(r))
    if (!next) return
    setP((cur) => ({ ...cur, injuries: [...cur.injuries, { region: next, severity: 'mild' }] }))
  }
  const updateInjury = (idx: number, patch: Partial<InjuryFlag>) =>
    setP((cur) => ({ ...cur, injuries: cur.injuries.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }))
  const removeInjury = (idx: number) =>
    setP((cur) => ({ ...cur, injuries: cur.injuries.filter((_, i) => i !== idx) }))

  const onScanResult = (r: BodyScanResult) => {
    setP((cur) => ({ ...cur, composition: r.composition, scan: r.scan }))
  }

  const save = () => {
    saveProfile({ ...p, onboarded: true })
    setSavedFlash(true)
    window.setTimeout(() => { setSavedFlash(false); onClose() }, 600)
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-gradient-to-b from-slate-950 to-black text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/70 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <User size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">My Profile</span>
          <span className="ml-1 text-[11px] text-slate-400">personalises your whole experience</span>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-800" title="Close"><X size={16} /></button>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 lg:flex-row lg:items-start">
        {/* ── Left: the form ── */}
        <div className="flex-1 space-y-5">
          {/* Demographics */}
          <Section title="About you" icon={<User size={14} />}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField label="Age" value={p.ageYears} min={10} max={100}
                onChange={(v) => set('ageYears', v)} placeholder="—" />
              <div>
                <FieldLabel>Sex</FieldLabel>
                <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-700">
                  {(['male', 'female'] as const).map((s) => (
                    <button key={s} onClick={() => set('sex', s)}
                      className={['flex-1 px-2 py-2 text-xs font-semibold capitalize',
                        p.sex === s ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-400'].join(' ')}>{s}</button>
                  ))}
                </div>
              </div>
              <NumberField label="Height (cm)" value={p.heightCm} min={HEIGHT_MIN_CM} max={HEIGHT_MAX_CM}
                onChange={(v) => set('heightCm', clampHeight(v ?? p.heightCm))} />
              <NumberField label="Weight (kg)" value={p.weightKg} min={WEIGHT_MIN_KG} max={WEIGHT_MAX_KG}
                onChange={(v) => set('weightKg', clampWeight(v ?? p.weightKg))} />
            </div>
          </Section>

          {/* Fitness level */}
          <Section title="Training background" icon={<Activity size={14} />}>
            <div className="flex flex-wrap gap-2">
              {FITNESS_LEVELS.map((lvl) => (
                <button key={lvl} onClick={() => set('fitnessLevel', lvl)}
                  className={['rounded-full px-3 py-1.5 text-xs font-semibold ring-1',
                    p.fitnessLevel === lvl ? 'bg-cyan-600 text-white ring-cyan-500' : 'bg-slate-900 text-slate-300 ring-slate-700 hover:bg-slate-800'].join(' ')}>
                  {FITNESS_LABEL[lvl]}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <FieldLabel>Goals</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <button key={g} onClick={() => toggleGoal(g)}
                    className={['rounded-full px-3 py-1.5 text-xs ring-1',
                      p.goals.includes(g) ? 'bg-violet-600 text-white ring-violet-500' : 'bg-slate-900 text-slate-300 ring-slate-700 hover:bg-slate-800'].join(' ')}>
                    {GOAL_LABEL[g]}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Injuries */}
          <Section title="Injuries / pain to protect" icon={<ShieldAlert size={14} />}>
            <div className="space-y-2">
              {p.injuries.length === 0 && (
                <div className="text-xs text-slate-500">None added — your plan won't restrict any region.</div>
              )}
              {p.injuries.map((inj, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select value={inj.region} onChange={(e) => updateInjury(idx, { region: e.target.value as SymmetryRegion })}
                    className="flex-1 rounded-lg bg-slate-900 px-2 py-1.5 text-xs text-slate-200 ring-1 ring-slate-700">
                    {REGIONS.map((r) => <option key={r} value={r}>{prettyRegion(r)}</option>)}
                  </select>
                  <select value={inj.severity} onChange={(e) => updateInjury(idx, { severity: e.target.value as InjurySeverity })}
                    className="rounded-lg bg-slate-900 px-2 py-1.5 text-xs text-slate-200 ring-1 ring-slate-700 capitalize">
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => removeInjury(idx)} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-300"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={addInjury} disabled={p.injuries.length >= REGIONS.length}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                <Plus size={13} /> Add region
              </button>
            </div>
          </Section>
        </div>

        {/* ── Right: body scan + personalization preview ── */}
        <div className="w-full space-y-4 lg:w-[340px]">
          {/* Body composition */}
          <Section title="Body composition" icon={<Scan size={14} />}>
            {p.composition.bodyFatPct != null ? (
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">{p.composition.bodyFatPct}%</span>
                  <span className="text-xs text-slate-400">fat · range {p.composition.bodyFatLow}–{p.composition.bodyFatHigh}%</span>
                </div>
                <div className="text-xs text-slate-300">
                  {p.composition.build && <>Build: <span className="font-semibold">{BUILD_LABEL[p.composition.build]}</span></>}
                  {p.composition.leanMassKg != null && <> · ~{p.composition.leanMassKg} kg lean</>}
                </div>
                <div className="text-[10px] text-slate-500">Camera estimate · {Math.round(p.composition.confidence * 100)}% confidence</div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">No scan yet. A scan refines your fatigue model with real build + symmetry data.</div>
            )}
            <button onClick={() => setScanOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold hover:bg-cyan-500">
              <Scan size={15} /> {p.composition.bodyFatPct != null ? 'Rescan body' : 'Run body scan'}
            </button>
          </Section>

          {/* Personalization preview */}
          <Section title="How this personalises you" icon={<Sparkles size={14} />}>
            <div className="mb-2 grid grid-cols-3 gap-2 text-center">
              <Stat label="Reps" value={`${rx.reps}`} />
              <Stat label="Intensity" value={`${rx.intensityPct}%`} />
              <Stat label="Rest" value={`${rx.restSec}s`} />
            </div>
            <div className="space-y-1.5">
              {personalization.rationale.length === 0 ? (
                <div className="text-xs text-slate-500">Fill in your details to see how your plan adapts.</div>
              ) : personalization.rationale.map((line, i) => (
                <div key={i} className="flex gap-1.5 text-[11px] text-slate-300">
                  <span className="text-cyan-400">•</span><span>{line}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {ageBand(p.ageYears) !== 'unknown'
                ? `Modeled fatigue ×${personalization.fatigueGainMul.toFixed(2)} · recovery ×${personalization.recoveryRateMul.toFixed(2)}`
                : 'Add your age for age-aware fatigue pacing.'}
            </div>
          </Section>

          <button onClick={save}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold hover:bg-emerald-500">
            {savedFlash ? <><Check size={16} /> Saved</> : 'Save profile'}
          </button>
        </div>
      </div>

      <BodyScanView
        open={scanOpen}
        input={{ heightCm: p.heightCm, weightKg: p.weightKg, sex: p.sex, ageYears: p.ageYears }}
        onClose={() => setScanOpen(false)}
        onResult={onScanResult}
      />
    </div>
  )
}

// ── Small UI helpers ─────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-slate-900/50 p-4 ring-1 ring-slate-800">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
        {icon} {title}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">{children}</div>
}

function NumberField({
  label, value, min, max, onChange, placeholder,
}: {
  label: string; value: number | null; min: number; max: number
  onChange: (v: number | null) => void; placeholder?: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number" inputMode="numeric" min={min} max={max}
        value={value ?? ''} placeholder={placeholder}
        onChange={(e) => { const v = e.target.value; onChange(v === '' ? null : Number(v)) }}
        className="w-full rounded-lg bg-slate-900 px-2.5 py-2 text-sm text-slate-100 ring-1 ring-slate-700 focus:outline-none focus:ring-cyan-500"
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/70 p-2">
      <div className="text-sm font-bold tabular-nums text-slate-100">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  )
}
