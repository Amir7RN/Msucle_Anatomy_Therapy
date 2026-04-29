/**
 * muscleNormalization.ts
 *
 * Per-muscle micro-adjustments applied AFTER the global non-uniform
 * MuscleOverlay scale.  Use this when "fattening" the entire muscle shell
 * to fit the Meshy athletic torso has the side effect of pushing one
 * specific muscle (commonly the deltoids, lateral glutes, or pecs) off
 * its anatomical landmark on the new body.
 *
 * Format
 *   MUSCLE_NORMALIZATION[<structureId>] = {
 *     scale?:    [sx, sy, sz]      // multiplier on top of the global scale
 *     position?: [dx, dy, dz]      // additive offset (in legacy-model units)
 *   }
 *
 *   structureId is the existing GLB mesh ID — e.g. MUSC_DELTOID_LATERAL_R.
 *   Add entries only as needed; an empty record is a no-op.
 *
 *   Reference values for the deltoids are pre-seeded as zero / unit so the
 *   intent is documented even when the values do nothing.  Tune visually,
 *   then commit.
 */

export interface NormalizationEntry {
  scale?:    [number, number, number]
  position?: [number, number, number]
}

export const MUSCLE_NORMALIZATION: Record<string, NormalizationEntry> = {
  // ── Deltoids — common culprit when global X scale is increased ──────────
  // MUSC_DELTOID_ANTERIOR_R:  { position: [-0.005, 0.000, 0.005] },
  // MUSC_DELTOID_ANTERIOR_L:  { position: [ 0.005, 0.000, 0.005] },
  // MUSC_DELTOID_LATERAL_R:   { position: [-0.010, 0.005, 0.000] },
  // MUSC_DELTOID_LATERAL_L:   { position: [ 0.010, 0.005, 0.000] },
  // MUSC_DELTOID_POSTERIOR_R: { position: [-0.005, 0.000,-0.005] },
  // MUSC_DELTOID_POSTERIOR_L: { position: [ 0.005, 0.000,-0.005] },

  // ── Pectoralis — if chest stretch makes the pec ride up the clavicle ───
  // MUSC_PECTORALIS_MAJOR_R:  { position: [0, -0.005, 0] },
  // MUSC_PECTORALIS_MAJOR_L:  { position: [0, -0.005, 0] },

  // ── Glutes — lateral drift when global X is widened ─────────────────────
  // MUSC_GLUTEUS_MEDIUS_R:    { position: [ 0.005, 0, 0] },
  // MUSC_GLUTEUS_MEDIUS_L:    { position: [-0.005, 0, 0] },
}

/** Returns the entry for a structure, falling back to identity. */
export function getNormalization(id: string | undefined | null): NormalizationEntry {
  if (!id) return {}
  return MUSCLE_NORMALIZATION[id] ?? {}
}
