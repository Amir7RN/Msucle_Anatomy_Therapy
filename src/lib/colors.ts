import type { SystemType, LayerType } from './types'

// ── Muted qualitative palette — Seaborn / ColorBrewer inspired ───────────────
//
// Philosophy: perceptually uniform, low-to-medium saturation, no pure
// primaries.  Inspired by Seaborn 'muted' + ColorBrewer Set2/Pastel2.
// Looks like a professional medical illustration rather than a data plot.
//
// Brightness kept in 55–82 % range; saturation 28–55 %.
// Hue wheel spread ensures maximum distinguishability between adjacent muscles.
//
//  0  Muted teal        #4a9fa6  — SCM
//  1  Muted steel blue  #5b8bb5  — Serratus, Triceps, Vast Lat, Soleus
//  2  Muted sage green  #5a9050  — Masseter, Infraspinatus, Brachialis, FCR, Glut Med, Vast Med, Tib Ant
//  3  Muted ochre       #a89950  — Temporalis
//  4  Muted slate purple#7868a5  — Deltoid, Brachioradialis, Rect Femoris, Fibularis, Frontalis
//  5  Muted rose red    #b87070  — Pec Major, Biceps Brachii
//  6  Muted dusty pink  #b57888  — Rectus Abdominis
//  7  Muted lavender    #8870a5  — External Oblique
//  8  Muted berry       #a03060  — Trapezius
//  9  Muted indigo      #503890  — Lat Dorsi, Adductor Magnus, Semimembranosus
// 10  Muted cool gray   #7e7e88  — Erector Spinae
// 11  Muted terracotta  #b54030  — Gluteus Maximus
// 12  Muted medium plum #706898  — Biceps Femoris, Semitendinosus
// 13  Muted mauve pink  #b06098  — Gastrocnemius
// 14  Muted sand        #c8bfa5  — Sartorius, IT Band
// 15  Muted dusty rose  #b06878  — Face sheet muscles, Platysma
// 16  Muted mint        #509870  — Gracilis, Teal-green group
// 17  Muted periwinkle  #5868b0  — Extensor Digitorum, Coracobrachialis
// 18  Muted warm terra  #b87858  — Pronator Teres, Palmaris, FCU, Flex Dig
// 19  Muted pale sage   #78a870  — Extensor Hallucis, foot intrinsics
// 20  Muted burnt orange#a86040  — TFL / alt
// 21  Muted cornflower  #6098b5  — Serratus alt
// 22  Muted plum grey   #9878a0  — Face secondary
// 23  Muted olive       #909850  — Aponeurosis alt
// 24  Muted deep blue   #485098  — Deep pelvic
// 25  Muted tan         #b89870  — Fallback warm
// 26  Muted teal-green  #509888  — Mint alt
// 27  Muted pale purple #9878b0  — Extra purple
// 28  Muted peach       #c09070  — Peach fallback
// 29  Muted pale sage   #88a878  — Pale green fallback
//
const PALETTE: readonly string[] = [
  '#4a9fa6',   //  0  Muted teal
  '#5b8bb5',   //  1  Muted steel blue
  '#5a9050',   //  2  Muted sage green
  '#a89950',   //  3  Muted ochre
  '#7868a5',   //  4  Muted slate purple
  '#b87070',   //  5  Muted rose red
  '#b57888',   //  6  Muted dusty pink
  '#8870a5',   //  7  Muted lavender
  '#a03060',   //  8  Muted berry
  '#503890',   //  9  Muted indigo
  '#7e7e88',   // 10  Muted cool gray
  '#b54030',   // 11  Muted terracotta
  '#706898',   // 12  Muted medium plum
  '#b06098',   // 13  Muted mauve pink
  '#c8bfa5',   // 14  Muted sand
  '#b06878',   // 15  Muted dusty rose
  '#509870',   // 16  Muted mint
  '#5868b0',   // 17  Muted periwinkle
  '#b87858',   // 18  Muted warm terra
  '#78a870',   // 19  Muted pale sage
  '#a86040',   // 20  Muted burnt orange
  '#6098b5',   // 21  Muted cornflower
  '#9878a0',   // 22  Muted plum grey
  '#909850',   // 23  Muted olive
  '#485098',   // 24  Muted deep blue
  '#b89870',   // 25  Muted tan
  '#509888',   // 26  Muted teal-green
  '#9878b0',   // 27  Muted pale purple
  '#c09070',   // 28  Muted peach
  '#88a878',   // 29  Muted pale sage
]

// ── Per-muscle palette index ───────────────────────────────────────────────────
//
// Muscles are assigned the atlas color that matches the user-specified scheme.
// Adjacent muscles are always given contrasting hues.
//
const MUSCLE_PALETTE_INDEX: Record<string, number> = {

  // ── Head & neck ─────────────────────────────────────────────────────────────
  MUSC_STERNOCLEIDOMASTOID_R:                  0,   // Teal
  MUSC_STERNOCLEIDOMASTOID_L:                  0,
  MUSC_MASSETER_R:                             2,   // Light green
  MUSC_MASSETER_L:                             2,
  MUSC_TEMPORALIS_R:                           3,   // Pale yellow
  MUSC_TEMPORALIS_L:                           3,

  // ── Face muscles ────────────────────────────────────────────────────────────
  MUSC_FRONTALIS_R:                            4,   // Light purple
  MUSC_FRONTALIS_L:                            4,
  MUSC_ORBICULARIS_OCULI_R:                   15,   // Rose pink
  MUSC_ORBICULARIS_OCULI_L:                   15,
  MUSC_ZYGOMATICUS_MAJOR_R:                   22,   // Mauve
  MUSC_ZYGOMATICUS_MAJOR_L:                   22,
  MUSC_BUCCINATOR_R:                          22,   // Mauve
  MUSC_BUCCINATOR_L:                          22,
  MUSC_PLATYSMA_R:                            15,   // Rose pink (neck sheet)
  MUSC_PLATYSMA_L:                            15,
  MUSC_ORBICULARIS_ORIS:                      15,   // Rose pink
  MUSC_MENTALIS:                              15,
  MUSC_CORRUGATOR_SUPERCILII_R:               15,
  MUSC_CORRUGATOR_SUPERCILII_L:               15,

  // ── Posterior trunk ─────────────────────────────────────────────────────────
  MUSC_TRAPEZIUS:                              8,   // Deep pink
  MUSC_LATISSIMUS_DORSI_R:                     9,   // Deep purple
  MUSC_LATISSIMUS_DORSI_L:                     9,
  MUSC_ERECTOR_SPINAE_R:                      10,   // Light gray
  MUSC_ERECTOR_SPINAE_L:                      10,
  MUSC_INFRASPINATUS_R:                        2,   // Light green
  MUSC_INFRASPINATUS_L:                        2,

  // ── Anterior trunk ──────────────────────────────────────────────────────────
  MUSC_PECTORALIS_MAJOR_R:                     5,   // Salmon red
  MUSC_PECTORALIS_MAJOR_L:                     5,
  MUSC_SERRATUS_ANTERIOR_R:                    1,   // Light blue
  MUSC_SERRATUS_ANTERIOR_L:                    1,
  MUSC_RECTUS_ABDOMINIS:                       6,   // Pink
  MUSC_EXTERNAL_OBLIQUE_R:                     7,   // Lavender
  MUSC_EXTERNAL_OBLIQUE_L:                     7,

  // ── Shoulder ────────────────────────────────────────────────────────────────
  MUSC_DELTOID_R:                              4,   // Light purple
  MUSC_DELTOID_L:                              4,
  MUSC_CORACOBRACHIALIS_R:                    17,   // Blue-purple (deep, hidden)
  MUSC_CORACOBRACHIALIS_L:                    17,

  // ── Upper arm ───────────────────────────────────────────────────────────────
  MUSC_BICEPS_BRACHII_R:                       5,   // Salmon red
  MUSC_BICEPS_BRACHII_L:                       5,
  MUSC_BRACHIALIS_R:                           2,   // Light green (under biceps)
  MUSC_BRACHIALIS_L:                           2,
  MUSC_TRICEPS_BRACHII_R:                      1,   // Light blue
  MUSC_TRICEPS_BRACHII_L:                      1,

  // ── Forearm ─────────────────────────────────────────────────────────────────
  MUSC_BRACHIORADIALIS_R:                      4,   // Light purple
  MUSC_BRACHIORADIALIS_L:                      4,
  MUSC_PRONATOR_TERES_R:                      18,   // Warm salmon
  MUSC_PRONATOR_TERES_L:                      18,
  MUSC_FLEXOR_CARPI_RADIALIS_R:                2,   // Light green
  MUSC_FLEXOR_CARPI_RADIALIS_L:                2,
  MUSC_PALMARIS_LONGUS_R:                     18,   // Warm salmon
  MUSC_PALMARIS_LONGUS_L:                     18,
  MUSC_FLEXOR_CARPI_ULNARIS_R:               18,   // Warm salmon
  MUSC_FLEXOR_CARPI_ULNARIS_L:               18,
  MUSC_FLEXOR_DIGITORUM_SUPERFICIALIS_R:      18,   // Warm salmon
  MUSC_FLEXOR_DIGITORUM_SUPERFICIALIS_L:      18,
  MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_R:       4,   // Light purple
  MUSC_EXTENSOR_CARPI_RADIALIS_LONGUS_L:       4,
  MUSC_EXTENSOR_DIGITORUM_R:                   6,   // Pink
  MUSC_EXTENSOR_DIGITORUM_L:                   6,

  // ── Gluteal ─────────────────────────────────────────────────────────────────
  MUSC_GLUTEUS_MAXIMUS_R:                     11,   // Orange-red
  MUSC_GLUTEUS_MAXIMUS_L:                     11,
  MUSC_GLUTEUS_MEDIUS_R:                       2,   // Light green
  MUSC_GLUTEUS_MEDIUS_L:                       2,

  // ── Thigh anterior (quads) ──────────────────────────────────────────────────
  MUSC_RECTUS_FEMORIS_R:                       4,   // Light purple
  MUSC_RECTUS_FEMORIS_L:                       4,
  MUSC_VASTUS_LATERALIS_R:                     1,   // Light blue
  MUSC_VASTUS_LATERALIS_L:                     1,
  MUSC_VASTUS_MEDIALIS_R:                      2,   // Light green
  MUSC_VASTUS_MEDIALIS_L:                      2,
  MUSC_SARTORIUS_R:                           14,   // Cream (diagonal strap)
  MUSC_SARTORIUS_L:                           14,

  // ── Thigh posterior (hamstrings) ────────────────────────────────────────────
  MUSC_BICEPS_FEMORIS_R:                      12,   // Purple
  MUSC_BICEPS_FEMORIS_L:                      12,
  MUSC_SEMITENDINOSUS_R:                      12,   // Purple
  MUSC_SEMITENDINOSUS_L:                      12,
  MUSC_SEMIMEMBRANOSUS_R:                      9,   // Deep purple
  MUSC_SEMIMEMBRANOSUS_L:                      9,

  // ── Thigh medial ────────────────────────────────────────────────────────────
  MUSC_GRACILIS_R:                            16,   // Teal-green
  MUSC_GRACILIS_L:                            16,
  MUSC_ADDUCTOR_MAGNUS_R:                      9,   // Deep purple
  MUSC_ADDUCTOR_MAGNUS_L:                      9,

  // ── Lower leg ───────────────────────────────────────────────────────────────
  MUSC_GASTROCNEMIUS_R:                       13,   // Magenta pink
  MUSC_GASTROCNEMIUS_L:                       13,
  MUSC_SOLEUS_R:                               1,   // Light blue
  MUSC_SOLEUS_L:                               1,
  MUSC_TIBIALIS_ANTERIOR_R:                    2,   // Light green
  MUSC_TIBIALIS_ANTERIOR_L:                    2,
  MUSC_FIBULARIS_LONGUS_R:                     4,   // Light purple
  MUSC_FIBULARIS_LONGUS_L:                     4,
  MUSC_FIBULARIS_BREVIS_R:                     4,   // Light purple
  MUSC_FIBULARIS_BREVIS_L:                     4,
  MUSC_EXTENSOR_HALLUCIS_LONGUS_R:            19,   // Soft green
  MUSC_EXTENSOR_HALLUCIS_LONGUS_L:            19,

  // ── Foot ────────────────────────────────────────────────────────────────────
  MUSC_FLEXOR_DIGITORUM_BREVIS_R:             19,   // Soft green
  MUSC_FLEXOR_DIGITORUM_BREVIS_L:             19,
  MUSC_ABDUCTOR_HALLUCIS_R:                  16,   // Teal-green
  MUSC_ABDUCTOR_HALLUCIS_L:                  16,
}

// ── Per-muscle roughness ───────────────────────────────────────────────────────
//
// Low roughness = wet/shiny (tendons, face, mobile muscles)
// High roughness = dry/matte (fascia, deep positional muscles)
//
export const MUSCLE_ROUGHNESS_OVERRIDE: Record<string, number> = {
  MUSC_BICEPS_BRACHII_R:                    0.38,
  MUSC_BICEPS_BRACHII_L:                    0.38,
  MUSC_GASTROCNEMIUS_R:                     0.36,
  MUSC_GASTROCNEMIUS_L:                     0.36,
  MUSC_SOLEUS_R:                            0.34,
  MUSC_SOLEUS_L:                            0.34,
  MUSC_RECTUS_FEMORIS_R:                    0.40,
  MUSC_RECTUS_FEMORIS_L:                    0.40,
  MUSC_TRICEPS_BRACHII_R:                   0.42,
  MUSC_TRICEPS_BRACHII_L:                   0.42,
  MUSC_SARTORIUS_R:                         0.44,
  MUSC_SARTORIUS_L:                         0.44,
  MUSC_MASSETER_R:                          0.32,
  MUSC_MASSETER_L:                          0.32,
  MUSC_TEMPORALIS_R:                        0.34,
  MUSC_TEMPORALIS_L:                        0.34,
  MUSC_FRONTALIS_R:                         0.28,
  MUSC_FRONTALIS_L:                         0.28,
  MUSC_ORBICULARIS_OCULI_R:                 0.28,
  MUSC_ORBICULARIS_OCULI_L:                 0.28,
  MUSC_ZYGOMATICUS_MAJOR_R:                 0.30,
  MUSC_ZYGOMATICUS_MAJOR_L:                 0.30,
  MUSC_TRAPEZIUS:                           0.72,
  MUSC_LATISSIMUS_DORSI_R:                  0.68,
  MUSC_LATISSIMUS_DORSI_L:                  0.68,
  MUSC_EXTERNAL_OBLIQUE_R:                  0.66,
  MUSC_EXTERNAL_OBLIQUE_L:                  0.66,
  MUSC_ERECTOR_SPINAE_R:                    0.70,
  MUSC_ERECTOR_SPINAE_L:                    0.70,
  MUSC_BRACHIALIS_R:                        0.75,
  MUSC_BRACHIALIS_L:                        0.75,
}

// ── System defaults ───────────────────────────────────────────────────────────
export const SKELETON_DEFAULT  = '#d4c8a0'
export const SKELETON_HOVER    = '#ece4c0'
export const SKELETON_SELECTED = '#60a5fa'

export const NERVE_DEFAULT  = '#c8a020'
export const JOINT_DEFAULT  = '#5080b0'
export const TENDON_DEFAULT = '#dcc8a0'

export const MUSCLE_HOVER    = '#ffffff'
export const MUSCLE_SELECTED = '#1d4ed8'
export const MUSCLE_DEFAULT  = PALETTE[5]   // salmon fallback

export const BODY_SILHOUETTE = '#3a4858'

// ── Core color resolver ───────────────────────────────────────────────────────

export function muscleColor(
  id:    string | undefined,
  layer: LayerType | undefined,
): string {
  if (id !== undefined) {
    const explicit = MUSCLE_PALETTE_INDEX[id]
    if (explicit !== undefined) return PALETTE[explicit]

    // Hash-based fallback — spreads across the full palette
    let h = 5381
    for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
    return PALETTE[Math.abs(h) % PALETTE.length]
  }
  switch (layer) {
    case 'deep':         return PALETTE[9]
    case 'intermediate': return PALETTE[12]
    default:             return PALETTE[5]
  }
}

export function muscleRoughness(id: string | undefined): number {
  if (id && MUSCLE_ROUGHNESS_OVERRIDE[id] !== undefined) {
    return MUSCLE_ROUGHNESS_OVERRIDE[id]
  }
  return 0.52
}

export function systemColor(system: SystemType): string {
  switch (system) {
    case 'muscle':   return MUSCLE_DEFAULT
    case 'skeleton': return SKELETON_DEFAULT
    case 'nerve':    return NERVE_DEFAULT
    case 'joint':    return JOINT_DEFAULT
    default:         return MUSCLE_DEFAULT
  }
}

export function resolveColor(
  system:     SystemType,
  isHovered:  boolean,
  isSelected: boolean,
  structureId?: string,
  layer?:       LayerType,
): string {
  if (isSelected) return MUSCLE_SELECTED
  if (isHovered)  return system === 'muscle' ? MUSCLE_HOVER : SKELETON_HOVER
  if (system !== 'muscle') return systemColor(system)
  return muscleColor(structureId, layer)
}

// ── Legacy aliases ────────────────────────────────────────────────────────────
export function muscleBaseColor(layer: LayerType | undefined): string {
  return muscleColor(undefined, layer)
}
export function muscleColorVariant(id: string, _base: string): string {
  return muscleColor(id, undefined)
}
