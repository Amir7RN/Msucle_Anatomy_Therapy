/**
 * PersonalProgramView.tsx
 *
 * Full-screen modal showing the user's AI-generated 4-week mobility program.
 * Week tabs across the top, day cards below, each day's sessions expand to
 * show exercises with a "Start session" button per exercise.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { X, Sparkles, Loader2, AlertCircle, Play, Calendar, ChevronDown } from 'lucide-react'
import {
  generatePersonalProgram,
  loadPersonalProgram,
  type PersonalProgram,
  type ProgramExercise,
} from '../../lib/insights/personalProgram'
import { ExerciseGuidance } from '../movement/ExerciseGuidance'
import { useAtlasStore } from '../../store/atlasStore'

// Map of exerciseId -> { label, videoSrc } so we can launch the existing
// ExerciseGuidance component. Pulled from MetadataPanel's EXERCISE_MAP via a
// thin lookup table to avoid coupling.
const EXERCISE_RESOLVER: Record<string, { label: string; src: string }> = (() => {
  // Shoulder/deltoid + glute/hamstring videos live in public/videos/ (flat).
  const base = import.meta.env.BASE_URL
  const V = (n: string) => `${base}videos/${n}`
  // Bicep & Quad videos live OUTSIDE public/ as Vite asset-pipeline imports
  // (../../../Videos/...) - we re-use the same paths MetadataPanel resolves
  // via new URL(...) so the build hashes them and copies them into /assets.
  const VB = (n: string) => new URL(`../../../Videos/Bicep/${n}`, import.meta.url).href
  const VQ = (n: string) => new URL(`../../../Videos/QuadRecipts/${n}`, import.meta.url).href
  return {
    // Shoulder / Deltoid (public/videos)
    doorway_stretch:        { label: 'Doorway Stretch',          src: V('DoorWay_Stretch.mp4') },
    seated_cross_arm:       { label: 'Seated Cross-Arm Stretch', src: V('Seated_Cross_Arm_Stretch.mp4') },
    standing_sleeper:       { label: 'Standing Sleeper Stretch', src: V('Standing_Sleeper_Stretch.mp4') },
    hand_behind_back:       { label: 'Hand Behind Back Stretch', src: V('Hand_Behind_Back_Stretch.mp4') },
    standing_chest:         { label: 'Standing Chest Stretch',   src: V('Standing_Chest_Stretch.mp4') },
    crab_press:             { label: 'Crab Press',               src: V('Crab_Press.mp4') },
    side_lying_er:          { label: 'Side-Lying ER',            src: V('Side_Lying_External_Rotation.mp4') },
    post_shoulder:          { label: 'Posterior Shoulder',       src: V('Posterior_Shoulder_Stretch.mp4') },
    wand_rotation:          { label: 'Wand Rotation',            src: V('Wand_Rotation.mp4') },
    // Biceps / elbow (Videos/Bicep)
    bb_flex_ext:            { label: 'Biceps Flex / Extend',     src: VB('Flexion and Extension.mp4') },
    bb_shoulder_flex:       { label: 'Shoulder Flexion',         src: VB('Single Shoulder Flexion.mp4') },
    bb_wall_stretch:        { label: 'Wall Biceps Stretch',      src: VB('Biceps Stretch.mp4') },
    bb_ext_rotation:        { label: 'External Rotation',        src: VB('Reclining External Rotation.mp4') },
    bb_sleeper_stretch:     { label: 'Sleeper Stretch',          src: VB('Sleeper Stretch.mp4') },
    // Glute / hip / hamstring (public/videos)
    glute_bridge:           { label: 'Glute Bridge',             src: V('Glute_Bridge_Exercise.mp4') },
    hip_hinge:              { label: 'Hip Hinge',                src: V('Hip_Hinge_Exercise.mp4') },
    side_clamshell:         { label: 'Side Clamshell',           src: V('Glute_Bridge_Exercise.mp4') },
    hamstring_squeeze:      { label: 'Hamstring Squeeze',        src: V('Hamstring_Squeeze.mp4') },
    // Quad (Videos/QuadRecipts)
    qd_wall_squat:          { label: 'Wall Squat',                src: VQ('Wall Squat.mp4') },
    qd_stiff_deadlift:      { label: 'Stiff-Leg Deadlift',        src: VQ('Stiff-legged Deadlift.mp4') },
    qd_quad_stretch_stand:  { label: 'Standing Quad Stretch',     src: VQ('Quad stretch (standing).mp4') },
    qd_quad_stretch_side:   { label: 'Side-Lying Quad Stretch',   src: VQ('Quad stretch (lying on side).mp4') },
    qd_hamstring_supine:    { label: 'Supine Hamstring Stretch',  src: VQ('Hamstring stretch (lying down).mp4') },
  }
})()

interface Props {
  open:    boolean
  onClose: () => void
}

export function PersonalProgramView({ open, onClose }: Props) {
  // Hide the 3D canvas chrome while this modal is open.
  useEffect(() => {
    if (!open) return
    const { pushModal, popModal } = useAtlasStore.getState()
    pushModal()
    return () => popModal()
  }, [open])

  const [program,  setProgram]  = useState<PersonalProgram | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [weekIdx,  setWeekIdx]  = useState(0)
  const [openDay,  setOpenDay]  = useState<number | null>(null)
  const [running,  setRunning]  = useState<{ exerciseId: string; muscleId?: string; label: string; src: string } | null>(null)

  // Hydrate cached program on open.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadPersonalProgram().then((p) => { if (!cancelled) setProgram(p) }).catch(() => {})
    return () => { cancelled = true }
  }, [open])

  async function regenerate() {
    setLoading(true); setError(null)
    try {
      const p = await generatePersonalProgram()
      setProgram(p)
      setWeekIdx(0); setOpenDay(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const currentWeek = useMemo(() => program?.weeks[weekIdx], [program, weekIdx])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-orange-400" />
            <h2 className="text-base font-semibold text-slate-100">Your AI Mobility Program</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={regenerate}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white disabled:bg-slate-700 disabled:text-slate-500"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {program ? 'Regenerate' : 'Generate'}
            </button>
            <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {error && (
            <div className="flex items-start gap-2 rounded border border-red-700/50 bg-red-900/30 p-3 text-xs text-red-300">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!program && !loading && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Sparkles size={32} className="text-orange-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-200 mb-1">Build your personal mobility program</h3>
              <p className="text-xs text-slate-400 max-w-md mb-4">
                I will read your assessment history, identify your weakest joints
                and asymmetries, and build a 4-week progressive plan you can do
                from your living room. Each day's session opens in the AI coach.
              </p>
              <button
                onClick={regenerate}
                className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white"
              >
                <Sparkles size={14} />
                Generate my program
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 size={28} className="text-orange-400 animate-spin mb-3" />
              <p className="text-sm text-slate-300">Building your personalised plan…</p>
              <p className="text-[11px] text-slate-500 mt-1">This can take 15-20 seconds.</p>
            </div>
          )}

          {program && currentWeek && (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                <div className="text-sm font-semibold text-slate-100">{program.title}</div>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">{program.summary}</p>
                <div className="mt-2 text-[10px] text-slate-500">
                  Generated {new Date(program.generatedAt).toLocaleString()}
                </div>
              </div>

              {/* Week tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {program.weeks.map((w, i) => (
                  <button
                    key={i}
                    onClick={() => { setWeekIdx(i); setOpenDay(null) }}
                    className={`flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      i === weekIdx
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    Week {w.weekNum}
                  </button>
                ))}
              </div>

              {/* Week focus */}
              <div className="flex items-center gap-2 text-[11px] text-cyan-300">
                <Calendar size={11} />
                <span className="font-semibold uppercase tracking-wider">Focus:</span>
                <span className="text-slate-300">{currentWeek.focus}</span>
              </div>

              {/* Day cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2">
                {currentWeek.days.map((day) => {
                  const isOpen = openDay === day.dayNum
                  const isRest = day.type === 'rest'
                  return (
                    <button
                      key={day.dayNum}
                      onClick={() => setOpenDay(isOpen ? null : day.dayNum)}
                      className={`flex flex-col items-center justify-center rounded-lg border p-2 min-h-[60px] text-[10px] transition-all ${
                        isOpen
                          ? 'border-orange-500 bg-orange-500/10'
                          : isRest
                            ? 'border-slate-700/60 bg-slate-900/40 text-slate-500'
                            : 'border-slate-700 bg-slate-950/60 hover:border-orange-500/50'
                      }`}
                    >
                      <span className="uppercase tracking-wider text-[9px] text-slate-500">Day {day.dayNum}</span>
                      <span className={`mt-0.5 font-semibold ${isRest ? 'text-slate-500' : 'text-slate-200'}`}>
                        {isRest ? 'Rest' : day.theme || 'Session'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Selected day */}
              {openDay !== null && currentWeek.days.find((d) => d.dayNum === openDay) && (() => {
                const day = currentWeek.days.find((d) => d.dayNum === openDay)!
                return (
                  <div className="rounded-lg border border-orange-500/40 bg-slate-950/60 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-orange-300">
                        Day {day.dayNum} {day.theme && `· ${day.theme}`}
                      </span>
                      <ChevronDown size={12} className="text-slate-500" />
                    </div>
                    {day.type === 'rest' ? (
                      <p className="text-[11px] text-slate-400">
                        Active recovery day. Walk, stretch lightly, hydrate, sleep well.
                      </p>
                    ) : day.sessions.map((session, si) => (
                      <div key={si} className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span className="text-slate-200">{session.title}</span>
                          <span className="text-slate-500">~{session.durationMin} min</span>
                        </div>
                        {session.exercises.map((ex, ei) => (
                          <ExerciseRow key={ei} ex={ex} onStart={() => {
                            const resolved = ex.exerciseId ? EXERCISE_RESOLVER[ex.exerciseId] : undefined
                            if (resolved) {
                              setRunning({
                                exerciseId: ex.exerciseId!,
                                muscleId:   ex.muscleId,
                                label:      resolved.label,
                                src:        resolved.src,
                              })
                            }
                          }} />
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      </div>

      {/* Camera-guided exercise launcher */}
      {running && (
        <ExerciseGuidance
          exerciseId={running.exerciseId}
          exerciseLabel={running.label}
          videoSrc={running.src}
          muscleId={running.muscleId}
          onClose={() => setRunning(null)}
        />
      )}
    </div>
  )
}

function ExerciseRow({ ex, onStart }: { ex: ProgramExercise; onStart: () => void }) {
  const startable = !!ex.exerciseId && !!EXERCISE_RESOLVER[ex.exerciseId]
  return (
    <div className="rounded border border-slate-700 bg-slate-900/70 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-100">{ex.name}</div>
          <div className="text-[10px] text-cyan-300 mt-0.5">{ex.prescription}</div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">{ex.rationale}</div>
        </div>
        <button
          onClick={onStart}
          disabled={!startable}
          title={startable ? 'Start guided session' : 'Video not in library'}
          className="flex-shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-slate-700 disabled:text-slate-500"
        >
          <Play size={9} />
          Start
        </button>
      </div>
    </div>
  )
}
