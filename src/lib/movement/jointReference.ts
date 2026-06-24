/**
 * jointReference.ts
 *
 * Single source of truth for biomechanical reference data, loaded directly
 * from the clinician-supplied JSON (AAOS / Norkin & White tele-goniometry):
 *
 *   • human_joint_rom_reference.json   — normal ROM bounds [min,max]° per movement
 *   • human_joint_measurements.json    — goniometric measurement protocol + plane/axis
 *   • human_joint_neutral_camera.json  — neutral start pose + camera orientation per movement
 *
 * Everything downstream (constraints, calibration, coaching cues, the ROM
 * dials) reads from HERE rather than hard-coding numbers, so the app stays
 * faithful to the reference the way the JSON describes it.  When the JSON is
 * updated, the whole pipeline follows automatically.
 *
 * Key mapping
 * ───────────
 * The catalog in muscleJointMap.ts uses ids like `shoulder_flexion`,
 * `cervical_rotation_left`, `hip_abduction`.  The JSON groups bidirectional
 * movements under a single joint_id (e.g. `shoulder_flexion_extension`) with
 * a `movement` discriminator ("Flexion" / "Extension").  `romFor()` resolves
 * a catalog id to the right [min,max] pair, handling the left/right and
 * flexion/extension splits.
 */

import romJson     from '../../data/human_joint_rom_reference.json'
import measureJson  from '../../data/human_joint_measurements.json'
import neutralJson  from '../../data/human_joint_neutral_camera.json'

// ── Raw JSON row shapes ──────────────────────────────────────────────────────

interface RomRow {
  joint_id:             string
  joint_name:           string
  movement:             string
  normal_range_degrees: [number, number]
  citation:             string[]
}

interface MeasureRow {
  joint_id:              string
  joint_name:            string
  movement:              string
  plane:                 string
  axis:                  string
  measurement_reference: string
  citation:              string[]
}

interface NeutralRow {
  joint_id:           string
  joint_name:         string
  movement:           string
  neutral_pose:       string
  camera_orientation: string
}

// Cast through `unknown` — the JSON's inferred type (e.g. number[] for the
// range tuple) doesn't structurally match our stricter row types, which TS
// rejects on a direct `as`. The shapes match at runtime.
const ROM_ROWS:     RomRow[]     = romJson     as unknown as RomRow[]
const MEASURE_ROWS: MeasureRow[] = measureJson as unknown as MeasureRow[]
const NEUTRAL_ROWS: NeutralRow[] = neutralJson as unknown as NeutralRow[]

export type AnatomicalPlane = 'sagittal' | 'frontal' | 'transverse' | 'unknown'

export interface RomReference {
  /** Lower bound of normal ROM, in degrees from neutral (0). */
  min: number
  /** Upper bound of normal (able-bodied) ROM, in degrees from neutral. */
  max: number
  /** Hard anatomical ceiling used for outlier clamping (max + slack). */
  ceiling: number
  /** Anatomical plane the motion lives in (drives frame projection). */
  plane: AnatomicalPlane
  /** Human-readable movement name from the reference table. */
  movement: string
  /** Joint name from the reference table. */
  jointName: string
}

// ─────────────────────────────────────────────────────────────────────────────
//  Catalog-id → (joint_id, movement-keyword) resolver
//
//  The keyword is matched case-insensitively against the JSON `movement`
//  field. For paired side movements (left/right) the ROM is identical, so we
//  map both to the same row.
// ─────────────────────────────────────────────────────────────────────────────

interface RomKey { jointId: string; movementKeyword: string; plane: AnatomicalPlane }

const CATALOG_TO_ROM: Record<string, RomKey> = {
  shoulder_flexion:                { jointId: 'shoulder_flexion_extension',   movementKeyword: 'flexion',   plane: 'sagittal' },
  shoulder_extension:              { jointId: 'shoulder_flexion_extension',   movementKeyword: 'extension', plane: 'sagittal' },
  shoulder_abduction:              { jointId: 'shoulder_abduction_adduction', movementKeyword: 'abduction', plane: 'frontal' },
  shoulder_adduction:              { jointId: 'shoulder_abduction_adduction', movementKeyword: 'adduction', plane: 'frontal' },
  shoulder_external_rotation:      { jointId: 'shoulder_rotation',            movementKeyword: 'external',  plane: 'transverse' },
  shoulder_internal_rotation:      { jointId: 'shoulder_rotation',            movementKeyword: 'internal',  plane: 'transverse' },
  elbow_flexion:                   { jointId: 'elbow_flexion_extension',      movementKeyword: 'flexion',   plane: 'sagittal' },
  hip_flexion:                     { jointId: 'hip_flexion_extension',        movementKeyword: 'flexion',   plane: 'sagittal' },
  hip_extension:                   { jointId: 'hip_flexion_extension',        movementKeyword: 'extension', plane: 'sagittal' },
  hip_abduction:                   { jointId: 'hip_abduction_adduction',      movementKeyword: 'abduction', plane: 'frontal' },
  hip_adduction:                   { jointId: 'hip_abduction_adduction',      movementKeyword: 'adduction', plane: 'frontal' },
  hip_rotation:                    { jointId: 'hip_internal_external_rotation', movementKeyword: 'external', plane: 'transverse' },
  knee_flexion:                    { jointId: 'knee_flexion_extension',       movementKeyword: 'flexion',   plane: 'sagittal' },
  ankle_dorsiflexion:              { jointId: 'ankle_dorsiflexion_plantarflexion', movementKeyword: 'dorsiflexion',   plane: 'sagittal' },
  ankle_plantarflexion:            { jointId: 'ankle_dorsiflexion_plantarflexion', movementKeyword: 'plantarflexion', plane: 'sagittal' },
  cervical_flexion:                { jointId: 'spine_cervical_flexion_extension', movementKeyword: 'flexion',   plane: 'sagittal' },
  cervical_extension:              { jointId: 'spine_cervical_flexion_extension', movementKeyword: 'extension', plane: 'sagittal' },
  cervical_rotation_left:          { jointId: 'spine_cervical_rotation',        movementKeyword: 'rotation', plane: 'transverse' },
  cervical_rotation_right:         { jointId: 'spine_cervical_rotation',        movementKeyword: 'rotation', plane: 'transverse' },
  cervical_lateral_flexion_left:   { jointId: 'spine_cervical_lateral_flexion', movementKeyword: 'lateral',  plane: 'frontal' },
  cervical_lateral_flexion_right:  { jointId: 'spine_cervical_lateral_flexion', movementKeyword: 'lateral',  plane: 'frontal' },
  trunk_flexion:                   { jointId: 'spine_thoracolumbar_flexion_extension', movementKeyword: 'flexion',   plane: 'sagittal' },
  trunk_extension:                 { jointId: 'spine_thoracolumbar_flexion_extension', movementKeyword: 'extension', plane: 'sagittal' },
  trunk_lateral_flexion_left:      { jointId: 'spine_thoracolumbar_lateral_flexion',   movementKeyword: 'lateral',   plane: 'frontal' },
  trunk_lateral_flexion_right:     { jointId: 'spine_thoracolumbar_lateral_flexion',   movementKeyword: 'lateral',   plane: 'frontal' },
  trunk_rotation_left:             { jointId: 'spine_thoracolumbar_rotation',          movementKeyword: 'rotation',  plane: 'transverse' },
  trunk_rotation_right:            { jointId: 'spine_thoracolumbar_rotation',          movementKeyword: 'rotation',  plane: 'transverse' },
}

/**
 * Extra anatomical slack (deg) added to the reference max to form the hard
 * "impossible beyond this" ceiling used by the outlier clamp. Joints with
 * naturally high inter-subject variance (shoulders, hips) get more slack.
 */
function ceilingSlack(jointId: string): number {
  if (jointId.startsWith('shoulder') || jointId.startsWith('hip')) return 25
  if (jointId.startsWith('spine'))                                  return 20
  return 15
}

const _romCache = new Map<string, RomReference | null>()

/**
 * Resolve a catalog movement id (e.g. `shoulder_flexion`) to its reference
 * ROM bounds + plane. Returns null when the id isn't in the reference table.
 */
export function romFor(catalogId: string): RomReference | null {
  if (_romCache.has(catalogId)) return _romCache.get(catalogId)!

  const key = CATALOG_TO_ROM[catalogId]
  if (!key) { _romCache.set(catalogId, null); return null }

  const row = ROM_ROWS.find(
    (r) => r.joint_id === key.jointId &&
           r.movement.toLowerCase().includes(key.movementKeyword),
  )
  if (!row) { _romCache.set(catalogId, null); return null }

  const [min, max] = row.normal_range_degrees
  const ref: RomReference = {
    min,
    max,
    ceiling:   max + ceilingSlack(key.jointId),
    plane:     key.plane,
    movement:  row.movement,
    jointName: row.joint_name,
  }
  _romCache.set(catalogId, ref)
  return ref
}

/** Plane for a catalog movement (sagittal/frontal/transverse), or 'unknown'. */
export function planeFor(catalogId: string): AnatomicalPlane {
  return CATALOG_TO_ROM[catalogId]?.plane ?? 'unknown'
}

/**
 * The neutral start pose + camera orientation text for a catalog movement,
 * resolved from human_joint_neutral_camera.json. Used to coach the user into
 * the correct setup before measuring (single-camera accuracy depends on it).
 */
export interface NeutralGuidance {
  neutralPose:       string
  cameraOrientation: string
}

// neutral_camera.json uses its own joint_id scheme; map catalog ids onto it.
const CATALOG_TO_NEUTRAL: Record<string, { jointId: string; kw: string }> = {
  shoulder_flexion:               { jointId: 'shoulder_flexion_extension',   kw: '' },
  shoulder_extension:             { jointId: 'shoulder_flexion_extension',   kw: '' },
  shoulder_abduction:             { jointId: 'shoulder_abduction_adduction', kw: '' },
  shoulder_adduction:             { jointId: 'shoulder_abduction_adduction', kw: '' },
  shoulder_external_rotation:     { jointId: 'shoulder_internal_external_rotation', kw: '' },
  shoulder_internal_rotation:     { jointId: 'shoulder_internal_external_rotation', kw: '' },
  elbow_flexion:                  { jointId: 'elbow_flexion_extension',      kw: '' },
  hip_flexion:                    { jointId: 'hip_flexion_extension',        kw: '' },
  hip_extension:                  { jointId: 'hip_flexion_extension',        kw: '' },
  hip_abduction:                  { jointId: 'hip_abduction_adduction',      kw: '' },
  hip_adduction:                  { jointId: 'hip_abduction_adduction',      kw: '' },
  hip_rotation:                   { jointId: 'hip_internal_external_rotation', kw: '' },
  knee_flexion:                   { jointId: 'knee_flexion_extension',       kw: '' },
  ankle_dorsiflexion:             { jointId: 'ankle_dorsiflexion_plantarflexion', kw: '' },
  ankle_plantarflexion:           { jointId: 'ankle_dorsiflexion_plantarflexion', kw: '' },
  cervical_flexion:               { jointId: 'cervical_flexion_extension',   kw: '' },
  cervical_extension:             { jointId: 'cervical_flexion_extension',   kw: '' },
  cervical_rotation_left:         { jointId: 'cervical_rotation',            kw: '' },
  cervical_rotation_right:        { jointId: 'cervical_rotation',            kw: '' },
  cervical_lateral_flexion_left:  { jointId: 'cervical_lateral_flexion',     kw: '' },
  cervical_lateral_flexion_right: { jointId: 'cervical_lateral_flexion',     kw: '' },
  trunk_flexion:                  { jointId: 'thoracolumbar_flexion_extension', kw: '' },
  trunk_extension:                { jointId: 'thoracolumbar_flexion_extension', kw: '' },
  trunk_lateral_flexion_left:     { jointId: 'thoracolumbar_lateral_flexion',   kw: '' },
  trunk_lateral_flexion_right:    { jointId: 'thoracolumbar_lateral_flexion',   kw: '' },
  trunk_rotation_left:            { jointId: 'thoracolumbar_rotation',          kw: '' },
  trunk_rotation_right:           { jointId: 'thoracolumbar_rotation',          kw: '' },
}

export function neutralGuidanceFor(catalogId: string): NeutralGuidance | null {
  const key = CATALOG_TO_NEUTRAL[catalogId]
  if (!key) return null
  const row = NEUTRAL_ROWS.find((r) => r.joint_id === key.jointId)
  if (!row) return null
  return { neutralPose: row.neutral_pose, cameraOrientation: row.camera_orientation }
}

/**
 * Which camera orientation a movement wants, distilled to a machine-usable
 * enum so the setup coach can verify the user is actually side-on vs facing.
 * Derived from the neutral_camera.json text ("sideways"/"profile" → sagittal;
 * "face the camera" → frontal).
 */
export type CameraSetup = 'face_on' | 'side_on' | 'either'

export function cameraSetupFor(catalogId: string): CameraSetup {
  const g = neutralGuidanceFor(catalogId)
  if (!g) {
    // Fall back to the plane: sagittal motions read best side-on, frontal
    // and transverse read best face-on.
    const p = planeFor(catalogId)
    return p === 'sagittal' ? 'side_on' : p === 'unknown' ? 'either' : 'face_on'
  }
  const t = g.cameraOrientation.toLowerCase()
  if (t.includes('sideways') || t.includes('profile') || t.includes('side-on') || t.includes('side on')) return 'side_on'
  if (t.includes('face the camera') || t.includes('facing the camera') || t.includes('front')) return 'face_on'
  return 'either'
}

/** Raw access to the measurement-protocol rows (plane, axis, reference text). */
export function measurementProtocol(catalogId: string): MeasureRow | null {
  const key = CATALOG_TO_ROM[catalogId]
  if (!key) return null
  return MEASURE_ROWS.find(
    (r) => r.joint_id === key.jointId &&
           (key.movementKeyword === '' || r.movement.toLowerCase().includes(key.movementKeyword)),
  ) ?? null
}

export const ALL_REFERENCE_IDS = Object.keys(CATALOG_TO_ROM)
