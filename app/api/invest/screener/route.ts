import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET(request: Request) {
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

  const url    = new URL(request.url)
  const search = url.searchParams.get('q') ?? ''
  const sector = url.searchParams.get('sector') ?? ''
  const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)

  let q = supabase
    .from('klippa_invest_companies')
    .select('*')
    .order('market_cap_zar', { ascending: false })
    .limit(limit)

  if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
  if (sector) q = q.eq('sector', sector)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ companies: data ?? [] })
}
