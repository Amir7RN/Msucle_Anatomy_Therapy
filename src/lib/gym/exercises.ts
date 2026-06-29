/**
 * gym/exercises.ts
 *
 * The MoveMate Train catalogue — a gym-training library grouped by body part,
 * deliberately separate from the pain / rehab content. Every entry is
 * self-describing so the generic tracker (gym/tracker.ts) can drive a live rep
 * count + muscle-activation readout straight from MediaPipe landmarks, with no
 * per-exercise glue code.
 *
 * Media: we reuse the local clips that ship with the app where one fits, and
 * fall back to a clean on-brand SVG illustration otherwise (no external/CDN
 * dependency, no licensing risk). The `video` field is wired so an open-source
 * clip set can be dropped in per exercise later without touching the UI.
 */

import { LM } from '../movement/landmarks'

export type MuscleGroupId =
  | 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core'

/** Which joint the rep counter watches, and on which side(s). */
export type TrackedJoint = 'elbow' | 'knee' | 'shoulder' | 'hip'
export type TrackedSide = 'left' | 'right' | 'both'

/**
 * Rep/activation config. The tracker measures the angle at `joint` (both sides
 * averaged when `side === 'both'`). The muscle is "contracted" when the angle
 * is at the `contractAt` end of `range`; a rep is logged each time the user
 * enters the contracted zone, holds, and returns.
 */
export interface TrackConfig {
  joint:      TrackedJoint
  side:       TrackedSide
  /** Whether peak contraction is the SMALL angle (e.g. curl, squat) or the LARGE angle (e.g. press, raise). */
  contractAt: 'low' | 'high'
  /** [lengthened°, shortened°] working range used to scale activation 0→1. */
  range:      [number, number]
}

export interface ExerciseMedia {
  /** Path under /public served at runtime, or null to use the SVG fallback. */
  video:  string | null
  /** Accent-tinted illustration glyph used for the fallback thumbnail. */
  glyph:  'press' | 'row' | 'raise' | 'curl' | 'squat' | 'hinge' | 'core' | 'pull'
}

export interface Exercise {
  id:        string
  name:      string
  group:     MuscleGroupId
  /** Short "what it trains" line. */
  focus:     string
  equipment: 'bodyweight' | 'dumbbell' | 'barbell' | 'machine' | 'band' | 'kettlebell'
  level:     'beginner' | 'intermediate' | 'advanced'
  /** Muscles that light up in the activation panel (primary first). */
  primary:   string[]
  secondary: string[]
  /** 2-4 short coaching cues spoken/shown during the set. */
  cues:      string[]
  repGoal:   number
  sets:      number
  track:     TrackConfig
  media:     ExerciseMedia
}

export interface MuscleGroup {
  id:       MuscleGroupId
  name:     string
  tagline:  string
  /** Muscles listed on the group card. */
  muscles:  string[]
  /** Tailwind accent tokens for the amber/energetic theme (kept warm + distinct per group). */
  accent:   { from: string; to: string; ring: string; text: string; glow: string }
}

export const MUSCLE_GROUPS: MuscleGroup[] = [
  {
    id: 'chest', name: 'Chest', tagline: 'Press & push power',
    muscles: ['Pectoralis major', 'Pectoralis minor', 'Serratus anterior'],
    accent: { from: 'from-amber-500', to: 'to-orange-600', ring: 'ring-amber-400/40', text: 'text-amber-300', glow: 'shadow-amber-500/30' },
  },
  {
    id: 'back', name: 'Back', tagline: 'Pull & posture',
    muscles: ['Latissimus dorsi', 'Trapezius', 'Rhomboids', 'Erector spinae'],
    accent: { from: 'from-orange-500', to: 'to-red-600', ring: 'ring-orange-400/40', text: 'text-orange-300', glow: 'shadow-orange-500/30' },
  },
  {
    id: 'shoulders', name: 'Shoulders', tagline: 'Caps & overhead',
    muscles: ['Anterior deltoid', 'Lateral deltoid', 'Posterior deltoid', 'Rotator cuff'],
    accent: { from: 'from-yellow-500', to: 'to-amber-600', ring: 'ring-yellow-400/40', text: 'text-yellow-300', glow: 'shadow-yellow-500/30' },
  },
  {
    id: 'arms', name: 'Arms', tagline: 'Biceps & triceps',
    muscles: ['Biceps brachii', 'Triceps brachii', 'Brachialis', 'Forearms'],
    accent: { from: 'from-amber-600', to: 'to-rose-600', ring: 'ring-amber-400/40', text: 'text-amber-300', glow: 'shadow-amber-500/30' },
  },
  {
    id: 'legs', name: 'Legs', tagline: 'Drive & strength',
    muscles: ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves'],
    accent: { from: 'from-orange-600', to: 'to-amber-500', ring: 'ring-orange-400/40', text: 'text-orange-300', glow: 'shadow-orange-500/30' },
  },
  {
    id: 'core', name: 'Core', tagline: 'Brace & control',
    muscles: ['Rectus abdominis', 'Obliques', 'Transverse abdominis'],
    accent: { from: 'from-amber-400', to: 'to-orange-500', ring: 'ring-amber-300/40', text: 'text-amber-200', glow: 'shadow-amber-400/30' },
  },
]

export const muscleGroupById = (id: MuscleGroupId): MuscleGroup =>
  MUSCLE_GROUPS.find((g) => g.id === id)!

// ─────────────────────────────────────────────────────────────────────────────
//  Exercise catalogue
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISES: Exercise[] = [
  // ── CHEST ──────────────────────────────────────────────────────────────────
  {
    id: 'push_up', name: 'Push-up', group: 'chest', focus: 'Bodyweight horizontal press',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Pectoralis major'], secondary: ['Anterior deltoid', 'Triceps brachii'],
    cues: ['Hands under shoulders', 'Lower with a tight body line', 'Elbows ~45° from torso', 'Press the floor away'],
    repGoal: 12, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'low', range: [85, 165] },
    media: { video: '/videos/Crab_Press.mp4', glyph: 'press' },
  },
  {
    id: 'db_bench_press', name: 'Dumbbell Bench Press', group: 'chest', focus: 'Mid-chest mass',
    equipment: 'dumbbell', level: 'intermediate',
    primary: ['Pectoralis major'], secondary: ['Anterior deltoid', 'Triceps brachii'],
    cues: ['Shoulder blades pinched', 'Lower to mid-chest', 'Press up and slightly in', 'Control the descent'],
    repGoal: 10, sets: 4,
    track: { joint: 'elbow', side: 'both', contractAt: 'high', range: [80, 170] },
    media: { video: null, glyph: 'press' },
  },
  {
    id: 'incline_press', name: 'Incline Press', group: 'chest', focus: 'Upper chest',
    equipment: 'dumbbell', level: 'intermediate',
    primary: ['Pectoralis major (clavicular)'], secondary: ['Anterior deltoid'],
    cues: ['Bench ~30–45°', 'Wrists stacked over elbows', 'Drive up, don’t flare', 'Full lockout'],
    repGoal: 10, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'high', range: [80, 170] },
    media: { video: null, glyph: 'press' },
  },
  {
    id: 'chest_fly', name: 'Chest Fly', group: 'chest', focus: 'Pec stretch & squeeze',
    equipment: 'dumbbell', level: 'intermediate',
    primary: ['Pectoralis major'], secondary: ['Anterior deltoid'],
    cues: ['Soft elbows, hold the angle', 'Open wide to a stretch', 'Hug the weights together', 'Squeeze at the top'],
    repGoal: 12, sets: 3,
    track: { joint: 'shoulder', side: 'both', contractAt: 'low', range: [20, 95] },
    media: { video: '/videos/Standing_Chest_Stretch.mp4', glyph: 'press' },
  },
  {
    id: 'dips', name: 'Chest Dips', group: 'chest', focus: 'Lower chest & triceps',
    equipment: 'bodyweight', level: 'advanced',
    primary: ['Pectoralis major (sternal)'], secondary: ['Triceps brachii', 'Anterior deltoid'],
    cues: ['Lean torso forward', 'Lower under control', 'Elbows track back', 'Press to lockout'],
    repGoal: 8, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'high', range: [80, 170] },
    media: { video: null, glyph: 'press' },
  },

  // ── BACK ───────────────────────────────────────────────────────────────────
  {
    id: 'bent_row', name: 'Bent-over Row', group: 'back', focus: 'Mid-back thickness',
    equipment: 'dumbbell', level: 'intermediate',
    primary: ['Latissimus dorsi', 'Rhomboids'], secondary: ['Biceps brachii', 'Trapezius'],
    cues: ['Hinge to ~45°', 'Flat back, braced core', 'Drive elbows past ribs', 'Squeeze shoulder blades'],
    repGoal: 10, sets: 4,
    track: { joint: 'elbow', side: 'both', contractAt: 'low', range: [70, 165] },
    media: { video: '/videos/High_To_Low_Rows.mp4', glyph: 'row' },
  },
  {
    id: 'lat_pulldown', name: 'Lat Pulldown', group: 'back', focus: 'Lat width',
    equipment: 'machine', level: 'beginner',
    primary: ['Latissimus dorsi'], secondary: ['Biceps brachii', 'Rhomboids'],
    cues: ['Tall chest, slight lean', 'Pull the bar to collarbone', 'Drive elbows down', 'Control back up'],
    repGoal: 12, sets: 3,
    track: { joint: 'shoulder', side: 'both', contractAt: 'low', range: [30, 160] },
    media: { video: null, glyph: 'pull' },
  },
  {
    id: 'one_arm_row', name: 'One-arm Row', group: 'back', focus: 'Unilateral lat',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Latissimus dorsi'], secondary: ['Trapezius', 'Biceps brachii'],
    cues: ['Brace on the bench', 'Flat back', 'Row to the hip', 'Full stretch at the bottom'],
    repGoal: 10, sets: 3,
    track: { joint: 'elbow', side: 'right', contractAt: 'low', range: [70, 165] },
    media: { video: null, glyph: 'row' },
  },
  {
    id: 'face_pull', name: 'Face Pull', group: 'back', focus: 'Rear delts & traps',
    equipment: 'band', level: 'beginner',
    primary: ['Posterior deltoid', 'Trapezius'], secondary: ['Rhomboids', 'Rotator cuff'],
    cues: ['Pull to the eyes', 'Elbows high', 'Externally rotate', 'Pause and squeeze'],
    repGoal: 15, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'low', range: [70, 160] },
    media: { video: '/videos/Pendulum_Swing.mp4', glyph: 'pull' },
  },
  {
    id: 'superman', name: 'Superman', group: 'back', focus: 'Lower-back endurance',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Erector spinae'], secondary: ['Glutes', 'Posterior deltoid'],
    cues: ['Lie face down', 'Lift chest and thighs', 'Reach long', 'Lower with control'],
    repGoal: 12, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'high', range: [150, 185] },
    media: { video: null, glyph: 'hinge' },
  },

  // ── SHOULDERS ────────────────────────────────────────────────────────────────
  {
    id: 'overhead_press', name: 'Overhead Press', group: 'shoulders', focus: 'Overhead strength',
    equipment: 'dumbbell', level: 'intermediate',
    primary: ['Anterior deltoid', 'Lateral deltoid'], secondary: ['Triceps brachii', 'Trapezius'],
    cues: ['Stack wrists over elbows', 'Brace ribs down', 'Press to a full lockout', 'Lower to ear height'],
    repGoal: 10, sets: 4,
    track: { joint: 'shoulder', side: 'both', contractAt: 'high', range: [60, 170] },
    media: { video: null, glyph: 'press' },
  },
  {
    id: 'lateral_raise', name: 'Lateral Raise', group: 'shoulders', focus: 'Side-delt caps',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Lateral deltoid'], secondary: ['Trapezius'],
    cues: ['Soft elbows', 'Lead with the elbows', 'Up to shoulder height', 'Lower slowly'],
    repGoal: 15, sets: 3,
    track: { joint: 'shoulder', side: 'both', contractAt: 'high', range: [15, 95] },
    media: { video: '/videos/Wall_Climb_To_The_Side.mp4', glyph: 'raise' },
  },
  {
    id: 'front_raise', name: 'Front Raise', group: 'shoulders', focus: 'Front-delt',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Anterior deltoid'], secondary: ['Pectoralis major (clavicular)'],
    cues: ['Raise to eye level', 'No swinging', 'Control the lower', 'Brace the core'],
    repGoal: 12, sets: 3,
    track: { joint: 'shoulder', side: 'both', contractAt: 'high', range: [15, 95] },
    media: { video: '/videos/Scapular_Arm_Reach_Lying_Down.mp4', glyph: 'raise' },
  },
  {
    id: 'rear_delt_fly', name: 'Rear-delt Fly', group: 'shoulders', focus: 'Rear-delt & posture',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Posterior deltoid'], secondary: ['Rhomboids', 'Trapezius'],
    cues: ['Hinge forward', 'Open arms wide', 'Squeeze the rear delts', 'Lower with control'],
    repGoal: 15, sets: 3,
    track: { joint: 'shoulder', side: 'both', contractAt: 'high', range: [15, 90] },
    media: { video: '/videos/Side_Lying_External_Rotation.mp4', glyph: 'raise' },
  },
  {
    id: 'ext_rotation', name: 'External Rotation', group: 'shoulders', focus: 'Rotator-cuff health',
    equipment: 'band', level: 'beginner',
    primary: ['Rotator cuff (infraspinatus)'], secondary: ['Posterior deltoid'],
    cues: ['Elbow pinned to the side', 'Rotate the forearm out', 'Slow and controlled', 'Keep the wrist neutral'],
    repGoal: 15, sets: 3,
    track: { joint: 'shoulder', side: 'both', contractAt: 'high', range: [10, 70] },
    media: { video: '/videos/Wand_Rotation.mp4', glyph: 'raise' },
  },

  // ── ARMS ─────────────────────────────────────────────────────────────────────
  {
    id: 'biceps_curl', name: 'Biceps Curl', group: 'arms', focus: 'Biceps peak',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Biceps brachii'], secondary: ['Brachialis', 'Forearms'],
    cues: ['Elbows pinned', 'Curl to a full squeeze', 'No swinging', 'Lower slowly'],
    repGoal: 12, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'low', range: [45, 165] },
    media: { video: null, glyph: 'curl' },
  },
  {
    id: 'hammer_curl', name: 'Hammer Curl', group: 'arms', focus: 'Brachialis & forearm',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Brachialis', 'Biceps brachii'], secondary: ['Forearms'],
    cues: ['Neutral grip', 'Curl straight up', 'Pause at the top', 'Control down'],
    repGoal: 12, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'low', range: [45, 165] },
    media: { video: null, glyph: 'curl' },
  },
  {
    id: 'triceps_ext', name: 'Overhead Triceps Extension', group: 'arms', focus: 'Triceps long head',
    equipment: 'dumbbell', level: 'intermediate',
    primary: ['Triceps brachii'], secondary: ['Forearms'],
    cues: ['Elbows by the ears', 'Lower behind the head', 'Extend to lockout', 'Keep elbows still'],
    repGoal: 12, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'high', range: [55, 170] },
    media: { video: '/videos/Supported_Extensor_Stretch.mp4', glyph: 'press' },
  },
  {
    id: 'triceps_kickback', name: 'Triceps Kickback', group: 'arms', focus: 'Triceps lockout',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Triceps brachii'], secondary: [],
    cues: ['Hinge forward', 'Upper arm parallel', 'Extend fully back', 'Squeeze the triceps'],
    repGoal: 15, sets: 3,
    track: { joint: 'elbow', side: 'both', contractAt: 'high', range: [55, 170] },
    media: { video: null, glyph: 'press' },
  },
  {
    id: 'concentration_curl', name: 'Concentration Curl', group: 'arms', focus: 'Isolated biceps',
    equipment: 'dumbbell', level: 'beginner',
    primary: ['Biceps brachii'], secondary: ['Brachialis'],
    cues: ['Elbow on the inner thigh', 'Curl slow', 'Full squeeze', 'Lower all the way'],
    repGoal: 12, sets: 3,
    track: { joint: 'elbow', side: 'right', contractAt: 'low', range: [45, 165] },
    media: { video: null, glyph: 'curl' },
  },

  // ── LEGS ─────────────────────────────────────────────────────────────────────
  {
    id: 'bodyweight_squat', name: 'Bodyweight Squat', group: 'legs', focus: 'Quad & glute pattern',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Quadriceps', 'Glutes'], secondary: ['Hamstrings', 'Core'],
    cues: ['Feet shoulder-width', 'Sit back and down', 'Knees track over toes', 'Drive through mid-foot'],
    repGoal: 15, sets: 3,
    track: { joint: 'knee', side: 'both', contractAt: 'low', range: [80, 170] },
    media: { video: null, glyph: 'squat' },
  },
  {
    id: 'goblet_squat', name: 'Goblet Squat', group: 'legs', focus: 'Loaded quad/glute',
    equipment: 'kettlebell', level: 'intermediate',
    primary: ['Quadriceps', 'Glutes'], secondary: ['Core', 'Adductors'],
    cues: ['Hold the weight at the chest', 'Elbows inside the knees', 'Sit to depth', 'Stand tall and squeeze'],
    repGoal: 12, sets: 4,
    track: { joint: 'knee', side: 'both', contractAt: 'low', range: [80, 170] },
    media: { video: null, glyph: 'squat' },
  },
  {
    id: 'reverse_lunge', name: 'Reverse Lunge', group: 'legs', focus: 'Single-leg strength',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Quadriceps', 'Glutes'], secondary: ['Hamstrings'],
    cues: ['Step back, drop the knee', 'Front shin vertical', 'Torso tall', 'Drive up through the heel'],
    repGoal: 12, sets: 3,
    track: { joint: 'knee', side: 'both', contractAt: 'low', range: [80, 170] },
    media: { video: null, glyph: 'squat' },
  },
  {
    id: 'hip_hinge', name: 'Hip Hinge / RDL', group: 'legs', focus: 'Hamstrings & glutes',
    equipment: 'dumbbell', level: 'intermediate',
    primary: ['Hamstrings', 'Glutes'], secondary: ['Erector spinae'],
    cues: ['Soft knees', 'Push hips back', 'Flat back, weights close', 'Squeeze glutes to stand'],
    repGoal: 12, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'low', range: [95, 175] },
    media: { video: '/videos/Hip_Hinge_Exercise.mp4', glyph: 'hinge' },
  },
  {
    id: 'glute_bridge', name: 'Glute Bridge', group: 'legs', focus: 'Glute activation',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Glutes'], secondary: ['Hamstrings', 'Core'],
    cues: ['Heels close to hips', 'Ribs down', 'Drive hips to the ceiling', 'Squeeze hard at the top'],
    repGoal: 15, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'high', range: [120, 178] },
    media: { video: '/videos/Glute_Bridge_Exercise.mp4', glyph: 'hinge' },
  },
  {
    id: 'calf_raise', name: 'Standing Calf Raise', group: 'legs', focus: 'Calves',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Calves (gastrocnemius)'], secondary: ['Soleus'],
    cues: ['Stand tall', 'Rise onto the toes', 'Pause at the top', 'Lower for a stretch'],
    repGoal: 20, sets: 3,
    track: { joint: 'knee', side: 'both', contractAt: 'high', range: [165, 182] },
    media: { video: null, glyph: 'squat' },
  },

  // ── CORE ─────────────────────────────────────────────────────────────────────
  {
    id: 'crunch', name: 'Crunch', group: 'core', focus: 'Upper-ab flexion',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Rectus abdominis'], secondary: ['Obliques'],
    cues: ['Lower back stays down', 'Curl the ribs to the hips', 'Exhale up', 'Lower slowly'],
    repGoal: 15, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'low', range: [110, 165] },
    media: { video: null, glyph: 'core' },
  },
  {
    id: 'leg_raise', name: 'Lying Leg Raise', group: 'core', focus: 'Lower-ab control',
    equipment: 'bodyweight', level: 'intermediate',
    primary: ['Rectus abdominis (lower)'], secondary: ['Hip flexors'],
    cues: ['Press the low back down', 'Lift legs to vertical', 'Lower under control', 'Stop before the back arches'],
    repGoal: 12, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'low', range: [90, 170] },
    media: { video: null, glyph: 'core' },
  },
  {
    id: 'bicycle', name: 'Bicycle Crunch', group: 'core', focus: 'Obliques & rotation',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Obliques'], secondary: ['Rectus abdominis'],
    cues: ['Opposite elbow to knee', 'Slow and deliberate', 'Reach the leg long', 'Rotate from the trunk'],
    repGoal: 20, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'low', range: [110, 165] },
    media: { video: null, glyph: 'core' },
  },
  {
    id: 'plank', name: 'Plank (hold)', group: 'core', focus: 'Anti-extension brace',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Transverse abdominis', 'Rectus abdominis'], secondary: ['Obliques', 'Glutes'],
    cues: ['Elbows under shoulders', 'Straight line head-to-heels', 'Squeeze glutes', 'Breathe steadily'],
    repGoal: 1, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'high', range: [150, 185] },
    media: { video: null, glyph: 'core' },
  },
  {
    id: 'mountain_climber', name: 'Mountain Climber', group: 'core', focus: 'Dynamic core + cardio',
    equipment: 'bodyweight', level: 'beginner',
    primary: ['Rectus abdominis', 'Hip flexors'], secondary: ['Obliques', 'Anterior deltoid'],
    cues: ['Strong plank base', 'Drive knees to chest', 'Hips low', 'Quick, controlled tempo'],
    repGoal: 20, sets: 3,
    track: { joint: 'hip', side: 'both', contractAt: 'low', range: [100, 170] },
    media: { video: null, glyph: 'core' },
  },
]

export const exercisesForGroup = (group: MuscleGroupId): Exercise[] =>
  EXERCISES.filter((e) => e.group === group)

export const exerciseById = (id: string): Exercise | undefined =>
  EXERCISES.find((e) => e.id === id)

/**
 * Landmark triplet (a-b-c, angle measured at b) for a tracked joint on a side.
 * 'both' resolves to the right side here; the tracker also reads the left and
 * averages, so this is just the canonical lookup.
 */
export function jointTriplet(joint: TrackedJoint, side: 'left' | 'right'): [number, number, number] {
  const L = side === 'left'
  switch (joint) {
    case 'elbow':    return L ? [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST] : [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST]
    case 'knee':     return L ? [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE]       : [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE]
    case 'shoulder': return L ? [LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW]   : [LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW]
    case 'hip':      return L ? [LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE]    : [LM.R_SHOULDER, LM.R_HIP, LM.R_KNEE]
  }
}
