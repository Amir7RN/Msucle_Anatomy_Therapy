/**
 * loadEstimator.ts
 *
 * Uses Claude vision to estimate the EXTERNAL LOAD the user is holding (e.g. a
 * dumbbell, kettlebell, resistance band, water bottle) from a single webcam
 * still, so the Live Muscle Twin can scale activation magnitude realistically —
 * the same curl with 10 kg lights the biceps far more than with empty hands,
 * and pose alone can't see weight.
 *
 * Reuses the app's existing browser-direct Anthropic pattern (same key the
 * Symptom Triage uses, stored in localStorage). The key is the user's own and
 * is sent only to Anthropic. If no key is present the estimator is simply
 * inert and the twin falls back to bodyweight (no error surfaced).
 *
 * Cost control: a single low-res frame, a tiny token budget, and hard
 * debouncing (one call every REFRESH_MS at most, and only when asked). The
 * caller triggers it occasionally (e.g. when movement starts), not per frame.
 */

import { getStoredApiKey, setStoredApiKey } from '../triage/llm'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
// Haiku is vision-capable, fast, and cheap — ample for "what weight is this".
const MODEL_ID = 'claude-haiku-4-5-20251001'

export interface LoadEstimate {
  leftKg:  number
  rightKg: number
  /** Short label of what was detected ("10 kg dumbbell", "no weight", …). */
  item:    string
  /** 0..1 model-stated confidence. */
  confidence: number
  at: number   // epoch ms
}

const EMPTY: LoadEstimate = { leftKg: 0, rightKg: 0, item: 'no weight', confidence: 0, at: 0 }

/**
 * Tiny grayscale signature of the current frame (a 24×24 average-pooled grid).
 * Comparing successive signatures lets us notice when the scene actually changes
 * — e.g. the user picks up or sets down a weight — and pull the next AI scan
 * forward, instead of waiting out the full idle interval. Cheap enough to run
 * every poll.
 */
const SIG_N = 24
function frameSignature(video: HTMLVideoElement): Float32Array | null {
  if (!video.videoWidth) return null
  const canvas = document.createElement('canvas')
  canvas.width = SIG_N; canvas.height = SIG_N
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, SIG_N, SIG_N)
  const data = ctx.getImageData(0, 0, SIG_N, SIG_N).data
  const sig = new Float32Array(SIG_N * SIG_N)
  for (let i = 0; i < sig.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    sig[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return sig
}

/** Mean absolute difference between two signatures (0 = identical, 1 = max). */
function signatureDiff(a: Float32Array | null, b: Float32Array | null): number {
  if (!a || !b || a.length !== b.length) return 1
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

/** Downscale a video frame to a small JPEG and return base64 (no data: prefix). */
function grabFrameBase64(video: HTMLVideoElement, maxW = 448): string | null {
  if (!video.videoWidth) return null
  const scale = Math.min(1, maxW / video.videoWidth)
  const w = Math.round(video.videoWidth * scale)
  const h = Math.round(video.videoHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  // 0.6 quality keeps the payload tiny; weight ID doesn't need fine detail.
  const url = canvas.toDataURL('image/jpeg', 0.6)
  const comma = url.indexOf(',')
  return comma >= 0 ? url.slice(comma + 1) : null
}

const PROMPT =
  `You are looking at one webcam frame of a person exercising. Identify any ` +
  `external weight or resistance they are HOLDING in their hands (dumbbell, ` +
  `kettlebell, barbell, plate, resistance band, water bottle, etc.). Estimate ` +
  `the mass in KILOGRAMS held in each hand. If a hand is empty, use 0. If you ` +
  `cannot tell, estimate conservatively. Reply with ONLY compact JSON, no prose:\n` +
  `{"leftKg": <number>, "rightKg": <number>, "item": "<short label>", "confidence": <0..1>}\n` +
  `Note: the image may be mirrored; "left"/"right" are the person's hands as they appear.`

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResp { content?: AnthropicTextBlock[]; error?: { message: string } }

function parseEstimate(text: string): LoadEstimate | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as Partial<LoadEstimate>
    const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(100, v)) : 0)
    return {
      leftKg:  n(j.leftKg),
      rightKg: n(j.rightKg),
      item:    typeof j.item === 'string' ? j.item.slice(0, 48) : 'unknown',
      confidence: typeof j.confidence === 'number' ? Math.max(0, Math.min(1, j.confidence)) : 0.5,
      at: Date.now(),
    }
  } catch { return null }
}

async function callClaudeVision(base64: string, apiKey: string): Promise<LoadEstimate | null> {
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
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  })
  if (!res.ok) {
    let msg = `vision API ${res.status}`
    try { const b = await res.json(); if (b?.error?.message) msg = b.error.message } catch {}
    throw new Error(msg)
  }
  const data = (await res.json()) as AnthropicResp
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  return parseEstimate(text)
}

/**
 * Stateful, debounced load estimator. Construct one per session; call
 * `maybeRefresh(video)` whenever you'd like (e.g. each second). It fires a
 * Claude call at most once per REFRESH_MS and never overlaps calls. Read the
 * latest result from `current()`.
 */
export class LoadEstimator {
  private last: LoadEstimate = EMPTY
  private lastCallAt = 0
  private inFlight = false
  private enabled: boolean
  private error: string | null = null
  private lastSig: Float32Array | null = null   // frame at the last scan

  /**
   * @param refreshMs  steady cadence for an unchanged scene.
   * @param minMs      shortest gap allowed when the scene CHANGES (so a newly
   *                   picked-up weight is re-estimated quickly without hammering
   *                   the API while you move).
   * @param changeThresh  mean frame-difference that counts as "scene changed".
   */
  constructor(
    private refreshMs = 4000,
    private minMs = 2000,
    private changeThresh = 0.05,
  ) {
    this.enabled = !!getStoredApiKey()
  }

  isEnabled(): boolean { return this.enabled }
  current(): LoadEstimate { return this.last }
  lastError(): string | null { return this.error }
  /** Save the user's Anthropic key (shared with the AI Chat) and enable. */
  setKey(key: string): void {
    const k = key.trim()
    if (!k) return
    setStoredApiKey(k)
    this.enabled = true
    this.error = null
    this.lastCallAt = 0   // allow an immediate scan
  }

  /**
   * Trigger a refresh if due. Runs automatically on a steady cadence, and pulls
   * the next scan forward when the camera scene changes (you grab or drop a
   * weight). `forced` ignores all debouncing (the manual "Scan now" button).
   */
  async maybeRefresh(video: HTMLVideoElement | null, forced = false): Promise<LoadEstimate> {
    if (!video) return this.last
    const key = getStoredApiKey()
    this.enabled = !!key
    if (!key) return this.last
    const now = Date.now()
    if (this.inFlight) return this.last

    const sig = frameSignature(video)
    const sinceLast = now - this.lastCallAt
    const changed = signatureDiff(sig, this.lastSig) > this.changeThresh
    // Due when: forced, the steady interval elapsed, OR the scene changed and at
    // least the short minimum has elapsed.
    const due = forced || sinceLast >= this.refreshMs || (changed && sinceLast >= this.minMs)
    if (!due) return this.last

    const b64 = grabFrameBase64(video)
    if (!b64) return this.last

    this.inFlight = true
    this.lastCallAt = now
    this.lastSig = sig
    try {
      const est = await callClaudeVision(b64, key)
      if (est) { this.last = est; this.error = null }
    } catch (e) {
      // Non-fatal: keep the previous estimate; surface the error to the UI.
      this.error = (e as Error).message || 'vision request failed'
      console.warn('[load] vision estimate failed:', this.error)
    } finally {
      this.inFlight = false
    }
    return this.last
  }

  reset(): void { this.last = EMPTY; this.lastCallAt = 0; this.inFlight = false; this.lastSig = null }
}
