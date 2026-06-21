import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

function investClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

async function requireFullInvest() {
  const supabase = investClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: prof } = await supabase
    .from('klippa_profiles')
    .select('feature_invest_full, invest_enabled')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_full) {
    return { supabase, user, error: NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 }) }
  }

  return { supabase, user, error: null }
}

export async function GET() {
  const ctx = await requireFullInvest()
  if (ctx.error || !ctx.user) return ctx.error

  const { data, error } = await ctx.supabase
    .from('klippa_invest_portfolios')
    .select('*, holdings:klippa_invest_holdings(id)')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ portfolios: data ?? [] })
}

export async function POST(request: Request) {
  const ctx = await requireFullInvest()
  if (ctx.error || !ctx.user) return ctx.error

  const { name } = await request.json()
  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (!cleanName) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await ctx.supabase
    .from('klippa_invest_portfolios')
    .insert({ user_id: ctx.user.id, name: cleanName })
    .select('*, holdings:klippa_invest_holdings(id)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await ctx.supabase.from('klippa_invest_recommendations_log').insert({
    user_id:           ctx.user.id,
    source:            'compass',
    rationale_payload: { action: 'portfolio_create', portfolio_id: data.id, name: cleanName },
    user_action:       'simulated_buy',
    acted_at:          new Date().toISOString(),
  })

  return NextResponse.json(data)
}
