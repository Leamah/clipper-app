import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware on /auth/* — avoid disrupting magic-link / signout flows
  // Also skip the Ozow webhook — it's server-to-server and has no session.
  // The practice client portal (/portal/* page + /api/portal/* routes) is a
  // public, token-authenticated surface — clients have no Klippa session.
  if (
    pathname.startsWith('/auth/') ||
    pathname === '/api/payments/ozow/notify' ||
    pathname === '/api/auth/send-otp' ||   // public: no session needed to request a magic link
    pathname === '/api/feedback' ||        // feedback can be sent by anyone (even logged-out landing page visitors)
    pathname.startsWith('/portal/') ||
    pathname.startsWith('/api/portal/')
  ) {
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

  // API requests must NEVER be answered with an HTML redirect. When an
  // unauthenticated /api/* request is redirected to the HTML /login page, the
  // caller's `fetch(...).then(r => r.json())` receives "<!DOCTYPE html>…" and
  // throws `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. Return a
  // clean JSON 401 instead so clients can handle it. (Admin API routes keep
  // their own stricter checks below.)
  const isApiRoute = pathname.startsWith('/api/')

  // Pricing and payment pages are accessible without login (so users can see plans)
  const isPublicRoute   = (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/pricing' ||
    pathname.startsWith('/payments/')      // success / cancel pages
  )
  const isOnboarding    = pathname.startsWith('/onboarding')
  const isAdminRoute    = pathname.startsWith('/admin')
  const isApiAdminRoute = pathname.startsWith('/api/admin')
  // Ozow notify webhook must be reachable without a session (Ozow posts server-to-server)
  const isPaymentWebhook = pathname === '/api/payments/ozow/notify'

  // Unauthenticated → JSON 401 for API routes, HTML /login redirect for pages
  if (!user && !isPublicRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    // Fetch klippa profile to check onboarding + admin status
    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('onboarding_complete, subscription_tier, user_type')
      .eq('id', user.id)
      .single()

    const isAdmin       = profile?.subscription_tier === 'admin'
    const isPractitioner = profile?.user_type === 'practitioner'
    const isOrgUser     = profile?.user_type === 'company_owner' || isPractitioner
    const orgHome       = isPractitioner ? '/practice/dashboard' : '/org/dashboard'

    // Admin routes: require subscription_tier === 'admin'
    if (isAdminRoute || isApiAdminRoute) {
      if (!isAdmin) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      return response
    }

    // Already logged in + hitting /login → send to correct home
    if (pathname === '/login' && request.nextUrl.searchParams.get('signedout') !== '1') {
      const home = !profile?.onboarding_complete
        ? '/onboarding'
        : isOrgUser ? orgHome : '/dashboard'
      return NextResponse.redirect(new URL(home, request.url))
    }

    // Redirect to onboarding if profile not complete (except when already there,
    // on public routes, API routes, or on /invite/* — invited consultants must
    // reach the invite-acceptance page so accept-invite can set them up properly
    // and mark onboarding complete; intercepting them here sends them to the
    // type-selection step which is wrong for invited members).
    const isInvitePath = pathname.startsWith('/invite/')
    if (!isOnboarding && !isPublicRoute && !isApiRoute && !isInvitePath) {
      if (!profile || !profile.onboarding_complete) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    // Exclude static assets — _next internals, favicon, images, fonts, and
    // all media files (mp4/webm/ogg etc.).  Without this exclusion the
    // middleware auth-gates every asset request: a visitor on the landing page
    // with no session cookie gets their /influencer.mp4 request redirected to
    // /login, so the hero video never loads.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg|mov|avi|woff2?|ttf|otf|ico)$).*)',
  ],
}
