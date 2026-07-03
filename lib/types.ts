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
  | 'dividends'
  | 'capital_gains'
  | 'foreign_income'
  | 'crypto'
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
  | 'investment_certificate'
  | 'timesheet'
  | 'other'

export type OcrStatus = 'pending' | 'processing' | 'complete' | 'failed'
export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'admin'
export type UserType         = 'freelancer' | 'company_owner' | 'practitioner'
export type OrgType          = 'company' | 'practice'
// 'org-admin' = manages the org (the creator + any invited managers).
// 'member'    = a consultant who submits timesheets.
export type OrgRole          = 'org-admin' | 'member'
export type OrgPlan          = 'tier1' | 'tier2'

// Plan limits — managers ('users') vs consultant seats.
export const ORG_PLANS: Record<OrgPlan, { label: string; managers: number; seats: number }> = {
  tier1: { label: 'Team',  managers: 3, seats: 50 },
  tier2: { label: 'Scale', managers: 5, seats: Infinity },
}

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
  feature_invest_basic: boolean  // FINscope: screener + Buffett + basic snapshots
  feature_invest_full:  boolean  // FINscope: all 13 modules + SENS + portfolio
  feature_overrides:    boolean  // true = admin has manually set flags; tier changes won't overwrite
  // FINscope Invest opt-in and persona
  invest_enabled:       boolean
  invest_persona:       'beginner' | 'novice' | 'prosumer' | null
  invest_goal:          string | null
  invest_horizon:       '3m' | '6m' | '1y' | '3y' | '5y_plus' | null
  invest_risk_band:     'conservative' | 'balanced' | 'aggressive' | null
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
  // Persisted signature PNG (base64 data-URL) — reused across timesheets
  saved_signature:      string | null
  // Free-text banking/payment details printed on invoices
  invoice_banking_details: string | null
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
  organisation_id?: string | null
  org_placement_id?: string | null
  created_at:  string
}

export interface KlippaTimesheet {
  id:                    string
  user_id:               string
  client_id:             string | null
  org_placement_id?:     string | null
  month:                 string       // ISO date: first day of month 'YYYY-MM-01'
  consultant_name:       string | null
  position:              string | null
  hourly_rate:           number | null
  status:                'draft' | 'submitted' | 'approved'
  consultant_signed_at:  string | null  // ISO timestamp
  consultant_signature:  string | null  // base64 PNG of drawn signature
  client_signed_at:      string | null  // ISO timestamp — manually confirmed by consultant
  client_name:           string | null  // denormalised at sign time
  client_contact:        string | null  // denormalised at sign time
  // Placement-house review columns (added migration 015)
  org_approved_at:       string | null  // set when org admin approves the timesheet
  org_approved_by:       string | null  // UUID of the admin who approved
  org_rejected_at:       string | null  // set when org admin bounces back to draft
  org_review_note:       string | null  // optional note attached to approve/reject
  locked_at:             string | null  // set at approval; prevents consultant edits
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
  brand_color:       string | null   // hex e.g. '#10b981'
  subscription_tier: string
  seat_count:        number
  created_at:        string
  updated_at:        string
}

/** Branding passed to PDF / email generators */
export interface OrgBranding {
  orgName:    string
  brandColor: string          // hex e.g. '#10b981'
  logoUrl:    string | null
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
export type OrgClientStatus = 'active' | 'paused' | 'archived'
export type PlacementStatus = 'active' | 'ending' | 'ended' | 'paused'

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
  evidence?:             Record<string, unknown>
  verified_by?:          string | null
  verified_at?:          string | null
  created_at:           string
  updated_at:           string
}

export interface KlippaOrgClient {
  id:              string
  organisation_id: string
  name:            string
  contact_person:  string | null
  contact_email:   string | null
  default_site:    string | null
  status:          OrgClientStatus
  notes:           string | null
  created_at:      string
  updated_at:      string
}

export interface KlippaOrgPlacement {
  id:                      string
  organisation_id:         string
  client_id:               string
  user_id:                 string
  role_title:              string
  site:                    string | null
  client_manager_name:     string | null
  client_manager_email:    string | null
  start_date:              string | null
  end_date:                string | null
  bill_rate:               number | null
  pay_rate:                number | null
  rate_type:               RateType
  status:                  PlacementStatus
  compliance_requirements: string[]
  requirement_status?:     Record<string, boolean>
  risk_answers?:           Record<string, boolean>
  notes:                   string | null
  created_at:              string
  updated_at:              string
}

export interface OrgPlacementReadiness {
  placement:       KlippaOrgPlacement
  client:          KlippaOrgClient | null
  consultant:      { id: string; full_name: string | null; email: string }
  timesheet:       { id: string; status: string; month: string; hours: number; client_signed_at: string | null; org_approved_at: string | null } | null
  compliance_score: number
  expected_bill:    number
  expected_pay:     number
  expected_margin:  number
  margin_pct:       number | null
  ready_to_bill:    boolean
  ready_to_pay:     boolean
  blockers:         string[]
  risk_flags:       string[]
  risk_score:       number
}

// Aggregated per-consultant view for the org dashboard
export interface OrgConsultantRow {
  id:               string
  email:            string
  full_name:        string | null
  org_role:         string | null
  latest_timesheet: {
    id:               string
    status:           string
    month:            string
    org_approved_at:  string | null
    client_signed_at: string | null
  } | null
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
  clients?:            KlippaOrgClient[]
  placements?:         OrgPlacementReadiness[]
  placement_summary?:  {
    active:             number
    ready_to_bill:      number
    ready_to_pay:       number
    blocked:            number
    client_approval_due: number
    projected_bill:     number
    projected_pay:      number
    projected_margin:   number
    margin_pct:         number | null
  }
}

// ── Practice (Accounting) Types ────────────────────────────

export type ClientEntityType = 'individual' | 'sole_prop' | 'company' | 'trust'
export type ClientReturnType = 'ITR12' | 'IRP6' | 'ITR14' | 'IT12TR'
export type FilingStatus =
  | 'not_started' | 'collecting' | 'in_progress' | 'review' | 'filed' | 'assessed'

export const FILING_STATUS_FLOW: FilingStatus[] =
  ['not_started', 'collecting', 'in_progress', 'review', 'filed', 'assessed']

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  not_started: 'Not started',
  collecting:  'Collecting docs',
  in_progress: 'In progress',
  review:      'Client review',
  filed:       'Filed',
  assessed:    'Assessed',
}

export const ENTITY_TYPE_LABELS: Record<ClientEntityType, string> = {
  individual: 'Individual',
  sole_prop:  'Sole Proprietor',
  company:    'Company',
  trust:      'Trust',
}

export interface ChecklistItem {
  id:       string
  label:    string
  received: boolean
}

export interface KlippaPracticeClient {
  id:              string
  organisation_id: string
  client_user_id:  string | null
  full_name:       string
  email:           string | null
  entity_type:     ClientEntityType
  tax_number:      string | null
  return_type:     ClientReturnType
  tax_year:        number
  filing_status:   FilingStatus
  deadline:        string | null
  fee:             number
  fee_paid:        boolean
  status:          'active' | 'archived'
  notes:           string | null
  doc_checklist:   ChecklistItem[]
  portal_token:    string | null
  portal_enabled:  boolean
  portal_token_created_at: string | null
  last_activity_at: string | null
  created_at:      string
  updated_at:      string
}

export interface KlippaPracticeReturn {
  id:                 string
  client_id:          string
  organisation_id:    string
  tax_year:           number
  return_type:        ClientReturnType
  filing_status:      FilingStatus
  deadline:           string | null
  review_due_at:      string | null
  owner_user_id:      string | null
  preparer_user_id:   string | null
  reviewer_user_id:   string | null
  fee:                number
  fee_paid:           boolean
  notes:              string | null
  blocked_reason_codes: string[]
  doc_checklist:      ChecklistItem[]
  last_chased_at:     string | null
  client_signoff_at:  string | null
  filed_at:           string | null
  assessed_at:        string | null
  sars_reference:     string | null
  created_at:         string
  updated_at:         string
}

export interface KlippaPracticeClientDocument {
  id:                string
  client_id:         string
  organisation_id:   string
  return_id:         string | null
  checklist_item_id: string | null
  file_name:         string
  storage_path:      string
  mime_type:         string | null
  size_bytes:        number | null
  uploaded_via:      'portal' | 'practice'
  created_at:        string
  signed_url?:       string   // populated on read for the practice UI
}

export interface PracticeReadinessItem {
  id:       string
  label:    string
  status:   'ok' | 'warn' | 'blocker'
  detail?:  string
}

export interface PracticeReadinessScore {
  score:       number
  label:       'Blocked' | 'At risk' | 'Nearly ready' | 'Ready'
  blockers:    PracticeReadinessItem[]
  warnings:    PracticeReadinessItem[]
  next_actions: PracticeReadinessItem[]
  checks:      {
    documents: number
    deadline:  number
    identity:  number
    workflow:  number
    review:    number
  }
}

export interface PracticeStats {
  total_clients:    number
  total_returns:    number
  due_soon:         number   // deadline within 14 days, not yet filed
  filed_count:      number   // filed or assessed this tax year
  in_progress:      number   // collecting | in_progress | review
  blocked_returns:  number
  waiting_on_client: number
  ready_for_review: number
  ready_to_file:    number
  outstanding_fees: number   // sum of unpaid fees
}

export type PracticeQueueName =
  | 'Needs triage'
  | 'Waiting on client'
  | 'Ready to prepare'
  | 'Ready for review'
  | 'Ready to file'
  | 'Filed'
  | 'SARS follow-up'

export interface PracticeTeamMember {
  id:         string
  full_name:  string | null
  email:      string
  org_role:   string | null
}

export interface PracticeDashboardRow {
  client: Pick<KlippaPracticeClient, 'id' | 'full_name' | 'email' | 'tax_number' | 'entity_type' | 'client_user_id'>
  return: KlippaPracticeReturn
  queue: PracticeQueueName
  readiness: PracticeReadinessScore
  received_documents: number
  total_documents:    number
  assignees: {
    owner:    PracticeTeamMember | null
    preparer: PracticeTeamMember | null
    reviewer: PracticeTeamMember | null
  }
}

export interface KlippaPracticeActivityEvent {
  id:             string
  organisation_id: string
  client_id:      string
  return_id:      string | null
  actor_user_id:  string | null
  event_type:     string
  event_label:    string
  detail:         string | null
  metadata:       Record<string, unknown> | null
  created_at:     string
  actor_name?:    string | null
}

export interface KlippaPracticeChecklistTemplate {
  id:              string
  organisation_id: string | null
  name:            string
  return_type:     ClientReturnType
  entity_type:     ClientEntityType | null
  description:     string | null
  checklist:       ChecklistItem[]
  reminder_cadence_days: number | null
  created_by:      string | null
  created_at:      string
  updated_at:      string
}

export interface KlippaPracticeReminderEvent {
  id:              string
  organisation_id: string
  client_id:       string
  return_id:       string
  channel:         'email'
  recipient_email: string | null
  template_name:   string | null
  sent_by:         string | null
  sent_at:         string
}

// ── Tier Feature Config ────────────────────────────────────

export interface KlippaTierFeature {
  id:          string
  tier:        SubscriptionTier
  feature_key: 'timesheets' | 'logbook' | 'provisional' | 'invest_basic' | 'invest_full'
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
  // FINscope Invest extensions (optional — defaults to 0)
  dividendIncome?:      number    // gross SA dividends received in tax year
  capitalGains?:        number    // net realised gains, excluding TFSA holdings
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
  // FINscope Invest additions
  dwtOnDividends:       number    // 20% of dividendIncome (Section 64J)
  taxableCapitalGain:   number    // capital gain included in taxable income after exclusion/inclusion rate
  cgtPayable:           number    // (capitalGains − 40 000) × 0.40 × marginalRate
  investTaxPayable:     number    // dwtOnDividends + cgtPayable
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
  freelance:      'Client or freelance work',
  salary:         'Job or payslip income',
  interest:       'Bank interest',
  dividends:      'Share or ETF payouts',
  capital_gains:  'Sold an investment or asset',
  foreign_income: 'Money from outside SA',
  crypto:         'Crypto sale or trading profit',
  rental:         'Rent from property',
  commission:     'Commission earned',
  other:          'Other money received',
}

export const WORK_LOCATION_LABELS: Record<WorkLocation, string> = {
  home_only:   'Fully Remote (Home Only)',
  hybrid:      'Hybrid (Home + Office)',
  office_only: 'Office / On-site Only',
}

// Client entertainment is only 50% deductible per SARS
// ── Feature Flags (shared between AppNav and invest pages) ──

export interface FeatureFlags {
  timesheets:      boolean
  logbook:         boolean
  provisional:     boolean
  is_org_user?:    boolean
  invest_basic?:   boolean
  invest_enabled?: boolean
}

// ── FINscope Invest Types ──────────────────────────────────

export interface InvestCompany {
  code:           string
  name:           string
  sector:         string | null
  industry:       string | null
  listed_at:      string | null
  fiscal_year_end: string | null
  auditor:        string | null
  market_cap_zar: number | null
  is_altx:        boolean
  yahoo_ticker?:  string | null
  is_tracked?:    boolean
  last_synced_at?: string | null
  updated_at:     string
}

export interface InvestFinancials {
  company_code:      string
  fiscal_year:       number
  income_statement:  Record<string, unknown>
  balance_sheet:     Record<string, unknown>
  cash_flow:         Record<string, unknown>
  source:            'sharedata' | 'manual' | 'pdf_extract' | 'yahoo_finance'
  ingested_at:       string
}

export interface InvestAnalysisRun {
  id:                  string
  company_code:        string
  fiscal_year_range:   string
  module_outputs:      Record<string, unknown>
  ai_commentary:       Record<string, unknown>
  health_score:        number | null
  going_concern_score: number | null
  computed_at:         string
}

export interface InvestWatchlistEntry {
  user_id:             string
  company_code:        string
  added_at:            string
  sens_alerts_enabled: boolean
  company?:            InvestCompany
}

export interface InvestPortfolio {
  id:         string
  user_id:    string
  name:       string
  created_at: string
  holdings?:  InvestHolding[]
}

export interface InvestHolding {
  id:               string
  user_id:          string
  portfolio_id:     string
  company_code:     string
  shares:           number
  cost_basis_zar:   number
  acquired_at:      string
  in_tfsa:          boolean
  closed_at:        string | null
  closed_price_zar: number | null
  company?:         InvestCompany
}

export interface InvestSensEvent {
  id:                       string
  company_code:             string
  sens_id:                  string
  category:                 string | null
  published_at:             string
  pdf_url:                  string | null
  extracted_payload:        Record<string, unknown> | null
  re_analysis_triggered_at: string | null
  alerts_dispatched_at:     string | null
  alerts_dispatched_count:  number | null
  company?:                 InvestCompany
}

export type InvestPhilosophy = 'buffett' | 'lynch' | 'pabrai' | 'graham' | 'greenblatt'

export const INVEST_PHILOSOPHY_LABELS: Record<InvestPhilosophy, string> = {
  buffett:    'Warren Buffett',
  lynch:      'Peter Lynch',
  pabrai:     'Mohnish Pabrai',
  graham:     'Benjamin Graham',
  greenblatt: 'Joel Greenblatt',
}

export const INVEST_PHILOSOPHY_TAGLINES: Record<InvestPhilosophy, string> = {
  buffett:    'Wonderful companies at fair prices — held forever',
  lynch:      'Invest in what you know; find growth before Wall Street does',
  pabrai:     'Shameless cloning of the best ideas; heads I win, tails I don\'t lose much',
  graham:     'Margin of safety above all — price is what you pay, value is what you get',
  greenblatt: 'Magic Formula: high earnings yield + high return on capital',
}

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

// ============================================================
// Freelancer invoicing (migration 021)
// ============================================================

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export interface KlippaFreelancerClient {
  id:             string
  user_id:        string
  name:           string
  contact_person: string | null
  email:          string | null
  phone:          string | null
  vat_number:     string | null
  address:        string | null
  notes:          string | null
  status:         'active' | 'archived'
  created_at:     string
  updated_at:     string
}

export interface KlippaInvoiceItem {
  id:          string
  invoice_id:  string
  user_id:     string
  description: string
  quantity:    number
  unit_price:  number
  amount:      number
  sort_order:  number
}

export interface KlippaInvoice {
  id:                string
  user_id:           string
  client_id:         string
  invoice_number:    number
  status:            InvoiceStatus
  issue_date:        string
  due_date:          string | null
  currency:          string
  vat_enabled:       boolean
  vat_rate:          number
  subtotal:          number
  vat_amount:        number
  total:             number
  notes:             string | null
  payment_reference: string | null
  sent_at:           string | null
  paid_at:           string | null
  income_record_id:  string | null
  created_at:        string
  updated_at:        string
  // Joined
  client?:           KlippaFreelancerClient
  items?:            KlippaInvoiceItem[]
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:     'Draft',
  sent:      'Sent',
  paid:      'Paid',
  overdue:   'Overdue',
  cancelled: 'Cancelled',
}

// ============================================================
// Recurring income/expense templates (migration 021)
// ============================================================

export interface KlippaRecurringTemplate {
  id:                    string
  user_id:               string
  kind:                  'income' | 'expense'
  source_name:           string | null
  income_type:           IncomeType | null
  category:              ExpenseCategory | null
  amount:                number
  description:           string | null
  deductible_percentage: number
  day_of_month:          number
  active:                boolean
  next_run:              string
  last_run:              string | null
  created_at:            string
}
