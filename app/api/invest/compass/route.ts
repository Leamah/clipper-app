import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

type Horizon   = '3m' | '6m' | '1y' | '3y' | '5y_plus'
type RiskBand  = 'conservative' | 'balanced' | 'aggressive'

interface RecommendationTemplate {
  category:       string
  description:    string
  horizons:       Horizon[]
  risks:          RiskBand[]
  baseAllocation: Record<RiskBand, number>  // % of investable amount
}

const TEMPLATES: RecommendationTemplate[] = [
  {
    category:    'Tax-Free Savings Account (TFSA)',
    description: 'Use your R36,000 annual TFSA allowance first — all growth, dividends, and capital gains inside a TFSA are 100% tax-free. Ideal vehicle for any JSE ETF. For a freelancer, this is the single highest-impact structural move available.',
    horizons:    ['1y', '3y', '5y_plus'],
    risks:       ['conservative', 'balanced', 'aggressive'],
    baseAllocation: { conservative: 50, balanced: 40, aggressive: 30 },
  },
  {
    category:    'JSE Top 40 / Capped SWIX ETF',
    description: 'Broad market exposure to SA\'s 40 largest companies through a passive index tracker (e.g. Satrix 40, CoreShares Top 50). Low cost, diversified, tracks the SA economy. Best for long-term wealth building alongside a TFSA.',
    horizons:    ['1y', '3y', '5y_plus'],
    risks:       ['balanced', 'aggressive'],
    baseAllocation: { conservative: 0, balanced: 30, aggressive: 40 },
  },
  {
    category:    'SA Government / Inflation-Linked Bonds',
    description: 'RSA Retail Savings Bonds or a bond ETF (e.g. Satrix ILBI). Government-backed, inflation-linked, low volatility. Suitable for capital preservation over 1–3 years.',
    horizons:    ['3m', '6m', '1y', '3y'],
    risks:       ['conservative', 'balanced'],
    baseAllocation: { conservative: 35, balanced: 20, aggressive: 0 },
  },
  {
    category:    'Money Market / High-Yield Notice Account',
    description: 'A money market unit trust or bank 32-day notice account. Liquid, low risk, earning prime-linked rates. Ideal for short-term parking while you research longer-term investments.',
    horizons:    ['3m', '6m'],
    risks:       ['conservative', 'balanced', 'aggressive'],
    baseAllocation: { conservative: 15, balanced: 10, aggressive: 5 },
  },
  {
    category:    'JSE REIT / Property ETF',
    description: 'JSE-listed Real Estate Investment Trust exposure (e.g. CoreShares SA Property). Generates quarterly distributions (rental income) plus capital appreciation. Adds real-asset diversification for 3y+ horizons.',
    horizons:    ['3y', '5y_plus'],
    risks:       ['balanced', 'aggressive'],
    baseAllocation: { conservative: 0, balanced: 10, aggressive: 15 },
  },
  {
    category:    'Global Equity ETF (JSE-listed)',
    description: 'Offshore diversification through a JSE-listed global ETF (e.g. Satrix MSCI World, Ashburton Global 1200). Rand-hedged, no Exchange Control complexity, accessible with a standard JSE account.',
    horizons:    ['3y', '5y_plus'],
    risks:       ['aggressive'],
    baseAllocation: { conservative: 0, balanced: 0, aggressive: 10 },
  },
]

function buildRecommendations(amount: number, horizon: Horizon, risk: RiskBand) {
  const matched = TEMPLATES.filter(t => t.horizons.includes(horizon) && t.risks.includes(risk))
  const totalPct = matched.reduce((s, t) => s + (t.baseAllocation[risk] || 0), 0)

  return matched
    .filter(t => t.baseAllocation[risk] > 0)
    .map(t => {
      const pct   = totalPct ? Math.round((t.baseAllocation[risk] / totalPct) * 100) : 0
      const alloc = Math.round((amount * pct) / 100)
      return {
        category:    t.category,
        description: t.description,
        allocation_pct:  pct,
        allocation_zar:  alloc,
      }
    })
}

function taxNote(amount: number, horizon: Horizon): string {
  const tfsa = 36_000
  if (amount <= tfsa) {
    return `Your R${amount.toLocaleString('en-ZA')} fits within your annual TFSA allowance of R36,000. Consider opening a TFSA — all investment returns inside it are completely tax-free (no DWT, no CGT on your ITR12).`
  }
  const overflow = amount - tfsa
  return `Maximise your TFSA allowance first (R36,000/year — completely tax-free). Invest the remaining R${overflow.toLocaleString('en-ZA')} in a standard brokerage account. Any dividends will incur 20% DWT and capital gains above R40,000 will be subject to CGT — both tracked automatically in Klippa.`
}

// ── Route handler ─────────────────────────────────────────────────────────────

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
    .select('feature_invest_basic, feature_invest_full, invest_enabled')
    .eq('id', user.id)
    .single()

  if (!prof?.invest_enabled || !prof?.feature_invest_basic) {
    return NextResponse.json({ error: 'INVEST_TIER_REQUIRED' }, { status: 403 })
  }

  const { amount, horizon, risk_band } = await request.json()
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })

  const amt  = Number(amount)
  const hor  = (horizon  as Horizon)  ?? '1y'
  const risk = (risk_band as RiskBand) ?? 'balanced'

  await supabase.from('klippa_invest_recommendations_log').insert({
    user_id:           user.id,
    source:            'compass',
    rationale_payload: { amount: amt, horizon: hor, risk_band: risk },
  })

  // Basic tier: 1 session per 24h
  if (!prof.feature_invest_full) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('klippa_invest_recommendations_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'compass')
      .gte('surfaced_at', since)
    if ((count ?? 0) > 1) {
      return NextResponse.json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Basic Invest: 1 Compass session per day. Upgrade to Starter for unlimited.' }, { status: 429 })
    }
  }

  const recommendations = buildRecommendations(amt, hor, risk)
  const tax_note        = taxNote(amt, hor)

  return NextResponse.json({ amount: amt, horizon: hor, risk_band: risk, recommendations, tax_note })
}
