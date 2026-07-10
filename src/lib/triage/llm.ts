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
import { completeSentences } from '../speechText'
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
  /** Top-1 targeted muscle the AI nailed down through questioning. */
  primary_muscle_id?: string
  /** Optional parent group label (e.g. "Hamstrings", "Deltoid"). */
  primary_group?:     string
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
 * Server-side proxy (recommended for public launch)
 * ──────────────────────────────────────────────────
 * When VITE_LLM_PROXY_URL is set, the browser sends chat requests to THAT URL
 * instead of api.anthropic.com, and the proxy attaches the real Anthropic key
 * server-side (e.g. a Supabase Edge Function — see supabase/functions/
 * anthropic-proxy/). The key is NEVER shipped to the browser, so visitors can't
 * read it out of the JS bundle and abuse it.
 *
 * ⚠️ Do NOT put an Anthropic key in a VITE_* variable: every VITE_* value is
 * inlined into the public build and is trivially extractable. The old
 * VITE_ANTHROPIC_API_KEY fallback was removed for exactly this reason.
 */
const _rawProxy = (import.meta.env.VITE_LLM_PROXY_URL as string | undefined)?.trim() || ''
// Guard: a URL pasted without a scheme (e.g. "xyz.supabase.co/functions/v1/…")
// would be treated by fetch() as a RELATIVE path and POST to the static site,
// which returns 405. Prepend https:// so the proxy is always hit absolutely.
export const LLM_PROXY_URL = _rawProxy && !/^https?:\/\//i.test(_rawProxy) ? `https://${_rawProxy}` : _rawProxy
export function hasLlmProxy(): boolean { return !!LLM_PROXY_URL }

/** Sentinel returned by getStoredApiKey() when a proxy handles auth for us. */
export const PROXY_KEY = 'proxy'

/**
 * The active credential:
 *   1. If a proxy is configured → a sentinel (no real key lives in the browser).
 *   2. Otherwise the user's own key from localStorage (bring-your-own-key).
 *   3. null → the UI shows the key-entry prompt.
 */
export function getStoredApiKey(): string | null {
  if (hasLlmProxy()) return PROXY_KEY
  // Local-development convenience ONLY: the owner can drop VITE_ANTHROPIC_API_KEY
  // in .env.local to exercise the AI without standing up the proxy. import.meta.env.DEV
  // is false in production builds, so this can never bake a key into the shipped site.
  if (import.meta.env.DEV) {
    const devKey = (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)?.trim()
    if (devKey && devKey.startsWith('sk-')) return devKey
  }
  try {
    const stored = localStorage.getItem(KEY_STORAGE)
    if (stored) return stored
  } catch { /* ignore */ }
  return null
}

/** True when the AI can be used without the visitor supplying anything (proxy
 *  in prod, or a dev key locally). Drives whether AI sections are shown as ready. */
export function aiReady(): boolean {
  return !!getStoredApiKey()
}
export function setStoredApiKey(key: string): void {
  try { localStorage.setItem(KEY_STORAGE, key) } catch { /* ignore */ }
}
export function clearStoredApiKey(): void {
  try { localStorage.removeItem(KEY_STORAGE) } catch { /* ignore */ }
}

/**
 * Single entry point for calling Claude's Messages API. Routes through the proxy
 * when configured (no key in the browser), otherwise calls Anthropic directly
 * with the user's own key. Both the triage chat and the live workout coach use
 * this so the key handling stays in one place.
 */
export async function anthropicMessages(
  body: Record<string, unknown>,
  apiKey?: string | null,
): Promise<Response> {
  if (hasLlmProxy()) {
    return fetch(LLM_PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  if (!apiKey || apiKey === PROXY_KEY) throw new Error('Missing API key')
  return fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type':                              'application/json',
      'x-api-key':                                 apiKey,
      'anthropic-version':                         '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })
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
// Opus 4.8 — conversational quality is the product here (the reply is spoken
// aloud), and Haiku's clipped, template-y phrasing read as robotic. Opus does
// not accept temperature/top_p/top_k; omitting `thinking` runs without
// thinking, which keeps voice-loop latency low.
const MODEL_ID       = 'claude-opus-4-8'

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
  if (!apiKey && !hasLlmProxy()) throw new Error('Missing API key')
  if (catalogue.length === 0) throw new Error('Diagnostic catalogue not loaded')

  const system = getSystemPrompt(catalogue)
  const messages = history.map((m) => ({ role: m.role, content: m.content }))

  const res = await anthropicMessages({
    model:      MODEL_ID,
    // Short replies + the structured tool payload (zones/reasoning/red_flags
    // arrays). 220 was tight enough that a verbose differential could get
    // budget-cut mid-JSON, losing the whole tool call for that turn.
    max_tokens: 600,
    // The system prompt embeds the full 52-muscle catalogue and never changes
    // within a session — cache it so every turn after the first reads it at
    // ~0.1x price and lower latency instead of reprocessing it.
    system:     [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools:      [PRESENT_DIFFERENTIAL_TOOL],
    messages,
  }, apiKey)

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
        primary_muscle_id: typeof input.primary_muscle_id === 'string' ? input.primary_muscle_id : undefined,
        primary_group:     typeof input.primary_group     === 'string' ? input.primary_group     : undefined,
      }
    }
  }

  // A budget-cut reply (stop_reason max_tokens) can end mid-sentence — bad in
  // a chat bubble, worse read aloud. Trim to the last clean sentence boundary.
  if (data.stop_reason === 'max_tokens') textReply = completeSentences(textReply)

  // Fallback: if the model went straight to the tool with no narration, give
  // the chat bubble a short stock string so the timeline isn't empty.
  if (!textReply && differential) {
    textReply = "Based on what you've described, here's my best read of likely sources."
  }

  return { textReply, differential }
}
