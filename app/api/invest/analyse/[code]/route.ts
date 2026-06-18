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

function generateCommentary(modules: Record<string, ModuleResult>): Record<string, string> {
  const out: Record<string, string> = {}
  const m = modules

  if (m.M01) {
    const v = m.M01.value
    out.M01 = v === null ? 'Insufficient data to calculate return on equity.'
      : v >= 20  ? `Strong ROE of ${v.toFixed(1)}% — well above the 15% benchmark, indicating efficient use of shareholder capital.`
      : v >= 15  ? `Solid ROE of ${v.toFixed(1)}% — meets the 15% benchmark for capital efficiency.`
      : v >= 0   ? `ROE of ${v.toFixed(1)}% is below the 15% benchmark — the company is generating returns but not at an exceptional rate.`
      : `Negative ROE of ${v.toFixed(1)}% indicates the company reported a net loss during this period.`
  }
  if (m.M02) {
    const v = m.M02.value
    out.M02 = v === null ? 'Insufficient data to assess debt levels.'
      : v <= 0.3 ? `Very low D/E of ${v.toFixed(2)}x — minimal leverage, strong balance sheet.`
      : v <= 0.5 ? `Conservative D/E of ${v.toFixed(2)}x — within the preferred 0.5x threshold.`
      : v <= 1.0 ? `Moderate D/E of ${v.toFixed(2)}x — some leverage but manageable.`
      : `Elevated D/E of ${v.toFixed(2)}x — above the 0.5x benchmark; debt level warrants monitoring.`
  }
  if (m.M03) {
    const v = m.M03.value
    out.M03 = v === null ? 'Insufficient data to calculate current ratio.'
      : v >= 2   ? `Current ratio of ${v.toFixed(2)}x — strong short-term liquidity.`
      : v >= 1.5 ? `Current ratio of ${v.toFixed(2)}x meets the 1.5x benchmark — adequate liquidity.`
      : v >= 1   ? `Current ratio of ${v.toFixed(2)}x — liquid but below the 1.5x preferred level.`
      : `Current ratio below 1.0x (${v.toFixed(2)}x) — current liabilities exceed current assets, a liquidity risk.`
  }
  if (m.M04) {
    const v = m.M04.value
    out.M04 = v === null ? 'EPS growth cannot be calculated — prior year EPS unavailable.'
      : v >= 20  ? `Strong EPS growth of ${v.toFixed(1)}% year-on-year.`
      : v >= 5   ? `Positive EPS growth of ${v.toFixed(1)}% — meets the 5% benchmark.`
      : v >= 0   ? `Modest EPS growth of ${v.toFixed(1)}% — below the 5% benchmark.`
      : `EPS declined ${Math.abs(v).toFixed(1)}% year-on-year — earnings pressure evident.`
  }
  if (m.M05) {
    const v = m.M05.value
    out.M05 = v === null ? 'Insufficient revenue data to calculate net profit margin.'
      : v >= 20  ? `Excellent net margin of ${v.toFixed(1)}% — high profitability.`
      : v >= 10  ? `Solid net margin of ${v.toFixed(1)}% — meets the 10% benchmark.`
      : v >= 0   ? `Thin net margin of ${v.toFixed(1)}% — profitable but below the 10% benchmark.`
      : `Negative net margin of ${v.toFixed(1)}% — the company is loss-making.`
  }
  if (m.M06) {
    const v = m.M06.value
    out.M06 = v === null ? 'Cannot assess cash flow quality — insufficient data.'
      : v >= 1.5 ? `Cash flow quality ratio of ${v.toFixed(2)}x — operating cash flow substantially exceeds net income, high earnings quality.`
      : v >= 1   ? `Cash flow quality of ${v.toFixed(2)}x — operating cash flow backs reported earnings.`
      : v >= 0   ? `Cash flow quality of ${v.toFixed(2)}x — operating cash flow is below reported net income; investigate working capital movements.`
      : `Negative operating cash flow (${v.toFixed(2)}x) despite reported net income — earnings quality concern.`
  }
  if (m.M07) {
    const v = m.M07.value
    out.M07 = v === null ? 'Insufficient data to calculate gross margin.'
      : v >= 50  ? `High gross margin of ${v.toFixed(1)}% — strong pricing power or low cost structure.`
      : v >= 30  ? `Good gross margin of ${v.toFixed(1)}% — meets the 30% benchmark.`
      : v >= 0   ? `Gross margin of ${v.toFixed(1)}% is below the 30% benchmark.`
      : `Negative gross margin — cost of revenue exceeds revenue, a structural concern.`
  }
  if (m.M08) {
    const v = m.M08.value
    out.M08 = v === null ? 'Revenue growth cannot be calculated — prior year data unavailable.'
      : v >= 15  ? `Strong revenue growth of ${v.toFixed(1)}% year-on-year.`
      : v >= 5   ? `Positive revenue growth of ${v.toFixed(1)}% — meets the 5% benchmark.`
      : v >= 0   ? `Flat revenue growth of ${v.toFixed(1)}% — below the 5% benchmark.`
      : `Revenue declined ${Math.abs(v).toFixed(1)}% year-on-year.`
  }
  if (m.M09) {
    const v = m.M09.value
    out.M09 = v === null ? 'Interest coverage cannot be calculated.'
      : v >= 10  ? `Interest coverage of ${v.toFixed(1)}x — very comfortable debt servicing capacity.`
      : v >= 3   ? `Interest coverage of ${v.toFixed(1)}x meets the 3x benchmark.`
      : v >= 1   ? `Interest coverage of ${v.toFixed(1)}x — earnings cover interest but with limited headroom.`
      : `Interest coverage below 1.0x — EBIT does not fully cover interest expense; financial stress risk.`
  }
  if (m.M10) {
    const v = m.M10.value
    out.M10 = v === null ? 'Asset turnover cannot be calculated.'
      : v >= 1   ? `Asset turnover of ${v.toFixed(2)}x — efficient use of assets to generate revenue.`
      : v >= 0.5 ? `Asset turnover of ${v.toFixed(2)}x meets the 0.5x benchmark.`
      : `Low asset turnover of ${v.toFixed(2)}x — typical for capital-intensive industries but below 0.5x benchmark.`
  }
  if (m.M11) {
    const v = m.M11.value
    out.M11 = v === null ? 'Retained earnings ratio cannot be calculated.'
      : v >= 50  ? `Retained earnings represent ${v.toFixed(1)}% of equity — strong reinvestment history.`
      : v >= 0   ? `Retained earnings are ${v.toFixed(1)}% of equity — positive but modest retained capital.`
      : `Negative retained earnings (${v.toFixed(1)}%) — accumulated deficits exceed paid-in capital.`
  }
  if (m.M12) {
    const v = m.M12.value
    out.M12 = v === null ? 'Payout ratio cannot be calculated — no EPS data.'
      : v <= 40  ? `Conservative payout ratio of ${v.toFixed(1)}% — most earnings retained for growth.`
      : v <= 80  ? `Sustainable payout ratio of ${v.toFixed(1)}% — meets the sub-80% benchmark.`
      : `High payout ratio of ${v.toFixed(1)}% — dividend may not be sustainable if earnings decline.`
  }
  if (m.M13) {
    const v = m.M13.value
    out.M13 = v === null ? 'Altman Z\' score cannot be calculated — balance sheet data unavailable.'
      : v >= 2.6 ? `Altman Z' of ${v.toFixed(2)} — in the safe zone (>2.6). Low going-concern risk.`
      : v >= 1.1 ? `Altman Z' of ${v.toFixed(2)} — grey zone (1.1–2.6). Monitor debt and liquidity closely.`
      : `Altman Z' of ${v.toFixed(2)} — distress zone (<1.1). Elevated going-concern risk.`
  }

  return out
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
    ai_commentary:       generateCommentary(moduleOutputs),
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
