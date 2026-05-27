import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType:           'implicit',
          detectSessionInUrl: true,
          persistSession:     true,
          autoRefreshToken:   true,
        },
      }
    )
  }
  return _client
}

// Lazy proxy — the real client is only created on first property access (at runtime,
// not at module import time), so Next.js static analysis during `next build` doesn't
// throw "URL and API key are required" when env vars aren't set locally.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    return (getClient() as any)[prop as string]
  },
})
