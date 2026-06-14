import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

const IFRS_CONTENT: Record<string, { standard: string; description: string; ratios: string[]; worked_example: string }> = {
  M01: {
    standard:        'IAS 1 — Presentation of Financial Statements',
    description:     'Liquidity measures a company\'s ability to meet short-term obligations as they fall due. Key ratios compare current assets to current liabilities.',
    ratios:          ['Current Ratio = Current Assets ÷ Current Liabilities', 'Quick Ratio = (Cash + Receivables) ÷ Current Liabilities', 'Cash Ratio = Cash ÷ Current Liabilities'],
    worked_example:  'If a company has R5m in current assets and R2m in current liabilities, the current ratio is 2.5 — meaning it can cover its short-term debts 2.5 times.',
  },
  M02: {
    standard:        'IAS 1 / IFRS 15 — Revenue Recognition & Margins',
    description:     'Profitability measures how efficiently a company converts revenue into profit at gross, operating, and net margin levels.',
    ratios:          ['Gross Margin = (Revenue − COGS) ÷ Revenue', 'EBIT Margin = EBIT ÷ Revenue', 'Net Margin = Net Profit ÷ Revenue', 'ROE = Net Profit ÷ Shareholders\' Equity'],
    worked_example:  'A company with R10m revenue and R3m gross profit has a 30% gross margin. High margins indicate pricing power and cost efficiency.',
  },
  M03: {
    standard:        'IAS 2 / IAS 7 — Inventory & Cash Flow',
    description:     'Activity ratios measure how efficiently a company manages its assets and converts them to revenue.',
    ratios:          ['Asset Turnover = Revenue ÷ Total Assets', 'Inventory Days = Inventory ÷ (COGS ÷ 365)', 'Receivable Days = Receivables ÷ (Revenue ÷ 365)'],
    worked_example:  'Inventory days of 30 means the company sells its entire inventory every 30 days — a retailer vs a manufacturer will show very different figures.',
  },
  M04: {
    standard:        'IFRS 9 / IAS 32 — Financial Instruments & Equity',
    description:     'Solvency ratios assess long-term financial health and the company\'s ability to sustain operations over time.',
    ratios:          ['Debt-to-Equity = Total Debt ÷ Shareholders\' Equity', 'Interest Coverage = EBIT ÷ Interest Expense', 'Debt-to-Assets = Total Debt ÷ Total Assets'],
    worked_example:  'A debt-to-equity ratio of 0.5 means the company uses R0.50 of debt for every R1 of equity — generally considered conservative.',
  },
}

export async function GET(
  _request: Request,
  { params }: { params: { module: string } }
) {
  const moduleId    = params.module.toUpperCase()
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

  const content = IFRS_CONTENT[moduleId]
  if (!content) return NextResponse.json({ error: 'Module not found' }, { status: 404 })

  return NextResponse.json({ module: moduleId, ...content })
}
