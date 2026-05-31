/**
 * POST /api/auth/send-otp
 *
 * Server-side magic-link proxy — sends the OTP via a direct server-to-Supabase
 * HTTP request so the browser never touches Supabase (no CORS, no PKCE).
 *
 * We intentionally use a raw fetch (not the @supabase/supabase-js SDK) because
 * the SDK tries to parse every response as JSON and will throw a SyntaxError if
 * Supabase returns an HTML error page (e.g. project paused, bad URL).  With a
 * raw fetch we read text() first so we can log the real body and always return
 * a clean JSON response to the browser.
 */

import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').replace(/\/$/, '')
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      console.error('[send-otp] Missing SUPABASE env vars')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { email, emailRedirectTo } = await req.json() as {
      email?: string
      emailRedirectTo?: string
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const qs = emailRedirectTo
      ? '?' + new URLSearchParams({ redirect_to: emailRedirectTo }).toString()
      : ''

    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({
        email,
        create_user:           true,
        data:                  {},
        gotrue_meta_security:  {},
        // No code_challenge → Supabase sends implicit-flow link (hash tokens)
      }),
    })

    // Read as text first — if Supabase ever returns HTML (e.g. project paused)
    // we want to log it rather than throw a SyntaxError.
    const text = await res.text()

    if (!res.ok) {
      let msg = `Supabase error ${res.status}`
      try {
        const body = JSON.parse(text) as { msg?: string; message?: string; error?: string }
        msg = body.msg ?? body.message ?? body.error ?? msg
      } catch {
        // HTML or non-JSON body — log it so we can debug
        console.error('[send-otp] Non-JSON error body:', text.slice(0, 500))
      }
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-otp] Unexpected error:', err)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}
