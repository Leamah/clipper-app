import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Use the implicit flow for magic links so cross-device clicks work
// (PKCE requires the code verifier to be on the same browser session
// that requested the link, which often isn't the case in real usage).
export const supabase = createBrowserClient(url, key, {
  auth: {
    flowType:            'implicit',
    detectSessionInUrl:  true,
    persistSession:      true,
    autoRefreshToken:    true,
  },
})
