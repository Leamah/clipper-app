/**
 * Auth Callback — PKCE code exchange
 *
 * Supabase sends the user here after they click the magic link:
 *   https://klippa.co.za/auth/callback?code=XXXX
 *
 * This handler:
 *  1. Exchanges the one-time code for a session (PKCE — server-safe)
 *  2. Writes the session cookies directly onto the redirect response so the
 *     very next request (to /onboarding or /dashboard) is authenticated
 *  3. Routes new users (no klippa_profiles row or onboarding_complete=false)
 *     to /onboarding and returning users to /dashboard
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // Supabase forwards error params on bad/expired links
  const supaError = searchParams.get('error')
  if (supaError) {
    const desc = searchParams.get('error_description') ?? supaError
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(desc)}`, origin)
    )
  }

  const code = searchParams.get('code')

  if (code) {
    // Accumulate cookies Supabase wants to set so we can attach them to the
    // redirect response (cookies().set() inside a route handler doesn't
    // automatically appear on NextResponse.redirect).
    const pendingCookies: Array<{
      name:    string
      value:   string
      options: Record<string, unknown>
    }> = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cs: Array<{ name: string; value: string; options?: Record<string, unknown> }>) =>
            cs.forEach(({ name, value, options }) =>
              pendingCookies.push({ name, value, options: options ?? {} })
            ),
        },
      }
    )

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      // Determine destination: onboarding for new/incomplete users, dashboard otherwise
      let destination = '/dashboard'

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('klippa_profiles')
          .select('onboarding_complete')
          .eq('id', user.id)
          .single()

        if (!profile || !profile.onboarding_complete) {
          destination = '/onboarding'
        }
      }

      // Build the redirect with all session cookies attached
      const response = NextResponse.redirect(new URL(destination, origin))
      pendingCookies.forEach(({ name, value, options }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response.cookies.set(name, value, options as any)
      })
      return response
    }

    console.error('[auth/callback] exchangeCodeForSession failed:', exchangeError.message)
  }

  // No code param or exchange failed
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
}
