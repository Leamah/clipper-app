import { createClient }       from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import yahooFinance           from 'yahoo-finance2'

interface YahooMeta {
  price?: { longName?: string | null; shortName?: string | null; marketCap?: number | null }
  summaryProfile?: { sector?: string | null; industry?: string | null }
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key)
}

async function requireAdmin(): Promise<{ error: Response } | { error: null }> {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as unknown as Response }
  const { data: profile } = await anon.from('klippa_profiles').select('subscription_tier').eq('id', user.id).single()
  if (profile?.subscription_tier !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as unknown as Response }
  return { error: null }
}

// GET — list all invest companies with tracking status
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const admin = adminClient()
  const { data, error } = await admin
    .from('klippa_invest_companies')
    .select('code, name, sector, is_tracked, yahoo_ticker, last_synced_at, updated_at')
    .order('is_tracked', { ascending: false })
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data ?? [] })
}

// POST — add a company by JSE code; looks up metadata from Yahoo Finance
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const upper  = (code as string).toUpperCase().trim()
  const ticker = `${upper}.JO`
  const admin  = adminClient()

  // If already exists, just enable tracking
  const { data: existing } = await admin
    .from('klippa_invest_companies')
    .select('code')
    .eq('code', upper)
    .maybeSingle()

  if (existing) {
    await admin.from('klippa_invest_companies').update({ is_tracked: true }).eq('code', upper)
    return NextResponse.json({ ok: true, code: upper, action: 'tracked' })
  }

  // Fetch metadata from Yahoo Finance
  try {
    const raw  = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryProfile', 'price'],
    }) as unknown as YahooMeta

    const { data: company, error } = await admin
      .from('klippa_invest_companies')
      .upsert({
        code,
        yahoo_ticker:   ticker,
        name:           raw.price?.longName ?? raw.price?.shortName ?? upper,
        sector:         raw.summaryProfile?.sector   ?? null,
        industry:       raw.summaryProfile?.industry ?? null,
        market_cap_zar: raw.price?.marketCap         ?? null,
        is_tracked:     true,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'code' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, company, action: 'created' })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Yahoo Finance lookup failed for ${ticker}: ${String(e)}` },
      { status: 422 }
    )
  }
}

// PATCH — toggle is_tracked or set a custom yahoo_ticker
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { code, is_tracked, yahoo_ticker } = await request.json()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const admin  = adminClient()
  const update: Record<string, unknown> = {}
  if (is_tracked    !== undefined) update.is_tracked   = is_tracked
  if (yahoo_ticker  !== undefined) update.yahoo_ticker = yahoo_ticker

  const { error } = await admin.from('klippa_invest_companies').update(update).eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove a company (financials + analyses cascade-delete)
export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const admin = adminClient()
  const { error } = await admin.from('klippa_invest_companies').delete().eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
