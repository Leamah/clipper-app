// ============================================================
// Ozow Payment Integration — South African Instant EFT
// ============================================================
// Docs: https://developer.ozow.com
// Set OZOW_IS_TEST=false in Vercel env vars to go live.
// Default (no var set) = sandbox / test mode.
// ============================================================

import crypto from 'crypto'

// Server-side only (API routes). Client-side pages import PLANS/helpers only.
export const OZOW_IS_TEST = process.env.OZOW_IS_TEST !== 'false'

export const OZOW_PAY_URL = 'https://pay.ozow.com/'

// ── Plan definitions ──────────────────────────────────────

export const PLANS = {
  starter: {
    name:         'Starter',
    monthlyPrice: 20,
    annualPrice:  200,    // ~2 months free
    description:  'For anyone who works for themselves and needs to stay SARS-compliant.',
    features: [
      'Unlimited income & expense tracking',
      'AI expense classification',
      'Mixed-use deductibility intelligence',
      'Mileage logbook (auto-generated)',
      'Receipt storage & categorisation',
      'Bank CSV import',
      'eFiling cheat sheet',
    ],
  },
  professional: {
    name:         'Professional',
    monthlyPrice: 299,
    annualPrice:  2990,   // ~2 months free
    description:  'For contractors and consultants with higher deduction complexity.',
    features: [
      'Everything in Starter',
      'Full ITR12 filing wizard',
      'Audit-readiness checklist',
      'Tax year archive (prior years)',
      'Priority support',
    ],
  },
} as const

export type PlanKey      = keyof typeof PLANS
export type BillingCycle = 'monthly' | 'annual'

export function getPlanAmount(
  plan:        PlanKey,
  cycle:       BillingCycle,
  discountPct: number = 0,
): number {
  const base = cycle === 'annual' ? PLANS[plan].annualPrice : PLANS[plan].monthlyPrice
  const after = base * (1 - discountPct / 100)
  return parseFloat(after.toFixed(2))
}

// ── Hash computation ──────────────────────────────────────
// Ozow hash = SHA512 of concatenated field values (in order) + private key, all lowercased.

export function buildOzowHash(
  orderedValues: string[],
  privateKey:    string,
): string {
  const input = [...orderedValues, privateKey].join('').toLowerCase()
  return crypto.createHash('sha512').update(input).digest('hex').toLowerCase()
}

// ── Payment request builder ───────────────────────────────

export interface OzowPaymentParams {
  transactionRef: string   // our unique reference (ozow_reference on the subscription)
  amount:         number
  bankReference:  string   // label shown to user in their bank app
  successUrl:     string
  cancelUrl:      string
  errorUrl:       string
  notifyUrl:      string
  userId:         string   // passed in Optional1 for webhook matching
  plan:           string   // Optional2
  billingCycle:   string   // Optional3
}

export interface OzowRequestPayload {
  url:    string
  fields: Record<string, string>
}

export function buildOzowRequest(
  params:     OzowPaymentParams,
  siteCode:   string,
  privateKey: string,
): OzowRequestPayload {
  // Field order MUST match Ozow's documented hash input order
  const fields: Record<string, string> = {
    SiteCode:             siteCode,
    CountryCode:          'ZA',
    CurrencyCode:         'ZAR',
    Amount:               params.amount.toFixed(2),
    TransactionReference: params.transactionRef,
    BankReference:        params.bankReference,
    Optional1:            params.userId,
    Optional2:            params.plan,
    Optional3:            params.billingCycle,
    Optional4:            '',
    Optional5:            '',
    Language:             'en',
    IsTest:               String(OZOW_IS_TEST),
    CancelUrl:            params.cancelUrl,
    ErrorUrl:             params.errorUrl,
    SuccessUrl:           params.successUrl,
    NotifyUrl:            params.notifyUrl,
  }

  // Hash input: all values in order above + private key
  const hashValues = Object.values(fields)
  fields.HashCheck = buildOzowHash(hashValues, privateKey)

  return { url: OZOW_PAY_URL, fields }
}

// ── Webhook verification ──────────────────────────────────
// Ozow sends these fields in the notification POST:
// SiteCode, TransactionId, TransactionReference, Amount, Status,
// Optional1-5, CurrencyCode, IsTest, StatusMessage, HashCheck

export function verifyOzowWebhook(
  body:       Record<string, string>,
  privateKey: string,
): boolean {
  const {
    SiteCode, TransactionId, TransactionReference, Amount, Status,
    Optional1 = '', Optional2 = '', Optional3 = '', Optional4 = '', Optional5 = '',
    CurrencyCode, IsTest, StatusMessage, HashCheck,
  } = body

  if (!HashCheck) return false

  const values = [
    SiteCode, TransactionId, TransactionReference, Amount, Status,
    Optional1, Optional2, Optional3, Optional4, Optional5,
    CurrencyCode, IsTest, StatusMessage,
  ]

  const computed = buildOzowHash(values, privateKey)
  return computed === HashCheck.toLowerCase()
}

// ── Subscription tier mapping ─────────────────────────────
// Maps Ozow Optional2 (plan) → klippa subscription_tier

export function planToTier(plan: string): 'starter' | 'professional' | 'free' {
  if (plan === 'professional') return 'professional'
  if (plan === 'starter')      return 'starter'
  return 'free'
}
