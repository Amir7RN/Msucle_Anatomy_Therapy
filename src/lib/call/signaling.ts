/**
 * signaling.ts
 *
 * Tiny WebRTC signaling layer built on Supabase Realtime broadcast — no extra
 * server needed.  Both peers join the same per-room channel and exchange the
 * SDP offer/answer and ICE candidates as broadcast messages.
 *
 * Also resolves ICE (STUN/TURN) servers.  Because the site is usually a STATIC
 * deploy (env vars are baked at build time), TURN credentials can ALSO be set
 * at RUNTIME from the call UI and saved in localStorage — so you can enable
 * cross-network calls on the live site without rebuilding/redeploying.
 */

import { supabase } from '../supabase'

export type SignalKind =
  | 'host-ready' | 'client-ready'
  | 'offer' | 'answer' | 'ice' | 'bye'

export interface SignalMsg {
  kind: SignalKind
  from: string
  data?: unknown
}

export interface Signaling {
  ready: Promise<void>
  send: (kind: SignalKind, data?: unknown) => void
  close: () => void
}

/** A short random id for this peer / room. */
export function randomId(len = 6): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)]
  return s
}

export function createSignaling(
  roomId: string,
  self: string,
  onMessage: (m: SignalMsg) => void,
): Signaling {
  const channel = supabase.channel(`assess-call-${roomId}`, {
    config: { broadcast: { self: false, ack: false } },
  })

  channel.on('broadcast', { event: 'signal' }, (payload) => {
    const m = payload.payload as SignalMsg
    if (!m || m.from === self) return
    onMessage(m)
  })

  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Realtime channel ${status}`))
      }
    })
  })

  const send = (kind: SignalKind, data?: unknown) => {
    channel.send({ type: 'broadcast', event: 'signal', payload: { kind, from: self, data } })
  }

  const close = () => {
    try { supabase.removeChannel(channel) } catch { /* ignore */ }
  }

  return { ready, send, close }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TURN configuration — runtime (localStorage) overrides build-time env.
// ─────────────────────────────────────────────────────────────────────────────

const TURN_KEY = 'muscleAtlas.turn.v1'

export interface TurnConfig {
  /** Metered free tier: your app subdomain, e.g. "myapp.metered.live". */
  meteredDomain?: string
  /** Metered free tier API key. */
  meteredApiKey?: string
  /** Any REST endpoint returning an iceServers JSON array. */
  credentialUrl?: string
  /** Static TURN (own coturn): comma-separated urls. */
  turnUrl?: string
  turnUser?: string
  turnCred?: string
}

export function loadTurnConfig(): TurnConfig {
  try {
    const raw = localStorage.getItem(TURN_KEY)
    return raw ? (JSON.parse(raw) as TurnConfig) : {}
  } catch { return {} }
}

export function saveTurnConfig(cfg: TurnConfig): void {
  try {
    const clean: TurnConfig = {}
    for (const [k, v] of Object.entries(cfg)) {
      if (typeof v === 'string' && v.trim()) (clean as Record<string, string>)[k] = v.trim()
    }
    localStorage.setItem(TURN_KEY, JSON.stringify(clean))
  } catch { /* quota / unavailable */ }
}

export function clearTurnConfig(): void {
  try { localStorage.removeItem(TURN_KEY) } catch { /* */ }
}

/** Merge runtime (localStorage) + build-time (env), runtime taking precedence. */
function resolveTurn(): { credentialUrl: string; turnUrl: string; turnUser?: string; turnCred?: string } {
  const env = import.meta.env as Record<string, string | undefined>
  const c = loadTurnConfig()
  const meteredUrl = (domain?: string, key?: string) =>
    domain && key ? `https://${domain}/api/v1/turn/credentials?apiKey=${key}` : ''
  const credentialUrl =
    c.credentialUrl ||
    meteredUrl(c.meteredDomain, c.meteredApiKey) ||
    env.VITE_TURN_CREDENTIAL_URL ||
    meteredUrl(env.VITE_METERED_DOMAIN, env.VITE_METERED_API_KEY) ||
    ''
  const turnUrl  = c.turnUrl  || env.VITE_TURN_URL || ''
  const turnUser = c.turnUser || env.VITE_TURN_USERNAME
  const turnCred = c.turnCred || env.VITE_TURN_CREDENTIAL
  return { credentialUrl, turnUrl, turnUser, turnCred }
}

/**
 * Resolve ICE servers.  STUN alone only connects "easy" NATs; across different
 * networks a TURN RELAY is required.  Priority: REST credential endpoint →
 * static TURN → best-effort public relay.  Async because the REST option
 * fetches credentials.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  const base: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ]
  const { credentialUrl, turnUrl, turnUser, turnCred } = resolveTurn()

  if (credentialUrl) {
    try {
      const r = await fetch(credentialUrl)
      if (r.ok) {
        const list = (await r.json()) as RTCIceServer[]
        if (Array.isArray(list) && list.length) return [...base, ...list]
      }
    } catch (e) {
      console.warn('[call] TURN credential fetch failed:', e)
    }
  }

  if (turnUrl) {
    base.push({
      urls: turnUrl.split(',').map((s) => s.trim()),
      username: turnUser,
      credential: turnCred,
    })
    return base
  }

  // Best-effort public relay (often unavailable now — configure your own).
  base.push(
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  )
  return base
}

/** True when a real TURN relay is configured (runtime or env). */
export function turnConfigured(): boolean {
  const { credentialUrl, turnUrl } = resolveTurn()
  return !!(credentialUrl || turnUrl)
}
