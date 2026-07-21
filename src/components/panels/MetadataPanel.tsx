import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { MousePointerClick, MapPin, Zap, StickyNote, Activity, Play, Mic, Square, Volume2, ChevronDown, ChevronRight, Camera, ArrowDown, X, Info } from 'lucide-react'
import { getGuideSeen, markGuideSeen, subscribeGuide } from '../../lib/guideProgress'
import { ExerciseGuidance } from '../movement/ExerciseGuidance'
import { AssessmentView } from '../assessment/AssessmentView'
import { loadROMHistory } from '../../lib/movement/romHistory'
import { useROMVersion } from '../../hooks/useROMVersion'

/**
 * Resolve the diagnostic-flavoured muscle_id (e.g. 'deltoid_anterior')
 * for the current selection.  Mesh IDs in the GLB look like
 * 'MUSC_DELTOID_ANTERIOR_R'; the assessment catalog is keyed by the
 * lowercased painDiagnostic.json muscle_id, so we prefer the explicit
 * diagnosticSubMuscleId set by the AI triage / blueprint flow.  When
 * that's null we fall back to deriving the diagnostic key from the
 * mesh ID (strip MUSC_ prefix and _L/_R suffix).
 */
function subMuscleIdForAssessment(
  selectedMeshId: string | null,
  diagnosticSubMuscleId: string | null,
): string | null {
  if (diagnosticSubMuscleId) return diagnosticSubMuscleId
  if (!selectedMeshId)        return null
  return selectedMeshId
    .replace(/^MUSC_/, '')
    .replace(/_(L|R)$/i, '')
    .toLowerCase()
}

/** Subscribed wrapper — re-renders when EITHER selection or diagnostic sub-muscle changes. */
function AssessmentMount({ muscleName, selectedId }: { muscleName: string | null; selectedId: string | null }) {
  const diagnosticSubMuscleId = useAtlasStore((s) => s.diagnosticSubMuscleId)
  const muscleId = subMuscleIdForAssessment(selectedId, diagnosticSubMuscleId)
  return <AssessmentView muscleId={muscleId} muscleName={muscleName} />
}
import { useAtlasStore } from '../../store/atlasStore'
import { Badge, systemBadgeColor, layerBadgeColor } from '../ui/Badge'
import { Button } from '../ui/Button'
import { REGION_LABELS, SIDE_LABELS, SYSTEM_LABELS, LAYER_LABELS } from '../../lib/structureMapper'
import { PAIN_PATTERNS } from '../../data/painPatterns'
import {
  groupContributionsForDisplay,
  isGrouped,
  pickSideFromClick,
  type DiagnosticResult,
  type MuscleContribution,
  type GroupedMuscleContribution,
  type DiagnosticDisplayItem,
} from '../../lib/diagnostic'

// ── Exercise video data ───────────────────────────────────────────────────────

interface ExerciseDef {
  id:       string
  label:    string
  subtitle: string
  src:      string
}

// Use BASE_URL so paths work both in local dev (/) and GitHub Pages (/Msucle_Anatomy_Therapy/)
const V = (file: string) => `${import.meta.env.BASE_URL}videos/${file}`

// ── Deltoid exercises split by sub-head ──────────────────────────────────────
const DELTOID_ANTERIOR_EXERCISES: ExerciseDef[] = [
  { id: 'crab_press',        label: 'Crab Press',             subtitle: 'Anterior delt activation',  src: V('Crab_Press.mp4')               },
  { id: 'doorway_stretch',   label: 'Doorway Stretch',        subtitle: 'Anterior deltoid release',  src: V('DoorWay_Stretch.mp4')          },
  { id: 'hand_behind_back',  label: 'Behind Back Stretch',    subtitle: 'Internal rotation mob.',    src: V('Hand_Behind_Back_Stretch.mp4') },
  { id: 'standing_chest',    label: 'Standing Chest Stretch', subtitle: 'Pec & anterior delt',       src: V('Standing_Chest_Stretch.mp4')   },
]

const DELTOID_LATERAL_EXERCISES: ExerciseDef[] = [
  { id: 'seated_cross_arm',  label: 'Seated Cross-Arm Stretch', subtitle: 'Lateral deltoid stretch', src: V('Seated_Cross_Arm_Stretch.mp4') },
  { id: 'standing_sleeper',  label: 'Sleeper Stretch',          subtitle: 'Posterior capsule mob.',  src: V('Standing_Sleeper_Stretch.mp4') },
]

const DELTOID_ALL_EXERCISES: ExerciseDef[] = [
  ...DELTOID_ANTERIOR_EXERCISES,
  ...DELTOID_LATERAL_EXERCISES,
]

// ── Rotator cuff exercises ────────────────────────────────────────────────────

// Infraspinatus — primary external rotator; posterior scapula.
const INFRASPINATUS_EXERCISES: ExerciseDef[] = [
  { id: 'side_lying_er',     label: 'Side-Lying External Rotation', subtitle: 'Gold-standard IR strengthening', src: V('Side_Lying_External_Rotation.mp4')  },
  { id: 'wand_rotation',     label: 'Wand Rotation',                subtitle: 'External rotation ROM',          src: V('Wand_Rotation.mp4')                 },
  { id: 'post_shoulder',     label: 'Posterior Shoulder Stretch',   subtitle: 'Deep release for posterior cuff', src: V('Posterior_Shoulder_Stretch.mp4')    },
]

// Supraspinatus — initiates abduction; subacromial space stabiliser.
const SUPRASPINATUS_EXERCISES: ExerciseDef[] = [
  { id: 'wall_climb',        label: 'Wall Climb (to the side)',      subtitle: 'Low-load abduction rehab',        src: V('Wall_Climb_To_The_Side.mp4')            },
  { id: 'scapular_reach',    label: 'Scapular Arm Reach',            subtitle: 'Scapulohumeral rhythm training',  src: V('Scapular_Arm_Reach_Lying_Down.mp4')     },
  { id: 'pendulum',          label: 'Pendulum Swing',                subtitle: 'Joint decompression, early rehab', src: V('Pendulum_Swing.mp4')                   },
]

// Teres minor — external rotation + adduction; "little brother" to infraspinatus.
const TERES_MINOR_EXERCISES: ExerciseDef[] = [
  { id: 'high_low_rows',     label: 'High to Low Rows',              subtitle: 'Teres minor & lower trap',        src: V('High_To_Low_Rows.mp4')                  },
  { id: 'up_back_stretch',   label: 'Up-the-Back Stretch',           subtitle: 'Stretches posterior cuff',        src: V('Up_The_Back_Shoulder_Stretch.mp4')      },
  { id: 'supported_ext',     label: 'Supported Extensor Stretch',    subtitle: 'Posterior cuff lengthening',      src: V('Supported_Extensor_Stretch.mp4')        },
]

// ── Hamstring exercises ───────────────────────────────────────────────────────
const HAMSTRING_EXERCISES: ExerciseDef[] = [
  { id: 'hamstring_squeeze', label: 'Hamstring Squeeze',   subtitle: 'Isometric activation',   src: V('Hamstring_Squeeze.mp4')    },
  { id: 'glute_bridge',      label: 'Glute Bridge',        subtitle: 'Hip extension & loading', src: V('Glute_Bridge_Exercise.mp4') },
  { id: 'hip_hinge',         label: 'Hip Hinge',           subtitle: 'Eccentric hamstring',     src: V('Hip_Hinge_Exercise.mp4')   },
]

// ── Biceps brachii exercises ──────────────────────────────────────────────────
// Videos live in /Videos/Bicep/ (outside public/), so we use Vite's URL import
// so the asset pipeline picks them up and hashes them at build time.
const VB = (file: string) => new URL(`../../../Videos/Bicep/${file}`, import.meta.url).href

const BICEPS_BRACHII_EXERCISES: ExerciseDef[] = [
  { id: 'bb_flex_ext',        label: 'Flexion & Extension',         subtitle: 'Gentle elbow mobility',     src: VB('Flexion and Extension.mp4')       },
  { id: 'bb_shoulder_flex',   label: 'Single Shoulder Flexion',     subtitle: 'Range of motion',           src: VB('Single Shoulder Flexion.mp4')     },
  { id: 'bb_wall_stretch',    label: 'Wall Biceps Stretch',         subtitle: 'Static stretch hold',       src: VB('Biceps Stretch.mp4')              },
  { id: 'bb_ext_rotation',    label: 'Reclining External Rotation', subtitle: 'Rotator cuff control',      src: VB('Reclining External Rotation.mp4') },
  { id: 'bb_sleeper_stretch', label: 'Sleeper Stretch',             subtitle: 'Internal rotation release', src: VB('Sleeper Stretch.mp4')             },
]

// ── Quadriceps exercises ──────────────────────────────────────────────────────
// Videos live in /Videos/QuadRecipts/ (outside public/), so we use Vite's URL
// import so the asset pipeline picks them up and hashes them at build time.
// Subtitles encode the movement metric the AI coach should monitor at runtime
// (knee flexion target, hold duration, rep count) — these map directly to
// pose-derived signals (knee angle, hip-hinge angle, hold-state detector).
const VQ = (file: string) => new URL(`../../../Videos/QuadRecipts/${file}`, import.meta.url).href

const QUADRICEPS_EXERCISES: ExerciseDef[] = [
  { id: 'qd_wall_squat',         label: 'Wall Squat',                 subtitle: 'Knee flex ~90° · 7–10 reps · 2–3 sets', src: VQ('Wall Squat.mp4')                    },
  { id: 'qd_stiff_deadlift',     label: 'Stiff-Legged Deadlift',      subtitle: 'Hip hinge · knees stiff · 7–10 reps',   src: VQ('Stiff-legged Deadlift.mp4')         },
  { id: 'qd_quad_stretch_stand', label: 'Quad Stretch (Standing)',    subtitle: 'Hold 15–30 s · 2–4× per leg',           src: VQ('Quad stretch (standing).mp4')       },
  { id: 'qd_quad_stretch_side',  label: 'Quad Stretch (Side-Lying)',  subtitle: 'Side-lying · hold 15–30 s',             src: VQ('Quad stretch (lying on side).mp4')  },
  { id: 'qd_hamstring_supine',   label: 'Hamstring Stretch (Supine)', subtitle: 'Lying down · hold 15–30 s · 2–4×',      src: VQ('Hamstring stretch (lying down).mp4')},
]

// ── Master lookup — keyed by both mesh ID and diagnostic muscle ID ────────────
const EXERCISE_MAP: Record<string, ExerciseDef[]> = {
  // Deltoid (mesh IDs → all; diagnostic sub-IDs → targeted)
  MUSC_DELTOID_R:    DELTOID_ALL_EXERCISES,
  MUSC_DELTOID_L:    DELTOID_ALL_EXERCISES,
  deltoid_anterior:  DELTOID_ANTERIOR_EXERCISES,
  deltoid_lateral:   DELTOID_LATERAL_EXERCISES,
  deltoid_posterior: DELTOID_LATERAL_EXERCISES,

  // Infraspinatus
  MUSC_INFRASPINATUS_R: INFRASPINATUS_EXERCISES,
  MUSC_INFRASPINATUS_L: INFRASPINATUS_EXERCISES,
  infraspinatus:        INFRASPINATUS_EXERCISES,

  // Supraspinatus
  MUSC_SUPRASPINATUS_R: SUPRASPINATUS_EXERCISES,
  MUSC_SUPRASPINATUS_L: SUPRASPINATUS_EXERCISES,
  supraspinatus:        SUPRASPINATUS_EXERCISES,

  // Teres minor
  MUSC_TERES_MINOR_R: TERES_MINOR_EXERCISES,
  MUSC_TERES_MINOR_L: TERES_MINOR_EXERCISES,
  teres_minor:        TERES_MINOR_EXERCISES,

  // Hamstrings (mesh IDs → biceps femoris is the representative head)
  MUSC_BICEPS_FEMORIS_R:    HAMSTRING_EXERCISES,
  MUSC_BICEPS_FEMORIS_L:    HAMSTRING_EXERCISES,
  MUSC_SEMITENDINOSUS_R:    HAMSTRING_EXERCISES,
  MUSC_SEMITENDINOSUS_L:    HAMSTRING_EXERCISES,
  MUSC_SEMIMEMBRANOSUS_R:   HAMSTRING_EXERCISES,
  MUSC_SEMIMEMBRANOSUS_L:   HAMSTRING_EXERCISES,
  biceps_femoris:            HAMSTRING_EXERCISES,
  semitendinosus:            HAMSTRING_EXERCISES,
  semimembranosus:           HAMSTRING_EXERCISES,

  // Biceps brachii (left + right share the same recovery protocol)
  MUSC_BICEPS_BRACHII_R:    BICEPS_BRACHII_EXERCISES,
  MUSC_BICEPS_BRACHII_L:    BICEPS_BRACHII_EXERCISES,
  biceps_brachii:            BICEPS_BRACHII_EXERCISES,

  // Quadriceps — all four heads share the same protocol on both sides.
  // Mesh IDs (8) + diagnostic lowercase keys (4) all route to the same set.
  MUSC_RECTUS_FEMORIS_R:      QUADRICEPS_EXERCISES,
  MUSC_RECTUS_FEMORIS_L:      QUADRICEPS_EXERCISES,
  MUSC_VASTUS_LATERALIS_R:    QUADRICEPS_EXERCISES,
  MUSC_VASTUS_LATERALIS_L:    QUADRICEPS_EXERCISES,
  MUSC_VASTUS_MEDIALIS_R:     QUADRICEPS_EXERCISES,
  MUSC_VASTUS_MEDIALIS_L:     QUADRICEPS_EXERCISES,
  MUSC_VASTUS_INTERMEDIUS_R:  QUADRICEPS_EXERCISES,
  MUSC_VASTUS_INTERMEDIUS_L:  QUADRICEPS_EXERCISES,
  rectus_femoris:              QUADRICEPS_EXERCISES,
  vastus_lateralis:            QUADRICEPS_EXERCISES,
  vastus_medialis:             QUADRICEPS_EXERCISES,
  vastus_intermedius:          QUADRICEPS_EXERCISES,
}

// ── Live AI Coach system ──────────────────────────────────────────────────────
// While a video plays, an overlay surfaces three things in rotation —
//   info     : what to do                       (cyan tag)
//   monitor  : what the coach is measuring      (emerald tag, pose-derivable)
//   motivate : encouragement / form reminder    (orange tag)
// plus a live elapsed timer and one exercise-specific metric (joint angle,
// hold time, ROM, reps). Every existing exercise has a hand-written script;
// any future exercise gets a sensible auto-generated fallback.

type CueKind = 'info' | 'monitor' | 'motivate'

interface ExerciseCoaching {
  metric: { label: string; value: string }
  cues:   { kind: CueKind; text: string }[]
}

const COACHING: Record<string, ExerciseCoaching> = {
  /* Deltoid · anterior */
  crab_press:        { metric: { label: 'Angle', value: '95°' }, cues: [
    { kind: 'info',     text: 'Tabletop position — drive the hips up.' },
    { kind: 'monitor',  text: 'Anterior delts engaged.' },
    { kind: 'motivate', text: 'Hold a beat at the top.' }] },
  doorway_stretch:   { metric: { label: 'Hold', value: '25 s' }, cues: [
    { kind: 'info',     text: 'Forearms on the frame, step through.' },
    { kind: 'monitor',  text: 'Chest and anterior delts opening.' },
    { kind: 'motivate', text: 'Slow breath. Let the front lengthen.' }] },
  hand_behind_back:  { metric: { label: 'Hold', value: '20 s' }, cues: [
    { kind: 'info',     text: 'Reach the hand up the back.' },
    { kind: 'monitor',  text: 'Internal rotation mobilising.' },
    { kind: 'motivate', text: 'Only as far as comfort allows.' }] },
  standing_chest:    { metric: { label: 'Hold', value: '30 s' }, cues: [
    { kind: 'info',     text: 'Arm against the frame, step forward.' },
    { kind: 'monitor',  text: 'Pec and anterior delt stretching.' },
    { kind: 'motivate', text: 'Deep, slow breathing.' }] },

  /* Deltoid · lateral / posterior */
  seated_cross_arm:  { metric: { label: 'Hold', value: '25 s' }, cues: [
    { kind: 'info',     text: 'Pull the arm across the chest.' },
    { kind: 'monitor',  text: 'Lateral delt stretching.' },
    { kind: 'motivate', text: 'Feel the back of the shoulder soften.' }] },
  standing_sleeper:  { metric: { label: 'Hold', value: '30 s' }, cues: [
    { kind: 'info',     text: 'Gently rotate the arm down.' },
    { kind: 'monitor',  text: 'Posterior capsule mobilising.' },
    { kind: 'motivate', text: 'Gentle pressure only — never sharp pain.' }] },

  /* Infraspinatus */
  side_lying_er:     { metric: { label: 'Angle', value: '78°' }, cues: [
    { kind: 'info',     text: 'Elbow tucked — rotate the forearm up.' },
    { kind: 'monitor',  text: 'External rotation tracking.' },
    { kind: 'motivate', text: 'Light load, perfect control.' }] },
  wand_rotation:     { metric: { label: 'ROM',   value: '92%' }, cues: [
    { kind: 'info',     text: 'Both hands on the wand, push to the side.' },
    { kind: 'monitor',  text: 'Range improving.' },
    { kind: 'motivate', text: 'Stay relaxed through the shoulder.' }] },
  post_shoulder:     { metric: { label: 'Hold', value: '30 s' }, cues: [
    { kind: 'info',     text: 'Arm across body, gentle pressure.' },
    { kind: 'monitor',  text: 'Posterior cuff lengthening.' },
    { kind: 'motivate', text: 'Breathe through the stretch.' }] },

  /* Supraspinatus */
  wall_climb:        { metric: { label: 'Reach', value: '+5°' }, cues: [
    { kind: 'info',     text: 'Fingers walking up the wall.' },
    { kind: 'monitor',  text: 'Abduction increasing.' },
    { kind: 'motivate', text: 'Stop where it stays pain-free.' }] },
  scapular_reach:    { metric: { label: 'Form', value: '90%' }, cues: [
    { kind: 'info',     text: 'Lying down — reach to the ceiling.' },
    { kind: 'monitor',  text: 'Scapulohumeral rhythm tracking.' },
    { kind: 'motivate', text: 'Smooth protraction and retraction.' }] },
  pendulum:          { metric: { label: 'Tempo', value: 'Smooth' }, cues: [
    { kind: 'info',     text: 'Let the arm hang. Small circles.' },
    { kind: 'monitor',  text: 'Joint decompressing.' },
    { kind: 'motivate', text: 'Let gravity do the work.' }] },

  /* Teres minor */
  high_low_rows:     { metric: { label: 'Reps', value: '8 / 10' }, cues: [
    { kind: 'info',     text: 'Pull high to low — elbow back.' },
    { kind: 'monitor',  text: 'Lower trap & teres minor firing.' },
    { kind: 'motivate', text: 'Squeeze the shoulder blade in.' }] },
  up_back_stretch:   { metric: { label: 'Hold', value: '20 s' }, cues: [
    { kind: 'info',     text: 'Hand up the back — gentle pull.' },
    { kind: 'monitor',  text: 'Posterior cuff stretching.' },
    { kind: 'motivate', text: 'Breathe. Let it release.' }] },
  supported_ext:     { metric: { label: 'Hold', value: '25 s' }, cues: [
    { kind: 'info',     text: 'Forearm supported, lean forward.' },
    { kind: 'monitor',  text: 'Posterior cuff lengthening.' },
    { kind: 'motivate', text: 'Gentle pressure, slow breath.' }] },

  /* Hamstrings */
  hamstring_squeeze: { metric: { label: 'Hold', value: '5 s' }, cues: [
    { kind: 'info',     text: 'Heels dig in — squeeze.' },
    { kind: 'monitor',  text: 'Isometric activation.' },
    { kind: 'motivate', text: '5 on, 5 off. Stay tight.' }] },
  glute_bridge:      { metric: { label: 'Reps', value: '6 / 10' }, cues: [
    { kind: 'info',     text: 'Drive the hips up. Squeeze the glutes.' },
    { kind: 'monitor',  text: 'Hip extension active.' },
    { kind: 'motivate', text: 'Up two, down two — controlled.' }] },
  hip_hinge:         { metric: { label: 'Reps', value: '5 / 10' }, cues: [
    { kind: 'info',     text: 'Hinge at the hips. Soft knees.' },
    { kind: 'monitor',  text: 'Hamstrings loading.' },
    { kind: 'motivate', text: 'Slow eccentric — feel the stretch.' }] },

  /* Biceps brachii */
  bb_flex_ext:        { metric: { label: 'Elbow', value: '92°' }, cues: [
    { kind: 'info',     text: 'Bring the palm to the shoulder.' },
    { kind: 'monitor',  text: 'Elbow angle on target.' },
    { kind: 'motivate', text: "Smooth and controlled — that's the work." }] },
  bb_shoulder_flex:   { metric: { label: 'ROM',   value: '93%' }, cues: [
    { kind: 'info',     text: 'Lift the arm — reach for the ceiling.' },
    { kind: 'monitor',  text: 'Shoulder ROM tracking.' },
    { kind: 'motivate', text: 'A little higher each rep.' }] },
  bb_wall_stretch:    { metric: { label: 'Hold',  value: '22 s' }, cues: [
    { kind: 'info',     text: 'Palm on the wall — turn the body away.' },
    { kind: 'monitor',  text: 'Biceps stretching.' },
    { kind: 'motivate', text: "Breathe through it. Don't bounce." }] },
  bb_ext_rotation:    { metric: { label: 'Rotation', value: '78°' }, cues: [
    { kind: 'info',     text: 'Elbow tucked — rotate the forearm up.' },
    { kind: 'monitor',  text: 'Form steady.' },
    { kind: 'motivate', text: 'Small range, big control.' }] },
  bb_sleeper_stretch: { metric: { label: 'Stretch', value: '64°' }, cues: [
    { kind: 'info',     text: 'Side-lying — gently guide down.' },
    { kind: 'monitor',  text: 'Gentle tension detected.' },
    { kind: 'motivate', text: 'Stretch, not strain.' }] },

  /* Quadriceps */
  qd_wall_squat:          { metric: { label: 'Knee',  value: '90°' }, cues: [
    { kind: 'info',     text: 'Slide down until thighs are level.' },
    { kind: 'monitor',  text: 'Knee flexion approaching 90°.' },
    { kind: 'motivate', text: 'Quads working — stay strong.' }] },
  qd_stiff_deadlift:      { metric: { label: 'Hinge', value: '88°' }, cues: [
    { kind: 'info',     text: 'Hinge at the hips — knees stiff.' },
    { kind: 'monitor',  text: 'Hip hinge tracking.' },
    { kind: 'motivate', text: 'Drive through the heels coming up.' }] },
  qd_quad_stretch_stand:  { metric: { label: 'Hold',  value: '20 s' }, cues: [
    { kind: 'info',     text: 'Pull the foot toward the buttock.' },
    { kind: 'monitor',  text: 'Quad stretch on target.' },
    { kind: 'motivate', text: 'Let the front of the thigh open.' }] },
  qd_quad_stretch_side:   { metric: { label: 'Hold',  value: '25 s' }, cues: [
    { kind: 'info',     text: 'Side-lying — reach for the foot.' },
    { kind: 'monitor',  text: 'Stretch detected.' },
    { kind: 'motivate', text: 'Stay relaxed. Breathe.' }] },
  qd_hamstring_supine:    { metric: { label: 'Hold',  value: '22 s' }, cues: [
    { kind: 'info',     text: 'On your back — lift the leg straight up.' },
    { kind: 'monitor',  text: 'Hamstring lengthening.' },
    { kind: 'motivate', text: "Hold the stretch. Don't bounce." }] },
}

// Fallback for any exercise not explicitly scripted. Reads the label/subtitle
// to decide between a hold/stretch flavour and a movement flavour.
function coachingFor(ex: ExerciseDef): ExerciseCoaching {
  const explicit = COACHING[ex.id]
  if (explicit) return explicit
  const blob = `${ex.label} ${ex.subtitle}`.toLowerCase()
  const isHold = /stretch|stretching|hold/.test(blob)
  return {
    metric: isHold ? { label: 'Hold', value: '20 s' } : { label: 'Form', value: '90%' },
    cues:   isHold
      ? [
          { kind: 'info',     text: `${ex.label} — settle into the position.` },
          { kind: 'monitor',  text: 'Stretch holding.' },
          { kind: 'motivate', text: 'Breathe slow — let it release.' },
        ]
      : [
          { kind: 'info',     text: `${ex.label} — control the movement.` },
          { kind: 'monitor',  text: 'Form within range.' },
          { kind: 'motivate', text: "You're doing great. Keep going." },
        ],
  }
}

// CoachOverlay — renders while the user is actively playing a video. Shows
// a live elapsed timer, one exercise-specific metric chip, a pulsing "Live
// Coach" pill, and a rotating cue card that cycles through info → monitor →
// motivate every 2.8 s. Reset to t=0/cue 0 whenever playback stops.
function CoachOverlay({ playing, coaching }: { playing: boolean; coaching: ExerciseCoaching }) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [cueIdx,    setCueIdx]    = useState(0)

  // Timer tick
  useEffect(() => {
    if (!playing) {
      setElapsedMs(0)
      setCueIdx(0)
      return
    }
    const startedAt = Date.now()
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 500)
    return () => window.clearInterval(id)
  }, [playing])

  // Cue rotation
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(
      () => setCueIdx((i) => (i + 1) % coaching.cues.length),
      2800,
    )
    return () => window.clearInterval(id)
  }, [playing, coaching.cues.length])

  if (!playing) return null

  const total = Math.floor(elapsedMs / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  const cue = coaching.cues[cueIdx]
  const tagColor =
    cue.kind === 'motivate' ? 'text-orange-200'
    : cue.kind === 'info'   ? 'text-cyan-200'
    :                          'text-emerald-200'
  const tagText =
    cue.kind === 'motivate' ? 'Coach'
    : cue.kind === 'info'   ? 'Info'
    :                          'Live'

  return (
    <>
      {/* Top-left: pulsing live-coach pill */}
      <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-md border border-cyan-300/40 bg-slate-950/75 px-1.5 py-0.5 text-[8px] text-cyan-100 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <span className="h-1 w-1 animate-pulse rounded-full bg-cyan-300" />
          <span className="font-semibold uppercase tracking-[0.18em]">Live Coach</span>
        </div>
      </div>

      {/* Top-right: elapsed timer + exercise metric */}
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1">
        <div className="rounded-md border border-white/15 bg-slate-950/75 px-1.5 py-0.5 text-right backdrop-blur-sm">
          <div className="text-[7px] uppercase tracking-[0.16em] text-slate-400 leading-tight">Time</div>
          <div className="text-[10px] font-semibold leading-tight text-cyan-200">{mm}:{ss}</div>
        </div>
        <div className="rounded-md border border-white/15 bg-slate-950/75 px-1.5 py-0.5 text-right backdrop-blur-sm">
          <div className="text-[7px] uppercase tracking-[0.16em] text-slate-400 leading-tight">{coaching.metric.label}</div>
          <div className="text-[10px] font-semibold leading-tight text-orange-200">{coaching.metric.value}</div>
        </div>
      </div>

      {/* Above the label bar: rotating cue */}
      <div
        key={cueIdx}
        className="mm-fade-up pointer-events-none absolute bottom-12 left-1.5 right-1.5 rounded-md border border-white/10 bg-slate-950/85 px-2 py-1 text-[10px] leading-snug text-white shadow-lg backdrop-blur-md"
      >
        <span className={`mr-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] ${tagColor}`}>{tagText}</span>
        {cue.text}
      </div>
    </>
  )
}

// ── Individual video thumbnail card ──────────────────────────────────────────
// The <video> element IS the thumbnail and the player.
// preload="auto" loads the first frame so it's visible immediately.
// Clicking anywhere on the card toggles play / pause.
// When another card becomes active this card auto-pauses via useEffect.

function VideoCard({
  ex,
  isActive,
  onSelect,
  onGuide,
  recommended = false,
}: {
  ex:           ExerciseDef
  isActive:     boolean
  onSelect:     () => void
  onGuide:      (ex: ExerciseDef) => void
  /** True when this exercise scored highest for the user's measured ROM band. */
  recommended?: boolean
}) {
  const videoRef            = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  // Auto-pause when a sibling card is selected
  useEffect(() => {
    if (!isActive) {
      videoRef.current?.pause()
      setPlaying(false)
    }
  }, [isActive])

  // Seek to first frame so the video shows a real thumbnail before any click
  function handleLoaded() {
    const v = videoRef.current
    if (v && v.currentTime === 0) v.currentTime = 0.05
  }

  function handleClick() {
    onSelect()                          // mark this card active (pauses siblings)
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play();  setPlaying(true)  }
    else          { v.pause(); setPlaying(false) }
  }

  return (
    <div
      className={[
        'relative rounded-lg overflow-hidden border transition-colors group',
        isActive
          ? 'border-emerald-500 dark:border-emerald-500'
          : recommended
            ? 'border-amber-400/70 dark:border-amber-500/70 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]'
            : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400/60 dark:hover:border-emerald-600/60',
      ].join(' ')}
    >
      {/* "Recommended" badge — only on top-ranked exercises for the user's ROM */}
      {recommended && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded-md border border-amber-400/70 bg-amber-500/85 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white shadow">
          ★ Recommended
        </div>
      )}
      {/* Video — doubles as thumbnail (first frame) and inline player */}
      <div onClick={handleClick} className="cursor-pointer">
        <video
          ref={videoRef}
          src={ex.src}
          preload="auto"
          playsInline
          muted                            /* always muted — AI coach handles audio */
          className="w-full block bg-black"
          onLoadedData={handleLoaded}
          onEnded={() => setPlaying(false)}
        />

        {/* Play-icon overlay — fades out while playing */}
        <div
          className={[
            'absolute inset-0 flex items-center justify-center transition-opacity duration-150',
            playing
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100 bg-black/38 group-hover:bg-black/28',
          ].join(' ')}
        >
          <div className="w-10 h-10 rounded-full bg-white/22 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
            <Play size={15} className="text-white ml-0.5" fill="white" />
          </div>
        </div>

        {/* Live AI Coach — surfaces while the clip is playing. Provides
            real-time-feeling metrics, a rotating info/monitor/motivate cue,
            and a pulsing "Live Coach" pill. */}
        <CoachOverlay playing={playing} coaching={coachingFor(ex)} />
      </div>

      {/* Label bar — always visible at bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between gap-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white leading-tight truncate">{ex.label}</p>
          <p className="text-[10px] text-white/58 leading-tight">{ex.subtitle}</p>
        </div>
        {/* Guide Me button */}
        <button
          onClick={(e) => { e.stopPropagation(); onGuide(ex) }}
          title="Guide Me — camera form check"
          className="flex-shrink-0 flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold bg-cyan-600/80 hover:bg-cyan-500 text-white backdrop-blur-sm transition-colors"
        >
          <Camera size={10} />
          Guide
        </button>
      </div>
    </div>
  )
}

// ── Exercise tailoring helpers ────────────────────────────────────────────────
//
// Categorise each exercise by load profile so the ranker can match it to the
// user's measured ROM severity.  Keyword-based — cheap but accurate for the
// current catalogue.
type LoadCategory = 'gentle' | 'balanced' | 'loaded'

function categoriseExercise(ex: ExerciseDef): LoadCategory {
  const blob = `${ex.label} ${ex.subtitle}`.toLowerCase()
  if (/squeeze|isometric|pendulum|reach|hold|stretch|sleeper|stretching/.test(blob))
    return 'gentle'
  if (/deadlift|squat|press|row|bridge|hinge|climb|rotation/.test(blob))
    return 'loaded'
  return 'balanced'
}

/** Severity bands from the user's most recent ROM assessments on this muscle. */
type SeverityBand = 'severe' | 'moderate' | 'good' | 'unknown'

function computeSeverity(muscleId: string): { band: SeverityBand; pct: number | null } {
  const records = loadROMHistory().filter((r) => r.muscleId === muscleId)
  if (records.length === 0) return { band: 'unknown', pct: null }
  // Use the best peak per movement, then average percentages across movements.
  const best = new Map<string, { angle: number; ref: number }>()
  for (const r of records) {
    const cur = best.get(r.movementId)
    if (!cur || r.angle > cur.angle) best.set(r.movementId, { angle: r.angle, ref: r.reference })
  }
  const pcts = Array.from(best.values()).map((v) => (v.ref > 0 ? v.angle / v.ref : 0))
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length
  const pct = Math.round(avg * 100)
  if (avg < 0.5)  return { band: 'severe',   pct }
  if (avg < 0.8)  return { band: 'moderate', pct }
  return            { band: 'good',     pct }
}

/** Score table: how much each category fits each severity band. */
const SCORE_MATRIX: Record<SeverityBand, Record<LoadCategory, number>> = {
  severe:   { gentle: 3, balanced: 1, loaded: -2 },
  moderate: { gentle: 2, balanced: 3, loaded:  0 },
  good:     { gentle: 1, balanced: 2, loaded:  3 },
  unknown:  { gentle: 1, balanced: 1, loaded:  1 },  // no preference
}

// ── Exercise video section ────────────────────────────────────────────────────

function ExerciseVideos({ muscleId }: { muscleId: string }) {
  const [activeId, setActiveId]         = useState<string | null>(null)
  const [guidanceEx, setGuidanceEx]     = useState<ExerciseDef | null>(null)

  // When the selection came from the diagnostic tool, use the sub-muscle ID
  // (e.g. 'deltoid_anterior') for a more targeted exercise lookup.
  const subMuscleId = useAtlasStore((s) => s.diagnosticSubMuscleId)

  const effectiveMuscleId = subMuscleId ?? muscleId
  const exercises = (subMuscleId && EXERCISE_MAP[subMuscleId])
    ? EXERCISE_MAP[subMuscleId]
    : EXERCISE_MAP[muscleId]

  // ── Tailor the list to the user's assessment ──────────────────────────
  // Rank exercises by suitability for the user's measured ROM severity.
  // The top two for the band get a "Recommended" badge; the loaded
  // exercises drop down for users with low ROM.
  // Subscribe to ROM changes so the memo re-runs after each assessment.
  const romVersion = useROMVersion()

  const { rankedExercises, severity } = useMemo(() => {
    if (!exercises) return { rankedExercises: [], severity: { band: 'unknown' as SeverityBand, pct: null } }
    const sev = computeSeverity(effectiveMuscleId)
    const scored = exercises.map((ex) => ({
      ex,
      score: SCORE_MATRIX[sev.band][categoriseExercise(ex)],
    }))
    // Stable sort by score descending (preserves original order on ties).
    const ranked = scored
      .map((s, i) => ({ ...s, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
    return { rankedExercises: ranked, severity: sev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, effectiveMuscleId, romVersion])

  if (!exercises) return null

  // Recommend up to top 2 ranked entries IF user has any assessment data.
  const recommendedIds = new Set<string>()
  if (severity.band !== 'unknown') {
    for (let i = 0; i < Math.min(2, rankedExercises.length); i++) {
      if (rankedExercises[i].score > 0) recommendedIds.add(rankedExercises[i].ex.id)
    }
  }

  // Tailoring banner copy — explains WHY the list is ordered this way.
  const banner =
    severity.band === 'severe'
      ? { tone: 'orange' as const, text: `Your measured ROM is ${severity.pct}% of healthy — we've prioritised gentle stretches first and pushed loaded movements down.` }
    : severity.band === 'moderate'
      ? { tone: 'cyan' as const,   text: `Your measured ROM is ${severity.pct}% of healthy — balanced motion is best for you right now.` }
    : severity.band === 'good'
      ? { tone: 'emerald' as const,text: `Your measured ROM is ${severity.pct}% of healthy — full-range work is appropriate.` }
    : null  // no assessment yet — no banner

  const bannerClass =
    banner?.tone === 'orange'
      ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
    : banner?.tone === 'cyan'
      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'

  return (
    <>
      {/* Camera-guided overlay — mounts outside the scrollable panel */}
      {guidanceEx && (
        <ExerciseGuidance
          exerciseId={guidanceEx.id}
          exerciseLabel={guidanceEx.label}
          videoSrc={guidanceEx.src}
          muscleId={effectiveMuscleId}
          onClose={() => setGuidanceEx(null)}
        />
      )}

      <div className="py-2 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">
          <Play size={10} />
          Exercises {banner && <span className="text-slate-400 normal-case tracking-normal">· tailored to your ROM</span>}
        </div>

        {banner && (
          <div className={`mb-2 rounded-md border px-2.5 py-1.5 text-[10px] leading-snug ${bannerClass}`}>
            {banner.text}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {rankedExercises.map(({ ex }) => (
            <VideoCard
              key={ex.id}
              ex={ex}
              isActive={activeId === ex.id}
              onSelect={() => setActiveId(ex.id)}
              onGuide={(e) => setGuidanceEx(e)}
              recommended={recommendedIds.has(ex.id)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

// ── Guided coach-mark: explore exercises + Guide ──────────────────────────────
// Shown in the detail panel the first time a user lands on a muscle, pointing
// down at the exercise list. Retires once dismissed or after they've met the
// step elsewhere (shared with the on-canvas GuideCoach via guideProgress).

function ExploreGuideHint() {
  const seen = useSyncExternalStore(subscribeGuide, getGuideSeen)
  if (seen.has('explore')) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[11px] leading-snug text-cyan-200">
      <ArrowDown size={22} strokeWidth={2.5} className="mt-0.5 flex-shrink-0 animate-bounce text-cyan-300" />
      <span className="flex-1">
        <span className="font-semibold text-white">Your exercises are below.</span>{' '}
        Tap <span className="font-semibold text-white">Guide</span> on any of them to
        have the camera coach check your posture live.
      </span>
      <button
        onClick={() => markGuideSeen('explore')}
        title="Got it"
        className="flex-shrink-0 rounded-full p-0.5 text-cyan-300/70 hover:bg-cyan-500/20 hover:text-white"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ── Section row ───────────────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
}: {
  icon:  React.ReactNode
  label: string
  value: string | undefined | null
}) {
  if (!value) return null
  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{value}</p>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-500 px-4 text-center">
      <MousePointerClick size={32} strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium mb-1">Select a Structure</p>
        <p className="text-xs leading-relaxed">
          Click any muscle in the 3D viewer, or pick one from the list on the left.
        </p>
      </div>
    </div>
  )
}

// ── Pain Voice Button ──────────────────────────────────────────────────────────

/** Expand common medical shorthand so the TTS reads them as words, not letters. */
function prepareTextForSpeech(raw: string): string {
  return raw
    // Anatomical directions
    .replace(/\bant\./gi, 'anterior')
    .replace(/\bpost\./gi, 'posterior')
    .replace(/\blat\./gi, 'lateral')
    .replace(/\bmed\./gi, 'medial')
    .replace(/\bsup\./gi, 'superior')
    .replace(/\binf\./gi, 'inferior')
    // Common abbreviations
    .replace(/\bm\./gi, 'muscle')
    .replace(/\bnn?\./gi, 'nerve')
    .replace(/\bv\./gi, 'vein')
    .replace(/\ba\./gi, 'artery')
    .replace(/\bL(\d)/g, 'lumbar $1')
    .replace(/\bC(\d)/g, 'cervical $1')
    .replace(/\bT(\d)/g, 'thoracic $1')
    // Ensure sentences have breathing room (comma before conjunctions in long text)
    .replace(/([^,])\s+(and|but|which|causing|resulting)\s/gi, '$1, $2 ')
    // Replace semicolons with commas for more natural pausing
    .replace(/;/g, ',')
    .trim()
}

/** Pick the most human-sounding available voice. */
function pickBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  // 1. Microsoft Neural voices (Edge/Windows — best quality available in browser)
  const msNeural = voices.find((v) =>
    v.name.includes('Natural') && v.name.startsWith('Microsoft') && v.lang.startsWith('en')
  )
  if (msNeural) return msNeural

  // 2. Any Microsoft online English voice
  const msOnline = voices.find((v) =>
    v.name.startsWith('Microsoft') && !v.localService && v.lang.startsWith('en')
  )
  if (msOnline) return msOnline

  // 3. Google online voices (Chrome)
  const google = voices.find((v) =>
    v.name.startsWith('Google') && v.lang.startsWith('en')
  )
  if (google) return google

  // 4. Any online (server-side) English voice
  const onlineEn = voices.find((v) => v.lang.startsWith('en') && !v.localService)
  if (onlineEn) return onlineEn

  // 5. Preferred local voices (macOS / iOS — actually sound decent)
  const goodLocals = ['Samantha', 'Karen', 'Tessa', 'Nicky', 'Alex']
  for (const name of goodLocals) {
    const v = voices.find((v) => v.name === name)
    if (v) return v
  }

  // 6. Any English voice
  return voices.find((v) => v.lang.startsWith('en')) ?? voices[0] ?? null
}

function PainVoiceButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Voices load asynchronously in Chrome; re-render when ready
  const [voicesReady, setVoicesReady] = useState(false)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const update = () => setVoicesReady(window.speechSynthesis.getVoices().length > 0)
    window.speechSynthesis.addEventListener('voiceschanged', update)
    if (window.speechSynthesis.getVoices().length > 0) setVoicesReady(true)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  // Stop if the displayed text changes (user switched muscle)
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); setSpeaking(false) }
  }, [text])

  if (!('speechSynthesis' in window)) return null

  const play = () => {
    const synth = window.speechSynthesis
    synth.cancel()

    const cleaned = prepareTextForSpeech(text)
    const utt = new SpeechSynthesisUtterance(cleaned)
    const voice = pickBestVoice()
    if (voice) utt.voice = voice

    // Slightly slower than default so neural voices sound measured, not rushed.
    // Pitch stays at 1.0 (neutral) — neural voices already have natural inflection
    // baked in; nudging pitch higher makes them sound synthetic.
    utt.rate  = 0.90
    utt.pitch = 1.0
    utt.lang  = 'en-US'
    utt.onend   = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    utterRef.current = utt
    setSpeaking(true)
    synth.speak(utt)
  }

  const stop = () => { window.speechSynthesis.cancel(); setSpeaking(false) }

  return (
    <button
      onClick={speaking ? stop : play}
      disabled={!voicesReady}
      title={speaking ? 'Stop' : 'Read aloud'}
      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {speaking
        ? <Square size={10} fill="currentColor" />
        : <Volume2 size={10} />
      }
    </button>
  )
}

// ── Likely Sources Component ───────────────────────────────────────────────────

function LikelySources({ result, onClose }: { result: DiagnosticResult; onClose?: () => void }) {
  const setSelected        = useAtlasStore((s) => s.setSelected)
  const setHovered         = useAtlasStore((s) => s.setHovered)
  const setDiagnosticPulse = useAtlasStore((s) => s.setDiagnosticPulse)
  const setDiagnostic      = useAtlasStore((s) => s.setDiagnostic)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const { contributions, clickPoint } = result
  const clickVec = useMemo(() => new THREE.Vector3(...clickPoint), [clickPoint])
  const grouped  = useMemo(() => groupContributionsForDisplay(contributions), [contributions])

  const hoverItem = (meshIds: string[]) => {
    const id = pickSideFromClick(meshIds, clickVec)
    if (!id) return
    setHovered(id)
    setDiagnosticPulse(id)
  }
  const unhoverItem = () => { setHovered(null); setDiagnosticPulse(null) }

  const selectItem = (meshIds: string[]) => {
    const id = pickSideFromClick(meshIds, clickVec)
    if (!id) return
    setDiagnosticPulse(null)
    setDiagnostic(null)   // also clears candidateIds via store action
    setSelected(id)
  }

  const toggleGroup = (label: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      return next
    })

  // Bar color helpers
  const barColor = (matchType: 'primary' | 'referred' | 'mixed') =>
    matchType === 'primary' ? '#FF8C00' : matchType === 'mixed' ? '#F59E0B' : '#B45309'

  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700/60">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-wide">
          <Activity size={10} />
          Likely Sources
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="truncate max-w-[110px]">{result.clickedZones.slice(0, 2).join(', ')}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 ml-1 flex-shrink-0"
              aria-label="Dismiss"
            >✕</button>
          )}
        </div>
      </div>

      {contributions.length === 0 ? (
        <p className="text-xs text-slate-400 px-1">No patterns match this area.</p>
      ) : (
        <ul className="space-y-1">
          {grouped.map((item: DiagnosticDisplayItem) => {
            if (isGrouped(item)) {
              const isExpanded = expandedGroups.has(item.label)
              return (
                <li key={item.label}>
                  {/* Group header */}
                  <div
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/60 transition-colors"
                    onMouseEnter={() => hoverItem(item.meshIds)}
                    onMouseLeave={unhoverItem}
                    onClick={() => toggleGroup(item.label)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-slate-400 flex-shrink-0">
                        {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </span>
                      <span className="text-sm font-medium text-slate-200 truncate">{item.label}</span>
                      <span className="text-[10px] text-slate-500 ml-0.5 flex-shrink-0">group</span>
                    </div>
                    <div className="ml-3 flex w-24 items-center gap-2 flex-shrink-0">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full transition-all"
                          style={{
                            width:           `${Math.min(100, Math.round(item.totalProbability * 100))}%`,
                            backgroundColor: barColor(item.matchType),
                          }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-neutral-200">
                        {Math.round(item.totalProbability * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Children — collapsed by default */}
                  {isExpanded && (
                    <ul className="ml-5 mt-0.5 space-y-0.5">
                      {item.members.map((child) => (
                        <li key={child.muscle_id}>
                          <button
                            onMouseEnter={() => hoverItem(child.meshIds)}
                            onMouseLeave={unhoverItem}
                            onClick={() => selectItem(child.meshIds)}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-slate-700/60 transition-colors"
                          >
                            <span className="text-xs text-slate-300 truncate flex-1">{child.common_name}</span>
                            <div className="ml-3 flex w-20 items-center gap-2 flex-shrink-0">
                              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
                                <div
                                  className="absolute left-0 top-0 h-full rounded-full"
                                  style={{
                                    width:           `${Math.round(child.probability * 100)}%`,
                                    backgroundColor: barColor(child.matchType),
                                  }}
                                />
                              </div>
                              <span className="w-8 text-right text-[10px] tabular-nums text-neutral-400">
                                {Math.round(child.probability * 100)}%
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            }

            // Flat muscle row — TypeScript narrowing: after isGrouped guard, item is MuscleContribution
            const flat = item as MuscleContribution
            return (
              <li key={flat.muscle_id}>
                <button
                  onMouseEnter={() => hoverItem(flat.meshIds)}
                  onMouseLeave={unhoverItem}
                  onClick={() => selectItem(flat.meshIds)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-800/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-200 truncate">{flat.common_name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {flat.matchType === 'primary' ? 'primary zone' : 'referred zone'}
                    </div>
                  </div>
                  <div className="ml-3 flex w-24 items-center gap-2 flex-shrink-0">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width:           `${Math.round(flat.probability * 100)}%`,
                          backgroundColor: barColor(flat.matchType),
                        }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-neutral-200">
                      {Math.round(flat.probability * 100)}%
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function MetadataPanel() {
  const selectedId       = useAtlasStore((s) => s.selectedId)
  const diagnosticResult = useAtlasStore((s) => s.diagnosticResult)
  const sceneIndex       = useAtlasStore((s) => s.sceneIndex)
  const hideSelected     = useAtlasStore((s) => s.hideSelected)
  const isolateSelected  = useAtlasStore((s) => s.isolateSelected)
  const isolateMode      = useAtlasStore((s) => s.isolateMode)
  const exitIsolate      = useAtlasStore((s) => s.exitIsolate)
  const showPainOverlay  = useAtlasStore((s) => s.showPainOverlay)
  const togglePainOverlay = useAtlasStore((s) => s.togglePainOverlay)
  const [speaking, setSpeaking] = useState(false)
  // Researcher-grade anatomy/pain reference is collapsed by default so it never
  // buries the primary flow (exercises + progress).
  const [detailsOpen, setDetailsOpen] = useState(false)

  const meta = selectedId ? sceneIndex.metadataById.get(selectedId) : undefined
  const pain = selectedId ? PAIN_PATTERNS[selectedId] : undefined

  if (!selectedId && !diagnosticResult) return <EmptyState />

  const speakPainPattern = () => {
    if (!pain || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(pain.description)
    utter.rate = 0.95
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utter)
  }

  const stopPainPattern = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug mb-2">
          {meta?.displayName}
        </h2>
        <div className="flex flex-wrap gap-1">
          <Badge color={systemBadgeColor(meta?.system ?? 'muscle')}>
            {SYSTEM_LABELS[meta?.system ?? ''] ?? meta?.system}
          </Badge>
          <Badge color={layerBadgeColor(meta?.layer ?? 'superficial')}>
            {LAYER_LABELS[meta?.layer ?? ''] ?? meta?.layer}
          </Badge>
          <Badge color="slate">
            {SIDE_LABELS[meta?.side ?? ''] ?? meta?.side}
          </Badge>
          <Badge color="slate">
            {REGION_LABELS[meta?.region ?? ''] ?? meta?.region}
          </Badge>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <Button size="sm" variant="secondary" onClick={hideSelected}>
          Hide
        </Button>
        <Button
          size="sm"
          variant={isolateMode ? 'primary' : 'secondary'}
          onClick={isolateMode ? exitIsolate : isolateSelected}
        >
          {isolateMode ? 'Exit Isolate' : 'Isolate'}
        </Button>
      </div>

      {/* Scrollable detail rows — action-first. The exercises + progress lead;
          the anatomy/pain reference is tucked into a collapsible block so it
          never buries what the user actually came to do. */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {selectedId && <ExploreGuideHint />}
        {selectedId && <ExerciseVideos muscleId={selectedId} />}

        {/* Progress Assessment */}
        <AssessmentMount muscleName={meta?.displayName ?? null} selectedId={selectedId} />

        {/* Collapsible anatomy + pain reference (formerly always-on rows) */}
        {(pain || meta?.origin || meta?.action || meta?.notes) && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => setDetailsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
              aria-expanded={detailsOpen}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Info size={12} />
                Anatomy &amp; pain details
              </span>
              {detailsOpen
                ? <ChevronDown size={14} className="text-slate-400" />
                : <ChevronRight size={14} className="text-slate-400" />}
            </button>
            {detailsOpen && (
              <div className="px-3 pb-2">
                <MetaRow
                  icon={<Activity size={10} />}
                  label="Pain Referral Pattern"
                  value={pain?.description}
                />
                {pain && (
                  <div className="mb-2 -mt-1 flex items-center justify-end gap-2">
                    <button
                      onClick={speaking ? stopPainPattern : speakPainPattern}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      title="Read pain referral pattern aloud"
                    >
                      {speaking ? <Square size={10} /> : <Mic size={10} />}
                      {speaking ? 'Stop voice' : 'Voice'}
                    </button>
                    <button
                      onClick={togglePainOverlay}
                      className={[
                        'text-[10px] px-2 py-0.5 rounded border font-medium transition-colors',
                        showPainOverlay
                          ? 'border-red-300 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700'
                          : 'border-slate-200 text-slate-400 bg-transparent dark:border-slate-600',
                      ].join(' ')}
                    >
                      {showPainOverlay ? '● Pain map On' : '○ Pain map Off'}
                    </button>
                  </div>
                )}
                <MetaRow icon={<MapPin size={10} />}     label="Origin"       value={meta?.origin} />
                <MetaRow icon={<Zap size={10} />}        label="Action"       value={meta?.action} />
                <MetaRow icon={<StickyNote size={10} />} label="Intervention" value={meta?.notes} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
