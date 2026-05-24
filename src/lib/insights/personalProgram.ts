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
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ''

  // Defensive JSON extraction — Claude sometimes wraps in ```json blocks.
  const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  let parsed: any
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    console.error('[personalProgram] Claude returned non-JSON:', text)
    throw new Error('Coach response was not valid JSON. Try again.')
  }

  const program: PersonalProgram = {
    generatedAt: new Date().toISOString(),
    title:       parsed.title ?? 'Your 4-week Mobility Program',
    summary:     parsed.summary ?? '',
    weeks:       Array.isArray(parsed.weeks) ? parsed.weeks : [],
  }

  await savePersonalProgram(program)
  return program
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
