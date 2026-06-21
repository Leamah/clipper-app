import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { getIRP6Deadlines, getTfsaAnnualLimit } from '@/lib/tax-engine'

type Horizon  = '3m' | '6m' | '1y' | '3y' | '5y_plus'
type RiskBand = 'conservative' | 'balanced' | 'aggressive'

type InvestProfile = {
  feature_invest_basic: boolean
  feature_invest_full: boolean
  invest_enabled: boolean
  feature_provisional?: boolean
  tax_year?: number
}

type Readiness = {
  monthly_income_zar:    number
  monthly_expenses_zar:  number
  safe_to_spend_zar:     number
  suggested_amount_zar:  number
  debt_like_monthly_zar: number
  tfsa_limit_zar:        number
  risk_flags:            string[]
  blocks:                string[]
  tax_due_soon:          boolean
}

interface RecommendationTemplate {
  category:       string
  description:    string
  horizons:       Horizon[]
  risks:          RiskBand[]
  baseAllocation: Record<RiskBand, number>
}

const TEMPLATES: RecommendationTemplate[] = [
  {
    category:    'Tax-Free Savings Account (TFSA)',
    description: 'Use your annual TFSA allowance first where appropriate. Growth, dividends, and capital gains inside a TFSA are tax-free. For a freelancer, this is often the highest-impact structural move before ordinary brokerage investing.',
    horizons:    ['1y', '3y', '5y_plus'],
    risks:       ['conservative', 'balanced', 'aggressive'],
    baseAllocation: { conservative: 50, balanced: 40, aggressive: 30 },
  },
  {
    category:    'JSE Top 40 / Capped SWIX ETF',
    description: 'Broad market exposure to large SA-listed companies through a passive index tracker. Best for long-term wealth building after emergency cash and tax obligations are protected.',
    horizons:    ['1y', '3y', '5y_plus'],
    risks:       ['balanced', 'aggressive'],
    baseAllocation: { conservative: 0, balanced: 30, aggressive: 40 },
  },
  {
    category:    'SA Government / Inflation-Linked Bonds',
    description: 'Government or inflation-linked bond exposure for capital preservation and lower volatility over shorter horizons.',
    horizons:    ['3m', '6m', '1y', '3y'],
    risks:       ['conservative', 'balanced'],
    baseAllocation: { conservative: 35, balanced: 20, aggressive: 0 },
  },
  {
    category:    'Money Market / High-Yield Notice Account',
    description: 'Liquid, low-risk parking for short-term cash while you protect SARS deadlines, emergency cash, or planned expenses.',
    horizons:    ['3m', '6m'],
    risks:       ['conservative', 'balanced', 'aggressive'],
    baseAllocation: { conservative: 15, balanced: 10, aggressive: 5 },
  },
  {
    category:    'JSE REIT / Property ETF',
    description: 'Listed property exposure for 3-year-plus horizons. Adds real-asset diversification but can be volatile and distribution-heavy.',
    horizons:    ['3y', '5y_plus'],
    risks:       ['balanced', 'aggressive'],
    baseAllocation: { conservative: 0, balanced: 10, aggressive: 15 },
  },
  {
    category:    'Global Equity ETF (JSE-listed)',
    description: 'Offshore diversification through a JSE-listed global ETF. Useful for long horizons where currency and market volatility can be absorbed.',
    horizons:    ['3y', '5y_plus'],
    risks:       ['aggressive'],
    baseAllocation: { conservative: 0, balanced: 0, aggressive: 10 },
  },
]

function client() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

function cleanHorizon(value: unknown): Horizon {
  return ['3m', '6m', '1y', '3y', '5y_plus'].includes(String(value))
    ? value as Horizon
    : '1y'
}

function cleanRisk(value: unknown): RiskBand {
  return ['conservative', 'balanced', 'aggressive'].includes(String(value))
    ? value as RiskBand
    : 'balanced'
}

function monthStart(d: Date, monthsBack: number) {
  return new Date(d.getFullYear(), d.getMonth() - monthsBack, 1).toISOString().slice(0, 10)
}

function debtLike(row: { merchant_name?: string | null; description?: string | null; category?: string | null }) {
  const text = `${row.merchant_name ?? ''} ${row.description ?? ''} ${row.category ?? ''}`.toLowerCase()
  return ['loan', 'credit card', 'interest', 'finance', 'debt', 'repayment', 'instalment', 'installment'].some((w) => text.includes(w))
}

function buildRecommendations(amount: number, horizon: Horizon, risk: RiskBand) {
  const matched = TEMPLATES.filter(t => t.horizons.includes(horizon) && t.risks.includes(risk))
  const totalPct = matched.reduce((s, t) => s + (t.baseAllocation[risk] || 0), 0)

  return matched
    .filter(t => t.baseAllocation[risk] > 0)
    .map(t => {
      const pct = totalPct ? Math.round((t.baseAllocation[risk] / totalPct) * 100) : 0
      return {
        category:       t.category,
        description:    t.description,
        allocation_pct: pct,
        allocation_zar: Math.round((amount * pct) / 100),
      }
    })
}

async function buildReadiness(
  supabase: ReturnType<typeof client>,
  userId: string,
  profile: InvestProfile,
  requestedAmount?: number
): Promise<Readiness> {
  const taxYear = profile.tax_year ?? 2027
  const since   = monthStart(new Date(), 3)
  const amount  = requestedAmount ?? 0

  const [{ data: income }, { data: expenses }, { data: taxReturn }] = await Promise.all([
    supabase.from('klippa_income_records').select('amount, received_date').eq('user_id', userId).gte('received_date', since),
    supabase.from('klippa_expense_records').select('amount, deductible_amount, merchant_name, description, category, expense_date').eq('user_id', userId).gte('expense_date', since),
    supabase.from('klippa_tax_returns').select('tax_year, net_tax_payable, payment1_status, payment2_status').eq('user_id', userId).order('tax_year', { ascending: false }).limit(1).maybeSingle(),
  ])

  const totalIncome   = (income ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const totalExpenses = (expenses ?? []).reduce((s, r) => s + (Number(r.amount ?? r.deductible_amount) || 0), 0)
  const monthlyIncome = Math.round(totalIncome / 3)
  const monthlyExp    = Math.round(totalExpenses / 3)
  const safeToSpend   = Math.max(0, monthlyIncome - monthlyExp)
  const debtMonthly   = Math.round((expenses ?? []).filter(debtLike).reduce((s, r) => s + (Number(r.amount ?? r.deductible_amount) || 0), 0) / 3)
  const tfsaLimit     = getTfsaAnnualLimit(taxYear)
  const suggested     = Math.max(0, Math.min(tfsaLimit, Math.round(safeToSpend * 0.2)))

  const riskFlags: string[] = []
  const blocks: string[] = []

  if ((income ?? []).length === 0 || (expenses ?? []).length === 0) {
    riskFlags.push('Klippa has limited income/expense history for this cash-flow check.')
  }
  if (safeToSpend <= 0) {
    blocks.push('Your current Klippa income/expense baseline shows no investable surplus.')
  } else if (amount > safeToSpend) {
    blocks.push('The requested amount is higher than your estimated monthly Safe-to-Spend.')
  }
  if (debtMonthly > 500) {
    blocks.push(`Klippa detected about R${debtMonthly.toLocaleString('en-ZA')}/month of debt or interest-like expenses. Clear high-interest debt before investing.`)
  }

  let taxDueSoon = false
  const tr = taxReturn as { tax_year?: number; net_tax_payable?: number | null; payment1_status?: string | null; payment2_status?: string | null } | null
  if (profile.feature_provisional && tr?.tax_year) {
    const now = new Date()
    const deadlines = getIRP6Deadlines(tr.tax_year)
    const upcoming = [
      { date: deadlines.first,  paid: tr.payment1_status === 'paid' },
      { date: deadlines.second, paid: tr.payment2_status === 'paid' },
    ].find((d) => !d.paid && d.date.getTime() >= now.getTime())
    const days = upcoming ? Math.ceil((upcoming.date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null
    const estimatedTax = Math.max(0, Number(tr.net_tax_payable) || 0)
    if (days != null && days <= 30 && estimatedTax >= 10_000 && amount >= 10_000) {
      taxDueSoon = true
      blocks.push('A provisional-tax payment appears due within 30 days. Keep that cash liquid before investing.')
    }
  }

  return {
    monthly_income_zar:    monthlyIncome,
    monthly_expenses_zar:  monthlyExp,
    safe_to_spend_zar:     safeToSpend,
    suggested_amount_zar:  suggested,
    debt_like_monthly_zar: debtMonthly,
    tfsa_limit_zar:        tfsaLimit,
    risk_flags:            riskFlags,
    blocks,
    tax_due_soon:          taxDueSoon,
  }
}

function taxNote(amount: number, taxYear: number): string {
  const tfsa = getTfsaAnnualLimit(taxYear)
  if (amount <= tfsa) {
    return `Your R${amount.toLocaleString('en-ZA')} fits within the R${tfsa.toLocaleString('en-ZA')} annual TFSA allowance for this tax year. Consider using a TFSA first - investment returns inside it are tax-free.`
  }
  const overflow = amount - tfsa
  return `Maximise your TFSA allowance first (R${tfsa.toLocaleString('en-ZA')}/year). The remaining R${overflow.toLocaleString('en-ZA')} would sit outside the TFSA, where dividends and realised gains should be tracked back into Klippa filing.`
}

async function loadContext() {
  const supabase = client()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, prof: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: prof } = await supabase
    .from('klippa_profiles')
    .select('feature_invest_basic, feature_invest_full, invest_enabled, feature_provisional, tax_year')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_basic) {
    return { supabase, user, prof, error: NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 }) }
  }

  return { supabase, user, prof: prof as InvestProfile, error: null }
}

export async function GET() {
  const ctx = await loadContext()
  if (ctx.error || !ctx.user || !ctx.prof) return ctx.error

  const readiness = await buildReadiness(ctx.supabase, ctx.user.id, ctx.prof)
  return NextResponse.json({ readiness })
}

export async function POST(request: Request) {
  const ctx = await loadContext()
  if (ctx.error || !ctx.user || !ctx.prof) return ctx.error

  const { amount, horizon, risk_band, acknowledge_warnings = false } = await request.json()
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })

  const amt       = Number(amount)
  const hor       = cleanHorizon(horizon)
  const risk      = cleanRisk(risk_band)
  const readiness = await buildReadiness(ctx.supabase, ctx.user.id, ctx.prof, amt)

  if (!ctx.prof.feature_invest_full) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await ctx.supabase
      .from('klippa_invest_recommendations_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ctx.user.id)
      .eq('source', 'compass')
      .gte('surfaced_at', since)
    if ((count ?? 0) >= 1) {
      return NextResponse.json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Basic Invest: 1 Compass session per day. Upgrade to Starter for unlimited.' }, { status: 429 })
    }
  }

  if (readiness.blocks.length > 0 && !acknowledge_warnings) {
    return NextResponse.json({
      error:     'INVEST_READINESS_BLOCK',
      message:   'Review the Klippa cash-flow warnings before continuing.',
      readiness,
    }, { status: 409 })
  }

  const recommendations = buildRecommendations(amt, hor, risk)
  const tax_note        = taxNote(amt, ctx.prof.tax_year ?? 2027)

  await ctx.supabase.from('klippa_invest_recommendations_log').insert({
    user_id:           ctx.user.id,
    source:            'compass',
    rationale_payload: { amount: amt, horizon: hor, risk_band: risk, readiness },
  })

  return NextResponse.json({ amount: amt, horizon: hor, risk_band: risk, recommendations, tax_note, readiness })
}
