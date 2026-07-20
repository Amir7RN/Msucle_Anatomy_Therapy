/**
 * exerciseCatalog.ts
 *
 * Single source of truth for the guided-exercise library used by the AI
 * program + ExerciseGuidance: label, reference-video source, equipment
 * needed, and a gentler "regression" alternative for the mid-exercise
 * "This hurts" escape hatch.
 *
 * Video sources mirror what PersonalProgramView used to build inline:
 * shoulder/glute clips live in public/videos (BASE_URL), bicep/quad clips
 * are Vite asset-pipeline imports from the repo-root Videos/ folder.
 */

export interface CatalogEntry {
  label:     string
  src:       string
  /** What the user needs to have ready, or null for bodyweight/no props. */
  equipment: string | null
  /** A gentler same-region alternative to swap to when the exercise hurts. */
  regressionId?: string
}

const base = import.meta.env.BASE_URL
const V  = (n: string) => `${base}videos/${n}`
const VB = (n: string) => new URL(`../../../Videos/Bicep/${n}`, import.meta.url).href
const VQ = (n: string) => new URL(`../../../Videos/QuadRecipts/${n}`, import.meta.url).href

export const EXERCISE_CATALOG: Record<string, CatalogEntry> = {
  // Shoulder / Deltoid (public/videos)
  doorway_stretch:  { label: 'Doorway Stretch',          src: V('DoorWay_Stretch.mp4'),                 equipment: 'Doorway',            regressionId: 'seated_cross_arm' },
  seated_cross_arm: { label: 'Seated Cross-Arm Stretch', src: V('Seated_Cross_Arm_Stretch.mp4'),       equipment: 'Chair',              regressionId: 'post_shoulder' },
  standing_sleeper: { label: 'Standing Sleeper Stretch', src: V('Standing_Sleeper_Stretch.mp4'),       equipment: 'Wall',               regressionId: 'post_shoulder' },
  hand_behind_back: { label: 'Hand Behind Back Stretch', src: V('Hand_Behind_Back_Stretch.mp4'),       equipment: null,                 regressionId: 'seated_cross_arm' },
  standing_chest:   { label: 'Standing Chest Stretch',   src: V('Standing_Chest_Stretch.mp4'),         equipment: 'Wall',               regressionId: 'doorway_stretch' },
  crab_press:       { label: 'Crab Press',               src: V('Crab_Press.mp4'),                     equipment: 'Floor mat',          regressionId: 'side_lying_er' },
  side_lying_er:    { label: 'Side-Lying ER',            src: V('Side_Lying_External_Rotation.mp4'),   equipment: 'Floor mat',          regressionId: 'post_shoulder' },
  post_shoulder:    { label: 'Posterior Shoulder',       src: V('Posterior_Shoulder_Stretch.mp4'),     equipment: null },
  wand_rotation:    { label: 'Wand Rotation',            src: V('Wand_Rotation.mp4'),                  equipment: 'Stick / broom handle', regressionId: 'post_shoulder' },
  // Biceps / elbow (Videos/Bicep)
  bb_flex_ext:        { label: 'Biceps Flex / Extend',   src: VB('Flexion and Extension.mp4'),         equipment: null,                 regressionId: 'bb_wall_stretch' },
  bb_shoulder_flex:   { label: 'Shoulder Flexion',       src: VB('Single Shoulder Flexion.mp4'),       equipment: null,                 regressionId: 'bb_flex_ext' },
  bb_wall_stretch:    { label: 'Wall Biceps Stretch',    src: VB('Biceps Stretch.mp4'),                equipment: 'Wall',               regressionId: 'bb_sleeper_stretch' },
  bb_ext_rotation:    { label: 'External Rotation',      src: VB('Reclining External Rotation.mp4'),   equipment: 'Floor mat',          regressionId: 'bb_sleeper_stretch' },
  bb_sleeper_stretch: { label: 'Sleeper Stretch',        src: VB('Sleeper Stretch.mp4'),               equipment: 'Floor mat',          regressionId: 'bb_wall_stretch' },
  // Glute / hip / hamstring (public/videos)
  glute_bridge:      { label: 'Glute Bridge',            src: V('Glute_Bridge_Exercise.mp4'),          equipment: 'Floor mat',          regressionId: 'hamstring_squeeze' },
  hip_hinge:         { label: 'Hip Hinge',               src: V('Hip_Hinge_Exercise.mp4'),             equipment: null,                 regressionId: 'glute_bridge' },
  side_clamshell:    { label: 'Side Clamshell',          src: V('Glute_Bridge_Exercise.mp4'),          equipment: 'Floor mat',          regressionId: 'glute_bridge' },
  hamstring_squeeze: { label: 'Hamstring Squeeze',       src: V('Hamstring_Squeeze.mp4'),              equipment: 'Floor mat' },
  // Quad (Videos/QuadRecipts)
  qd_wall_squat:         { label: 'Wall Squat',               src: VQ('Wall Squat.mp4'),                        equipment: 'Wall',        regressionId: 'qd_quad_stretch_side' },
  qd_stiff_deadlift:     { label: 'Stiff-Leg Deadlift',       src: VQ('Stiff-legged Deadlift.mp4'),             equipment: null,          regressionId: 'qd_hamstring_supine' },
  qd_quad_stretch_stand: { label: 'Standing Quad Stretch',    src: VQ('Quad stretch (standing).mp4'),           equipment: 'Wall (balance)', regressionId: 'qd_quad_stretch_side' },
  qd_quad_stretch_side:  { label: 'Side-Lying Quad Stretch',  src: VQ('Quad stretch (lying on side).mp4'),      equipment: 'Floor mat' },
  qd_hamstring_supine:   { label: 'Supine Hamstring Stretch', src: VQ('Hamstring stretch (lying down).mp4'),    equipment: 'Floor mat' },
}

export function resolveExercise(id: string | undefined | null): CatalogEntry | null {
  if (!id) return null
  return EXERCISE_CATALOG[id] ?? null
}

/** Gentler alternative for the "This hurts" swap, or null when none exists. */
export function regressionFor(id: string | undefined | null): ({ id: string } & CatalogEntry) | null {
  const entry = resolveExercise(id)
  const regId = entry?.regressionId
  if (!regId) return null
  const reg = EXERCISE_CATALOG[regId]
  return reg ? { id: regId, ...reg } : null
}
