import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function middleware(request: NextRequest) {
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
  const { pathname } = request.nextUrl

  const isAuthRoute     = pathname === '/login' || pathname.startsWith('/auth')
  const isAdminRoute    = pathname.startsWith('/admin')
  const isApiAdminRoute = pathname.startsWith('/api/admin')

  // Unauthenticated → /login
  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Already logged in → skip login page
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
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
