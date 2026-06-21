import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase
    .from('klippa_profiles')
    .select('feature_invest_full, invest_enabled')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_full) {
    return NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 })
  }

  const { data: watchlist } = await supabase
    .from('klippa_invest_watchlist')
    .select('company_code')
    .eq('user_id', user.id)
    .eq('sens_alerts_enabled', true)

  const codes = (watchlist ?? []).map((w: { company_code: string }) => w.company_code)
  if (codes.length === 0) return NextResponse.json({ events: [] })

  const { data, error } = await supabase
    .from('klippa_invest_sens_events')
    .select('*, company:klippa_invest_companies(code, name, sector)')
    .in('company_code', codes)
    .order('published_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}
