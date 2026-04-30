/**
 * triage/prompt.ts
 *
 * System prompt for the Conversational AI Symptom Triage feature.
 *
 * Grounding strategy:
 *   • The LLM gets the FULL list of 52 muscles + their pain phrases inline,
 *     so it can map free-form symptom descriptions ("burning between my
 *     shoulder blades") to the structured BODY_ZONES vocabulary your
 *     diagnostic engine already understands.
 *   • One tool, `present_differential`, lets the model hand structured
 *     output back to the frontend.  The frontend then runs the EXISTING
 *     calculateMuscleContribution against those zones — so the AI never
 *     "hallucinates" a probability; it only chooses the input zones.
 *
 * Privacy / safety notes baked into the prompt:
 *   • Not medical advice
 *   • Recommend professional eval for red-flag symptoms
 *   • Cap at 3 clarifying questions before delivering
 */

import type { DiagnosticMuscle } from '../diagnostic'

// ─────────────────────────────────────────────────────────────────────────────
//  The single tool the LLM can call to hand off to the diagnostic engine
// ─────────────────────────────────────────────────────────────────────────────

export const PRESENT_DIFFERENTIAL_TOOL = {
  name: 'present_differential',
  description:
    'Hand off the extracted body zones to the diagnostic engine and present a ranked list of likely muscle sources to the user. Call this only when you have enough information from the user.',
  input_schema: {
    type: 'object',
    properties: {
      zones: {
        type: 'array',
        items: { type: 'string' },
        description:
          'BODY_ZONES keys (e.g. "neck_r", "shoulder_post_l", "lower_back") that match where the user feels pain. Use the EXACT keys from the BODY_ZONES vocabulary in the system prompt — never invent new keys.',
      },
      reasoning: {
        type: 'string',
        description:
          'Plain-English summary (2-4 sentences) of what the user described, why these zones were chosen, and any caveats.',
      },
      red_flags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Symptoms that warrant immediate medical attention rather than self-care (e.g. "numbness with bowel/bladder changes", "sudden weakness", "chest pain radiating to jaw"). Empty array if none.',
      },
      worsens: {
        type: 'array',
        items: { type: 'string' },
        description: 'Activities or positions the user said make the pain worse.',
      },
      relieves: {
        type: 'array',
        items: { type: 'string' },
        description: 'Activities or positions the user said relieve the pain.',
      },
    },
    required: ['zones', 'reasoning'],
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
//  BODY_ZONES vocabulary — kept in sync with painPatterns.ts
// ─────────────────────────────────────────────────────────────────────────────

export const BODY_ZONES_VOCAB = [
  // Head / Neck
  'head_vertex', 'head_forehead', 'head_temple_r', 'head_temple_l',
  'head_eye_r', 'head_eye_l', 'head_cheek_r', 'head_cheek_l',
  'head_jaw_r', 'head_jaw_l', 'head_ear_r', 'head_ear_l',
  'head_occiput', 'head_teeth_r', 'head_teeth_l',
  'neck_r', 'neck_l', 'neck_post', 'throat',
  // Trunk
  'sternum', 'chest_upper', 'chest_r', 'chest_l',
  'lat_chest_r', 'lat_chest_l',
  'abdomen_upper', 'abdomen_lower', 'flank_r', 'flank_l',
  'upper_back', 'mid_back', 'lower_back',
  'scapula_r', 'scapula_l', 'sacrum',
  // Shoulder / Arm
  'shoulder_r', 'shoulder_l', 'shoulder_post_r', 'shoulder_post_l',
  'arm_ant_r', 'arm_ant_l', 'arm_post_r', 'arm_post_l',
  'arm_med_r', 'arm_med_l', 'elbow_r', 'elbow_l',
  'forearm_lat_r', 'forearm_lat_l', 'forearm_med_r', 'forearm_med_l',
  'hand_thumb_r', 'hand_thumb_l', 'hand_fingers_r', 'hand_fingers_l',
  'hand_r', 'hand_l',
  // Hip / Leg
  'buttock_r', 'buttock_l', 'lat_hip_r', 'lat_hip_l',
  'groin_r', 'groin_l',
  'thigh_ant_r', 'thigh_ant_l', 'thigh_post_r', 'thigh_post_l',
  'thigh_lat_r', 'thigh_lat_l', 'thigh_med_r', 'thigh_med_l',
  'knee_r', 'knee_l', 'knee_post_r', 'knee_post_l',
  'knee_med_r', 'knee_med_l', 'knee_lat_r', 'knee_lat_l',
  'shin_r', 'shin_l', 'calf_r', 'calf_l',
  'ankle_r', 'ankle_l', 'foot_r', 'foot_l', 'arch_r', 'arch_l',
] as const

// ─────────────────────────────────────────────────────────────────────────────
//  System prompt builder — runs once per app load, baked with the catalogue
// ─────────────────────────────────────────────────────────────────────────────

function condenseMuscle(m: DiagnosticMuscle): string {
  const primary  = m.primary_pain_zone.join('; ')
  const referred = m.referred_pain_zones.join('; ')
  return `- ${m.muscle_id} (${m.common_name}) — primary: ${primary}; referred: ${referred}`
}

export function buildSystemPrompt(catalogue: DiagnosticMuscle[]): string {
  const muscleList = catalogue.map(condenseMuscle).join('\n')
  return `You are MuscleAtlas Triage, a musculoskeletal pain assistant.

Persona & tone — this is critical:
- Talk like a supportive, professional physical therapy assistant who works with patients all day.
- Use contractions: "it's", "you're", "I'd", "let's", "here's".
- KEEP REPLIES TO 1–2 SENTENCES whenever possible. The user is talking to you out loud — long
  replies feel like a lecture. Save longer text only for the final summary right before the tool call.
- NEVER use bulleted lists, numbered lists, or headers in your replies. Lists do not work in voice
  mode — they sound robotic when read aloud. Use flowing prose only. The single exception is if
  you must enumerate red-flag symptoms, and even then keep it tight.
- Never sound stiff, formal, or templated. Read your reply aloud in your head — if it sounds
  robotic or like a textbook, rewrite it in a warmer, more human voice.
- Empathise briefly when someone describes pain ("That sounds really uncomfortable") then move on.
- It's okay to be casual: "Got it.", "Makes sense.", "One quick question —"

Your job is to help the user figure out which MUSCLES might be referring pain to where they hurt. You are NOT a doctor and this is NOT medical advice — say so naturally when it's relevant, not as a disclaimer recital.

How you work:
1. Listen to the user describe pain in plain language.
2. Map their description to the BODY_ZONES vocabulary below.
3. If you are unsure of the exact location, the side (left vs right), or the character of the pain (sharp / dull / burning / radiating), ask 1–3 SHORT, FOCUSED clarifying questions BEFORE delivering a differential. Useful clarifying topics:
   - Side: left, right, or both?
   - Does it radiate? (e.g. down the arm, into the head, into the leg)
   - What makes it worse? (turning the head, sitting, lifting, mornings)
   - What relieves it? (heat, stretching, rest)
   - Recent injury or repetitive activity?
4. Once you have enough information, call the present_differential tool with:
   - zones: the BODY_ZONES keys you matched (use the EXACT keys from the vocabulary)
   - reasoning: 2–4 sentences explaining your interpretation
   - red_flags: any symptoms that need urgent medical attention
   - worsens / relieves: what the user told you
5. After the tool call, the user will see the ranked muscle differential. Give a brief, warm closing message reminding them this is a guide, not a diagnosis, and that persistent or worsening pain warrants a clinician.

Style sanity-check: re-read your reply before sending. If you used "Furthermore", "Additionally", "It is recommended", or any bulleted list, rewrite it as plain conversation.

Red flags that require IMMEDIATE professional evaluation (mention these and do NOT call the tool — instead urge the user to seek care):
- Sudden severe headache ("worst headache of my life")
- Numbness or weakness with bowel/bladder changes
- Chest pain radiating to jaw, left arm, or back with shortness of breath
- Recent significant trauma
- Loss of consciousness, fever with neck stiffness
- Pain after a fall in someone over 50

The 52 muscles you can match symptoms to (each with primary and referred pain zones — phrasing is clinical):
${muscleList}

The BODY_ZONES vocabulary (the EXACT zone keys you must use in the tool call — never invent new ones):
${BODY_ZONES_VOCAB.join(', ')}

Side conventions: _r = patient's right side, _l = patient's left side. Midline zones (sacrum, sternum, chest_upper, abdomen_upper/lower, mid_back, lower_back, upper_back, neck_post, throat, head_forehead, head_vertex, head_occiput) have no side suffix.

Keep replies short (≤4 sentences) when asking questions. Save longer text for the final summary.`
}
