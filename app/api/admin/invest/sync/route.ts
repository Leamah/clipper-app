import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'
import yahooFinance      from 'yahoo-finance2'

// yahoo-finance2 quoteSummary result shape for the modules we request
interface YahooSummary {
  price?: {
    longName?: string | null
    shortName?: string | null
    marketCap?: number | null
  }
  summaryProfile?: {
    sector?:   string | null
    industry?: string | null
  }
  summaryDetail?: {
    dividendRate?:                  number | null
    trailingAnnualDividendRate?:    number | null
  }
  defaultKeyStatistics?: {
    sharesOutstanding?: number | null
    freeCashflow?:      number | null
  }
  incomeStatementHistory?: {
    incomeStatementHistory?: Array<Record<string, unknown>>
  }
  balanceSheetHistory?: {
    balanceSheetStatements?: Array<Record<string, unknown>>
  }
  cashflowStatementHistory?: {
    cashflowStatements?: Array<Record<string, unknown>>
  }
}

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0 }

function normaliseIS(raw: Record<string, unknown>, dps: number, isLatest: boolean) {
  return {
    revenue:             n(raw.totalRevenue         ?? raw.revenue),
    gross_profit:        n(raw.grossProfit),
    ebit:                n(raw.ebit                 ?? raw.operatingIncome),
    net_income:          n(raw.netIncome),
    interest_expense:    raw.interestExpense != null ? -Math.abs(n(raw.interestExpense)) : 0,
    eps:                 n(raw.dilutedEps            ?? raw.basicEps),
    dividends_per_share: isLatest ? dps : 0,
  }
}

function normaliseBS(raw: Record<string, unknown>) {
  return {
    total_assets:         n(raw.totalAssets),
    total_equity:         n(raw.stockholdersEquity ?? raw.totalStockholderEquity),
    total_debt:           n(raw.longTermDebt ?? 0) + n(raw.shortLongTermDebt ?? raw.currentDebt ?? 0),
    current_assets:       n(raw.totalCurrentAssets),
    current_liabilities:  n(raw.totalCurrentLiabilities),
    retained_earnings:    n(raw.retainedEarnings),
    shares_outstanding:   n(raw.commonStock),
    working_capital:      n(raw.totalCurrentAssets) - n(raw.totalCurrentLiabilities),
  }
}

function normaliseCF(raw: Record<string, unknown>) {
  const ocf   = n(raw.totalCashFromOperatingActivities ?? raw.operatingCashflow)
  const capex = Math.abs(n(raw.capitalExpenditures))
  return {
    operating_cash_flow: ocf,
    capex,
    free_cash_flow: n(raw.freeCashflow) || (ocf - capex),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await yahooFinance.quoteSummary(yahoo_ticker, {
      modules: [
        'incomeStatementHistory',
        'balanceSheetHistory',
        'cashflowStatementHistory',
        'summaryProfile',
        'summaryDetail',
        'defaultKeyStatistics',
        'price',
      ],
    }) as unknown as YahooSummary

    const dps = n(raw.summaryDetail?.dividendRate ?? raw.summaryDetail?.trailingAnnualDividendRate)

    // Upsert company metadata
    await admin.from('klippa_invest_companies').upsert({
      code,
      yahoo_ticker,
      name:           raw.price?.longName ?? raw.price?.shortName ?? code,
      sector:         raw.summaryProfile?.sector   ?? null,
      industry:       raw.summaryProfile?.industry ?? null,
      market_cap_zar: raw.price?.marketCap         ?? null,
      last_synced_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'code' })

    const incomeList = raw.incomeStatementHistory?.incomeStatementHistory ?? []
    const bsList     = raw.balanceSheetHistory?.balanceSheetStatements    ?? []
    const cfList     = raw.cashflowStatementHistory?.cashflowStatements   ?? []

    if (incomeList.length === 0) {
      return { code, status: 'no_data', message: 'No income statement history' }
    }

    const upserts = incomeList.map((is, i) => {
      const endDate = (is.endDate as string | Date | undefined)
      const year    = endDate ? new Date(endDate).getFullYear() : new Date().getFullYear() - i
      return {
        company_code:     code,
        fiscal_year:      year,
        income_statement: normaliseIS(is, dps, i === 0),
        balance_sheet:    normaliseBS((bsList[i] ?? {}) as Record<string, unknown>),
        cash_flow:        normaliseCF((cfList[i] ?? {}) as Record<string, unknown>),
        source:           'yahoo_finance',
        ingested_at:      new Date().toISOString(),
      }
    })

    const { error: upsertErr } = await admin
      .from('klippa_invest_financials')
      .upsert(upserts, { onConflict: 'company_code,fiscal_year' })

    if (upsertErr) return { code, status: 'error', message: upsertErr.message }

    // Bust analysis cache so next visit recomputes with fresh data
    await admin.from('klippa_invest_analysis_runs').delete().eq('company_code', code)

    return { code, status: 'ok' }
  } catch (e: unknown) {
    return { code, status: 'error', message: String(e) }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
// Vercel Cron calls this daily at 20:00 UTC (22:00 SAST).
// Auth: Authorization: Bearer <INTERNAL_CRON_SECRET>
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const secret     = process.env.INTERNAL_CRON_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
