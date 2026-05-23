/**
 * supabase.ts
 *
 * Single Supabase client for the app. Reads credentials from .env.local.
 *
 * To forgive a common copy-paste mistake we read BOTH VITE_ and NEXT_PUBLIC_
 * prefixed env vars. vite.config.ts widens envPrefix to expose both.
 */

import { createClient, type SupabaseClient as SbClient } from '@supabase/supabase-js'

const env = import.meta.env as Record<string, string | undefined>

const supabaseUrl =
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  ''

const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''

// Strip a trailing /rest/v1 path from the URL — the supabase-js client appends
// those paths internally, so leaving them on causes every request to 404.
const cleanUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')

if (!cleanUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] Missing credentials. Create .env.local in the project root with:\n' +
      '  VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co\n' +
      '  VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY\n' +
      'Then restart `npm run dev` so Vite re-reads the file.'
  )
}

export const supabase: SbClient = createClient(
  cleanUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)

export type SupabaseClient = typeof supabase

/** True when env vars are present. UI uses this to disable sign-in buttons cleanly. */
export const supabaseConfigured = !!(cleanUrl && supabaseAnonKey)
