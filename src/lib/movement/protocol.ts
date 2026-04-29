/**
 * protocol.ts
 *
 * Personalised 5-minute daily protocol generator.
 *
 * Walks the prioritised MuscleFinding list and assembles 5–7 exercises
 * (mix of stretches and activations) that target the most-flagged muscles.
 * Each exercise has a target muscle_id, intent (stretch / activate),
 * duration and short cue.
 *
 * The library is intentionally small and beginner-safe — the bar is "what
 * a competent PT would prescribe for an asymptomatic person presenting
 * this pattern".  Real clinical use should always involve professional
 * evaluation; this protocol is shown alongside that disclaimer in the UI.
 */

import type { MuscleFinding } from './scoring'

export type ExerciseIntent = 'stretch' | 'activate'

export interface Exercise {
  id:        string
  /** muscle_id keys from painDiagnostic.json that this exercise serves. */
  muscles:   string[]
  intent:    ExerciseIntent
  title:     string
  cue:       string
  /** Recommended dose — "60s hold", "2 × 10", "30s/side" etc. */
  dose:      string
  /** Approx total time in seconds (used to budget the 5-min protocol). */
  seconds:   number
  /** Optional friendly emoji for the card. */
  emoji?:    string
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exercise library (curated, beginner-safe)
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_LIBRARY: Exercise[] = [
  // Hip / glute
  { id: 'side_clamshell',     muscles: ['gluteus_medius', 'gluteus_minimus'], intent: 'activate',
    title: 'Side-Lying Clamshell', cue: 'Lie on your side, knees bent. Keep heels together and lift the top knee.',
    dose: '2 × 12/side', seconds: 75, emoji: '🦵' },
  { id: 'side_bridge',        muscles: ['gluteus_medius', 'quadratus_lumborum'], intent: 'activate',
    title: 'Side Bridge', cue: 'Side plank from the knees, hold tall.',
    dose: '2 × 20s/side', seconds: 60, emoji: '🪧' },
  { id: 'glute_bridge',       muscles: ['gluteus_maximus'], intent: 'activate',
    title: 'Glute Bridge', cue: 'Lie on back, drive heels down, lift hips. Squeeze the glutes — don\'t arch the back.',
    dose: '2 × 12', seconds: 60, emoji: '🌉' },
  { id: 'standing_hip_hike',  muscles: ['quadratus_lumborum'], intent: 'activate',
    title: 'Standing Hip Hike', cue: 'Stand on one leg on a step, drop the off-leg hip, then hike it up.',
    dose: '2 × 10/side', seconds: 60, emoji: '⬆️' },

  // Hamstring / lower leg
  { id: 'hamstring_supine',   muscles: ['biceps_femoris', 'semitendinosus', 'semimembranosus'], intent: 'stretch',
    title: 'Supine Hamstring Stretch', cue: 'Lie on back, loop a strap over the foot, straighten the leg up.',
    dose: '45s/side', seconds: 90, emoji: '🩹' },
  { id: 'wall_calf_stretch',  muscles: ['gastrocnemius', 'soleus'], intent: 'stretch',
    title: 'Wall Calf Stretch', cue: 'Hands on wall, back leg straight, push the heel down.',
    dose: '30s/side', seconds: 60, emoji: '🧱' },

  // Quad / front of hip
  { id: 'couch_stretch',      muscles: ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis'], intent: 'stretch',
    title: 'Couch / Quad Stretch', cue: 'Back knee on a soft surface, foot up against a wall, tuck pelvis under.',
    dose: '45s/side', seconds: 90, emoji: '🛋️' },

  // Adductors / inner thigh
  { id: 'adductor_rocking',   muscles: ['adductor_longus', 'gracilis'], intent: 'stretch',
    title: 'Adductor Rocking', cue: 'On all fours, one leg out to the side, rock back gently.',
    dose: '45s/side', seconds: 90, emoji: '🦒' },

  // Spine / lower back
  { id: 'cat_cow',            muscles: ['erector_spinae', 'multifidus'], intent: 'activate',
    title: 'Cat-Cow', cue: 'On all fours, alternate between rounding and arching your spine.',
    dose: '10 reps', seconds: 60, emoji: '🐈' },
  { id: 'thread_the_needle',  muscles: ['rhomboid_major', 'rhomboid_minor', 'trapezius_middle'], intent: 'stretch',
    title: 'Thread the Needle', cue: 'On all fours, slide one arm under the other, drop the shoulder to the floor.',
    dose: '30s/side', seconds: 60, emoji: '🧵' },

  // Shoulder / rotator cuff
  { id: 'doorway_pec',        muscles: ['pectoralis_major'], intent: 'stretch',
    title: 'Doorway Pec Stretch', cue: 'Forearm on the doorframe at shoulder height, step through.',
    dose: '30s/side', seconds: 60, emoji: '🚪' },
  { id: 'sleeper_stretch',    muscles: ['subscapularis'], intent: 'stretch',
    title: 'Sleeper Stretch', cue: 'Lie on the affected side, arm out at 90°, gently press the forearm down.',
    dose: '30s/side', seconds: 60, emoji: '😴' },
  { id: 'band_external_rot',  muscles: ['infraspinatus', 'teres_minor'], intent: 'activate',
    title: 'Band External Rotation', cue: 'Elbow tucked, rotate the forearm out against a light band.',
    dose: '2 × 12/side', seconds: 60, emoji: '🎯' },
  { id: 'lower_trap_y',       muscles: ['trapezius_lower', 'serratus_anterior'], intent: 'activate',
    title: 'Prone Y Raise', cue: 'Face down, arms in a Y, thumbs up. Lift arms a few inches.',
    dose: '2 × 10', seconds: 60, emoji: '🔱' },
  { id: 'lat_stretch',        muscles: ['latissimus_dorsi', 'teres_major'], intent: 'stretch',
    title: 'Overhead Lat Stretch', cue: 'Reach overhead, side-bend away, lengthen the side body.',
    dose: '30s/side', seconds: 60, emoji: '🌿' },

  // Neck
  { id: 'neck_isometrics',    muscles: ['sternocleidomastoid', 'levator_scapulae', 'splenius_capitis'], intent: 'activate',
    title: 'Neck Isometrics', cue: 'Press your head into your hand without moving — front, sides, back.',
    dose: '5s × 5/dir', seconds: 60, emoji: '🧠' },
  { id: 'levator_stretch',    muscles: ['levator_scapulae'], intent: 'stretch',
    title: 'Levator Scap Stretch', cue: 'Look down toward your armpit, gently pull the head with the same-side hand.',
    dose: '30s/side', seconds: 60, emoji: '🪶' },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Protocol generation
// ─────────────────────────────────────────────────────────────────────────────

export interface ProtocolItem {
  exercise:        Exercise
  /** Muscles from the user's findings that this exercise targets. */
  targetMuscles:   string[]
  /** Reason this exercise was chosen (echoes the finding rationales). */
  rationale:       string
}

export interface DailyProtocol {
  /** Total estimated time in seconds. */
  totalSeconds: number
  items:        ProtocolItem[]
}

const TARGET_TOTAL_SECONDS = 300   // 5 minutes
const MAX_ITEMS            = 7

/**
 * Generate a 5-minute daily protocol from the prioritised findings list.
 *
 * Algorithm:
 *   1. Walk findings in priority order.
 *   2. For each finding, pick the highest-coverage exercise whose muscle
 *      list intersects this finding AND hasn't been chosen yet.
 *   3. Stop when totalSeconds >= 300 or items >= MAX_ITEMS.
 *   4. Always include at least one *activation* exercise to round out the
 *      protocol if the chosen items are all stretches (and vice versa).
 */
export function generateProtocol(findings: MuscleFinding[]): DailyProtocol {
  const items: ProtocolItem[] = []
  let total = 0
  const usedExerciseIds = new Set<string>()
  const seenMuscles     = new Set<string>()

  // Helper: best exercise covering a given muscle that isn't already in.
  function bestExerciseFor(muscleId: string): Exercise | null {
    const candidates = EXERCISE_LIBRARY.filter(
      (e) => e.muscles.includes(muscleId) && !usedExerciseIds.has(e.id),
    )
    if (candidates.length === 0) return null
    // Prefer exercises that ALSO cover other already-flagged muscles.
    candidates.sort((a, b) => {
      const ax = a.muscles.filter((m) => seenMuscles.has(m)).length
      const bx = b.muscles.filter((m) => seenMuscles.has(m)).length
      return bx - ax
    })
    return candidates[0]
  }

  for (const finding of findings) {
    if (items.length >= MAX_ITEMS || total >= TARGET_TOTAL_SECONDS) break
    seenMuscles.add(finding.muscle_id)
    const ex = bestExerciseFor(finding.muscle_id)
    if (!ex) continue
    usedExerciseIds.add(ex.id)
    items.push({
      exercise:      ex,
      targetMuscles: ex.muscles.filter((m) => seenMuscles.has(m)),
      rationale:     finding.reasons[0] ?? '',
    })
    total += ex.seconds
  }

  // Balance: ensure at least one of each intent (stretch + activate).
  const haveStretch  = items.some((i) => i.exercise.intent === 'stretch')
  const haveActivate = items.some((i) => i.exercise.intent === 'activate')
  if ((!haveStretch || !haveActivate) && items.length < MAX_ITEMS) {
    const need: ExerciseIntent = haveStretch ? 'activate' : 'stretch'
    const filler = EXERCISE_LIBRARY.find(
      (e) => e.intent === need && !usedExerciseIds.has(e.id),
    )
    if (filler) {
      items.push({
        exercise:      filler,
        targetMuscles: [],
        rationale:     need === 'stretch' ? 'Daily mobility maintenance.' : 'Daily stability maintenance.',
      })
      total += filler.seconds
      usedExerciseIds.add(filler.id)
    }
  }

  return { totalSeconds: total, items }
}
