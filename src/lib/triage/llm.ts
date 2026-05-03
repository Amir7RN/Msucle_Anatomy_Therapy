/**
 * triage/llm.ts
 *
 * Anthropic Claude API client for the Conversational AI Symptom Triage.
 *
 * v1 architecture:
 *   • Browser-direct fetch to api.anthropic.com using a user-supplied API key.
 *   • Key stored in localStorage on the user's machine — NEVER sent anywhere
 *     except Anthropic's API.
 *   • For commercial release, swap to a serverless proxy so users don't need
 *     to bring their own key — see notes in TriageChat.tsx.
 *
 * Why direct browser calls work:
 *   Anthropic exposes an explicit opt-in header
 *     anthropic-dangerous-direct-browser-access: true
 *   that bypasses CORS pre-flight blocking for prototype use.  It's documented
 *   and safe AS LONG AS THE KEY IS THE END USER'S OWN.  Production should
 *   never expose any other party's key in browser code.
 */

import { buildSystemPrompt, PRESENT_DIFFERENTIAL_TOOL } from './prompt'
import type { DiagnosticMuscle } from '../diagnostic'

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

export type TriageRole = 'user' | 'assistant'

/** A single chat message, as the UI tracks it (and as Anthropic accepts). */
export interface TriageChatMessage {
  role:    TriageRole
  /** Plain text shown in the chat bubble. */
  content: string
  /** Timestamp for ordering / PDF export. */
  ts:      number
}

/** Structured output the LLM emits via the present_differential tool call. */
export interface DifferentialPayload {
  zones:     string[]
  reasoning: string
  red_flags: string[]
  worsens:   string[]
  relieves:  string[]
}

/**
 * What chatTriage returns each turn.
 *  • textReply  — the assistant's chat-bubble text (always present)
 *  • differential — set when the LLM called present_differential this turn
 */
export interface TriageTurnResult {
  textReply:    string
  differential: DifferentialPayload | null
}

// ─────────────────────────────────────────────────────────────────────────────
//  API key helpers
// ─────────────────────────────────────────────────────────────────────────────

const KEY_STORAGE = 'muscleAtlas.triage.apiKey'

/**
 * Returns the active API key using this priority order:
 *   1. Key saved by the user in localStorage (their own personal key)
 *   2. VITE_ANTHROPIC_API_KEY baked into the build at deploy time
 *      (set as a GitHub Actions secret → everyone who visits the site uses it)
 *   3. null → the UI shows the key-entry prompt
 */
export function getStoredApiKey(): string | null {
  try {
    const stored = localStorage.getItem(KEY_STORAGE)
    if (stored) return stored
  } catch { /* ignore */ }
  // Fall back to the build-time env variable (set via GitHub Actions secret)
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
  return envKey && envKey.startsWith('sk-') ? envKey : null
}
export function setStoredApiKey(key: string): void {
  try { localStorage.setItem(KEY_STORAGE, key) } catch { /* ignore */ }
}
export function clearStoredApiKey(): void {
  try { localStorage.removeItem(KEY_STORAGE) } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
//  System-prompt cache — built once per catalogue load
// ─────────────────────────────────────────────────────────────────────────────

let _systemPromptCache: string | null = null
let _cacheCatalogueLen = -1

function getSystemPrompt(catalogue: DiagnosticMuscle[]): string {
  if (_systemPromptCache && _cacheCatalogueLen === catalogue.length) {
    return _systemPromptCache
  }
  _systemPromptCache  = buildSystemPrompt(catalogue)
  _cacheCatalogueLen  = catalogue.length
  return _systemPromptCache
}

// ─────────────────────────────────────────────────────────────────────────────
//  chatTriage — single LLM turn
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages'
const MODEL_ID       = 'claude-haiku-4-5-20251001'   // fast + cheap; ideal for 1-2 sentence triage replies

interface AnthropicContentBlockText { type: 'text'; text: string }
interface AnthropicContentBlockToolUse {
  type:  'tool_use'
  id:    string
  name:  string
  input: Record<string, unknown>
}
type AnthropicContentBlock = AnthropicContentBlockText | AnthropicContentBlockToolUse

interface AnthropicResponse {
  content:     AnthropicContentBlock[]
  stop_reason: string
  type:        string
  error?:      { message: string }
}

export async function chatTriage(
  history:   TriageChatMessage[],
  catalogue: DiagnosticMuscle[],
  apiKey:    string,
): Promise<TriageTurnResult> {
  if (!apiKey) throw new Error('Missing API key')
  if (catalogue.length === 0) throw new Error('Diagnostic catalogue not loaded')

  const system = getSystemPrompt(catalogue)
  const messages = history.map((m) => ({ role: m.role, content: m.content }))

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type':                              'application/json',
      'x-api-key':                                 apiKey,
      'anthropic-version':                         '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      MODEL_ID,
      max_tokens: 180,   // HUMANOID TONE: forces 1-2 sentence replies (≈120-160 tokens typical)
      system,
      tools:      [PRESENT_DIFFERENTIAL_TOOL],
      messages,
    }),
  })

  if (!res.ok) {
    let msg = `LLM API error ${res.status}`
    try { const body = await res.json(); if (body?.error?.message) msg = body.error.message } catch {}
    throw new Error(msg)
  }

  const data = (await res.json()) as AnthropicResponse

  let textReply: string = ''
  let differential: DifferentialPayload | null = null

  for (const block of data.content) {
    if (block.type === 'text') {
      textReply += (textReply ? '\n\n' : '') + block.text
    } else if (block.type === 'tool_use' && block.name === PRESENT_DIFFERENTIAL_TOOL.name) {
      const input = block.input as Partial<DifferentialPayload>
      differential = {
        zones:     Array.isArray(input.zones)     ? input.zones.filter((z) => typeof z === 'string') : [],
        reasoning: typeof input.reasoning === 'string' ? input.reasoning : '',
        red_flags: Array.isArray(input.red_flags) ? input.red_flags.filter((s) => typeof s === 'string') : [],
        worsens:   Array.isArray(input.worsens)   ? input.worsens.filter((s) => typeof s === 'string')   : [],
        relieves:  Array.isArray(input.relieves)  ? input.relieves.filter((s) => typeof s === 'string')  : [],
      }
    }
  }

  // Fallback: if the model went straight to the tool with no narration, give
  // the chat bubble a short stock string so the timeline isn't empty.
  if (!textReply && differential) {
    textReply = "Based on what you've described, here's my best read of likely sources."
  }

  return { textReply, differential }
}
