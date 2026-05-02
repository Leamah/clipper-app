import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip ALL middleware processing on /auth/* routes. Otherwise getUser()
  // here triggers a token refresh that writes fresh sb-* cookies onto the
  // response and overwrites the signout route's cookie-clearing work.
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Routes that don't require authentication
  const isPublicRoute   = pathname === '/' || pathname === '/login'
  const isAdminRoute    = pathname.startsWith('/admin')
  const isApiAdminRoute = pathname.startsWith('/api/admin')

  // Unauthenticated → /login (except public routes)
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Already logged in → skip login page, go to dashboard
  // EXCEPT when ?signedout=1 is set — the user is mid-cleanup and we
  // must not bounce them back to a session they're trying to drop.
  if (user && pathname === '/login' && request.nextUrl.searchParams.get('signedout') !== '1') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Admin routes: verify plan
  if (user && (isAdminRoute || isApiAdminRoute)) {
    const { data: profile } = await supabase
      .from('clipper_user_profiles')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (profile?.plan !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
