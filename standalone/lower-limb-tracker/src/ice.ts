/**
 * ice.ts
 *
 * ICE (STUN/TURN) server resolution for a WebRTC call, framework-agnostic
 * (plain explicit config — no bundler env-var or localStorage assumptions).
 *
 * Why you need this at all
 * ────────────────────────
 * A `LowerLimbTracker` only ever reads frames from a `<video>` element — it
 * has no opinion about how that video got there. If your integration is a
 * LIVE CALL (you watching a remote person's camera), that video element is
 * fed by WebRTC, and WebRTC needs:
 *   1. STUN — lets two peers discover their public IP/port (free, public,
 *      built into every browser's defaults — usually enough on the SAME
 *      network).
 *   2. TURN — a relay server for when direct peer-to-peer fails (different
 *      networks, symmetric NATs, corporate firewalls — the common case for
 *      a practitioner and a remote client). Unlike STUN, TURN relays actual
 *      media traffic, so it isn't free to run — you need a TURN provider or
 *      your own relay server.
 *
 * This module resolves an `RTCIceServer[]` you pass straight into
 * `new RTCPeerConnection({ iceServers })`. See the README's "Building a live
 * remote call" section for the full walkthrough (getting a free Metered.ca
 * key, wiring a signaling channel, etc).
 */

export interface MeteredTurnConfig {
  /** Your Metered.ca app subdomain, e.g. "myapp.metered.live" (NOT the full
   *  https:// URL — just the domain). Find it on dashboard.metered.ca after
   *  creating an app. */
  meteredDomain: string
  /** Your Metered.ca API key, from the same dashboard page. */
  meteredApiKey: string
}

export interface StaticTurnConfig {
  /** One or more TURN/TURNS URLs, e.g. ["turn:turn.example.com:3478"]. */
  turnUrls: string[]
  turnUsername: string
  turnCredential: string
}

export interface IceServersOptions {
  /** Extra/override STUN server URLs. Defaults to Google's public STUN. */
  stunUrls?: string[]
  /** Fetch short-lived TURN credentials from Metered.ca. See the README for
   *  how to get these two values — it's a 2-minute free signup. */
  metered?: MeteredTurnConfig
  /** Use a fixed/self-hosted TURN server (e.g. your own coturn) instead of a
   *  credential-issuing REST endpoint. */
  turn?: StaticTurnConfig
  /** Any REST endpoint returning a JSON `RTCIceServer[]` array — Metered.ca's
   *  own endpoint matches this shape, so does a custom backend that proxies
   *  another TURN provider. Takes priority over `metered`/`turn` when set. */
  credentialUrl?: string
}

const DEFAULT_STUN = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']

/** Builds a Metered.ca free/paid-tier TURN credential URL from your app
 *  subdomain + API key. Metered issues short-lived (time-boxed) credentials
 *  on every call to this URL — don't cache the result for long. */
export function meteredCredentialUrl(domain: string, apiKey: string): string {
  return `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`
}

/**
 * Resolve the `iceServers` array for `new RTCPeerConnection({ iceServers })`.
 * Priority: explicit `credentialUrl` → `metered` config → static `turn`
 * config → STUN only (works same-network, will fail cross-network/behind
 * strict NATs without TURN).
 */
export async function getIceServers(opts: IceServersOptions = {}): Promise<RTCIceServer[]> {
  const base: RTCIceServer[] = [{ urls: opts.stunUrls ?? DEFAULT_STUN }]

  const credentialUrl = opts.credentialUrl
    ?? (opts.metered ? meteredCredentialUrl(opts.metered.meteredDomain, opts.metered.meteredApiKey) : undefined)

  if (credentialUrl) {
    try {
      const r = await fetch(credentialUrl)
      if (r.ok) {
        const list = (await r.json()) as RTCIceServer[]
        if (Array.isArray(list) && list.length) return [...base, ...list]
        console.warn('[ice] TURN credential endpoint returned an empty/invalid list — falling back to STUN only')
      } else {
        console.warn(`[ice] TURN credential fetch failed: HTTP ${r.status} — check your domain/API key`)
      }
    } catch (e) {
      console.warn('[ice] TURN credential fetch failed (network error):', e)
    }
  }

  if (opts.turn) {
    base.push({ urls: opts.turn.turnUrls, username: opts.turn.turnUsername, credential: opts.turn.turnCredential })
  }

  return base
}

/**
 * Self-test: opens a throwaway RTCPeerConnection with the given servers and
 * gathers ICE candidates locally (no second peer needed) to confirm a TURN
 * RELAY candidate actually appears. If this returns false, cross-network
 * calls will fail regardless of how many times you retry — it means the
 * TURN credentials are wrong, expired, or unreachable, not a fluke.
 */
export async function probeTurnRelay(servers: RTCIceServer[], timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let pc: RTCPeerConnection
    try {
      pc = new RTCPeerConnection({ iceServers: servers, iceCandidatePoolSize: 1 })
    } catch {
      resolve(false)
      return
    }
    let found = false
    const finish = () => { try { pc.close() } catch { /* */ } ; resolve(found) }
    const timer = setTimeout(finish, timeoutMs)
    pc.onicecandidate = (e) => {
      if (!e.candidate) { clearTimeout(timer); finish(); return }
      const type = e.candidate.type || (/ typ (\w+)/.exec(e.candidate.candidate)?.[1] ?? '')
      if (type === 'relay') { found = true; clearTimeout(timer); finish() }
    }
    try {
      pc.createDataChannel('probe')
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => { clearTimeout(timer); finish() })
    } catch { clearTimeout(timer); finish() }
  })
}
