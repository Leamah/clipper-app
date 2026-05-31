/**
 * POST /api/auth/send-otp
 *
 * Server-side magic-link proxy.  Uses createClient from @supabase/supabase-js
 * (NOT @supabase/ssr) so that:
 *   1. The correct /auth/v1/otp URL is constructed by the SDK (avoids 404 from
 *      manual URL concatenation with a misconfigured SUPABASE_URL).
 *   2. flowType:'implicit' is actually respected — @supabase/ssr's
 *      createBrowserClient hard-codes 'pkce', but @supabase/supabase-js uses
 *      the value you supply.
 *   3. No PKCE code-verifier is generated (server has no browser storage),
 *      so Supabase sends tokens in the URL hash (implicit flow) which our
 *      /auth/callback handles via setSession().
 *   4. No browser CORS restrictions — same-origin call to our own API route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, emailRedirectTo } = await req.json() as {
      email: string
      emailRedirectTo?: string
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    // createClient from @supabase/supabase-js — NOT createBrowserClient from
    // @supabase/ssr — so flowType:'implicit' is honoured.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: 'implicit', autoRefreshToken: false, persistSession: false } }
    )

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    })

    if (error) {
      console.error('[send-otp] Supabase error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).status ?? 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-otp] Unexpected error:', err)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}
