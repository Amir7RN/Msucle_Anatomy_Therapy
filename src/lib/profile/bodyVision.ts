/**
 * bodyVision.ts
 *
 * Optional Claude-vision refinement of the body-composition estimate. Reuses
 * the SAME Anthropic key the rest of the app already uses (the one stored by the
 * Symptom Triage chat / load estimator), so the user doesn't enter anything new.
 *
 * Given a captured still (front pose) plus the user's height / weight / age /
 * sex, Claude returns a body-fat estimate, a build descriptor and a confidence.
 * That is then BLENDED with the geometric BMI-based estimate in bodyScan.ts —
 * it never replaces it, and if no key is present the scan silently falls back to
 * geometry only. Everything stays an estimate with a range; no medical claim.
 *
 * Privacy: one low-res still is sent to Anthropic with the user's own key, the
 * same trust boundary as the existing weight-detection feature. Nothing is
 * stored server-side by us.
 */

import { getStoredApiKey } from '../triage/llm'
import type { BuildClass } from './userProfile'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL_ID = 'claude-haiku-4-5-20251001'

export interface VisionComposition {
  bodyFatPct: number
  build:      BuildClass
  confidence: number
}

export function bodyVisionEnabled(): boolean {
  return !!getStoredApiKey()
}

/** Downscale a webcam still to a small JPEG and return base64 (no data: prefix). */
export function grabStillBase64(video: HTMLVideoElement, maxW = 512): string | null {
  if (!video.videoWidth) return null
  const scale = Math.min(1, maxW / video.videoWidth)
  const w = Math.round(video.videoWidth * scale)
  const h = Math.round(video.videoHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  const url = canvas.toDataURL('image/jpeg', 0.65)
  const comma = url.indexOf(',')
  return comma >= 0 ? url.slice(comma + 1) : null
}

const VALID_BUILDS: BuildClass[] = ['lean', 'athletic', 'average', 'solid', 'heavy']

function parse(text: string): VisionComposition | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>
    const bf = typeof j.bodyFatPct === 'number' ? j.bodyFatPct : Number(j.bodyFatPct)
    if (!isFinite(bf)) return null
    const build = (typeof j.build === 'string' && (VALID_BUILDS as string[]).includes(j.build))
      ? (j.build as BuildClass) : 'average'
    const conf = typeof j.confidence === 'number' ? j.confidence : 0.4
    return {
      bodyFatPct: Math.max(4, Math.min(55, bf)),
      build,
      confidence: Math.max(0, Math.min(1, conf)),
    }
  } catch { return null }
}

export interface VisionInput {
  heightCm: number; weightKg: number; sex: 'male' | 'female'; ageYears: number | null
}

/**
 * Ask Claude vision for a body-composition read. `stills` are base64 JPEGs
 * (front required; side/back optional, sent if present for a better view).
 * Returns null on any failure (caller falls back to the geometric estimate).
 */
export async function estimateCompositionVision(
  stills: { front?: string | null; side?: string | null; back?: string | null },
  input: VisionInput,
): Promise<VisionComposition | null> {
  const key = getStoredApiKey()
  if (!key) return null
  const imgs = [stills.front, stills.side, stills.back].filter((s): s is string => !!s)
  if (imgs.length === 0) return null

  const prompt =
    `These are webcam photos of one person from a few angles (front, and possibly side/back). ` +
    `Their height is ${input.heightCm} cm, weight ${input.weightKg} kg` +
    (input.ageYears != null ? `, age ${input.ageYears}` : '') +
    `, sex ${input.sex}. Estimate their body-fat percentage and overall build from the visible ` +
    `muscularity, waist and proportions. This is a rough fitness estimate, not a medical reading. ` +
    `Reply with ONLY compact JSON, no prose:\n` +
    `{"bodyFatPct": <number>, "build": "lean"|"athletic"|"average"|"solid"|"heavy", "confidence": <0..1>}`

  const content: unknown[] = imgs.map((data) => ({
    type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data },
  }))
  content.push({ type: 'text', text: prompt })

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type':                              'application/json',
        'x-api-key':                                 key,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: 120,
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
    return parse(text)
  } catch {
    return null
  }
}

/**
 * Blend a geometric body-fat estimate with the vision estimate (if any),
 * weighted by their confidences, and return the merged numbers + a tightened
 * range. Pure — no I/O.
 */
export function blendComposition(
  geo: { bodyFatPct: number; confidence: number; build: BuildClass },
  vision: VisionComposition | null,
): { bodyFatPct: number; bodyFatLow: number; bodyFatHigh: number; confidence: number; build: BuildClass; method: 'camera' | 'camera+ai' } {
  if (!vision) {
    const half = 4 + (1 - geo.confidence) * 8
    return {
      bodyFatPct: +geo.bodyFatPct.toFixed(1),
      bodyFatLow: +Math.max(3, geo.bodyFatPct - half).toFixed(1),
      bodyFatHigh: +Math.min(60, geo.bodyFatPct + half).toFixed(1),
      confidence: geo.confidence, build: geo.build, method: 'camera',
    }
  }
  const wG = geo.confidence, wV = vision.confidence
  const wSum = Math.max(1e-3, wG + wV)
  const bf = (geo.bodyFatPct * wG + vision.bodyFatPct * wV) / wSum
  // Two independent estimates agreeing → higher confidence; disagreeing widens.
  const spread = Math.abs(geo.bodyFatPct - vision.bodyFatPct)
  const confidence = Math.min(0.8, (wG + wV) / 2 + 0.1 - Math.min(0.15, spread / 60))
  const half = Math.max(3, 3 + spread / 2 + (1 - confidence) * 5)
  return {
    bodyFatPct: +bf.toFixed(1),
    bodyFatLow: +Math.max(3, bf - half).toFixed(1),
    bodyFatHigh: +Math.min(60, bf + half).toFixed(1),
    confidence: +confidence.toFixed(2),
    build: vision.confidence >= geo.confidence ? vision.build : geo.build,
    method: 'camera+ai',
  }
}
