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

  // Watchlist cap: 20 on starter, unlimited on professional/admin
  if (!prof.feature_invest_full) {
    const { count } = await supabase
      .from('klippa_invest_watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= 20) {
      return NextResponse.json({ error: 'WATCHLIST_LIMIT_REACHED', limit: 20 }, { status: 429 })
    }
  }

  const { error } = await supabase
    .from('klippa_invest_watchlist')
    .upsert({ user_id: user.id, company_code, sens_alerts_enabled }, { onConflict: 'user_id,company_code' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

  const { company_code } = await request.json()
  if (!company_code) return NextResponse.json({ error: 'company_code required' }, { status: 400 })

  const { error } = await supabase
    .from('klippa_invest_watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('company_code', company_code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
