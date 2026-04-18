import type { MockMeshDef, BodyPartDef } from './types'

/**
 * Mock muscle mesh definitions.
 * Coordinate system: Y-up, origin at navel level.
 * Body spans roughly y=-0.92 (feet) to y=0.88 (head top).
 *
 * These defs drive the LatheGeometry belly muscles (BELLY_GEO, FLAT_GEO, ROUND_GEO).
 * LatheGeometry spans Y: -0.5 to +0.5 with max X/Z radius ~0.5 at belly peak.
 * So world dimensions ≈ scale (no doubling needed — already calibrated for Lathe).
 *
 * muscleType:
 *   'belly' – LatheGeometry with sine-profile belly (default, limb muscles)
 *   'flat'  – Squashed SphereGeometry (pec, trap, lat, glutes, sheet muscles)
 *   'round' – Compact SphereGeometry (masseter, temporalis)
 */
export const MOCK_MUSCLE_DEFS: MockMeshDef[] = [

  // ── Upper Limb – Right ────────────────────────────────────────────────────

  {
    id: 'MUSC_BICEPS_BRACHII_R',
    meshName: 'Biceps_Brachii_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.285, 0.42, 0.055],
    scale: [0.072, 0.195, 0.068],
  },
  {
    id: 'MUSC_TRICEPS_BRACHII_R',
    meshName: 'Triceps_Brachii_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.285, 0.42, -0.062],
    scale: [0.078, 0.215, 0.070],
  },
  {
    id: 'MUSC_DELTOID_R',
    meshName: 'Deltoid_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.255, 0.572, 0.0],
    scale: [0.128, 0.12, 0.098],
  },
  {
    id: 'MUSC_BRACHIORADIALIS_R',
    meshName: 'Brachioradialis_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.335, 0.16, 0.042],
    scale: [0.052, 0.165, 0.048],
  },
  {
    id: 'MUSC_INFRASPINATUS_R',
    meshName: 'Infraspinatus_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.195, 0.515, -0.138],
    scale: [0.122, 0.095, 0.068],
  },
  {
    id: 'MUSC_BRACHIALIS_R',
    meshName: 'Brachialis_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.278, 0.375, 0.022],
    scale: [0.064, 0.155, 0.058],
  },
  {
    id: 'MUSC_CORACOBRACHIALIS_R',
    meshName: 'Coracobrachialis_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.242, 0.515, 0.042],
    scale: [0.048, 0.118, 0.045],
  },

  // ── Upper Limb – Left ─────────────────────────────────────────────────────

  {
    id: 'MUSC_BICEPS_BRACHII_L',
    meshName: 'Biceps_Brachii_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.285, 0.42, 0.055],
    scale: [0.072, 0.195, 0.068],
  },
  {
    id: 'MUSC_TRICEPS_BRACHII_L',
    meshName: 'Triceps_Brachii_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.285, 0.42, -0.062],
    scale: [0.078, 0.215, 0.070],
  },
  {
    id: 'MUSC_DELTOID_L',
    meshName: 'Deltoid_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.255, 0.572, 0.0],
    scale: [0.128, 0.12, 0.098],
  },
  {
    id: 'MUSC_BRACHIORADIALIS_L',
    meshName: 'Brachioradialis_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.335, 0.16, 0.042],
    scale: [0.052, 0.165, 0.048],
  },
  {
    id: 'MUSC_INFRASPINATUS_L',
    meshName: 'Infraspinatus_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.195, 0.515, -0.138],
    scale: [0.122, 0.095, 0.068],
  },
  {
    id: 'MUSC_BRACHIALIS_L',
    meshName: 'Brachialis_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.278, 0.375, 0.022],
    scale: [0.064, 0.155, 0.058],
  },
  {
    id: 'MUSC_CORACOBRACHIALIS_L',
    meshName: 'Coracobrachialis_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.242, 0.515, 0.042],
    scale: [0.048, 0.118, 0.045],
  },

  // ── Trunk (front) ─────────────────────────────────────────────────────────

  {
    id: 'MUSC_PECTORALIS_MAJOR_R',
    meshName: 'Pectoralis_Major_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.138, 0.455, 0.112],
    scale: [0.192, 0.135, 0.078],
  },
  {
    id: 'MUSC_PECTORALIS_MAJOR_L',
    meshName: 'Pectoralis_Major_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.138, 0.455, 0.112],
    scale: [0.192, 0.135, 0.078],
  },
  {
    id: 'MUSC_RECTUS_ABDOMINIS',
    meshName: 'Rectus_Abdominis',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.0, 0.20, 0.112],
    scale: [0.098, 0.29, 0.055],
  },
  {
    id: 'MUSC_EXTERNAL_OBLIQUE_R',
    meshName: 'External_Oblique_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.162, 0.16, 0.092],
    scale: [0.128, 0.195, 0.062],
  },
  {
    id: 'MUSC_EXTERNAL_OBLIQUE_L',
    meshName: 'External_Oblique_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.162, 0.16, 0.092],
    scale: [0.128, 0.195, 0.062],
  },
  {
    id: 'MUSC_SERRATUS_ANTERIOR_R',
    meshName: 'Serratus_Anterior_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.210, 0.365, 0.072],
    scale: [0.095, 0.135, 0.055],
  },
  {
    id: 'MUSC_SERRATUS_ANTERIOR_L',
    meshName: 'Serratus_Anterior_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.210, 0.365, 0.072],
    scale: [0.095, 0.135, 0.055],
  },

  // ── Trunk (back) ──────────────────────────────────────────────────────────

  {
    id: 'MUSC_TRAPEZIUS',
    meshName: 'Trapezius',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.0, 0.608, -0.108],
    scale: [0.302, 0.198, 0.062],
  },
  {
    id: 'MUSC_LATISSIMUS_DORSI_R',
    meshName: 'Latissimus_Dorsi_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.168, 0.295, -0.105],
    scale: [0.182, 0.235, 0.062],
  },
  {
    id: 'MUSC_LATISSIMUS_DORSI_L',
    meshName: 'Latissimus_Dorsi_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.168, 0.295, -0.105],
    scale: [0.182, 0.235, 0.062],
  },
  {
    id: 'MUSC_ERECTOR_SPINAE_R',
    meshName: 'Erector_Spinae_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.055, 0.265, -0.125],
    scale: [0.048, 0.285, 0.055],
  },
  {
    id: 'MUSC_ERECTOR_SPINAE_L',
    meshName: 'Erector_Spinae_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.055, 0.265, -0.125],
    scale: [0.048, 0.285, 0.055],
  },

  // ── Lower Limb – Right ────────────────────────────────────────────────────

  {
    id: 'MUSC_GLUTEUS_MAXIMUS_R',
    meshName: 'Gluteus_Maximus_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.118, -0.185, -0.122],
    scale: [0.152, 0.195, 0.108],
  },
  {
    id: 'MUSC_GLUTEUS_MEDIUS_R',
    meshName: 'Gluteus_Medius_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.168, -0.098, -0.088],
    scale: [0.108, 0.142, 0.082],
  },
  {
    id: 'MUSC_RECTUS_FEMORIS_R',
    meshName: 'Rectus_Femoris_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.098, -0.372, 0.072],
    scale: [0.082, 0.245, 0.075],
  },
  {
    id: 'MUSC_VASTUS_LATERALIS_R',
    meshName: 'Vastus_Lateralis_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.152, -0.392, 0.042],
    scale: [0.102, 0.228, 0.075],
  },
  {
    id: 'MUSC_BICEPS_FEMORIS_R',
    meshName: 'Biceps_Femoris_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.118, -0.402, -0.072],
    scale: [0.092, 0.228, 0.075],
  },
  {
    id: 'MUSC_GASTROCNEMIUS_R',
    meshName: 'Gastrocnemius_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.092, -0.718, -0.042],
    scale: [0.085, 0.185, 0.065],
  },
  {
    id: 'MUSC_SOLEUS_R',
    meshName: 'Soleus_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.090, -0.742, -0.058],
    scale: [0.075, 0.165, 0.055],
  },
  {
    id: 'MUSC_TIBIALIS_ANTERIOR_R',
    meshName: 'Tibialis_Anterior_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.098, -0.705, 0.062],
    scale: [0.065, 0.205, 0.065],
  },

  // ── Lower Limb – Left ─────────────────────────────────────────────────────

  {
    id: 'MUSC_GLUTEUS_MAXIMUS_L',
    meshName: 'Gluteus_Maximus_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.118, -0.185, -0.122],
    scale: [0.152, 0.195, 0.108],
  },
  {
    id: 'MUSC_GLUTEUS_MEDIUS_L',
    meshName: 'Gluteus_Medius_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.168, -0.098, -0.088],
    scale: [0.108, 0.142, 0.082],
  },
  {
    id: 'MUSC_RECTUS_FEMORIS_L',
    meshName: 'Rectus_Femoris_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.098, -0.372, 0.072],
    scale: [0.082, 0.245, 0.075],
  },
  {
    id: 'MUSC_VASTUS_LATERALIS_L',
    meshName: 'Vastus_Lateralis_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.152, -0.392, 0.042],
    scale: [0.102, 0.228, 0.075],
  },
  {
    id: 'MUSC_BICEPS_FEMORIS_L',
    meshName: 'Biceps_Femoris_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.118, -0.402, -0.072],
    scale: [0.092, 0.228, 0.075],
  },
  {
    id: 'MUSC_GASTROCNEMIUS_L',
    meshName: 'Gastrocnemius_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.092, -0.718, -0.042],
    scale: [0.085, 0.185, 0.065],
  },
  {
    id: 'MUSC_SOLEUS_L',
    meshName: 'Soleus_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.090, -0.742, -0.058],
    scale: [0.075, 0.165, 0.055],
  },
  {
    id: 'MUSC_TIBIALIS_ANTERIOR_L',
    meshName: 'Tibialis_Anterior_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.098, -0.705, 0.062],
    scale: [0.065, 0.205, 0.065],
  },

  // ── Head & Neck ───────────────────────────────────────────────────────────

  {
    id: 'MUSC_STERNOCLEIDOMASTOID_R',
    meshName: 'Sternocleidomastoid_R',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [0.058, 0.652, 0.045],
    rotation: [0, 0, 0.32],
    scale: [0.036, 0.145, 0.036],
  },
  {
    id: 'MUSC_STERNOCLEIDOMASTOID_L',
    meshName: 'Sternocleidomastoid_L',
    geometry: 'capsule',
    muscleType: 'belly',
    position: [-0.058, 0.652, 0.045],
    rotation: [0, 0, -0.32],
    scale: [0.036, 0.145, 0.036],
  },
  {
    id: 'MUSC_MASSETER_R',
    meshName: 'Masseter_R',
    geometry: 'capsule',
    muscleType: 'round',
    position: [0.068, 0.776, 0.065],
    scale: [0.055, 0.075, 0.050],
  },
  {
    id: 'MUSC_MASSETER_L',
    meshName: 'Masseter_L',
    geometry: 'capsule',
    muscleType: 'round',
    position: [-0.068, 0.776, 0.065],
    scale: [0.055, 0.075, 0.050],
  },
  {
    id: 'MUSC_TEMPORALIS_R',
    meshName: 'Temporalis_R',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [0.085, 0.822, 0.005],
    scale: [0.092, 0.072, 0.038],
  },
  {
    id: 'MUSC_TEMPORALIS_L',
    meshName: 'Temporalis_L',
    geometry: 'capsule',
    muscleType: 'flat',
    position: [-0.085, 0.822, 0.005],
    scale: [0.092, 0.072, 0.038],
  },
]

/**
 * Non-interactive body silhouette parts (ghost skeleton).
 * Rendered as semi-transparent — not clickable.
 */
export const BODY_PARTS: BodyPartDef[] = [
  { key: 'head',    geometry: 'sphere',  position: [0,      0.755,  0],       scale: [0.112, 0.132, 0.112] },
  { key: 'neck',    geometry: 'capsule', position: [0,      0.628,  0],        scale: [0.048, 0.058, 0.048] },
  { key: 'torso',   geometry: 'capsule', position: [0,      0.282,  0],        scale: [0.250, 0.275, 0.125] },
  { key: 'pelvis',  geometry: 'capsule', position: [0,     -0.098,  0],        scale: [0.198, 0.095, 0.115] },
  { key: 'uarm_r',  geometry: 'capsule', position: [0.288,  0.430,  0],        rotation: [0, 0, 0.15],  scale: [0.058, 0.155, 0.055] },
  { key: 'uarm_l',  geometry: 'capsule', position: [-0.288, 0.430,  0],        rotation: [0, 0, -0.15], scale: [0.058, 0.155, 0.055] },
  { key: 'farm_r',  geometry: 'capsule', position: [0.338,  0.148,  0],        rotation: [0, 0, 0.08],  scale: [0.048, 0.135, 0.045] },
  { key: 'farm_l',  geometry: 'capsule', position: [-0.338, 0.148,  0],        rotation: [0, 0, -0.08], scale: [0.048, 0.135, 0.045] },
  { key: 'thigh_r', geometry: 'capsule', position: [0.108, -0.375,  0],        scale: [0.078, 0.205, 0.078] },
  { key: 'thigh_l', geometry: 'capsule', position: [-0.108,-0.375,  0],        scale: [0.078, 0.205, 0.078] },
  { key: 'shin_r',  geometry: 'capsule', position: [0.088, -0.728,  0],        scale: [0.055, 0.165, 0.055] },
  { key: 'shin_l',  geometry: 'capsule', position: [-0.088,-0.728,  0],        scale: [0.055, 0.165, 0.055] },
  { key: 'foot_r',  geometry: 'capsule', position: [0.088, -0.882,  0.052],    rotation: [1.05, 0, 0], scale: [0.050, 0.038, 0.042] },
  { key: 'foot_l',  geometry: 'capsule', position: [-0.088,-0.882,  0.052],    rotation: [1.05, 0, 0], scale: [0.050, 0.038, 0.042] },
]
