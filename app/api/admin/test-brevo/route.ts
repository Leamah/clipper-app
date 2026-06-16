/**
 * GET /api/admin/test-brevo
 *
 * Calls Brevo GET /account to verify the API key is valid — no emails sent.
 * Returns the Brevo account name + plan on success, or the raw error on failure.
 * Protected: admin tier only.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await anon.from('klippa_profiles').select('subscription_tier').eq('id', user.id).single()
  if (profile?.subscription_tier !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = (process.env.BREVO_API_KEY ?? '').trim()

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'BREVO_API_KEY is not set' })
  }

  // Show first/last 4 chars so you can verify it's the right key without
  // exposing the full value
  const keyPreview = `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}`

  try {
    const res  = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'accept': 'application/json', 'api-key': apiKey },
    })
    const body = await res.text()

    if (!res.ok) {
      return NextResponse.json({
        ok:         false,
        keyPreview,
        status:     res.status,
        brevoError: body.slice(0, 500),
      })
    }

    const account = JSON.parse(body) as { companyName?: string; email?: string; plan?: { type: string }[] }
    return NextResponse.json({
      ok:          true,
      keyPreview,
      companyName: account.companyName,
      email:       account.email,
      plan:        account.plan?.[0]?.type,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, keyPreview, error: String(err) })
  }
}
