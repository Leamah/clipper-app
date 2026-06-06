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

type IncomeCopyContext = {
  source?:      string | null
  description?: string | null
}

function contextText(context?: IncomeCopyContext) {
  return `${context?.source ?? ''} ${context?.description ?? ''}`.toLowerCase()
}

function hasAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w))
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

export function getIncomeTypeCopy(type: IncomeType, context?: IncomeCopyContext): IncomeTypeMeta {
  const base = INCOME_TYPE_META[type]
  const text = contextText(context)

  if (type === 'freelance') {
    if (hasAny(text, ['campaign', 'brand', 'sponsored', 'sponsorship', 'influencer', 'instagram', 'tiktok', 'youtube', 'ugc', 'content'])) {
      return {
        ...base,
        label: 'Campaign or content payment',
        question: 'Did a brand or agency pay you for a campaign, post, video, or content work?',
        examples: 'Examples: Instagram campaign, TikTok video, YouTube sponsorship, UGC content, brand ambassador fee.',
        documentHint: 'Keep the campaign brief, invoice, bank proof, and any agency or brand payment statement.',
      }
    }
    if (hasAny(text, ['uber', 'bolt', 'mr d', 'mrd', 'takealot', 'checkers sixty60', 'sixty60', 'delivery', 'driver', 'rideshare'])) {
      return {
        ...base,
        label: 'Driving or delivery platform payment',
        question: 'Did a platform pay you for trips, deliveries, or driving work?',
        examples: 'Examples: Uber, Bolt, Mr D, Takealot, Checkers Sixty60, delivery or driving payouts.',
        documentHint: 'Keep platform statements, weekly payout reports, bank proof, fuel/vehicle records, and logbook support.',
      }
    }
    if (hasAny(text, ['upwork', 'fiverr', 'freelancer.com', 'peopleperhour', 'platform'])) {
      return {
        ...base,
        label: 'Online platform freelance payment',
        question: 'Did an online platform pay you for freelance work?',
        examples: 'Examples: Upwork, Fiverr, Freelancer.com, online client platform payouts.',
        documentHint: 'Keep platform statements, invoices, payout reports, and bank proof.',
      }
    }
    return {
      ...base,
      label: 'Client or contract payment',
      question: 'Did a client pay you for work, a project, or a contract?',
      examples: 'Examples: consulting, design, development, bookkeeping, tutoring, project work, retainer work.',
      documentHint: 'Keep invoices, contracts, bank statements, and proof of payment from each client.',
    }
  }

  if (type === 'commission' && hasAny(text, ['affiliate', 'referral', 'creator', 'link'])) {
    return {
      ...base,
      label: 'Affiliate or referral payment',
      question: 'Were you paid for referrals, affiliate links, or sales you helped generate?',
      examples: 'Examples: affiliate links, referral fees, promo-code commission, creator store commission.',
      documentHint: 'Keep the payout statement showing sales, commission rate, and money received.',
    }
  }

  if (type === 'rental' && hasAny(text, ['airbnb', 'booking.com', 'lekke slaap', 'short stay', 'guest'])) {
    return {
      ...base,
      label: 'Short-stay or Airbnb rental',
      question: 'Did guests pay you for a room, cottage, Airbnb, or short-stay property?',
      examples: 'Examples: Airbnb, Booking.com, guest room, holiday rental, garden cottage.',
      documentHint: 'Keep platform statements, cleaning/repairs proof, rates, levies, bond interest, and bank proof.',
    }
  }

  if (type === 'foreign_income' && hasAny(text, ['paypal', 'wise', 'payoneer', 'stripe', 'deel', 'remote', 'usd', 'eur', 'gbp'])) {
    return {
      ...base,
      label: 'Overseas client or platform payment',
      question: 'Did an overseas client, remote-work platform, or foreign app pay you?',
      examples: 'Examples: PayPal, Wise, Payoneer, Stripe, Deel, overseas client, USD/EUR/GBP payout.',
      documentHint: 'Keep invoices, payout statements, bank conversion proof, exchange rates, and any foreign tax certificates.',
    }
  }

  return base
}

export function isIncludedInTaxEstimate(type: IncomeType): boolean {
  return INCOME_TYPE_META[type]?.treatment !== 'informational'
}

export function needsHumanReview(type: IncomeType): boolean {
  return ['review', 'informational'].includes(INCOME_TYPE_META[type]?.treatment)
}
