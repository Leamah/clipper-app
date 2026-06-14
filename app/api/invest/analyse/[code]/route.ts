import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

const CACHE_TTL_MS    = 7 * 24 * 60 * 60 * 1000
const RATE_LIMIT_BASIC = 5

// ── Inline financial analysis engine ─────────────────────────────────────────

type FinYear = {
  fiscal_year:      number
  income_statement: Record<string, number>
  balance_sheet:    Record<string, number>
  cash_flow:        Record<string, number>
}

type ModuleResult = {
  label:             string
  value:             number | null
  unit:              string
  benchmark_above?:  number
  benchmark_below?:  number
}

function n(v: unknown): number {
  const x = Number(v)
  return isFinite(x) ? x : 0
}

function r(num: number, den: number): number | null {
  return den !== 0 ? Math.round((num / den) * 100) / 100 : null
}

function altmanZ(wc: number, re: number, ebit: number, equity: number, liab: number, assets: number): number | null {
  if (!assets || !liab) return null
  const z = 6.56 * (wc / assets) + 3.26 * (re / assets) + 6.72 * (ebit / assets) + 1.05 * (equity / liab)
  return Math.round(z * 100) / 100
}

function calcModules(years: FinYear[]): Record<string, ModuleResult> {
  const [lat, prev] = years
  const is = lat.income_statement
  const bs = lat.balance_sheet
  const cf = lat.cash_flow

  const revenue     = n(is.revenue);       const grossProfit  = n(is.gross_profit)
  const ebit        = n(is.ebit);          const netIncome    = n(is.net_income)
  const interestExp = n(is.interest_expense); const eps        = n(is.eps)
  const dps         = n(is.dividends_per_share)
  const totalAssets = n(bs.total_assets);  const totalEquity  = n(bs.total_equity)
  const totalDebt   = n(bs.total_debt);    const currentA     = n(bs.current_assets)
  const currentL    = n(bs.current_liabilities); const retainedE = n(bs.retained_earnings)
  const ocf         = n(cf.operating_cash_flow); const capex    = n(cf.capex)
  const fcf         = n(cf.free_cash_flow) || (ocf - capex)
  const workingCap  = currentA - currentL
  const totalLiab   = totalAssets - totalEquity

  const prevRev = prev ? n(prev.income_statement.revenue) : 0
  const prevEps = prev ? n(prev.income_statement.eps)     : 0

  return {
    M01: { label: 'Return on Equity',       value: r(netIncome * 100, totalEquity),       unit: '%',  benchmark_above: 15  },
    M02: { label: 'Debt / Equity',           value: r(totalDebt, totalEquity),             unit: 'x',  benchmark_below: 0.5 },
    M03: { label: 'Current Ratio',           value: r(currentA, currentL),                 unit: 'x',  benchmark_above: 1.5 },
    M04: { label: 'EPS Growth (YoY)',        value: prev && prevEps ? r((eps - prevEps) * 100, Math.abs(prevEps)) : null, unit: '%', benchmark_above: 5 },
    M05: { label: 'Net Profit Margin',       value: r(netIncome * 100, revenue),           unit: '%',  benchmark_above: 10  },
    M06: { label: 'Cash Flow Quality',       value: r(ocf, netIncome),                     unit: 'x',  benchmark_above: 1   },
    M07: { label: 'Gross Margin',            value: r(grossProfit * 100, revenue),         unit: '%',  benchmark_above: 30  },
    M08: { label: 'Revenue Growth (YoY)',    value: prev && prevRev ? r((revenue - prevRev) * 100, prevRev) : null, unit: '%', benchmark_above: 5 },
    M09: { label: 'Interest Coverage',       value: r(ebit, interestExp),                  unit: 'x',  benchmark_above: 3   },
    M10: { label: 'Asset Turnover',          value: r(revenue, totalAssets),               unit: 'x',  benchmark_above: 0.5 },
    M11: { label: 'Retained Earnings Ratio', value: r(retainedE * 100, totalEquity),       unit: '%',  benchmark_above: 0   },
    M12: { label: 'Payout Ratio',            value: eps ? r(dps * 100, eps) : null,        unit: '%',  benchmark_below: 80  },
    M13: { label: 'Going Concern (Z\')',      value: altmanZ(workingCap, retainedE, ebit, totalEquity, totalLiab, totalAssets), unit: 'Z\'', benchmark_above: 2.6 },
  }
}

function healthScore(modules: Record<string, ModuleResult>): number {
  let pass = 0, total = 0
  for (const m of Object.values(modules)) {
    if (m.value === null) continue
    total++
    if (m.benchmark_above !== undefined && m.value >= m.benchmark_above) pass++
    if (m.benchmark_below !== undefined && m.value <= m.benchmark_below) pass++
  }
  return total ? Math.round((pass / total) * 100) : 0
}

function goingConcernScore(z: number | null): number {
  if (z === null) return 50
  if (z >= 2.6) return Math.min(100, Math.round(70 + (z - 2.6) * 10))
  if (z >= 1.1) return Math.round(30 + ((z - 1.1) / 1.5) * 40)
  return Math.max(0, Math.round((z / 1.1) * 30))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  _request: Request,
  { params }: { params: { code: string } }
) {
  const { code } = params
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

  // Rate limit: basic tier — 5 analyses per 24h
  if (!prof.feature_invest_full) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('klippa_invest_recommendations_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'screener')
      .gte('surfaced_at', since)
    if ((count ?? 0) >= RATE_LIMIT_BASIC) {
      return NextResponse.json({ error: 'RATE_LIMIT_EXCEEDED', limit: RATE_LIMIT_BASIC }, { status: 429 })
    }
  }

  // Serve from cache (7-day TTL)
  const { data: cached } = await supabase
    .from('klippa_invest_analysis_runs')
    .select('*')
    .eq('company_code', code)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached && Date.now() - new Date(cached.computed_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json(cached)
  }

  // Fetch up to 5 years of financials
  const { data: financials } = await supabase
    .from('klippa_invest_financials')
    .select('fiscal_year, income_statement, balance_sheet, cash_flow')
    .eq('company_code', code)
    .order('fiscal_year', { ascending: false })
    .limit(5)

  if (!financials || financials.length === 0) {
    return NextResponse.json({
      error:   'NO_FINANCIAL_DATA',
      message: 'Financial statements for this company are not yet loaded. Use the admin panel to seed company data.',
    }, { status: 404 })
  }

  const years        = financials as FinYear[]
  const isFull       = prof.feature_invest_full ?? false
  const allModules   = calcModules(years)

  // Basic tier: expose M01-M04 only; full: all 13
  const moduleOutputs = isFull
    ? allModules
    : Object.fromEntries(Object.entries(allModules).slice(0, 4))

  const hs  = healthScore(moduleOutputs)
  const z13 = (allModules.M13?.value as number | null) ?? null
  const gc  = goingConcernScore(z13)

  const fiscalYearRange = years.length > 1
    ? `${years[years.length - 1].fiscal_year}–${years[0].fiscal_year}`
    : String(years[0].fiscal_year)

  const payload = {
    company_code:        code,
    fiscal_year_range:   fiscalYearRange,
    module_outputs:      moduleOutputs,
    ai_commentary:       {},
    health_score:        hs,
    going_concern_score: gc,
  }

  // Cache the full result
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    const { data: inserted } = await admin
      .from('klippa_invest_analysis_runs')
      .insert({ ...payload, module_outputs: allModules })
      .select()
      .single()
    // Return tier-filtered output to the user
    return NextResponse.json({ ...(inserted ?? payload), module_outputs: moduleOutputs })
  }

  return NextResponse.json(payload)
}
