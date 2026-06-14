import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET() {
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

  const { data: watchlist } = await supabase
    .from('klippa_invest_watchlist')
    .select('company_code, company:klippa_invest_companies(name, sector)')
    .eq('user_id', user.id)

  const watchlistCodes = (watchlist ?? []).map((w: { company_code: string }) => w.company_code)

  let latestAnalyses: unknown[] = []
  if (watchlistCodes.length > 0) {
    const { data } = await supabase
      .from('klippa_invest_analysis_runs')
      .select('company_code, health_score, computed_at')
      .in('company_code', watchlistCodes)
      .order('computed_at', { ascending: false })
      .limit(watchlistCodes.length)
    latestAnalyses = data ?? []
  }

  return NextResponse.json({
    watchlist:      watchlist ?? [],
    latestAnalyses,
    isFull:         prof.feature_invest_full ?? false,
  })
}
