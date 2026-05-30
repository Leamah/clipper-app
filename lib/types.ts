// ============================================================
// Klippa Tax Platform — Core Types
// ============================================================

export type EmploymentType = 'freelance' | 'employee' | 'mixed'
export type WorkLocation   = 'home_only' | 'hybrid' | 'office_only'

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
  | 'timesheet'
  | 'other'

export type OcrStatus = 'pending' | 'processing' | 'complete' | 'failed'
export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'admin'
export type UserType         = 'freelancer' | 'company_owner' | 'practitioner'
export type OrgType          = 'company' | 'practice'
export type OrgRole          = 'owner' | 'admin' | 'member'

// ── Database Row Types ─────────────────────────────────────

export interface KlippaProfile {
  id:                   string
  full_name:            string | null
  tax_number:           string | null
  id_number:            string | null
  employment_type:      EmploymentType
  work_location:        WorkLocation          // home_only | hybrid | office_only
  works_from_home:      boolean               // true when work_location !== 'office_only'
  home_office_pct:      number
  home_expenses_annual: number                // annual home costs (rent/bond interest + rates + elec + levies)
  has_vehicle:          boolean
  vehicle_value:        number                // for SARS fixed-cost table
  // Commute & logbook setup
  home_suburb:          string | null
  work_suburb:          string | null
  commute_km:           number
  office_mon:           boolean
  office_tue:           boolean
  office_wed:           boolean
  office_thu:           boolean
  office_fri:           boolean
  opening_odometer:     number
  closing_odometer:     number                // km at end of this tax year (for SARS logbook)
  vehicle_make:           string | null
  vehicle_model:          string | null
  vehicle_year:           number | null
  vehicle_registration:   string | null       // e.g. 'GP 123-456'
  vehicle_purchase_date:  string | null       // ISO date — for SARS logbook header
  logbook_reminder:       'weekly' | 'monthly' | 'none'
  // Feature flags — opt-in modules
  feature_timesheets:   boolean
  feature_logbook:      boolean
  feature_provisional:  boolean
  feature_overrides:    boolean  // true = admin has manually set flags; tier changes won't overwrite
  // Retirement savings
  has_ra:               boolean
  ra_contributions:     number
  has_pension:          boolean
  pension_contributions: number
  has_medical:          boolean
  medical_aid_members:  number               // incl. main member
  has_tfsa:             boolean
  has_interest_savings: boolean
  date_of_birth:        string | null        // ISO date — for age-based rebates & interest exemption
  tax_year:             number
  subscription_tier:    SubscriptionTier
  onboarding_complete:  boolean
  // B2B
  user_type:            UserType
  organisation_id:      string | null
  org_role:             OrgRole | null
  created_at:           string
  updated_at:           string
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
  sars_reference:    string | null
  submitted_at:      string | null
  assessed_at:       string | null
  refund_amount:     number | null
  employees_tax_paid: number        // PAYE already deducted by employer (IRP5 code 4102)
  // IRP6 provisional tax payment tracking
  payment1_status:   'unpaid' | 'paid'
  payment2_status:   'unpaid' | 'paid'
  payment1_paid_at:  string | null
  payment2_paid_at:  string | null
  created_at:        string
  updated_at:        string
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
  // Mixed-use intelligence fields
  ai_is_mixed_use:       boolean | null
  ai_conservative_pct:   number | null
  ai_aggressive_pct:     number | null
  ai_sars_rule:          string | null
  ai_audit_triggers:     string[] | null
  ai_required_evidence:  string[] | null
  ai_behavioral_tip:     string | null
  capture_method:        string
  created_at:            string
}

export interface KlippaDocument {
  id:                string
  user_id:           string
  tax_return_id:     string | null
  document_type:     DocumentType
  expense_category:  ExpenseCategory | null   // for receipt grouping by spend type
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
  odometer_start:   number | null  // opening KM — SARS requires per-trip odometer reading
  odometer_end:     number | null  // closing KM
  distance_km:      number
  purpose:          string
  trip_type:        'business' | 'private'
  deductible_amount: number | null
  review_week:      string | null   // e.g. '2025-W22'
  created_at:       string
}

// ── Timesheet Types ────────────────────────────────────────

export interface KlippaClient {
  id:          string
  user_id:     string
  name:        string          // "Client company"
  contact:     string | null   // contact person
  hourly_rate: number | null
  position:    string | null   // user's role at this client
  is_active:   boolean
  created_at:  string
}

export interface KlippaTimesheet {
  id:                    string
  user_id:               string
  client_id:             string | null
  month:                 string       // ISO date: first day of month 'YYYY-MM-01'
  consultant_name:       string | null
  position:              string | null
  hourly_rate:           number | null
  status:                'draft' | 'submitted' | 'approved'
  consultant_signed_at:  string | null  // ISO timestamp — digital signature
  client_signed_at:      string | null  // ISO timestamp — manually confirmed by consultant
  created_at:            string
  updated_at:            string
}

// ── B2B Types ──────────────────────────────────────────────

export interface KlippaOrganisation {
  id:                string
  name:              string
  slug:              string | null
  org_type:          OrgType
  owner_id:          string
  logo_url:          string | null
  subscription_tier: string
  seat_count:        number
  created_at:        string
  updated_at:        string
}

export interface KlippaOrgInvite {
  id:              string
  organisation_id: string
  invited_email:   string
  invited_by:      string
  status:          'pending' | 'accepted' | 'declined'
  role:            OrgRole
  token:           string
  expires_at:      string
  created_at:      string
}

// ── B2B Intelligence Types ─────────────────────────────────

export type PayrollStatus   = 'open' | 'closed' | 'processing'
export type ContractType    = 'fixed_term' | 'permanent' | 'freelance' | 'retainer'
export type ContractStatus  = 'active' | 'expired' | 'terminated'
export type RateType        = 'hourly' | 'daily' | 'monthly' | 'project'

export interface KlippaPayrollPeriod {
  id:              string
  organisation_id: string
  name:            string        // e.g. "June 2026"
  period_start:    string        // ISO date
  period_end:      string
  deadline:        string        // submission deadline
  status:          PayrollStatus
  created_at:      string
  updated_at:      string
}

export interface KlippaConsultantContract {
  id:              string
  organisation_id: string
  user_id:         string
  contract_type:   ContractType
  start_date:      string | null
  end_date:        string | null  // null = open-ended
  rate:            number | null
  rate_type:       RateType
  status:          ContractStatus
  notes:           string | null
  created_at:      string
  updated_at:      string
}

export interface KlippaConsultantCompliance {
  id:                   string
  organisation_id:      string
  user_id:              string
  tax_profile_complete: boolean
  banking_verified:     boolean
  id_verified:          boolean
  popia_consent:        boolean
  signed_agreement_at:  string | null
  notes:                string | null
  created_at:           string
  updated_at:           string
}

// Aggregated per-consultant view for the org dashboard
export interface OrgConsultantRow {
  id:               string
  email:            string
  full_name:        string | null
  org_role:         string | null
  latest_timesheet: { status: string; month: string } | null
  contract:         KlippaConsultantContract | null
  compliance:       KlippaConsultantCompliance | null
  compliance_score: number   // 0-5 checks passed
}

// Dashboard intelligence snapshot
export interface OrgIntelligence {
  active_consultants:  number
  submission_rate:     number       // 0-100
  missing_timesheets:  { id: string; name: string; email: string }[]
  expiring_contracts:  { id: string; name: string; email: string; end_date: string; days_left: number }[]
  current_period:      KlippaPayrollPeriod | null
  days_until_deadline: number | null
  consultants:         OrgConsultantRow[]
}

// ── Tier Feature Config ────────────────────────────────────

export interface KlippaTierFeature {
  id:          string
  tier:        SubscriptionTier
  feature_key: 'timesheets' | 'logbook' | 'provisional'
  enabled:     boolean
  updated_at:  string
}

export interface KlippaTimesheetEntry {
  id:           string
  user_id:      string
  timesheet_id: string
  entry_date:   string       // ISO date
  hours:        number
  comment:      string | null
  created_at:   string
}

export interface KlippaLogbookReview {
  id:               string
  user_id:          string
  review_week:      string
  trips_confirmed:  number
  km_confirmed:     number
  reviewed_at:      string
}

// ── Tax Engine Types ───────────────────────────────────────

export interface TaxCalculationInput {
  grossIncome:          number
  raContributions:      number
  pensionContributions: number    // combined with RA under Section 11F
  homeofficePct:        number
  homeExpenses:         number    // annual rent + rates + elec + levies
  businessKm:           number
  totalKm:              number
  vehicleValue:         number    // for SARS fixed cost table lookup
  medicalAidMembers:    number    // 0 = no medical aid; 1+ = members incl. main
  interestIncome:       number    // for annual exemption calc
  otherDeductions:      number    // sum of confirmed expense deductible_amount
  age:                  number    // for rebate tier + interest exemption threshold
  employeesTaxPaid:     number    // PAYE already deducted (IRP5 code 4102)
  taxYear?:             number    // SARS tax year (e.g. 2025 = 2024/2025). Defaults to 2025.
}

export interface TaxCalculationResult {
  grossIncome:          number
  section11fRa:         number    // RA + pension deduction (Section 11F)
  homeOffice:           number
  travel:               number
  interestExemption:    number    // exempt portion of interest income
  otherDeductions:      number
  totalDeductions:      number
  taxableIncome:        number
  grossTax:             number
  primaryRebate:        number
  secondaryRebate:      number
  tertiaryRebate:       number
  totalRebates:         number
  medicalAidCredits:    number    // Section 6A — reduces tax payable directly
  taxPayable:           number    // after rebates + medical credits
  employeesTaxPaid:     number
  netTaxPayable:        number    // positive = owe SARS, negative = refund
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

// ── OCR Extraction Result ─────────────────────────────────

export interface OcrExtractedReceipt {
  merchant_name: string | null
  amount:        number | null
  expense_date:  string | null
  description:   string | null
  vat_amount:    number | null
  confidence:    number          // 0–1
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

export const WORK_LOCATION_LABELS: Record<WorkLocation, string> = {
  home_only:   'Fully Remote (Home Only)',
  hybrid:      'Hybrid (Home + Office)',
  office_only: 'Office / On-site Only',
}

// Client entertainment is only 50% deductible per SARS
export const CATEGORY_DEFAULT_DEDUCTIBLE_PCT: Record<ExpenseCategory, number> = {
  phone_internet:         65,   // typical business usage estimate
  home_office:            100,
  vehicle_travel:         100,
  equipment:              100,
  software_subscriptions: 100,
  client_entertainment:   50,   // SARS rule: max 50%
  professional_fees:      100,
  training:               100,
  marketing:              100,
  bank_charges:           100,
  insurance:              100,
  stationery:             100,
  other:                  100,
}
