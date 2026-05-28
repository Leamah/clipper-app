// ============================================================
// Klippa Tax Engine — SARS 2024/2025 Tax Year (1 March 2024 – 28 Feb 2025)
// CRITICAL: This engine is the ONLY source of tax figures.
//           AI never generates tax calculations.
// ============================================================

import type { TaxCalculationInput, TaxCalculationResult } from './types'

// ── 2024/2025 Progressive Tax Brackets ────────────────────
interface TaxBracket {
  min:   number
  max:   number | null
  base:  number
  rate:  number
}

const TAX_BRACKETS_2025: TaxBracket[] = [
  { min:        0, max:    237100, base:        0, rate: 0.18  },
  { min:   237101, max:    370500, base:    42678, rate: 0.26  },
  { min:   370501, max:    512800, base:    77362, rate: 0.31  },
  { min:   512801, max:    673000, base:   121475, rate: 0.36  },
  { min:   673001, max:    857900, base:   179147, rate: 0.39  },
  { min:   857901, max:   1817000, base:   251258, rate: 0.41  },
  { min:  1817001, max:       null, base:  644489, rate: 0.45  },
]

// ── Rebates 2024/2025 ─────────────────────────────────────
const PRIMARY_REBATE   = 17235   // all taxpayers
const SECONDARY_REBATE =  9444   // age 65+
const TERTIARY_REBATE  =  3145   // age 75+

// ── Tax Thresholds (below = no tax) ──────────────────────
const THRESHOLD_UNDER_65  =  95750
const THRESHOLD_65_TO_74  = 148217
const THRESHOLD_75_PLUS   = 165689

// ── Section 11F RA + Pension Deduction ───────────────────
const RA_DEDUCTION_CAP = 350_000
const RA_DEDUCTION_PCT = 0.275    // 27.5%

// ── Medical Aid Tax Credits (Section 6A) 2024/2025 ───────
// These are CREDITS (reduce tax payable directly, not income)
const MEDICAL_CREDIT_MEMBER_1_2 = 364    // R/month — main member + first dependant
const MEDICAL_CREDIT_ADDITIONAL = 246    // R/month — each additional dependant beyond 2

function calcMedicalCredits(members: number): number {
  if (members <= 0) return 0
  const first2     = Math.min(members, 2) * MEDICAL_CREDIT_MEMBER_1_2 * 12
  const additional = Math.max(0, members - 2) * MEDICAL_CREDIT_ADDITIONAL * 12
  return first2 + additional
}

// ── Interest Income Exemption 2024/2025 ──────────────────
const INTEREST_EXEMPTION_UNDER_65 = 23_800
const INTEREST_EXEMPTION_65_PLUS  = 34_500

// ── SARS Vehicle Fixed-Cost Table 2024/2025 ──────────────
// Source: SARS Government Gazette — used for actual cost vs. fixed-rate logbook method
interface FixedCostRow {
  maxValue:    number
  fixedCost:   number     // R per annum
  fuelRate:    number     // cents per km
  mainRate:    number     // cents per km
}

const SARS_FIXED_COST_TABLE: FixedCostRow[] = [
  { maxValue:   95_000, fixedCost:  28_352, fuelRate: 105.4, mainRate:  37.4 },
  { maxValue:  190_000, fixedCost:  50_631, fuelRate: 118.9, mainRate:  51.5 },
  { maxValue:  285_000, fixedCost:  72_983, fuelRate: 131.2, mainRate:  61.5 },
  { maxValue:  380_000, fixedCost:  92_683, fuelRate: 147.6, mainRate:  71.4 },
  { maxValue:  475_000, fixedCost: 114_956, fuelRate: 167.1, mainRate:  80.7 },
  { maxValue:  570_000, fixedCost: 136_332, fuelRate: 175.5, mainRate: 101.6 },
  { maxValue:  665_000, fixedCost: 157_620, fuelRate: 197.6, mainRate: 117.5 },
  { maxValue: Infinity, fixedCost: 157_620, fuelRate: 197.6, mainRate: 117.5 }, // capped
]

export function calcTravelDeduction(
  businessKm:  number,
  totalKm:     number,
  vehicleValue: number
): number {
  if (businessKm <= 0 || totalKm <= 0) return 0
  const row  = SARS_FIXED_COST_TABLE.find((r) => vehicleValue <= r.maxValue)
            ?? SARS_FIXED_COST_TABLE[SARS_FIXED_COST_TABLE.length - 1]
  const actualCost =
    row.fixedCost +
    (row.fuelRate / 100) * totalKm +
    (row.mainRate / 100) * totalKm
  return (businessKm / totalKm) * actualCost
}

export function vehicleFixedCostRow(vehicleValue: number): FixedCostRow {
  return SARS_FIXED_COST_TABLE.find((r) => vehicleValue <= r.maxValue)
      ?? SARS_FIXED_COST_TABLE[SARS_FIXED_COST_TABLE.length - 1]
}

// ── Core calculation ──────────────────────────────────────

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
  } = input

  // 1. Interest income exemption (exempt portion excluded from taxable income)
  const interestExemption = Math.min(
    interestIncome,
    age >= 65 ? INTEREST_EXEMPTION_65_PLUS : INTEREST_EXEMPTION_UNDER_65
  )

  // 2. Section 11F: RA + Pension deduction
  //    = min(27.5% × gross, R350,000, actual contributions)
  const totalRetirementContributions = raContributions + pensionContributions
  const section11fRa = Math.min(
    RA_DEDUCTION_PCT * grossIncome,
    RA_DEDUCTION_CAP,
    totalRetirementContributions
  )

  // 3. Home office deduction
  //    SARS requires a dedicated room exclusively used for work
  const homeOffice = homeofficePct > 0 && homeExpenses > 0
    ? (homeofficePct / 100) * homeExpenses
    : 0

  // 4. Travel deduction (actual cost logbook method)
  const travel = calcTravelDeduction(businessKm, totalKm, vehicleValue)

  // 5. Total deductions
  const totalDeductions = section11fRa + homeOffice + travel + interestExemption + otherDeductions

  // 6. Taxable income
  const taxableIncome = Math.max(0, grossIncome - totalDeductions)

  // 7. Gross tax from brackets
  const grossTax = computeGrossTax(taxableIncome)

  // 8. Age rebates
  const primaryRebate   = PRIMARY_REBATE
  const secondaryRebate = age >= 65 ? SECONDARY_REBATE : 0
  const tertiaryRebate  = age >= 75 ? TERTIARY_REBATE  : 0
  const totalRebates    = primaryRebate + secondaryRebate + tertiaryRebate

  // 9. Medical aid credits (Section 6A — reduce tax payable, not taxable income)
  const medicalAidCredits = calcMedicalCredits(medicalAidMembers)

  // 10. Tax payable after rebates and medical credits (never below 0)
  const taxPayable = Math.max(0, grossTax - totalRebates - medicalAidCredits)

  // 11. Net tax (positive = owe SARS, negative = refund due)
  const netTaxPayable = taxPayable - employeesTaxPaid

  return {
    grossIncome:        grossIncome,
    section11fRa:       round2(section11fRa),
    homeOffice:         round2(homeOffice),
    travel:             round2(travel),
    interestExemption:  round2(interestExemption),
    otherDeductions:    round2(otherDeductions),
    totalDeductions:    round2(totalDeductions),
    taxableIncome:      round2(taxableIncome),
    grossTax:           round2(grossTax),
    primaryRebate,
    secondaryRebate,
    tertiaryRebate,
    totalRebates,
    medicalAidCredits:  round2(medicalAidCredits),
    taxPayable:         round2(taxPayable),
    employeesTaxPaid:   round2(employeesTaxPaid),
    netTaxPayable:      round2(netTaxPayable),
  }
}

function computeGrossTax(taxableIncome: number): number {
  for (const bracket of TAX_BRACKETS_2025) {
    const max = bracket.max ?? Infinity
    if (taxableIncome <= max) {
      return bracket.base + bracket.rate * (taxableIncome - bracket.min)
    }
  }
  const top = TAX_BRACKETS_2025[TAX_BRACKETS_2025.length - 1]
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

export function isBelowThreshold(taxableIncome: number, age: number): boolean {
  if (age >= 75) return taxableIncome < THRESHOLD_75_PLUS
  if (age >= 65) return taxableIncome < THRESHOLD_65_TO_74
  return taxableIncome < THRESHOLD_UNDER_65
}

export function ageFromDob(dob: string | null): number {
  if (!dob) return 35  // safe default for rebate calculation
  const today  = new Date()
  const birth  = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ── Quick estimate (annualised YTD) ──────────────────────
export function annualisedEstimate(
  ytdIncome:      number,
  monthsElapsed:  number,
  profile: {
    has_ra:              boolean
    works_from_home:     boolean
    home_office_pct:     number
    has_vehicle:         boolean
    has_medical:         boolean
    medical_aid_members: number
    date_of_birth:       string | null
  }
): Pick<TaxCalculationResult, 'grossIncome' | 'taxPayable' | 'netTaxPayable' | 'medicalAidCredits'> {
  if (monthsElapsed === 0) {
    return { grossIncome: 0, taxPayable: 0, netTaxPayable: 0, medicalAidCredits: 0 }
  }
  const annualised = (ytdIncome / monthsElapsed) * 12
  const estimatedRa         = profile.has_ra ? Math.min(annualised * 0.15, RA_DEDUCTION_CAP) : 0
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
  return {
    first:  new Date(taxYear - 1, 7, 31),
    second: new Date(taxYear,     1, 28),
  }
}

export function daysUntilDeadline(deadline: Date): number {
  const now  = new Date()
  const diff = deadline.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ── SARS Line number mapping for Filing Wizard / ITR12 doc ─

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
  pension:      { code: '4003', label: 'Pension fund contributions' },
  home_office:  { code: '4011', label: 'Home office expenses' },
  travel:       { code: '4016', label: 'Travel allowance / actual expenses' },
  medical:      { code: '4116', label: 'Medical aid contributions (Section 6A credits)' },
  other_biz:    { code: '4018', label: 'Other deductions' },
  interest_exempt: { code: '4201', label: 'Local interest — exempt portion' },
}

// ── Medical credit calc (exported for use in UI) ──────────
export { calcMedicalCredits }
