// supabase/functions/anthropic-proxy/index.ts
//
// Server-side proxy for Anthropic's Messages API. The browser calls THIS instead
// of api.anthropic.com, and the real Anthropic key lives only here as a Supabase
// secret — it is never shipped to the client, so visitors can't read it out of
// the JS bundle and run up your bill.
//
// Deploy (one time):
//   supabase functions deploy anthropic-proxy --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...    # your real key
//   supabase secrets set ALLOWED_ORIGIN=https://zeva.health   # your site origin
// Then in the site build set:  VITE_LLM_PROXY_URL=https://<project>.functions.supabase.co/anthropic-proxy
//
// This is a Deno (Supabase Edge) function — it is intentionally OUTSIDE src/ and
// is not part of the Vite/tsc build.

// deno-lint-ignore-file no-explicit-any
declare const Deno: any

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// ── Abuse limits ─────────────────────────────────────────────────────────────
// The function is public (deployed --no-verify-jwt so guests can use the AI),
// which means anyone who finds the URL can POST to it. These caps bound what a
// stolen-URL caller can spend: only the cheap model the app actually uses, a
// max_tokens ceiling matching the app's largest request (personalProgram: 4000),
// and a body-size cap sized for one camera frame (bodyVision base64 images).
const ALLOWED_MODELS = new Set(['claude-haiku-4-5-20251001'])
const MAX_TOKENS_CAP = 4096
const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10 MB

// ALLOWED_ORIGIN may be a single origin, a comma-separated list, or '*'.
function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGIN') || '*')
    .split(',').map((s) => s.trim()).filter(Boolean)
}
function originAllowed(origin: string): boolean {
  const list = allowedOrigins()
  return list.includes('*') || (!!origin && list.includes(origin))
}
function corsHeaders(origin: string): Record<string, string> {
  const list = allowedOrigins()
  // Echo the caller's origin when it's on the list (so multiple sites work),
  // else fall back to the first configured origin (or '*').
  const allowOrigin = list.includes('*')
    ? '*'
    : (origin && list.includes(origin) ? origin : (list[0] || '*'))
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'origin',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || ''
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors })
  }

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) {
    return new Response(JSON.stringify({ error: { message: 'Proxy not configured' } }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  // Origin lock: when ALLOWED_ORIGIN is configured (not '*'), require a match.
  // Requests with NO Origin header are rejected too — browsers always send one
  // on cross-site POSTs, so a missing header means a non-browser client. (To
  // test with curl, temporarily `supabase secrets set ALLOWED_ORIGIN='*'`.)
  if (!allowedOrigins().includes('*') && !originAllowed(origin)) {
    return new Response(JSON.stringify({ error: { message: 'Origin not allowed' } }), {
      status: 403, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  // Bound the request size before parsing (one bodyVision camera frame is the
  // legitimate worst case). content-length is set by all real clients; a
  // missing header falls through to the JSON parse, which still fails fast.
  const declaredLen = Number(req.headers.get('content-length') || '0')
  if (declaredLen > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: { message: 'Request too large' } }), {
      status: 413, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) throw new Error('too large')
    body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object')
  } catch {
    return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
      status: 400, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  // Clamp what the caller may spend: only the app's model, capped max_tokens,
  // and no streaming (the app never streams; keeps billing predictable).
  if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) {
    return new Response(JSON.stringify({ error: { message: 'Model not allowed' } }), {
      status: 400, headers: { ...cors, 'content-type': 'application/json' },
    })
  }
  const requestedMax = typeof body.max_tokens === 'number' ? body.max_tokens : MAX_TOKENS_CAP
  body.max_tokens = Math.min(Math.max(1, requestedMax), MAX_TOKENS_CAP)
  delete body.stream

  // Forward the request body verbatim, attaching the key server-side.
  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
})
