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
    monthlyPrice: 99,
    annualPrice:  990,    // 2 months free
    description:  'For anyone who works for themselves and needs to stay SARS-compliant.',
    features: [
      'Unlimited income & expense records',
      'AI expense classification (mixed-use aware)',
      'Receipt OCR — scan & auto-fill expenses',
      'Bank CSV import',
      'Mileage logbook (auto-generated)',
      'SARS eFiling cheat sheet',
      'Expense audit pack export',
    ],
  },
  professional: {
    name:         'Premium',
    monthlyPrice: 149,
    annualPrice:  1490,   // 2 months free
    description:  'For contractors and consultants who want to file and plan with confidence.',
    features: [
      'Everything in Starter',
      'Provisional tax planner (IRP6 deadlines + set-aside calculator)',
      'Full ITR12 filing wizard with eFiling walkthrough',
      'Priority support',
    ],
  },
} as const

export type PlanKey      = keyof typeof PLANS
export type BillingCycle = 'monthly' | 'annual'

// ── B2B seat pricing (companies + accounting practices) ───
// Ozow is a one-time instant-EFT push (not card-on-file recurring), so B2B is
// billed annually upfront: seats × SEAT_PRICE_ANNUAL in a single payment.
export const SEAT_PRICE_ANNUAL  = 1490   // R per seat per year
export const MAX_SEATS          = 500    // sanity cap on a single purchase
// Fair-use ceiling on active clients a practice can manage before "contact us".
export const PRACTICE_CLIENT_CAP = 50

/** Total annual rand amount for a B2B seat purchase. */
export function getSeatTotal(seats: number): number {
  const n = Math.max(1, Math.min(MAX_SEATS, Math.floor(seats || 1)))
  return n * SEAT_PRICE_ANNUAL
}

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
  renewFrom?:     string   // Optional4: ISO date of current period end (renewals only)
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
  // Field order follows the Ozow post variables table exactly (v3.5 docs, Feb 2023).
  // Rules confirmed from the hash example on page 6:
  //  1. Required fields always included
  //  2. Optional fields included ONLY when non-empty (empty optionals corrupt the hash)
  //  3. Language is NOT a documented field — excluded entirely
  //  4. IsTest comes AFTER the URLs (table order: CancelUrl=13, ErrorUrl=14,
  //     SuccessUrl=15, NotifyUrl=16, IsTest=17)

  // Build hash fields in exact table order
  const hashFields: Record<string, string> = {
    SiteCode:             siteCode,
    CountryCode:          'ZA',
    CurrencyCode:         'ZAR',
    Amount:               params.amount.toFixed(2),
    TransactionReference: params.transactionRef,
    BankReference:        params.bankReference,
  }

  // Optional1-5: only include when non-empty (table positions 7-11)
  if (params.userId)       hashFields.Optional1 = params.userId
  if (params.plan)         hashFields.Optional2 = params.plan
  if (params.billingCycle) hashFields.Optional3 = params.billingCycle
  if (params.renewFrom)    hashFields.Optional4 = params.renewFrom  // renewal: extend from this date
  // Optional5 not used — omitted

  // URLs then IsTest (table positions 13-17)
  hashFields.CancelUrl  = params.cancelUrl
  hashFields.ErrorUrl   = params.errorUrl
  hashFields.SuccessUrl = params.successUrl
  hashFields.NotifyUrl  = params.notifyUrl
  hashFields.IsTest     = String(OZOW_IS_TEST)

  const hashCheck = buildOzowHash(Object.values(hashFields), privateKey)

  return {
    url:    OZOW_PAY_URL,
    fields: { ...hashFields, HashCheck: hashCheck },
  }
}

// ── Webhook verification ──────────────────────────────────
// Ozow notification response variables 1-13 (docs p9-10), then Hash (field 14).
// IMPORTANT: response hash field is "Hash" — NOT "HashCheck" (that's request-only).
// Using the wrong name makes HashCheck undefined → verification always fails → 400.

export function verifyOzowWebhook(
  body:       Record<string, string>,
  privateKey: string,
): boolean {
  const {
    SiteCode, TransactionId, TransactionReference, Amount, Status,
    Optional1 = '', Optional2 = '', Optional3 = '', Optional4 = '', Optional5 = '',
    CurrencyCode, IsTest, StatusMessage,
    Hash,   // field 14 in response table — named "Hash", not "HashCheck"
  } = body

  if (!Hash) return false

  const values = [
    SiteCode, TransactionId, TransactionReference, Amount, Status,
    Optional1, Optional2, Optional3, Optional4, Optional5,
    CurrencyCode, IsTest, StatusMessage,
  ]

  const computed = buildOzowHash(values, privateKey)
  // Docs p11: trim leading zeros before comparing (some SHA512 implementations drop them)
  return computed.replace(/^0+/, '') === Hash.toLowerCase().replace(/^0+/, '')
}

// ── Subscription tier mapping ─────────────────────────────
// Maps Ozow Optional2 (plan) → klippa subscription_tier

export function planToTier(plan: string): 'starter' | 'professional' | 'free' {
  if (plan === 'professional') return 'professional'
  if (plan === 'starter')      return 'starter'
  return 'free'
}
