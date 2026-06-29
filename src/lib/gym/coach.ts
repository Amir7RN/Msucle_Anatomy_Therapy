/**
 * gym/coach.ts
 *
 * The MoveMate Train AI form-coach. Deliberately TOKEN-FRUGAL:
 *   • Default cues come from the exercise's own `cues` list (spoken locally —
 *     ZERO API cost).
 *   • The optional Claude coach is THROTTLED hard: it only fires on meaningful
 *     moments (set start, the halfway rep, or a sustained form problem) and never
 *     more than once every COOLDOWN_MS. max_tokens is tiny.
 * This means an entire set costs at most a few small calls, not a stream of them.
 */

import { getStoredApiKey } from '../triage/llm'
import type { Exercise } from './exercises'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL_ID = 'claude-haiku-4-5-20251001'
const COOLDOWN_MS = 12000

export interface CoachSnapshot {
  reps:        number
  repGoal:     number
  peakActivation: number   // 0..1
  romDeg:      number
  bpm?:        number | null
  /** seconds the user has been in poor form recently (drives a correction cue). */
  poorFormSec?: number
}

export function gymCoachEnabled(): boolean {
  return !!getStoredApiKey()
}

/**
 * A tiny throttled coach. Returns a short spoken cue, or null if it's not time
 * to speak / no key. Pure-local fallbacks are handled by the caller using
 * exercise.cues so this is purely the *optional* AI layer.
 */
export function createGymCoach(exercise: Exercise) {
  let lastAt = 0
  let busy = false

  async function maybeCue(snap: CoachSnapshot, reason: 'start' | 'halfway' | 'form' | 'done'): Promise<string | null> {
    const key = getStoredApiKey()
    if (!key) return null
    const now = Date.now()
    if (reason !== 'start' && reason !== 'done' && now - lastAt < COOLDOWN_MS) return null
    if (busy) return null
    busy = true
    lastAt = now

    const prompt =
      `You are a concise gym form-coach. Exercise: ${exercise.name} (${exercise.focus}). ` +
      `Target muscles: ${exercise.primary.join(', ')}. Key cues: ${exercise.cues.join('; ')}. ` +
      `Live: rep ${snap.reps}/${snap.repGoal}, peak contraction ${(snap.peakActivation * 100) | 0}%, ` +
      `range of motion ${snap.romDeg | 0}°` +
      (snap.bpm ? `, heart rate ${snap.bpm} bpm` : '') +
      (snap.poorFormSec ? `, partial range for ${snap.poorFormSec | 0}s` : '') + `. ` +
      `Context: ${reason}. Give ONE short spoken cue (max 14 words), motivating and specific. No preamble.`

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL_ID,
          max_tokens: 40,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
      const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ').trim()
      return text || null
    } catch {
      return null
    } finally {
      busy = false
    }
  }

  return { maybeCue }
}
