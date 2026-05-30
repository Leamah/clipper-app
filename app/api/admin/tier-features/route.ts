import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

async function getAdminClient(cookieStore: ReturnType<typeof cookies>) {
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const, status: 401 }

  const { data: profile } = await anon
    .from('klippa_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  if (profile?.subscription_tier !== 'admin') return { error: 'Forbidden' as const, status: 403 }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return { error: 'Service role key not configured' as const, status: 500 }

  return { admin: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey) }
}

// ── GET /api/admin/tier-features ─────────────────────────
export async function GET() {
  const cookieStore = cookies()
  const result = await getAdminClient(cookieStore)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { admin } = result

  const { data, error } = await admin
    .from('klippa_tier_features')
    .select('*')
    .order('tier')
    .order('feature_key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ features: data })
}

// ── PUT /api/admin/tier-features ─────────────────────────
// Body: { tier, feature_key, enabled, sync_users?: boolean }
export async function PUT(request: Request) {
  const cookieStore = cookies()
  const result = await getAdminClient(cookieStore)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { admin } = result

  const { tier, feature_key, enabled, sync_users = true } = await request.json()
  if (!tier || !feature_key || enabled == null) {
    return NextResponse.json({ error: 'tier, feature_key, enabled required' }, { status: 400 })
  }

  // Upsert the tier feature row
  const { data: row, error: upsertErr } = await admin
    .from('klippa_tier_features')
    .upsert(
      { tier, feature_key, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'tier,feature_key' },
    )
    .select()
    .single()

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Optionally sync all non-overridden users on this tier
  let synced = 0
  if (sync_users) {
    const featureCol = `feature_${feature_key}` // e.g. 'feature_timesheets'

    const { data: users, error: fetchErr } = await admin
      .from('klippa_profiles')
      .select('id')
      .eq('subscription_tier', tier)
      .eq('feature_overrides', false)

    if (!fetchErr && users && users.length > 0) {
      const ids = users.map((u: { id: string }) => u.id)
      await admin
        .from('klippa_profiles')
        .update({ [featureCol]: enabled })
        .in('id', ids)
      synced = users.length
    }
  }

  return NextResponse.json({ feature: row, synced_users: synced })
}
