import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

/**
 * Server-side sign-out. Use this instead of the browser-only signOut() so
 * the SSR cookie adapter actually clears the auth cookies (browser JS can't
 * touch HTTP-only cookies, which is why the previous client-only approach
 * left stale sessions behind).
 *
 * Accepts both GET and POST so it can be triggered from a link or a form.
 */
async function handleSignOut(request: NextRequest) {
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

  // Sign out globally — invalidates the refresh token server-side too,
  // so even an old browser tab can't silently refresh back in.
  try {
    await supabase.auth.signOut({ scope: 'global' })
  } catch (e) {
    console.error('[signout] supabase signOut error:', e)
  }

  // Belt-and-suspenders: stomp every sb-* cookie ourselves in case the
  // adapter missed any (e.g. chunked tokens like sb-...-auth-token.0/1).
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      cookieStore.set(cookie.name, '', {
        path:    '/',
        maxAge:  0,
        expires: new Date(0),
      })
    }
  }

  // Redirect to landing
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}

export async function GET(request: NextRequest)  { return handleSignOut(request) }
export async function POST(request: NextRequest) { return handleSignOut(request) }
