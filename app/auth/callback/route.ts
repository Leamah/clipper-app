/**
 * Auth Callback — server-side PKCE exchange
 *
 * Supabase sends the user here after they click the magic link:
 *   https://klippa.co.za/auth/callback?code=XXXX
 *
 * We exchange the code for a session on the server using the PKCE verifier
 * that @supabase/ssr stored in cookies when signInWithOtp() was called.
 * This works even when the link is opened in a different tab or app.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // Supabase error param (expired link, rate limit, etc.)
  const supaError = searchParams.get('error')
  if (supaError) {
    const desc = searchParams.get('error_description') ?? supaError
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(desc)}`
    )
  }

  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setAll: (cs: CookieToSet[]) =>
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            ),
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session established — let the middleware handle onboarding redirect if needed
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
  }

  // No code or exchange failed → back to login with error flag
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
