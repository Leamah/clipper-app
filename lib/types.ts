// ============================================================
// Klippa Tax Platform — Core Types
// ============================================================

export type EmploymentType = 'freelance' | 'employee' | 'mixed'

export type ReturnType = 'ITR12' | 'IRP6'

export type ReturnStatus = 'draft' | 'ready' | 'submitted' | 'assessed'

export type IncomeType =
  | 'freelance'
  | 'salary'
  | 'interest'
  | 'rental'
  | 'commission'
  | 'other'

export type ExpenseCategory =
  | 'phone_internet'
  | 'home_office'
  | 'vehicle_travel'
  | 'equipment'
  | 'software_subscriptions'
  | 'client_entertainment'
  | 'professional_fees'
  | 'training'
  | 'marketing'
  | 'bank_charges'
  | 'insurance'
  | 'stationery'
  | 'other'

export type ClassificationStatus = 'pending' | 'confirmed' | 'rejected'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type DocumentType =
  | 'receipt'
  | 'irp5'
  | 'bank_statement'
  | 'invoice'
  | 'medical'
  | 'ra_certificate'
  | 'other'

export type OcrStatus = 'pending' | 'processing' | 'complete' | 'failed'
export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'admin'

// ── Database Row Types ─────────────────────────────────────

export interface KlippaProfile {
  id:                  string
  full_name:           string | null
  tax_number:          string | null
  id_number:           string | null
  employment_type:     EmploymentType
  works_from_home:     boolean
  home_office_pct:     number
  has_vehicle:         boolean
  has_ra:              boolean
  tax_year:            number
  subscription_tier:   SubscriptionTier
  onboarding_complete: boolean
  created_at:          string
  updated_at:          string
}

export interface KlippaTaxReturn {
  id:               string
  user_id:          string
  tax_year:         number
  return_type:      ReturnType
  status:           ReturnStatus
  gross_income:     number
  total_deductions: number
  taxable_income:   number
  tax_payable:      number
  rebates:          number
  net_tax_payable:  number
  sars_reference:   string | null
  submitted_at:     string | null
  assessed_at:      string | null
  refund_amount:    number | null
  created_at:       string
  updated_at:       string
}

export interface KlippaIncomeRecord {
  id:             string
  tax_return_id:  string | null
  user_id:        string
  source_name:    string
  income_type:    IncomeType
  amount:         number
  received_date:  string | null
  description:    string | null
  capture_method: string
  created_at:     string
}

export interface KlippaExpenseRecord {
  id:                    string
  tax_return_id:         string | null
  user_id:               string
  category:              ExpenseCategory
  description:           string | null
  merchant_name:         string | null
  amount:                number
  deductible_percentage: number
  deductible_amount:     number
  expense_date:          string | null
  receipt_id:            string | null
  classification_status: ClassificationStatus
  ai_confidence:         ConfidenceLevel | null
  ai_reasoning:          string | null
  ai_audit_risk:         ConfidenceLevel | null
  capture_method:        string
  created_at:            string
}

export interface KlippaDocument {
  id:                string
  user_id:           string
  tax_return_id:     string | null
  document_type:     DocumentType
  original_filename: string | null
  storage_path:      string | null
  file_size_bytes:   number | null
  file_hash:         string | null
  ocr_status:        OcrStatus
  ocr_confidence:    number | null
  extracted_data:    Record<string, unknown> | null
  tax_year:          number | null
  upload_method:     string
  created_at:        string
}

export interface KlippaMileageTrip {
  id:               string
  user_id:          string
  tax_return_id:    string | null
  trip_date:        string
  start_location:   string | null
  end_location:     string | null
  distance_km:      number
  purpose:          string
  trip_type:        'business' | 'private'
  deductible_amount: number | null
  created_at:       string
}

// ── Tax Engine Types ───────────────────────────────────────

export interface TaxCalculationInput {
  grossIncome:       number
  raContributions:   number
  homeofficePct:     number
  homeExpenses:      number  // annual rent + rates + elec + levies
  businessKm:        number
  totalKm:           number
  vehicleValue:      number  // for SARS fixed cost table lookup
  otherDeductions:   number  // sum of confirmed expense deductible_amount
  age:               number  // for rebate tier
  employeesTaxPaid:  number  // PAYE already deducted (IRP5 code 4102)
}

export interface TaxCalculationResult {
  grossIncome:      number
  section11fRa:     number  // RA deduction (Section 11F)
  homeOffice:       number
  travel:           number
  otherDeductions:  number
  totalDeductions:  number
  taxableIncome:    number
  grossTax:         number
  primaryRebate:    number
  secondaryRebate:  number
  tertiaryRebate:   number
  totalRebates:     number
  taxPayable:       number
  employeesTaxPaid: number
  netTaxPayable:    number  // positive = owe SARS, negative = refund
}

// ── AI Classification Types ────────────────────────────────

export interface ClassificationResult {
  category:              ExpenseCategory
  deductible_percentage: number
  confidence:            ConfidenceLevel
  reasoning:             string
  audit_risk:            ConfidenceLevel
  suggested_claim:       number
}

// ── Plain-English Category Labels ─────────────────────────

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  phone_internet:         'Phone & Internet',
  home_office:            'Working from Home',
  vehicle_travel:         'Driving for Work',
  equipment:              'Big Purchases (Equipment)',
  software_subscriptions: 'Software & Subscriptions',
  client_entertainment:   'Client Entertainment',
  professional_fees:      'Professional Fees',
  training:               'Training & Development',
  marketing:              'Marketing & Advertising',
  bank_charges:           'Bank Charges',
  insurance:              'Insurance',
  stationery:             'Office & Stationery',
  other:                  'Other Business Expenses',
}

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  freelance:  'Freelance / Consulting',
  salary:     'Salary / Employment',
  interest:   'Interest Earned',
  rental:     'Property Rental',
  commission: 'Commission',
  other:      'Other Income',
}

// Client entertainment is only 50% deductible per SARS
export const CATEGORY_DEFAULT_DEDUCTIBLE_PCT: Record<ExpenseCategory, number> = {
  phone_internet:         65,  // typical business usage estimate
  home_office:            100,
  vehicle_travel:         100,
  equipment:              100,
  software_subscriptions: 100,
  client_entertainment:   50,  // SARS rule: max 50%
  professional_fees:      100,
  training:               100,
  marketing:              100,
  bank_charges:           100,
  insurance:              100,
  stationery:             100,
  other:                  100,
}
