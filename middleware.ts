import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware on /auth/* — avoid disrupting magic-link / signout flows
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

  const isPublicRoute   = pathname === '/' || pathname === '/login'
  const isOnboarding    = pathname.startsWith('/onboarding')
  const isAdminRoute    = pathname.startsWith('/admin')
  const isApiAdminRoute = pathname.startsWith('/api/admin')

  // Unauthenticated → /login
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Already logged in → skip login page
  if (user && pathname === '/login' && request.nextUrl.searchParams.get('signedout') !== '1') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (user) {
    // Fetch klippa profile to check onboarding + admin status
    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('onboarding_complete, subscription_tier')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.subscription_tier === 'admin'

    // Admin routes: require subscription_tier === 'admin'
    if (isAdminRoute || isApiAdminRoute) {
      if (!isAdmin) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      // Admin users can always access /admin regardless of onboarding state
      return response
    }

    // Redirect to onboarding if profile not complete (except when already there)
    if (!isOnboarding && !isPublicRoute) {
      if (!profile || !profile.onboarding_complete) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
