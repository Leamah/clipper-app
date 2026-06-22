import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

type FinYear = {
  fiscal_year:      number
  income_statement: Record<string, number>
  balance_sheet:    Record<string, number>
  cash_flow:        Record<string, number>
}

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0 }
function r(num: number, den: number): number | null { return den !== 0 ? Math.round((num / den) * 100) / 100 : null }

function altmanZ(wc: number, re: number, ebit: number, equity: number, liab: number, assets: number): number | null {
  if (!assets || !liab) return null
  const z = 6.56 * (wc / assets) + 3.26 * (re / assets) + 6.72 * (ebit / assets) + 1.05 * (equity / liab)
  return Math.round(z * 100) / 100
}

function calcModules(years: FinYear[]) {
  const [lat, prev] = years
  const is = lat.income_statement; const bs = lat.balance_sheet; const cf = lat.cash_flow
  const revenue = n(is.revenue);     const grossProfit = n(is.gross_profit)
  const ebit    = n(is.ebit);        const netIncome   = n(is.net_income)
  const interestExp = n(is.interest_expense); const eps = n(is.eps); const dps = n(is.dividends_per_share)
  const totalAssets = n(bs.total_assets); const totalEquity = n(bs.total_equity)
  const totalDebt   = n(bs.total_debt);   const currentA    = n(bs.current_assets)
  const currentL    = n(bs.current_liabilities); const retainedE = n(bs.retained_earnings)
  const ocf = n(cf.operating_cash_flow); const capex = n(cf.capex)
  const workingCap = currentA - currentL; const totalLiab = totalAssets - totalEquity
  const prevRev = prev ? n(prev.income_statement.revenue) : 0
  const prevEps = prev ? n(prev.income_statement.eps)     : 0

  return {
    M01: { label: 'Return on Equity',       value: r(netIncome * 100, totalEquity),   unit: '%' },
    M02: { label: 'Debt / Equity',           value: r(totalDebt, totalEquity),         unit: 'x' },
    M03: { label: 'Current Ratio',           value: r(currentA, currentL),             unit: 'x' },
    M04: { label: 'EPS Growth (YoY)',        value: prev && prevEps ? r((eps - prevEps) * 100, Math.abs(prevEps)) : null, unit: '%' },
    M05: { label: 'Net Profit Margin',       value: r(netIncome * 100, revenue),       unit: '%' },
    M06: { label: 'Cash Flow Quality',       value: r(ocf, netIncome),                 unit: 'x' },
    M07: { label: 'Gross Margin',            value: r(grossProfit * 100, revenue),     unit: '%' },
    M08: { label: 'Revenue Growth (YoY)',    value: prev && prevRev ? r((revenue - prevRev) * 100, prevRev) : null, unit: '%' },
    M09: { label: 'Interest Coverage',       value: r(ebit, interestExp),              unit: 'x' },
    M10: { label: 'Asset Turnover',          value: r(revenue, totalAssets),           unit: 'x' },
    M11: { label: 'Retained Earnings Ratio', value: r(retainedE * 100, totalEquity),   unit: '%' },
    M12: { label: 'Payout Ratio',            value: eps ? r(dps * 100, eps) : null,    unit: '%' },
    M13: { label: "Altman Z'",               value: altmanZ(workingCap, retainedE, ebit, totalEquity, totalLiab, totalAssets), unit: "Z'" },
  }
}

function healthScore(modules: ReturnType<typeof calcModules>): number {
  const benchmarks: Record<string, { above?: number; below?: number }> = {
    M01: { above: 15 }, M02: { below: 0.5 }, M03: { above: 1.5 }, M04: { above: 5 },
    M05: { above: 10 }, M06: { above: 1 },   M07: { above: 30 },  M08: { above: 5 },
    M09: { above: 3 },  M10: { above: 0.5 }, M11: { above: 0 },   M12: { below: 80 }, M13: { above: 2.6 },
  }
  let pass = 0, total = 0
  for (const [key, m] of Object.entries(modules)) {
    if (m.value === null) continue
    total++
    const b = benchmarks[key]
    if (b?.above !== undefined && m.value >= b.above) pass++
    if (b?.below !== undefined && m.value <= b.below) pass++
  }
  return total ? Math.round((pass / total) * 100) : 0
}

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
    .select('code, name, sector, industry')
    .in('code', codes)

  // Fetch cached analyses
  const { data: cachedRuns } = await supabase
    .from('klippa_invest_analysis_runs')
    .select('*')
    .in('company_code', codes)
    .order('computed_at', { ascending: false })

  const latestByCompany: Record<string, { health_score: number; module_outputs: ReturnType<typeof calcModules> }> = {}
  for (const run of (cachedRuns ?? [])) {
    const r = run as { company_code: string; health_score: number; module_outputs: ReturnType<typeof calcModules> }
    if (!latestByCompany[r.company_code]) latestByCompany[r.company_code] = r
  }

  // For companies with no cached run, compute on-the-fly from financials
  const uncached = codes.filter(c => !latestByCompany[c])
  if (uncached.length > 0) {
    const { data: allFin } = await supabase
      .from('klippa_invest_financials')
      .select('company_code, fiscal_year, income_statement, balance_sheet, cash_flow')
      .in('company_code', uncached)
      .order('fiscal_year', { ascending: false })

    const byCompany: Record<string, FinYear[]> = {}
    for (const f of (allFin ?? []) as (FinYear & { company_code: string })[]) {
      if (!byCompany[f.company_code]) byCompany[f.company_code] = []
      byCompany[f.company_code].push(f)
    }

    for (const code of uncached) {
      const years = byCompany[code]
      if (!years || years.length === 0) continue
      const modules = calcModules(years)
      latestByCompany[code] = { health_score: healthScore(modules), module_outputs: modules }
    }
  }

  return NextResponse.json({ companies: companies ?? [], analyses: latestByCompany })
}
