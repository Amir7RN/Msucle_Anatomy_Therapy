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
 * ICE servers.  Google's public STUN is enough for most home networks; for
 * symmetric-NAT / carrier-grade-NAT cases a TURN relay is required — supply it
 * via env (VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL) and it
 * will be added automatically.
 */
export function iceServers(): RTCIceServer[] {
  const env = import.meta.env as Record<string, string | undefined>
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ]
  if (env.VITE_TURN_URL) {
    servers.push({
      urls: env.VITE_TURN_URL,
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    })
  }
  return servers
}
