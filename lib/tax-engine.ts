// ============================================================
// Klippa Tax Engine — SARS 2024/2025 Tax Year (1 March 2024 – 28 Feb 2025)
// CRITICAL: This engine is the ONLY source of tax figures.
//           AI never generates tax calculations.
// ============================================================

import type { TaxCalculationInput, TaxCalculationResult } from './types'

// ── 2024/2025 Progressive Tax Brackets ────────────────────
// Source: SARS Budget 2024 / sars.gov.za
interface TaxBracket {
  min:   number
  max:   number | null
  base:  number
  rate:  number  // marginal rate as decimal
}

const TAX_BRACKETS_2025: TaxBracket[] = [
  { min:        0, max:    237100, base:        0, rate: 0.18  },
  { min:   237101, max:    370500, base:    42678, rate: 0.26  },
  { min:   370501, max:    512800, base:    77362, rate: 0.31  },
  { min:   512801, max:    673000, base:   121475, rate: 0.36  },
  { min:   673001, max:    857900, base:    179147, rate: 0.39 },
  { min:   857901, max:   1817000, base:   251258, rate: 0.41  },
  { min:  1817001, max:       null, base:   644489, rate: 0.45 },
]

// ── Rebates 2024/2025 ─────────────────────────────────────
const PRIMARY_REBATE   = 17235   // all taxpayers
const SECONDARY_REBATE =  9444   // age 65+
const TERTIARY_REBATE  =  3145   // age 75+

// ── Tax Thresholds (below = no tax) ──────────────────────
const THRESHOLD_UNDER_65  =  95750
const THRESHOLD_65_TO_74  = 148217
const THRESHOLD_75_PLUS   = 165689

// ── Section 11F RA Deduction Limits ──────────────────────
const RA_DEDUCTION_CAP     = 350_000    // absolute annual cap
const RA_DEDUCTION_PCT     = 0.275      // 27.5% of taxable income/remuneration

// ── SARS Fixed Cost Table 2024/2025 ──────────────────────
// Cents-per-km reimbursement rates for business travel
// Simplified: use R4.64/km as the approved rate for all vehicles ≤ R600k
const SARS_APPROVED_RATE_PER_KM = 4.64

// ── Core calculation ──────────────────────────────────────

export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  const {
    grossIncome,
    raContributions,
    homeofficePct,
    homeExpenses,
    businessKm,
    totalKm,
    otherDeductions,
    age,
    employeesTaxPaid,
  } = input

  // 1. Section 11F: RA deduction = min(27.5% × gross income, R350,000, actual contributions)
  const section11fRa = Math.min(
    RA_DEDUCTION_PCT * grossIncome,
    RA_DEDUCTION_CAP,
    raContributions
  )

  // 2. Home office deduction
  const homeOffice = homeofficePct > 0 && homeExpenses > 0
    ? (homeofficePct / 100) * homeExpenses
    : 0

  // 3. Travel deduction (logbook method)
  const travel = totalKm > 0 && businessKm > 0
    ? businessKm * SARS_APPROVED_RATE_PER_KM
    : 0

  // 4. Total deductions
  const totalDeductions = section11fRa + homeOffice + travel + otherDeductions

  // 5. Taxable income
  const taxableIncome = Math.max(0, grossIncome - totalDeductions)

  // 6. Gross tax from brackets
  const grossTax = computeGrossTax(taxableIncome)

  // 7. Rebates
  const primaryRebate   = PRIMARY_REBATE
  const secondaryRebate = age >= 65 ? SECONDARY_REBATE : 0
  const tertiaryRebate  = age >= 75 ? TERTIARY_REBATE  : 0
  const totalRebates    = primaryRebate + secondaryRebate + tertiaryRebate

  // 8. Tax payable after rebates (never below 0)
  const taxPayable = Math.max(0, grossTax - totalRebates)

  // 9. Net tax (positive = owe SARS, negative = refund due)
  const netTaxPayable = taxPayable - employeesTaxPaid

  return {
    grossIncome,
    section11fRa:    round2(section11fRa),
    homeOffice:      round2(homeOffice),
    travel:          round2(travel),
    otherDeductions: round2(otherDeductions),
    totalDeductions: round2(totalDeductions),
    taxableIncome:   round2(taxableIncome),
    grossTax:        round2(grossTax),
    primaryRebate,
    secondaryRebate,
    tertiaryRebate,
    totalRebates,
    taxPayable:      round2(taxPayable),
    employeesTaxPaid: round2(employeesTaxPaid),
    netTaxPayable:   round2(netTaxPayable),
  }
}

function computeGrossTax(taxableIncome: number): number {
  for (const bracket of TAX_BRACKETS_2025) {
    const max = bracket.max ?? Infinity
    if (taxableIncome <= max) {
      return bracket.base + bracket.rate * (taxableIncome - bracket.min)
    }
  }
  // Fallback to highest bracket (should never reach here)
  const top = TAX_BRACKETS_2025[TAX_BRACKETS_2025.length - 1]
  return top.base + top.rate * (taxableIncome - top.min)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Effective tax rate helper ─────────────────────────────

export function effectiveTaxRate(result: TaxCalculationResult): number {
  if (result.grossIncome === 0) return 0
  return round2((result.taxPayable / result.grossIncome) * 100)
}

// ── Tax threshold check ───────────────────────────────────

export function isBelowThreshold(taxableIncome: number, age: number): boolean {
  if (age >= 75) return taxableIncome < THRESHOLD_75_PLUS
  if (age >= 65) return taxableIncome < THRESHOLD_65_TO_74
  return taxableIncome < THRESHOLD_UNDER_65
}

// ── Quick estimate (annualised YTD) ──────────────────────
// Used by dashboard for live tax meter when user hasn't filed full year

export function annualisedEstimate(
  ytdIncome: number,
  monthsElapsed: number,
  profile: { has_ra: boolean; works_from_home: boolean; home_office_pct: number; has_vehicle: boolean }
): Pick<TaxCalculationResult, 'grossIncome' | 'taxPayable' | 'netTaxPayable'> {
  if (monthsElapsed === 0) {
    return { grossIncome: 0, taxPayable: 0, netTaxPayable: 0 }
  }
  const annualised = (ytdIncome / monthsElapsed) * 12

  // Very rough deduction estimate for dashboard display
  const estimatedRa         = profile.has_ra ? Math.min(annualised * 0.15, RA_DEDUCTION_CAP) : 0
  const estimatedHomeOffice = profile.works_from_home ? annualised * 0.05 : 0

  const result = calculateTax({
    grossIncome:      annualised,
    raContributions:  estimatedRa,
    homeofficePct:    profile.home_office_pct,
    homeExpenses:     estimatedHomeOffice,
    businessKm:       0,
    totalKm:          0,
    vehicleValue:     0,
    otherDeductions:  0,
    age:              35,
    employeesTaxPaid: 0,
  })

  return {
    grossIncome:    result.grossIncome,
    taxPayable:     result.taxPayable,
    netTaxPayable:  result.netTaxPayable,
  }
}

// ── SARS filing deadline helpers ─────────────────────────

export function getITR12Deadline(taxYear: number): Date {
  // Non-provisional individual: 23 October of the filing year
  // e.g. tax year 2025 (ends Feb 2025) → deadline 23 October 2025
  return new Date(taxYear, 9, 23) // month is 0-indexed
}

export function getIRP6Deadlines(taxYear: number): { first: Date; second: Date } {
  return {
    first:  new Date(taxYear - 1, 7, 31),  // 31 August (first provisional)
    second: new Date(taxYear,     1, 28),   // 28 February (second provisional)
  }
}

export function daysUntilDeadline(deadline: Date): number {
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ── SARS Line number mapping for Filing Wizard ───────────
// Maps our income_type → SARS ITR12 source codes

export const SARS_INCOME_CODES: Record<string, { code: string; label: string }> = {
  freelance:  { code: '3699', label: 'Other income / Freelance income' },
  salary:     { code: '3601', label: 'Income / Salary' },
  commission: { code: '3606', label: 'Commission' },
  rental:     { code: '4210', label: 'Rental income' },
  interest:   { code: '4201', label: 'Local interest' },
  other:      { code: '3699', label: 'Other income' },
}

export const SARS_DEDUCTION_CODES: Record<string, { code: string; label: string }> = {
  section11f:   { code: '4001', label: 'Retirement annuity fund contributions (Section 11F)' },
  home_office:  { code: '4011', label: 'Home office expenses' },
  travel:       { code: '4016', label: 'Travel allowance / actual expenses' },
  other_biz:    { code: '4018', label: 'Other deductions' },
}
