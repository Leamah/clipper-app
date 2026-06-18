import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import type { InvestPhilosophy } from '@/lib/types'

const BASIC_PHILOSOPHIES: InvestPhilosophy[] = ['buffett']

type FinRow = {
  company_code:     string
  income_statement: Record<string, number>
  balance_sheet:    Record<string, number>
  cash_flow:        Record<string, number>
}

type CompanyRow = { code: string; name: string; sector: string | null; industry: string | null }

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0 }

function computeMetrics(f: FinRow) {
  const is = f.income_statement; const bs = f.balance_sheet; const cf = f.cash_flow
  const revenue     = n(is.revenue);       const grossProfit  = n(is.gross_profit)
  const netIncome   = n(is.net_income);    const ebit         = n(is.ebit)
  const totalEquity = n(bs.total_equity);  const totalDebt    = n(bs.total_debt)
  const currentA    = n(bs.current_assets); const currentL    = n(bs.current_liabilities)
  const ocf         = n(cf.operating_cash_flow); const capex  = n(cf.capex)
  const dps         = n(is.dividends_per_share); const eps    = n(is.eps)
  return {
    roe:          totalEquity  ? (netIncome / totalEquity)  * 100 : null,
    de:           totalEquity  ? totalDebt  / totalEquity         : null,
    margin:       revenue      ? (netIncome / revenue)      * 100 : null,
    grossMargin:  revenue      ? (grossProfit / revenue)    * 100 : null,
    currentRatio: currentL     ? currentA   / currentL            : null,
    fcf:          n(cf.free_cash_flow) || (ocf - capex),
    payoutRatio:  eps          ? (dps / eps) * 100                : null,
    revenue,
    ebit,
  }
}

function fmt(n: number | null, suffix = '%'): string {
  if (n == null || !isFinite(n)) return 'N/A'
  return `${n.toFixed(1)}${suffix}`
}

function buildRationale(name: InvestPhilosophy, m: ReturnType<typeof computeMetrics>): string {
  switch (name) {
    case 'buffett':
      return `ROE ${fmt(m.roe)} · Net margin ${fmt(m.margin)} · D/E ${fmt(m.de, 'x')} · FCF ${m.fcf > 0 ? 'positive' : 'negative'} · Gross margin ${fmt(m.grossMargin)}`
    case 'graham':
      return `Current ratio ${fmt(m.currentRatio, 'x')} · D/E ${fmt(m.de, 'x')} · Net margin ${fmt(m.margin)} · Payout ratio ${fmt(m.payoutRatio)} · FCF ${m.fcf > 0 ? 'positive' : 'negative'}`
    case 'lynch':
      return `Net margin ${fmt(m.margin)} · ROE ${fmt(m.roe)} · FCF ${m.fcf > 0 ? 'positive' : 'negative'} · D/E ${fmt(m.de, 'x')}`
    case 'pabrai':
      return `ROE ${fmt(m.roe)} · D/E ${fmt(m.de, 'x')} · Net margin ${fmt(m.margin)} · FCF ${m.fcf > 0 ? 'positive' : 'negative'}`
    case 'greenblatt':
      return `ROE ${fmt(m.roe)} · EBIT R${(m.ebit / 1e6).toFixed(0)}m · Net margin ${fmt(m.margin)}`
    default:
      return ''
  }
}

const MAX_SCORE: Record<InvestPhilosophy, number> = {
  buffett:    10, // 3+2+2+2+1
  graham:     10, // 3+2+2+2+1
  lynch:      10, // 2+2+2+2+2
  pabrai:     10, // 3+3+2+2
  greenblatt:  8, // 4+2+2
}

function applyFilter(
  name: InvestPhilosophy,
  companies: CompanyRow[],
  latestFin: Record<string, FinRow>
) {
  const maxScore  = MAX_SCORE[name]
  type Scored = CompanyRow & { metrics: ReturnType<typeof computeMetrics>; score: number }
  const scored: Scored[] = []

  for (const c of companies) {
    const f = latestFin[c.code]
    if (!f) continue
    const m = computeMetrics(f)
    let score = 0

    switch (name) {
      case 'buffett':
        if ((m.roe  ?? 0) >= 15)  score += 3
        if ((m.de   ?? 1) <  0.5) score += 2
        if ((m.margin ?? 0) >= 10) score += 2
        if (m.fcf   >   0)        score += 2
        if ((m.grossMargin ?? 0) >= 40) score++
        break
      case 'graham':
        if ((m.currentRatio ?? 0) >= 2)   score += 3
        if ((m.de ?? 1) < 1)              score += 2
        if ((m.payoutRatio ?? 100) < 80 && (m.payoutRatio ?? 0) > 0) score += 2
        if ((m.margin ?? 0) > 0)          score += 2
        if (m.fcf > 0)                    score++
        break
      case 'lynch':
        // Lynch: consistent earners with moderate growth
        if ((m.margin  ?? 0) >= 5)  score += 2
        if ((m.roe     ?? 0) >= 10) score += 2
        if ((m.fcf)    > 0)         score += 2
        if (m.revenue  > 0)         score += 2
        if ((m.de ?? 1) < 1)        score += 2
        break
      case 'pabrai':
        if ((m.roe ?? 0) >= 20)   score += 3
        if ((m.de  ?? 1) < 0.3)   score += 3
        if (m.fcf  > 0)           score += 2
        if ((m.margin ?? 0) >= 15) score += 2
        break
      case 'greenblatt': {
        // Magic formula proxy: high ROE + high EBIT/assets
        const rocProxy = m.ebit > 0 ? m.ebit : 0
        if ((m.roe ?? 0) > 0)    score += Math.min(4, Math.floor((m.roe ?? 0) / 10))
        if (rocProxy > 0)        score += 2
        if ((m.margin ?? 0) > 0) score += 2
        break
      }
    }

    scored.push({ ...c, metrics: m, score })
  }

  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ code, name: cName, sector, metrics, score }) => ({
      company_code: code,
      company_name: cName,
      sector,
      fit_score:    score,
      max_score:    maxScore,
      rationale:    buildRationale(name, metrics),
    }))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: { name: string } }
) {
  const name        = params.name as InvestPhilosophy
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

  if (!prof.feature_invest_full && !BASIC_PHILOSOPHIES.includes(name)) {
    return NextResponse.json({ error: 'INVEST_TIER_REQUIRED', message: 'This philosophy requires Full Invest (Starter or above).' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))

  await supabase.from('klippa_invest_recommendations_log').insert({
    user_id:           user.id,
    source:            'philosophy',
    philosophy:        name,
    rationale_payload: body,
  })

  // Fetch all companies
  const { data: companies } = await supabase
    .from('klippa_invest_companies')
    .select('code, name, sector, industry')
    .limit(500)

  if (!companies || companies.length === 0) {
    return NextResponse.json({
      philosophy: name,
      results:    [],
      message:    'No company data loaded yet. Seed JSE companies via the admin panel.',
    })
  }

  // Fetch latest financial year for every company (single query, grouped client-side)
  const codes = companies.map((c: CompanyRow) => c.code)
  const { data: allFin } = await supabase
    .from('klippa_invest_financials')
    .select('company_code, fiscal_year, income_statement, balance_sheet, cash_flow')
    .in('company_code', codes)

  const latestFin: Record<string, FinRow> = {}
  for (const f of (allFin ?? []) as (FinRow & { fiscal_year: number })[]) {
    const existing = latestFin[f.company_code]
    if (!existing || f.fiscal_year > (existing as FinRow & { fiscal_year: number }).fiscal_year) {
      latestFin[f.company_code] = f
    }
  }

  const results = applyFilter(name, companies as CompanyRow[], latestFin)

  return NextResponse.json({ philosophy: name, results })
}
