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

  // Optional origin lock: reject requests from other sites reusing your proxy.
  // (Requests with no Origin header — e.g. curl — are allowed for testing.)
  if (origin && !originAllowed(origin)) {
    return new Response(JSON.stringify({ error: { message: 'Origin not allowed' } }), {
      status: 403, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
      status: 400, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

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
