import { createClient }       from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import YahooFinance           from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseFTSRow(row: Record<string, any>, dps: number, isLatest: boolean) {
  const ocf   = n(row.operatingCashFlow ?? row.cashFlowFromContinuingOperatingActivities)
  const capex = Math.abs(n(row.capitalExpenditure))
  return {
    income_statement: {
      revenue:             n(row.totalRevenue ?? row.operatingRevenue),
      gross_profit:        n(row.grossProfit),
      ebit:                n(row.EBIT ?? row.operatingIncome),
      net_income:          n(row.netIncome ?? row.netIncomeCommonStockholders),
      interest_expense:    row.interestExpense != null ? -Math.abs(n(row.interestExpense)) : 0,
      eps:                 n(row.dilutedEPS ?? row.basicEPS),
      dividends_per_share: isLatest ? dps : 0,
    },
    balance_sheet: {
      total_assets:        n(row.totalAssets),
      total_equity:        n(row.stockholdersEquity ?? row.commonStockEquity),
      total_debt:          n(row.totalDebt),
      current_assets:      n(row.currentAssets),
      current_liabilities: n(row.currentLiabilities),
      retained_earnings:   n(row.retainedEarnings),
      shares_outstanding:  n(row.ordinarySharesNumber ?? row.shareIssued),
      working_capital:     n(row.workingCapital) || (n(row.currentAssets) - n(row.currentLiabilities)),
    },
    cash_flow: {
      operating_cash_flow: ocf,
      capex,
      free_cash_flow: n(row.freeCashFlow) || (ocf - capex),
    },
  }
}

async function syncCompany(
  supabaseUrl: string,
  serviceKey: string,
  code: string,
  yahoo_ticker: string
): Promise<{ code: string; status: 'ok' | 'error' | 'no_data'; message?: string }> {
  const admin = createClient(supabaseUrl, serviceKey)
  try {
    // Fetch company metadata from quoteSummary
    const meta = await yahooFinance.quoteSummary(yahoo_ticker, {
      modules: ['price', 'summaryProfile', 'summaryDetail'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

    const dps = n(meta.summaryDetail?.dividendRate ?? meta.summaryDetail?.trailingAnnualDividendRate)

    await admin.from('klippa_invest_companies').upsert({
      code,
      yahoo_ticker,
      name:           meta.price?.longName ?? meta.price?.shortName ?? code,
      sector:         meta.summaryProfile?.sector   ?? null,
      industry:       meta.summaryProfile?.industry ?? null,
      market_cap_zar: meta.price?.marketCap         ?? null,
      last_synced_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'code' })

    // Fetch full financials via fundamentalsTimeSeries (replaces deprecated history modules)
    const ftsRows = await yahooFinance.fundamentalsTimeSeries(yahoo_ticker, {
      module: 'all',
      type:   'annual',
      period1: new Date(new Date().getFullYear() - 6, 0, 1).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any[]

    if (!ftsRows || ftsRows.length === 0) {
      return { code, status: 'no_data', message: 'No fundamentals data' }
    }

    const upserts = ftsRows.map((row, i) => {
      const year = row.date ? new Date(row.date).getFullYear() : new Date().getFullYear() - i
      return {
        company_code: code,
        fiscal_year:  year,
        ...normaliseFTSRow(row, dps, i === 0),
        source:       'yahoo_finance',
        ingested_at:  new Date().toISOString(),
      }
    })

    const { error: upsertErr } = await admin
      .from('klippa_invest_financials')
      .upsert(upserts, { onConflict: 'company_code,fiscal_year' })

    if (upsertErr) return { code, status: 'error', message: upsertErr.message }

    await admin.from('klippa_invest_analysis_runs').delete().eq('company_code', code)

    return { code, status: 'ok' }
  } catch (e: unknown) {
    return { code, status: 'error', message: String(e) }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
// Auth: either Vercel Cron bearer token OR an active admin session cookie.
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const secret     = process.env.INTERNAL_CRON_SECRET

  const isCron = secret && authHeader === `Bearer ${secret}`

  if (!isCron) {
    // Fall back to session-based admin check
    const cookieStore = cookies()
    const anon = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
    )
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: profile } = await admin.from('klippa_profiles').select('subscription_tier').eq('id', user.id).single()
    if (profile?.subscription_tier !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: companies } = await admin
    .from('klippa_invest_companies')
    .select('code, yahoo_ticker')
    .eq('is_tracked', true)

  if (!companies || companies.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: 'No tracked companies' })
  }

  const results: Awaited<ReturnType<typeof syncCompany>>[] = []
  for (const c of companies as { code: string; yahoo_ticker: string | null }[]) {
    const ticker = c.yahoo_ticker ?? `${c.code}.JO`
    results.push(await syncCompany(supabaseUrl, serviceKey, c.code, ticker))
    await new Promise(r => setTimeout(r, 500))  // avoid rate limits
  }

  return NextResponse.json({
    ok:      true,
    synced:  results.filter(r => r.status === 'ok').length,
    no_data: results.filter(r => r.status === 'no_data').length,
    errors:  results.filter(r => r.status === 'error'),
  })
}
