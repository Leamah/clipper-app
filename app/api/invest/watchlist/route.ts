import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function POST(request: Request) {
  const cookieStore = cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase
    .from('klippa_profiles')
    .select('feature_invest_basic, feature_invest_full, invest_enabled')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_basic) {
    return NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 })
  }

  const { company_code, sens_alerts_enabled = true } = await request.json()
  if (!company_code) return NextResponse.json({ error: 'company_code required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('klippa_invest_watchlist')
    .select('company_code')
    .eq('user_id', user.id)
    .eq('company_code', company_code)
    .maybeSingle()

  // Watchlist cap: 20 on basic, unlimited on full
  if (!prof.feature_invest_full) {
    const { count } = await supabase
      .from('klippa_invest_watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (!existing && (count ?? 0) >= 20) {
      return NextResponse.json({ error: 'WATCHLIST_LIMIT_REACHED', limit: 20 }, { status: 429 })
    }
  }

  const { error } = await supabase
    .from('klippa_invest_watchlist')
    .upsert({ user_id: user.id, company_code, sens_alerts_enabled }, { onConflict: 'user_id,company_code' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('klippa_invest_recommendations_log').insert({
    user_id:           user.id,
    source:            'screener',
    company_code,
    rationale_payload: { action: 'watchlist_add', sens_alerts_enabled },
    user_action:       'added_watchlist',
    acted_at:          new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const cookieStore = cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase
    .from('klippa_profiles')
    .select('feature_invest_basic, invest_enabled')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_basic) {
    return NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 })
  }

  const { company_code } = await request.json()
  if (!company_code) return NextResponse.json({ error: 'company_code required' }, { status: 400 })

  const { error } = await supabase
    .from('klippa_invest_watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('company_code', company_code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('klippa_invest_recommendations_log').insert({
    user_id:           user.id,
    source:            'screener',
    company_code,
    rationale_payload: { action: 'watchlist_remove' },
    user_action:       'dismissed',
    acted_at:          new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
