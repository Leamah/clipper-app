import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

/**
 * Server-side sign-out.
 *
 * The browser-only signOut() can't clear HTTP-only cookies, and even on the
 * server we have to bypass the SSR adapter when clearing — otherwise the
 * middleware's automatic token refresh races with us.
 *
 * Strategy:
 *   1. Snapshot every sb-* cookie name BEFORE touching anything
 *   2. Try supabase.signOut to invalidate the refresh token server-side
 *   3. Build the redirect response and explicitly delete every sb-* cookie
 *      directly on response.cookies (multiple variants for domain edge cases)
 */
async function handleSignOut(request: NextRequest) {
  // 1. Snapshot cookie names from the incoming request
  const sbCookieNames = request.cookies.getAll()
    .map((c) => c.name)
    .filter((n) => n.startsWith('sb-'))

  // 2. Best-effort: invalidate the refresh token globally
  try {
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
    await supabase.auth.signOut({ scope: 'global' })
  } catch (e) {
    console.error('[signout] supabase.signOut error:', e)
    // Continue — we'll force-clear cookies regardless
  }

  // 3. Build the redirect response and delete sb-* cookies on it directly.
  //    Using response.cookies guarantees the Set-Cookie headers land on
  //    THIS response, irrespective of any middleware writes.
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 })

  const host = request.nextUrl.hostname
  // Try a handful of domain/path variants to defeat any cookie-domain mismatch.
  // (Cookies must be cleared with the exact attributes they were set with.)
  const apex = host.replace(/^www\./, '')
  const domains = [undefined, host, `.${host}`, apex, `.${apex}`]
  const paths   = ['/', '/auth']

  for (const name of sbCookieNames) {
    for (const domain of domains) {
      for (const path of paths) {
        response.cookies.set({
          name,
          value:   '',
          path,
          maxAge:  0,
          expires: new Date(0),
          ...(domain ? { domain } : {}),
        })
      }
    }
  }

  return response
}

export async function GET(request: NextRequest)  { return handleSignOut(request) }
export async function POST(request: NextRequest) { return handleSignOut(request) }
