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
    .select('feature_invest_full, invest_enabled')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_full) {
    return NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 })
  }

  const { codes } = await request.json()
  if (!Array.isArray(codes) || codes.length < 2 || codes.length > 5) {
    return NextResponse.json({ error: 'Provide 2–5 company codes' }, { status: 400 })
  }

  const { data: companies } = await supabase
    .from('klippa_invest_companies')
    .select('*')
    .in('code', codes)

  const { data: analyses } = await supabase
    .from('klippa_invest_analysis_runs')
    .select('*')
    .in('company_code', codes)
    .order('computed_at', { ascending: false })

  // Deduplicate to latest run per company
  const latestByCompany: Record<string, unknown> = {}
  for (const run of (analyses ?? [])) {
    const r = run as { company_code: string }
    if (!latestByCompany[r.company_code]) latestByCompany[r.company_code] = run
  }

  return NextResponse.json({
    companies: companies ?? [],
    analyses:  latestByCompany,
  })
}
