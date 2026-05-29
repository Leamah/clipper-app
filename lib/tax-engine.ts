// ============================================================
// Klippa Tax Engine — multi-year SARS ITR12 rules engine
// Supports: 2024/2025 (taxYear=2025) and 2025/2026 (taxYear=2026)
// CRITICAL: This engine is the ONLY source of tax figures.
//           AI never generates tax calculations.
// ============================================================

import type { TaxCalculationInput, TaxCalculationResult } from './types'

// ── Tax Bracket type ──────────────────────────────────────
interface TaxBracket {
  min:   number
  max:   number | null
  base:  number
  rate:  number
}

// ── Vehicle Fixed-Cost Row ────────────────────────────────
interface FixedCostRow {
  maxValue:    number
  fixedCost:   number     // R per annum
  fuelRate:    number     // cents per km
  mainRate:    number     // cents per km
}

// ── Per-year constants ────────────────────────────────────

interface YearRates {
  brackets:               TaxBracket[]
  primaryRebate:          number
  secondaryRebate:        number    // age 65+
  tertiaryRebate:         number    // age 75+
  threshold_under65:      number
  threshold_65_74:        number
  threshold_75plus:       number
  medicalCredit_1_2:      number    // R/month — main + first dependant
  medicalCredit_add:      number    // R/month — each additional beyond 2
  interestExempt_under65: number
  interestExempt_65plus:  number
  fixedCostTable:         FixedCostRow[]
}

// ── 2024/2025 tax year ────────────────────────────────────
const BRACKETS_2025: TaxBracket[] = [
  { min:        0, max:    237100, base:        0, rate: 0.18  },
  { min:   237101, max:    370500, base:    42678, rate: 0.26  },
  { min:   370501, max:    512800, base:    77362, rate: 0.31  },
  { min:   512801, max:    673000, base:   121475, rate: 0.36  },
  { min:   673001, max:    857900, base:   179147, rate: 0.39  },
  { min:   857901, max:   1817000, base:   251258, rate: 0.41  },
  { min:  1817001, max:      null, base:   644489, rate: 0.45  },
]

const FIXED_COST_2025: FixedCostRow[] = [
  { maxValue:   95_000, fixedCost:  28_352, fuelRate: 105.4, mainRate:  37.4 },
  { maxValue:  190_000, fixedCost:  50_631, fuelRate: 118.9, mainRate:  51.5 },
  { maxValue:  285_000, fixedCost:  72_983, fuelRate: 131.2, mainRate:  61.5 },
  { maxValue:  380_000, fixedCost:  92_683, fuelRate: 147.6, mainRate:  71.4 },
  { maxValue:  475_000, fixedCost: 114_956, fuelRate: 167.1, mainRate:  80.7 },
  { maxValue:  570_000, fixedCost: 136_332, fuelRate: 175.5, mainRate: 101.6 },
  { maxValue:  665_000, fixedCost: 157_620, fuelRate: 197.6, mainRate: 117.5 },
  { maxValue: Infinity, fixedCost: 157_620, fuelRate: 197.6, mainRate: 117.5 },
]

const RATES_2025: YearRates = {
  brackets:               BRACKETS_2025,
  primaryRebate:          17_235,
  secondaryRebate:         9_444,
  tertiaryRebate:          3_145,
  threshold_under65:      95_750,
  threshold_65_74:       148_217,
  threshold_75plus:      165_689,
  medicalCredit_1_2:        364,
  medicalCredit_add:        246,
  interestExempt_under65: 23_800,
  interestExempt_65plus:  34_500,
  fixedCostTable:         FIXED_COST_2025,
}

// ── 2025/2026 tax year ────────────────────────────────────
// Brackets, rebates and thresholds are IDENTICAL to 2024/2025 —
// the February 2025 Budget froze all personal income tax parameters.
// NOTE: Update fixedCostTable below once SARS publishes the
//       2025/2026 Government Gazette rates (typically March 2026).
const RATES_2026: YearRates = {
  ...RATES_2025,   // inherits all 2025/2026 identical values
  // Override here when SARS publishes updated 2026/2027 gazette figures
}

// ── 2026/2027 tax year ────────────────────────────────────
// TODO: Update when SARS publishes the February 2026 Budget rates
const RATES_2027: YearRates = {
  ...RATES_2025,   // placeholder — replace after February 2026 Budget gazette
}

// ── Rate selector ─────────────────────────────────────────
function getRates(taxYear?: number): YearRates {
  switch (taxYear) {
    case 2027: return RATES_2027
    case 2026: return RATES_2026
    case 2025:
    default:   return RATES_2025
  }
}

// ── Travel deduction ──────────────────────────────────────

export function calcTravelDeduction(
  businessKm:   number,
  totalKm:      number,
  vehicleValue: number,
  taxYear?:     number
): number {
  if (businessKm <= 0 || totalKm <= 0) return 0
  const table = getRates(taxYear).fixedCostTable
  const row   = table.find((r) => vehicleValue <= r.maxValue) ?? table[table.length - 1]
  const actualCost =
    row.fixedCost +
    (row.fuelRate / 100) * totalKm +
    (row.mainRate / 100) * totalKm
  return (businessKm / totalKm) * actualCost
}

export function vehicleFixedCostRow(vehicleValue: number, taxYear?: number): FixedCostRow {
  const table = getRates(taxYear).fixedCostTable
  return table.find((r) => vehicleValue <= r.maxValue) ?? table[table.length - 1]
}

// ── Medical credits ───────────────────────────────────────

function calcMedicalCredits(members: number, rates: YearRates): number {
  if (members <= 0) return 0
  const first2     = Math.min(members, 2) * rates.medicalCredit_1_2  * 12
  const additional = Math.max(0, members - 2) * rates.medicalCredit_add * 12
  return first2 + additional
}

// Exported wrapper — use this in UI code
export function calcMedicalCreditsForYear(members: number, taxYear?: number): number {
  return calcMedicalCredits(members, getRates(taxYear))
}

// ── Core tax calculation ──────────────────────────────────

export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  const {
    grossIncome,
    raContributions,
    pensionContributions,
    homeofficePct,
    homeExpenses,
    businessKm,
    totalKm,
    vehicleValue,
    medicalAidMembers,
    interestIncome,
    otherDeductions,
    age,
    employeesTaxPaid,
    taxYear,
  } = input

  const rates = getRates(taxYear)

  // 1. Interest income exemption
  const interestExemption = Math.min(
    interestIncome,
    age >= 65 ? rates.interestExempt_65plus : rates.interestExempt_under65
  )

  // 2. Section 11F: RA + Pension deduction
  const totalRetirementContributions = raContributions + pensionContributions
  const section11fRa = Math.min(
    0.275 * grossIncome,
    350_000,
    totalRetirementContributions
  )

  // 3. Home office deduction
  const homeOffice = homeofficePct > 0 && homeExpenses > 0
    ? (homeofficePct / 100) * homeExpenses
    : 0

  // 4. Travel deduction (actual-cost logbook method)
  const travel = calcTravelDeduction(businessKm, totalKm, vehicleValue, taxYear)

  // 5. Total deductions
  const totalDeductions = section11fRa + homeOffice + travel + interestExemption + otherDeductions

  // 6. Taxable income
  const taxableIncome = Math.max(0, grossIncome - totalDeductions)

  // 7. Gross tax from brackets
  const grossTax = computeGrossTax(taxableIncome, rates.brackets)

  // 8. Age rebates
  const primaryRebate   = rates.primaryRebate
  const secondaryRebate = age >= 65 ? rates.secondaryRebate : 0
  const tertiaryRebate  = age >= 75 ? rates.tertiaryRebate  : 0
  const totalRebates    = primaryRebate + secondaryRebate + tertiaryRebate

  // 9. Medical aid credits (Section 6A — reduce tax payable)
  const medicalAidCredits = calcMedicalCredits(medicalAidMembers, rates)

  // 10. Tax payable after rebates and credits
  const taxPayable = Math.max(0, grossTax - totalRebates - medicalAidCredits)

  // 11. Net tax
  const netTaxPayable = taxPayable - employeesTaxPaid

  return {
    grossIncome,
    section11fRa:      round2(section11fRa),
    homeOffice:        round2(homeOffice),
    travel:            round2(travel),
    interestExemption: round2(interestExemption),
    otherDeductions:   round2(otherDeductions),
    totalDeductions:   round2(totalDeductions),
    taxableIncome:     round2(taxableIncome),
    grossTax:          round2(grossTax),
    primaryRebate,
    secondaryRebate,
    tertiaryRebate,
    totalRebates,
    medicalAidCredits: round2(medicalAidCredits),
    taxPayable:        round2(taxPayable),
    employeesTaxPaid:  round2(employeesTaxPaid),
    netTaxPayable:     round2(netTaxPayable),
  }
}

function computeGrossTax(taxableIncome: number, brackets: TaxBracket[]): number {
  for (const bracket of brackets) {
    const max = bracket.max ?? Infinity
    if (taxableIncome <= max) {
      return bracket.base + bracket.rate * (taxableIncome - bracket.min)
    }
  }
  const top = brackets[brackets.length - 1]
  return top.base + top.rate * (taxableIncome - top.min)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Helpers ───────────────────────────────────────────────

export function effectiveTaxRate(result: TaxCalculationResult): number {
  if (result.grossIncome === 0) return 0
  return round2((result.taxPayable / result.grossIncome) * 100)
}

export function isBelowThreshold(taxableIncome: number, age: number, taxYear?: number): boolean {
  const rates = getRates(taxYear)
  if (age >= 75) return taxableIncome < rates.threshold_75plus
  if (age >= 65) return taxableIncome < rates.threshold_65_74
  return taxableIncome < rates.threshold_under65
}

export function ageFromDob(dob: string | null): number {
  if (!dob) return 35
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// Returns the SARS tax year currently running (the year the current date falls in)
// e.g. May 2026 → 2027 (running year is 1 March 2026 – 28 Feb 2027)
export function currentRunningTaxYear(): number {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0=Jan
  return month >= 2 ? year + 1 : year   // Feb (1) or earlier = still in year Y, Mar+ = year Y+1
}

// ── Quick estimate (annualised YTD) ──────────────────────
export function annualisedEstimate(
  ytdIncome:     number,
  monthsElapsed: number,
  profile: {
    has_ra:              boolean
    works_from_home:     boolean
    home_office_pct:     number
    has_vehicle:         boolean
    has_medical:         boolean
    medical_aid_members: number
    date_of_birth:       string | null
  },
  taxYear?: number
): Pick<TaxCalculationResult, 'grossIncome' | 'taxPayable' | 'netTaxPayable' | 'medicalAidCredits'> {
  if (monthsElapsed === 0) {
    return { grossIncome: 0, taxPayable: 0, netTaxPayable: 0, medicalAidCredits: 0 }
  }
  const annualised = (ytdIncome / monthsElapsed) * 12
  const estimatedRa         = profile.has_ra ? Math.min(annualised * 0.15, 350_000) : 0
  const estimatedHomeOffice = profile.works_from_home ? annualised * 0.05 : 0

  const result = calculateTax({
    grossIncome:          annualised,
    raContributions:      estimatedRa,
    pensionContributions: 0,
    homeofficePct:        profile.home_office_pct,
    homeExpenses:         estimatedHomeOffice,
    businessKm:           0,
    totalKm:              0,
    vehicleValue:         0,
    medicalAidMembers:    profile.has_medical ? profile.medical_aid_members : 0,
    interestIncome:       0,
    otherDeductions:      0,
    age:                  ageFromDob(profile.date_of_birth),
    employeesTaxPaid:     0,
    taxYear,
  })

  return {
    grossIncome:       result.grossIncome,
    taxPayable:        result.taxPayable,
    netTaxPayable:     result.netTaxPayable,
    medicalAidCredits: result.medicalAidCredits,
  }
}

// ── SARS filing deadline helpers ─────────────────────────

export function getITR12Deadline(taxYear: number): Date {
  return new Date(taxYear, 9, 23)  // 23 October
}

export function getIRP6Deadlines(taxYear: number): { first: Date; second: Date } {
  // taxYear = ending year, e.g. 2027 = March 2026–Feb 2027
  // First payment: last business day of August in the year the tax year starts
  // Second payment: last business day of February at the end of the tax year
  return {
    first:  new Date(taxYear - 1, 7, 31),  // 31 August (start of the year)
    second: new Date(taxYear,     1, 28),   // 28 February (end of the year)
  }
}

export function daysUntilDeadline(deadline: Date): number {
  const now  = new Date()
  const diff = deadline.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// VAT registration threshold
export const VAT_THRESHOLD = 1_000_000
export const VAT_WARNING_THRESHOLD = 800_000

// Provisional tax threshold — must register if non-employment income > R30,000
export const PROVISIONAL_TAX_THRESHOLD = 30_000

// ── SARS Line number mapping ──────────────────────────────

export const SARS_INCOME_CODES: Record<string, { code: string; label: string }> = {
  freelance:  { code: '3699', label: 'Other income / Freelance income' },
  salary:     { code: '3601', label: 'Income / Salary' },
  commission: { code: '3606', label: 'Commission' },
  rental:     { code: '4210', label: 'Rental income' },
  interest:   { code: '4201', label: 'Local interest' },
  other:      { code: '3699', label: 'Other income' },
}

export const SARS_DEDUCTION_CODES: Record<string, { code: string; label: string }> = {
  section11f:      { code: '4001', label: 'Retirement annuity fund contributions (Section 11F)' },
  pension:         { code: '4003', label: 'Pension fund contributions' },
  home_office:     { code: '4011', label: 'Home office expenses' },
  travel:          { code: '4016', label: 'Travel allowance / actual expenses' },
  medical:         { code: '4116', label: 'Medical aid contributions (Section 6A credits)' },
  other_biz:       { code: '4018', label: 'Other deductions' },
  interest_exempt: { code: '4201', label: 'Local interest — exempt portion' },
}

// backward-compat re-export
export { calcMedicalCreditsForYear as calcMedicalCredits }
