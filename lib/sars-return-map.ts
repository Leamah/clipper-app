import type { IncomeType } from './types'

export type TaxTreatment = 'normal' | 'interest' | 'review' | 'informational'

export interface IncomeTypeMeta {
  label:        string
  question:     string
  examples:     string
  sarsCode:     string
  sarsLabel:    string
  section:      string
  documentHint: string
  treatment:    TaxTreatment
}

export const INCOME_TYPE_META: Record<IncomeType, IncomeTypeMeta> = {
  salary: {
    label:        'Job or payslip income',
    question:     'Did you have a job where tax was taken off your payslip?',
    examples:     'Examples: full-time job, part-time job, employer contract with a payslip.',
    sarsCode:     '3601',
    sarsLabel:    'Salary / employment income',
    section:      'Employment income',
    documentHint: 'Upload the tax certificate from your employer if you have it. It is often called an IRP5.',
    treatment:    'normal',
  },
  freelance: {
    label:        'Client or freelance work',
    question:     'Did clients pay you for work you did yourself?',
    examples:     'Examples: consulting, design work, development work, tutoring, contract projects.',
    sarsCode:     '3699',
    sarsLabel:    'Other taxable income',
    section:      'Local business or other income',
    documentHint: 'Keep invoices, bank statements, and proof of payment from each client.',
    treatment:    'normal',
  },
  commission: {
    label:        'Commission earned',
    question:     'Were you paid commission for sales or deals?',
    examples:     'Examples: sales commission, referral commission, agent commission.',
    sarsCode:     '3606',
    sarsLabel:    'Commission',
    section:      'Employment or commission income',
    documentHint: 'Keep the payslip, statement, or contract showing how the commission was calculated.',
    treatment:    'normal',
  },
  rental: {
    label:        'Rent from property',
    question:     'Did someone pay you rent for property you own or manage?',
    examples:     'Examples: house, flat, room, cottage, Airbnb, garden unit.',
    sarsCode:     '4210',
    sarsLabel:    'Rental income',
    section:      'Rental income',
    documentHint: 'Keep lease agreements, rental statements, rates bills, repairs, interest, and levy proof.',
    treatment:    'normal',
  },
  interest: {
    label:        'Bank interest',
    question:     'Did a bank or savings account pay you interest?',
    examples:     'Examples: savings account, fixed deposit, money market, notice account.',
    sarsCode:     '4201',
    sarsLabel:    'Local interest',
    section:      'Investment income',
    documentHint: 'Upload the tax certificate from your bank or investment app if you have it.',
    treatment:    'interest',
  },
  dividends: {
    label:        'Share or ETF payouts',
    question:     'Did shares, ETFs, or investments pay money out to you?',
    examples:     'Examples: EasyEquities dividends, ETF distributions, company share payouts.',
    sarsCode:     '4238',
    sarsLabel:    'Dividends / investment distributions',
    section:      'Investment income',
    documentHint: 'Upload the investment tax certificate or annual tax statement.',
    treatment:    'informational',
  },
  capital_gains: {
    label:        'Sold an investment or asset',
    question:     'Did you sell shares, crypto, property, or an investment for more than you paid?',
    examples:     'Examples: sold ETFs, sold shares, sold crypto, sold a second property.',
    sarsCode:     '4250',
    sarsLabel:    'Capital gain or loss',
    section:      'Capital gains',
    documentHint: 'Keep buy price, sell price, dates, fees, and the statement from the platform or agent.',
    treatment:    'review',
  },
  crypto: {
    label:        'Crypto sale or trading profit',
    question:     'Did you sell or trade crypto and make money?',
    examples:     'Examples: Bitcoin, Ethereum, Luno, VALR, Binance, wallet sales.',
    sarsCode:     '4250',
    sarsLabel:    'Crypto gain or trading income',
    section:      'Capital gains or trading income',
    documentHint: 'Keep exchange statements showing deposits, buys, sells, dates, and fees.',
    treatment:    'review',
  },
  foreign_income: {
    label:        'Money from outside SA',
    question:     'Did someone outside South Africa pay you?',
    examples:     'Examples: overseas client, remote work paid by a foreign company, foreign platform payouts.',
    sarsCode:     '4218',
    sarsLabel:    'Foreign income',
    section:      'Foreign income',
    documentHint: 'Keep invoices, bank proof, exchange-rate records, and any foreign tax certificates.',
    treatment:    'review',
  },
  other: {
    label:        'Other money received',
    question:     'Did you receive any other money that does not fit above?',
    examples:     'Examples: once-off work, small side income, unusual payment.',
    sarsCode:     '3699',
    sarsLabel:    'Other taxable income',
    section:      'Other income',
    documentHint: 'Keep proof of where the money came from and why it was paid.',
    treatment:    'review',
  },
}

export const PLAIN_INCOME_OPTIONS = Object.entries(INCOME_TYPE_META).map(([value, meta]) => ({
  value: value as IncomeType,
  ...meta,
}))

export function isIncludedInTaxEstimate(type: IncomeType): boolean {
  return INCOME_TYPE_META[type]?.treatment !== 'informational'
}

export function needsHumanReview(type: IncomeType): boolean {
  return ['review', 'informational'].includes(INCOME_TYPE_META[type]?.treatment)
}
