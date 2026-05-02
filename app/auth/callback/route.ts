import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')

  // If Supabase passed an error (e.g. expired link), redirect to login with message
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`
    )
  }

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setAll(cs: CookieToSet[]) {
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            )
          },
        },
      }
    )

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      // Use the forwarded host header for Vercel preview deployments
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalhost   = origin.includes('localhost')

      if (!isLocalhost && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Fallback: something went wrong
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
