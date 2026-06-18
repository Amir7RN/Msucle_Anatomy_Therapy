/**
 * signaling.ts
 *
 * Tiny WebRTC signaling layer built on Supabase Realtime broadcast — no extra
 * server needed.  Both peers join the same per-room channel and exchange the
 * SDP offer/answer and ICE candidates as broadcast messages.
 *
 * We use the project's existing Supabase client, so a remote assessment call
 * works as soon as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set (the same
 * credentials the app already uses for auth).  Broadcast doesn't touch the
 * database, so no tables or RLS policies are required.
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
  /** Resolves once the channel is subscribed and safe to send on. */
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
    if (!m || m.from === self) return   // ignore our own echoes
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

/**
 * ICE servers.
 *
 * STUN alone only connects peers whose NATs are "easy"; across different
 * networks (or symmetric / carrier-grade NAT) a TURN RELAY is required —
 * otherwise the call fails even though both sides are online.  This is NOT a
 * "same network" limitation, just a missing relay.
 *
 * We resolve TURN credentials in priority order:
 *   1. VITE_TURN_CREDENTIAL_URL — a REST endpoint that returns an iceServers
 *      array (e.g. Metered's free Open Relay:
 *        https://YOURAPP.metered.live/api/v1/turn/credentials?apiKey=KEY).
 *      Or set VITE_METERED_DOMAIN + VITE_METERED_API_KEY and we build it.
 *   2. VITE_TURN_URL (+ USERNAME / CREDENTIAL) — your own coturn / static TURN.
 *   3. A best-effort public relay (may be rate-limited or down) so a zero-config
 *      demo still has a chance of connecting.
 *
 * Always async because option 1 fetches credentials.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  const env = import.meta.env as Record<string, string | undefined>
  const base: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ]

  // 1) Dynamic credentials from a REST endpoint (recommended — Metered free tier).
  const restUrl =
    env.VITE_TURN_CREDENTIAL_URL ||
    (env.VITE_METERED_DOMAIN && env.VITE_METERED_API_KEY
      ? `https://${env.VITE_METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${env.VITE_METERED_API_KEY}`
      : '')
  if (restUrl) {
    try {
      const r = await fetch(restUrl)
      if (r.ok) {
        const list = (await r.json()) as RTCIceServer[]
        if (Array.isArray(list) && list.length) return [...base, ...list]
      }
    } catch (e) {
      console.warn('[call] TURN credential fetch failed:', e)
    }
  }

  // 2) Static TURN from env (your own server).
  if (env.VITE_TURN_URL) {
    base.push({
      urls: env.VITE_TURN_URL.split(',').map((s) => s.trim()),
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    })
    return base
  }

  // 3) Best-effort public relay (no guarantee — for quick demos only).
  base.push(
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  )
  return base
}

/** True when a real TURN relay is configured (so cross-network calls work). */
export function turnConfigured(): boolean {
  const env = import.meta.env as Record<string, string | undefined>
  return !!(env.VITE_TURN_CREDENTIAL_URL || (env.VITE_METERED_DOMAIN && env.VITE_METERED_API_KEY) || env.VITE_TURN_URL)
}
