/**
 * personalProgram.ts
 *
 * Generates a 4-week AI-tailored mobility program from the user's ROM
 * history + severity bands. Uses the same Claude Haiku model the triage
 * chat uses, and persists the generated plan in localStorage (and Supabase
 * if signed in) so it survives reloads.
 */

import { loadROMHistory, type ROMRecord } from '../movement/romHistory'
import { JOINT_MOVEMENTS } from '../movement/muscleJointMap'
import { getStoredApiKey } from '../triage/llm'
import { supabase } from '../supabase'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const PROGRAM_MODEL = 'claude-haiku-4-5-20251001'
const STORAGE_KEY   = 'muscleAtlas.personalProgram.v1'

export interface ProgramExercise {
  /** Plain-language name (e.g. "Doorway Stretch"). */
  name:        string
  /** Where it lives in our library — used to launch ExerciseGuidance. */
  exerciseId?: string
  /** Target muscle, lowercase snake (matches MUSCLE_TO_MOVEMENTS keys). */
  muscleId?:   string
  /** Reps × sets OR hold time, plain language. */
  prescription: string
  /** Why this exercise was chosen — shown as the "Coach says" line. */
  rationale:    string
}

export interface ProgramSession {
  /** Short title for the session card. */
  title:       string
  /** Estimated duration in minutes. */
  durationMin: number
  /** Ordered exercise list. */
  exercises:   ProgramExercise[]
}

export interface ProgramDay {
  /** 1..7 within the week. */
  dayNum: number
  /** 'rest' or 'active' — 'rest' days have an empty session list. */
  type:   'active' | 'rest'
  /** Optional theme note (e.g. "Posterior chain mobility"). */
  theme?: string
  sessions: ProgramSession[]
}

export interface ProgramWeek {
  weekNum: number
  /** Brief focus statement for the week. */
  focus:   string
  days:    ProgramDay[]
}

export interface PersonalProgram {
  /** ISO timestamp. */
  generatedAt: string
  /** User-readable headline, e.g. "4-week shoulder mobility program". */
  title:       string
  /** Why this plan was chosen — shown above the calendar. */
  summary:     string
  weeks:       ProgramWeek[]
}

// ─── Build the Claude prompt from history ────────────────────────────────────

function buildSnapshot(records: ROMRecord[]): string {
  if (records.length === 0) return 'No prior assessment data on file.'
  // Aggregate: best peak per (muscle, movement, side), with reference + %.
  const key = (r: ROMRecord) => `${r.muscleId}__${r.movementId}__${r.side}`
  const best = new Map<string, ROMRecord>()
  for (const r of records) {
    const k = key(r)
    const cur = best.get(k)
    if (!cur || r.angle > cur.angle) best.set(k, r)
  }
  const lines: string[] = []
  for (const r of best.values()) {
    const mv = JOINT_MOVEMENTS[r.movementId]
    if (!mv) continue
    const pct = mv.reference.ideal > 0
      ? Math.round((r.angle / mv.reference.ideal) * 100)
      : 0
    lines.push(`- ${mv.label} (${r.side}, ${r.muscleId}): peak ${Math.round(r.angle)}° / ${mv.reference.ideal}° (${pct}%)`)
  }
  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a movement coach for the Zevahealth app. The user has done several range-of-motion assessments using camera-based pose tracking; their measured peaks are given below. Generate a 4-WEEK PROGRESSIVE MOBILITY PROGRAM tailored to their measured deficits and asymmetries.

Constraints:
- General-purpose movement guidance only. NEVER use medical / diagnostic / therapeutic language. No "rehab", "treatment", "physical therapy", "patient", "injury". Use "mobility", "guidance", "session".
- 4 weeks, each week with 7 days. 4 active days + 3 rest days per week is typical.
- Each active day has 1 session, 10-25 minutes.
- Each session has 3-6 exercises. For each exercise:
  - Use ONLY exercises from the provided library (the exerciseId list). Do NOT invent new exercise names.
  - prescription: plain language like "3 sets of 30-second hold each side"
  - rationale: 1 sentence explaining why this exercise for this user, referencing their measured ROM
- Progress week-over-week: longer holds, harder variations, or added reps.
- Address the WEAKEST joints first; respect any low-ROM finding (e.g. <70%) by starting gentle.
- Reply with ONE JSON object only, no prose. Match this schema:

{
  "title": "string",
  "summary": "string - 1-2 sentence rationale shown above the calendar",
  "weeks": [
    {
      "weekNum": 1,
      "focus": "string",
      "days": [
        {
          "dayNum": 1,
          "type": "active" | "rest",
          "theme": "string (optional, only on active days)",
          "sessions": [
            {
              "title": "string",
              "durationMin": number,
              "exercises": [
                { "name": "string", "exerciseId": "string", "muscleId": "string", "prescription": "string", "rationale": "string" }
              ]
            }
          ]
        }
      ]
    }
  ]
}`

const EXERCISE_LIBRARY = `Available exercises (use these exerciseId values only):

DELTOID / SHOULDER:
- doorway_stretch       (Doorway Stretch)
- seated_cross_arm      (Seated Cross-Arm Stretch)
- standing_sleeper      (Standing Sleeper Stretch)
- hand_behind_back      (Hand Behind Back Stretch)
- standing_chest        (Standing Chest Stretch)
- crab_press            (Crab Press)
- side_lying_er         (Side-Lying External Rotation)
- post_shoulder         (Posterior Shoulder Stretch)
- wand_rotation         (Wand Rotation)

BICEPS / ELBOW:
- bb_flex_ext           (Biceps Flex/Extend)
- bb_shoulder_flex      (Shoulder Flexion w/ Arm Curl)
- bb_wall_stretch       (Wall Biceps Stretch)
- bb_ext_rotation       (External Rotation)
- bb_sleeper_stretch    (Sleeper Stretch for Biceps)

GLUTES / HIPS:
- glute_bridge          (Glute Bridge)
- hip_hinge             (Hip Hinge)
- side_clamshell        (Side Clamshell)
- hamstring_squeeze     (Hamstring Squeeze)

QUADS / LEGS:
- qd_wall_squat         (Wall Squat)
- qd_stiff_deadlift     (Stiff-Leg Deadlift)
- qd_quad_stretch_stand (Standing Quad Stretch)
- qd_quad_stretch_side  (Side-Lying Quad Stretch)
- qd_hamstring_supine   (Supine Hamstring Stretch)
`

export async function generatePersonalProgram(): Promise<PersonalProgram> {
  const apiKey = getStoredApiKey() || (import.meta.env as any).VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Missing Anthropic API key — add it via the Triage chat first.')

  const records = loadROMHistory()
  const snapshot = buildSnapshot(records)

  const userMsg = `My measured ROM snapshot:\n${snapshot}\n\n${EXERCISE_LIBRARY}\n\nPlease generate the 4-week JSON program.`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type':                              'application/json',
      'x-api-key':                                 apiKey,
      'anthropic-version':                         '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      PROGRAM_MODEL,
      max_tokens: 4000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userMsg }],
    }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    // Network/auth failure - fall back to local rule-based plan so the user
    // always gets *something* useful instead of a dead-end error.
    console.warn(`[personalProgram] Claude API ${res.status}: ${txt.slice(0, 200)} - falling back to offline plan`)
    const program = buildFallbackProgram(records)
    await savePersonalProgram(program)
    return program
  }
  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ''

  const parsed = extractProgramJson(text)
  if (!parsed) {
    console.warn('[personalProgram] Claude returned non-JSON, falling back to offline plan. Raw:', text.slice(0, 400))
    const program = buildFallbackProgram(records)
    await savePersonalProgram(program)
    return program
  }

  const program: PersonalProgram = {
    generatedAt: new Date().toISOString(),
    title:       parsed.title ?? 'Your 4-week Mobility Program',
    summary:     parsed.summary ?? '',
    weeks:       Array.isArray(parsed.weeks) ? parsed.weeks : [],
  }
  // If Claude produced an empty/garbage skeleton, still fall back so the
  // user gets a usable calendar.
  if (program.weeks.length === 0) {
    const fb = buildFallbackProgram(records)
    program.weeks   = fb.weeks
    program.title   = program.title  || fb.title
    program.summary = program.summary || fb.summary
  }

  await savePersonalProgram(program)
  return program
}

// --- Robust JSON extraction ------------------------------------------------
// Claude Haiku sometimes:
//   - wraps the JSON in ```json fences
//   - prefaces it with "Here is your program:" or similar prose
//   - appends a trailing comment after the closing brace
//   - emits trailing commas inside arrays/objects (invalid JSON but common)
//
// We walk the text, find the first balanced { ... }, repair common issues,
// and try parse. Returns null if everything fails.
function extractProgramJson(raw: string): any | null {
  if (!raw) return null
  // Strip any markdown code-fence wrappers anywhere in the string.
  let txt = raw.replace(/```(?:json)?/gi, '').trim()
  // Find first balanced {...} block.
  const block = firstBalancedObject(txt)
  if (!block) return null
  // First try as-is.
  try { return JSON.parse(block) } catch {}
  // Repair pass 1: remove trailing commas before } or ].
  const repaired = block.replace(/,(\s*[}\]])/g, '$1')
  try { return JSON.parse(repaired) } catch {}
  // Repair pass 2: drop // line comments and block comments.
  const noComments = repaired
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  try { return JSON.parse(noComments) } catch {}
  return null
}

function firstBalancedObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr: '"' | "'" | null = null
  let esc = false
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
    if (inStr) {
      if (esc)              esc = false
      else if (ch === '\\') esc = true
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") { inStr = ch as any; continue }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

// --- Offline fallback program ----------------------------------------------
// Rule-based plan built purely from the user's ROM history (or a generic
// starter plan if they have none). Used when the Claude call fails or
// returns un-parseable text. Guarantees the user always gets a 4-week plan.
function buildFallbackProgram(records: ROMRecord[]): PersonalProgram {
  // Aggregate by joint/region using the same per-joint best as buildSnapshot.
  const key = (r: ROMRecord) => `${r.movementId}__${r.side}`
  const best = new Map<string, ROMRecord>()
  for (const r of records) {
    const k = key(r)
    const cur = best.get(k)
    if (!cur || r.angle > cur.angle) best.set(k, r)
  }
  // Build a deficit list - lower ratio first.
  const deficits = Array.from(best.values()).map((r) => {
    const mv = JOINT_MOVEMENTS[r.movementId]
    const ratio = mv?.reference.ideal ? r.angle / mv.reference.ideal : 1
    return { rec: r, mv, ratio }
  }).filter((d) => d.mv).sort((a, b) => a.ratio - b.ratio)

  // Pick a session bias from the weakest joint groups we see.
  const focusJoints = new Set<string>()
  for (const d of deficits.slice(0, 4)) focusJoints.add(d.mv!.joint)
  if (focusJoints.size === 0) {
    // No data - give a balanced full-body starter.
    focusJoints.add('shoulder').add('hip').add('trunk')
  }

  // Exercise pool per joint group (mirrors the EXERCISE_LIBRARY whitelist).
  const POOLS: Record<string, Array<{ id: string; name: string; muscle: string; rx: string }>> = {
    shoulder: [
      { id: 'standing_chest',   name: 'Standing Chest Stretch',    muscle: 'deltoid',          rx: '3 sets of 30-second hold each side' },
      { id: 'doorway_stretch',  name: 'Doorway Stretch',           muscle: 'pectoralis_major', rx: '3 sets of 30-second hold' },
      { id: 'wand_rotation',    name: 'Wand Rotation',             muscle: 'infraspinatus',    rx: '2 sets of 10 reps each side' },
      { id: 'crab_press',       name: 'Crab Press',                muscle: 'deltoid_posterior', rx: '2 sets of 8 reps' },
    ],
    elbow: [
      { id: 'bb_flex_ext',      name: 'Biceps Flex / Extend',      muscle: 'biceps_brachii',   rx: '2 sets of 12 reps each side' },
      { id: 'bb_wall_stretch',  name: 'Wall Biceps Stretch',       muscle: 'biceps_brachii',   rx: '3 sets of 30-second hold each side' },
    ],
    hip: [
      { id: 'glute_bridge',     name: 'Glute Bridge',              muscle: 'gluteus_maximus',  rx: '3 sets of 12 reps' },
      { id: 'hip_hinge',        name: 'Hip Hinge',                 muscle: 'gluteus_maximus',  rx: '2 sets of 10 reps' },
      { id: 'side_clamshell',   name: 'Side Clamshell',            muscle: 'gluteus_medius',   rx: '2 sets of 12 reps each side' },
    ],
    knee: [
      { id: 'qd_wall_squat',          name: 'Wall Squat',                 muscle: 'rectus_femoris',  rx: '3 sets of 30-second hold' },
      { id: 'qd_quad_stretch_stand',  name: 'Standing Quad Stretch',      muscle: 'rectus_femoris',  rx: '3 sets of 30-second each side' },
      { id: 'qd_hamstring_supine',    name: 'Supine Hamstring Stretch',   muscle: 'biceps_femoris',  rx: '3 sets of 30-second each side' },
    ],
    ankle: [
      { id: 'qd_stiff_deadlift', name: 'Stiff-Leg Deadlift',        muscle: 'gastrocnemius',   rx: '2 sets of 10 reps' },
    ],
    trunk: [
      { id: 'hip_hinge',         name: 'Hip Hinge',                 muscle: 'erector_spinae',  rx: '2 sets of 10 reps' },
      { id: 'glute_bridge',      name: 'Glute Bridge',              muscle: 'erector_spinae',  rx: '3 sets of 12 reps' },
    ],
    cervical: [
      { id: 'wand_rotation',     name: 'Gentle Neck Rotations',     muscle: 'sternocleidomastoid', rx: '2 sets of 6 reps each side' },
    ],
  }

  // Build days: 4 active + 3 rest, rotating across focusJoints.
  const focusList = Array.from(focusJoints)
  const buildDay = (dayNum: number, weekNum: number, joint: string): ProgramDay => {
    const pool = POOLS[joint] ?? POOLS.shoulder
    // Week 2..4 progress: lengthen holds / add a rep.
    const holdSuffix = weekNum === 1 ? ''
                     : weekNum === 2 ? ' (add 5 s to holds)'
                     : weekNum === 3 ? ' (add a set)'
                     :                  ' (slow tempo, controlled)'
    const exercises: ProgramExercise[] = pool.slice(0, 4).map((p) => ({
      name:         p.name,
      exerciseId:   p.id,
      muscleId:     p.muscle,
      prescription: p.rx + holdSuffix,
      rationale:    `Targets ${joint} mobility based on your assessment focus.`,
    }))
    return {
      dayNum,
      type:  'active',
      theme: `${joint.charAt(0).toUpperCase() + joint.slice(1)} mobility`,
      sessions: [{
        title:       `${joint.charAt(0).toUpperCase() + joint.slice(1)} session`,
        durationMin: 12,
        exercises,
      }],
    }
  }
  const restDay = (dayNum: number): ProgramDay => ({ dayNum, type: 'rest', sessions: [] })

  const weeks: ProgramWeek[] = [1, 2, 3, 4].map((wk) => {
    const days: ProgramDay[] = []
    let activeCount = 0
    for (let d = 1; d <= 7; d += 1) {
      // Pattern: active, active, rest, active, rest, active, rest
      const pattern = [true, true, false, true, false, true, false]
      if (pattern[d - 1]) {
        const joint = focusList[activeCount % focusList.length]
        days.push(buildDay(d, wk, joint))
        activeCount += 1
      } else {
        days.push(restDay(d))
      }
    }
    return {
      weekNum: wk,
      focus:   wk === 1 ? `Baseline mobility - focus on ${focusList.join(', ')}.`
              : wk === 2 ? 'Build - slightly longer holds, same movements.'
              : wk === 3 ? 'Extend - add a set where the motion feels easy.'
              :            'Refine - slow tempo, full-range control.',
      days,
    }
  })

  const summary = deficits.length > 0
    ? `Offline plan based on your latest assessments - emphasis on ${focusList.join(', ')} where your measured ROM was lowest.`
    : 'Offline starter plan - run a Full-Body Assessment first so I can tailor this to your measured ROM.'

  return {
    generatedAt: new Date().toISOString(),
    title:       'Your 4-week Mobility Program',
    summary,
    weeks,
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export async function savePersonalProgram(program: PersonalProgram): Promise<void> {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(program)) } catch {}
  // Best-effort cloud save (table is optional — failure is silent).
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await supabase.from('user_programs').upsert({
        user_id:     session.user.id,
        generated_at: program.generatedAt,
        title:       program.title,
        plan:        program,
      })
    }
  } catch { /* ignore */ }
}

export async function loadPersonalProgram(): Promise<PersonalProgram | null> {
  // Try cloud first when signed in.
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data } = await supabase
        .from('user_programs')
        .select('plan')
        .eq('user_id', session.user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data?.plan) return data.plan as PersonalProgram
    }
  } catch { /* ignore - fall back to local */ }
  // Local fallback.
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersonalProgram
  } catch {}
  return null
}

export function clearPersonalProgram(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}
