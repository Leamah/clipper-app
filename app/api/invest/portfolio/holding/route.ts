import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
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

  const { portfolio_id, company_code, shares, cost_basis_zar, acquired_at, in_tfsa = false } = await request.json()

  if (!portfolio_id || !company_code || !shares || !cost_basis_zar || !acquired_at) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (Number(shares) <= 0 || Number(cost_basis_zar) <= 0) {
    return NextResponse.json({ error: 'shares and cost_basis_zar must be positive' }, { status: 400 })
  }

  // Verify portfolio belongs to user
  const { data: portfolio } = await supabase
    .from('klippa_invest_portfolios')
    .select('id')
    .eq('id', portfolio_id)
    .eq('user_id', user.id)
    .single()

  if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('klippa_invest_holdings')
    .insert({ user_id: user.id, portfolio_id, company_code, shares, cost_basis_zar, acquired_at, in_tfsa })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
    .select('feature_invest_full, invest_enabled')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_full) {
    return NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 })
  }

  const { holding_id, closed_at, closed_price_zar } = await request.json()
  if (!holding_id || !closed_at || closed_price_zar == null) {
    return NextResponse.json({ error: 'holding_id, closed_at, and closed_price_zar required' }, { status: 400 })
  }

  const { data: holding, error: fetchErr } = await supabase
    .from('klippa_invest_holdings')
    .select('*')
    .eq('id', holding_id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !holding) return NextResponse.json({ error: 'Holding not found' }, { status: 404 })

  const gain_zar  = (closed_price_zar - holding.cost_basis_zar / holding.shares) * holding.shares
  const tax_year  = new Date(closed_at).getMonth() >= 2  // SA tax year starts March
    ? new Date(closed_at).getFullYear() + 1
    : new Date(closed_at).getFullYear()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Close holding + write realised gains row atomically
  const [{ error: updateErr }, { error: gainErr }] = await Promise.all([
    admin.from('klippa_invest_holdings').update({ closed_at, closed_price_zar }).eq('id', holding_id),
    admin.from('klippa_invest_realised_gains').insert({
      user_id:      user.id,
      holding_id,
      company_code: holding.company_code,
      gain_zar,
      closed_at,
      tax_year,
      in_tfsa:      holding.in_tfsa,
    }),
  ])

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  if (gainErr)   return NextResponse.json({ error: gainErr.message },   { status: 500 })

  return NextResponse.json({ ok: true, gain_zar, tax_year })
}
