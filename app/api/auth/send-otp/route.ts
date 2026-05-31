/**
 * POST /api/auth/send-otp
 *
 * Proxies the Supabase magic-link OTP request server-side.
 *
 * WHY: @supabase/ssr 0.6.x ignores the flowType option passed to
 * createBrowserClient and hardcodes flowType:"pkce". This causes signInWithOtp
 * to generate a SHA-256 PKCE code challenge before making the network request.
 * If that storage/crypto step fails (e.g. in SSR pre-render context) the whole
 * call throws before it ever reaches Supabase — no log trace, no email sent,
 * the user sees "Failed to fetch".
 *
 * By calling the Supabase auth REST endpoint directly from the server (no PKCE
 * code_challenge) we:
 *   1. Bypass all browser CORS restrictions on /auth/v1/otp.
 *   2. Force implicit-flow links (hash tokens) which the callback already handles.
 *   3. Eliminate the PKCE cookie-storage step that can fail.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  try {
    const { email, emailRedirectTo } = await req.json() as {
      email: string
      emailRedirectTo?: string
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    // Build query string (redirect_to must be a query param, not body, per GoTrue)
    const qs = emailRedirectTo
      ? '?' + new URLSearchParams({ redirect_to: emailRedirectTo }).toString()
      : ''

    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp${qs}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        // Tell GoTrue this is a server-side call so it does not add a
        // code_challenge automatically (forces implicit-flow link).
        'X-Client-Info': 'supabase-js/server',
      },
      body: JSON.stringify({
        email,
        create_user: true,
        data: {},
        gotrue_meta_security: {},
        // No code_challenge / code_challenge_method → implicit flow link
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg  = (body as any)?.msg || (body as any)?.message || `Supabase error ${res.status}`
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-otp]', err)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}
