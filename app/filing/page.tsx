'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  Check, ChevronRight, ChevronLeft, Loader2,
  FileText, ClipboardList, ExternalLink, Download, AlertCircle, Lock
} from 'lucide-react'
import type { KlippaProfile, KlippaTaxReturn, KlippaIncomeRecord, KlippaExpenseRecord, KlippaMileageTrip, KlippaDocument, DocumentType } from '@/lib/types'
import { calculateTax, ageFromDob, SARS_INCOME_CODES, SARS_DEDUCTION_CODES, getITR12Deadline } from '@/lib/tax-engine'
import { INCOME_TYPE_LABELS, EXPENSE_CATEGORY_LABELS } from '@/lib/types'
import { isProfessionalOrAbove } from '@/lib/tier'
import { INCOME_TYPE_META, isIncludedInTaxEstimate, needsHumanReview } from '@/lib/sars-return-map'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}

const STEPS = ['Review', 'SARS Preview', 'Field Map', 'eFiling Guide', 'Checklist', 'Submit']

interface FilingData {
  profile:       KlippaProfile
  taxReturn:     KlippaTaxReturn
  incomeRecords: KlippaIncomeRecord[]
  expenseRecords: KlippaExpenseRecord[]
  mileageTrips:  KlippaMileageTrip[]
  documents:     KlippaDocument[]
}

export default function FilingPage() {
  const [step,   setStep]   = useState(0)
  const [data,   setData]   = useState<FilingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sarsRef,    setSarsRef]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [payeInput,  setPayeInput]  = useState(0)
  const [savingPaye, setSavingPaye] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, returnRes] = await Promise.all([
      supabase.from('klippa_profiles').select('*').eq('id', user.id).single(),
      supabase.from('klippa_tax_returns').select('*').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single(),
    ])

    const profile   = profileRes.data as KlippaProfile | null
    const taxReturn = returnRes.data as KlippaTaxReturn | null

    if (!profile || !taxReturn) { setLoading(false); return }

    const [incRes, expRes, mileRes, docRes] = await Promise.all([
      supabase.from('klippa_income_records').select('*').eq('tax_return_id', taxReturn.id).order('received_date', { ascending: false }),
      supabase.from('klippa_expense_records').select('*').eq('tax_return_id', taxReturn.id).eq('classification_status', 'confirmed'),
      supabase.from('klippa_mileage_trips').select('*').eq('tax_return_id', taxReturn.id),
      supabase.from('klippa_documents').select('*').eq('user_id', user.id).or(`tax_return_id.eq.${taxReturn.id},tax_year.eq.${taxReturn.tax_year}`),
    ])

    setData({
      profile,
      taxReturn,
      incomeRecords:  (incRes.data ?? []) as KlippaIncomeRecord[],
      expenseRecords: (expRes.data ?? []) as KlippaExpenseRecord[],
      mileageTrips:   (mileRes.data ?? []) as KlippaMileageTrip[],
      documents:      (docRes.data ?? []) as KlippaDocument[],
    })
    setSarsRef(taxReturn.sars_reference ?? '')
    setSubmitted(taxReturn.status === 'submitted')
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    if (data) setPayeInput(data.taxReturn.employees_tax_paid ?? 0)
  }, [data])

  const savePaye = async (value: number) => {
    if (!data) return
    setSavingPaye(true)
    await supabase
      .from('klippa_tax_returns')
      .update({ employees_tax_paid: value })
      .eq('id', data.taxReturn.id)
    setData(prev => prev ? { ...prev, taxReturn: { ...prev.taxReturn, employees_tax_paid: value } } : null)
    setSavingPaye(false)
  }

  const handleSubmit = async () => {
    if (!data || !sarsRef.trim()) return
    setSubmitting(true)
    await supabase
      .from('klippa_tax_returns')
      .update({ status: 'submitted', sars_reference: sarsRef.trim(), submitted_at: new Date().toISOString() })
      .eq('id', data.taxReturn.id)
    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base">
        <FilingNav step={-1} totalSteps={6} onPrev={() => {}} onNext={() => {}} canNext={false} />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
        </div>
      </div>
    )
  }

  // Gate: ITR12 Filing Wizard is Professional+ only
  if (data && !isProfessionalOrAbove(data.profile)) {
    return (
      <div className="app-shell bg-base">
        <AppNav activePage="filing" />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="rounded-2xl border border-edge bg-surface/40 p-10 flex flex-col items-center text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-raised flex items-center justify-center border border-edge">
              <Lock className="w-6 h-6 text-ink-3" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-ink-1">ITR12 Filing Wizard</h2>
              <p className="text-sm text-ink-2 max-w-sm leading-relaxed">
                Your personalised eFiling cheat sheet, deduction summary and step-by-step filing guide.
                Available on the <strong className="text-ink-1">Premium</strong> plan.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Link
                href="/pricing"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all"
              >
                Upgrade to Premium
              </Link>
              <Link
                href="/dashboard"
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-raised text-ink-2 hover:bg-edge transition-all"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-base">
        <FilingNav step={-1} totalSteps={5} onPrev={() => {}} onNext={() => {}} canNext={false} />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-ink-1">No tax return found. Please complete onboarding first.</p>
          <Link href="/onboarding" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Start onboarding</Link>
        </div>
      </div>
    )
  }

  const { profile, taxReturn, incomeRecords, expenseRecords, mileageTrips, documents } = data
  const totalIncome       = incomeRecords.reduce((s, r) => s + r.amount, 0)
  const taxEstimateIncome = incomeRecords.filter(r => isIncludedInTaxEstimate(r.income_type)).reduce((s, r) => s + r.amount, 0)
  const totalDeductible   = expenseRecords.reduce((s, r) => s + r.deductible_amount, 0)
  const businessKm        = mileageTrips.filter(t => t.trip_type === 'business').reduce((s, t) => s + t.distance_km, 0)
  const totalKm           = mileageTrips.reduce((s, t) => s + t.distance_km, 0)
  const interestIncome    = incomeRecords.filter(r => r.income_type === 'interest').reduce((s, r) => s + r.amount, 0)

  const taxResult = calculateTax({
    grossIncome:          taxEstimateIncome,
    raContributions:      profile.has_ra ? Math.min(profile.ra_contributions ?? 0, taxEstimateIncome * 0.275, 350_000) : 0,
    pensionContributions: profile.has_pension ? (profile.pension_contributions ?? 0) : 0,
    homeofficePct:        profile.works_from_home ? profile.home_office_pct : 0,
    homeExpenses:         profile.works_from_home ? (profile.home_expenses_annual ?? 0) : 0,
    businessKm,
    totalKm,
    vehicleValue:         profile.vehicle_value ?? 0,
    medicalAidMembers:    profile.has_medical ? (profile.medical_aid_members ?? 1) : 0,
    interestIncome,
    otherDeductions:      totalDeductible,
    age:                  ageFromDob(profile.date_of_birth ?? null),
    employeesTaxPaid:     payeInput,
    taxYear:              taxReturn.tax_year,
  })

  const deadline = getITR12Deadline(taxReturn.tax_year)

  return (
    <div className="app-shell bg-base text-ink-1">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/[0.05] blur-[100px] rounded-full" />
      </div>

      <AppNav activePage="filing" />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Step progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  i === step
                    ? 'bg-emerald-600 text-white'
                    : i < step
                      ? 'bg-raised text-emerald-400 cursor-pointer hover:bg-edge'
                      : 'bg-surface text-ink-3 cursor-default'
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`w-6 h-px ${i < step ? 'bg-emerald-500' : 'bg-raised'}`} />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Review ──────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-ink-1">Review your return</h1>
              <p className="text-sm text-ink-2 mt-1">Tax year {taxReturn.tax_year} · ITR12 · Filing deadline {deadline.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>

            <div className="rounded-2xl border border-edge bg-surface/40 divide-y divide-edge">
              <SectionRow label="Income records" value={`${incomeRecords.length} records`} sub={formatRand(totalIncome)} href="/income" />
              <SectionRow label="Confirmed expenses" value={`${expenseRecords.length} records`} sub={`${formatRand(totalDeductible)} deductible`} href="/expenses" />
              {/* PAYE from IRP5 — editable inline */}
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-ink-1">Employees&apos; tax paid (PAYE)</p>
                  <p className="text-xs text-ink-3 mt-0.5">From your IRP5. Leave R0 if fully self-employed.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-3">R</span>
                  <input
                    type="number"
                    value={payeInput}
                    onChange={(e) => setPayeInput(Number(e.target.value) || 0)}
                    onBlur={() => savePaye(payeInput)}
                    className="w-28 text-right bg-raised/60 border border-edge rounded-lg px-2 py-1 text-sm text-ink-1 tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    min={0}
                  />
                  {savingPaye && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-3" />}
                </div>
              </div>
              <SectionRow label="Taxable income" value={formatRand(taxResult.taxableIncome)} />
              <SectionRow label="Tax payable" value={formatRand(taxResult.taxPayable)} highlight />
            </div>

            {/* ── Warning banners ── */}
            {incomeRecords.length === 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No income records yet. <Link href="/income" className="underline ml-1">Add income</Link> before filing.
              </div>
            )}

            {!profile.date_of_birth && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Date of birth not set. Age-based rebates (65 and 75+) may be incorrect.{' '}
                  <Link href="/settings" className="underline">Update in Settings →</Link>
                </span>
              </div>
            )}

            {profile.works_from_home && !profile.home_expenses_annual && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Annual home running costs are R0, so your home office deduction is R0.{' '}
                  <Link href="/settings" className="underline">Update in Settings →</Link>
                </span>
              </div>
            )}

            {profile.employment_type !== 'freelance' && payeInput === 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Your profile indicates salaried employment. If your IRP5 shows PAYE withheld, enter it above so your refund estimate is accurate.</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: SARS Preview ─────────────────────────────── */}
        {step === 1 && (
          <SarsPreview
            profile={profile}
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            taxResult={taxResult}
            payeInput={payeInput}
            businessKm={businessKm}
            taxYear={taxReturn.tax_year}
            documents={documents}
            onPrev={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {/* ── Step 2: Field Map ─────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-ink-1">Your SARS field map</h1>
              <p className="text-sm text-ink-2 mt-1">Use these values when SARS asks for each matching section. The plain wording is what happened in your year; the code is the SARS field behind it.</p>
            </div>

            <div className="rounded-2xl border border-edge overflow-hidden">
              <div className="px-4 py-3 bg-surface/60 border-b border-edge">
                <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Income (ITR12: Local income)</p>
              </div>
              {incomeRecords.reduce((groups, r) => {
                const existing = groups.find((g) => g.type === r.income_type)
                if (existing) existing.amount += r.amount
                else groups.push({ type: r.income_type, amount: r.amount })
                return groups
              }, [] as { type: string; amount: number }[]).map(({ type, amount }) => {
                const sarsCode = SARS_INCOME_CODES[type]
                return (
                  <CheatRow
                    key={type}
                    code={sarsCode?.code ?? '3699'}
                    label={sarsCode?.label ?? INCOME_TYPE_LABELS[type as keyof typeof INCOME_TYPE_LABELS] ?? type}
                    value={formatRand(amount)}
                  />
                )
              })}

              <div className="px-4 py-3 bg-surface/60 border-t border-b border-edge mt-2">
                <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Deductions</p>
              </div>
              {taxResult.section11fRa > 0 && (
                <CheatRow code={SARS_DEDUCTION_CODES.section11f.code} label={SARS_DEDUCTION_CODES.section11f.label} value={formatRand(taxResult.section11fRa)} />
              )}
              {taxResult.homeOffice > 0 && (
                <CheatRow code={SARS_DEDUCTION_CODES.home_office.code} label={SARS_DEDUCTION_CODES.home_office.label} value={formatRand(taxResult.homeOffice)} />
              )}
              {taxResult.travel > 0 && (
                <CheatRow code={SARS_DEDUCTION_CODES.travel.code} label={SARS_DEDUCTION_CODES.travel.label} value={formatRand(taxResult.travel)} />
              )}
              {taxResult.interestExemption > 0 && (
                <CheatRow code={SARS_DEDUCTION_CODES.interest_exempt.code} label={SARS_DEDUCTION_CODES.interest_exempt.label} value={formatRand(taxResult.interestExemption)} />
              )}
              {taxResult.otherDeductions > 0 && (
                <CheatRow code={SARS_DEDUCTION_CODES.other_biz.code} label={SARS_DEDUCTION_CODES.other_biz.label} value={formatRand(taxResult.otherDeductions)} />
              )}

              {taxResult.employeesTaxPaid > 0 && (
                <>
                  <div className="px-4 py-3 bg-surface/60 border-t border-b border-edge mt-2">
                    <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Credits</p>
                  </div>
                  <CheatRow code={SARS_DEDUCTION_CODES.employees_tax.code} label={SARS_DEDUCTION_CODES.employees_tax.label} value={`− ${formatRand(taxResult.employeesTaxPaid)}`} />
                </>
              )}

              <div className="px-4 py-3 bg-raised/60 border-t border-edge">
                <div className="flex justify-between text-sm font-bold text-ink-1">
                  <span>Net tax payable</span>
                  <span className={taxResult.netTaxPayable > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {taxResult.netTaxPayable > 0 ? formatRand(taxResult.netTaxPayable) : `Refund ${formatRand(Math.abs(taxResult.netTaxPayable))}`}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-ink-3">These values are based on the {taxReturn.tax_year} SARS tax tables and the information you&apos;ve entered. Always verify against your actual documents before submitting.</p>

            {incomeRecords.some(r => needsHumanReview(r.income_type)) && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
                <p className="text-sm text-amber-200 font-medium">Some items need extra checking</p>
                <p className="text-xs text-amber-300/75 mt-0.5">Investments, crypto, foreign money, and unusual once-off amounts can need special SARS treatment. Klippa shows them separately so you do not miss them.</p>
              </div>
            )}

            <StepNav onPrev={() => setStep(1)} onNext={() => setStep(3)} />
          </div>
        )}

        {/* ── Step 2: eFiling guide ───────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-ink-1">eFiling walkthrough</h1>
              <p className="text-sm text-ink-2 mt-1">Follow these steps on the SARS eFiling portal to submit your ITR12.</p>
            </div>

            <div className="space-y-4">
              {[
                { n: '01', title: 'Log in to SARS eFiling', body: 'Go to secure.sarsefiling.co.za and log in with your username and password. If you haven\'t registered, click "Register" and complete the process.', link: 'https://secure.sarsefiling.co.za/app/login', linkLabel: 'Open eFiling portal' },
                { n: '02', title: 'Select "Returns" → "Returns Issued" → "Personal Income Tax (ITR12)"', body: 'From your dashboard, navigate to the Returns menu. Find the ITR12 for the current tax year and click "Open."' },
                { n: '03', title: 'Enter your money received', body: `In the income sections, use the values from your field map. Klippa groups each amount by what happened in real life, then shows the SARS code next to it.` },
                { n: '04', title: 'Enter your deductions', body: `In the "Deductions" section, enter your business expense deductions:\n${taxResult.section11fRa > 0 ? `• Code 4001 (RA / Section 11F): ${formatRand(taxResult.section11fRa)}\n` : ''}${taxResult.homeOffice > 0 ? `• Code 4011 (Home office): ${formatRand(taxResult.homeOffice)}\n` : ''}${taxResult.travel > 0 ? `• Code 4016 (Travel, fixed cost): ${formatRand(taxResult.travel)}\n` : ''}${taxResult.otherDeductions > 0 ? `• Code 4018 (Other business expenses): ${formatRand(taxResult.otherDeductions)}` : ''}` },
                { n: '05', title: 'Review the calculated tax', body: 'SARS eFiling will automatically calculate your tax. Compare it against your cheat sheet. If the figures differ significantly, review your entries.' },
                { n: '06', title: 'Submit your return', body: 'Once satisfied, click "File Return" and confirm. Save your SARS reference number. You\'ll need it in the next step.' },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border border-edge p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-black text-edge leading-none flex-shrink-0">{s.n}</span>
                    <div className="space-y-1 flex-1">
                      <h3 className="text-sm font-semibold text-ink-1">{s.title}</h3>
                      <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-line">{s.body}</p>
                      {s.link && (
                        <a
                          href={s.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors mt-1"
                        >
                          {s.linkLabel} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <StepNav onPrev={() => setStep(2)} onNext={() => setStep(4)} />
          </div>
        )}

        {/* ── Step 3: Document checklist ──────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-ink-1">Document checklist</h1>
              <p className="text-sm text-ink-2 mt-1">Keep these documents for 5 years in case SARS audits your return. Do not submit them unless SARS specifically asks.</p>
            </div>

            <div className="rounded-2xl border border-edge divide-y divide-edge overflow-hidden">
              {buildFilingPackChecklist({ profile, incomeRecords, expenseRecords, documents }).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${item.ready ? 'border-emerald-500 bg-emerald-500' : 'border-amber-500/70'}`}>
                    {item.ready && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm text-ink-1">{item.label}</p>
                    <p className="text-xs text-ink-3 mt-0.5">{item.ready ? 'Document found or generated in Klippa' : item.hint}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
              <p className="text-sm text-amber-200 font-medium">SARS retention rule</p>
              <p className="text-xs text-amber-300/70 mt-0.5">Keep all supporting documents for at least 5 years after your assessment date.</p>
            </div>

            <StepNav onPrev={() => setStep(3)} onNext={() => setStep(5)} />
          </div>
        )}

        {/* ── Step 4: Submission record ───────────────────────── */}
        {step === 5 && (
          <div className="space-y-6">
            {submitted ? (
              <div className="space-y-6 text-center py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-ink-1">Return submitted</h1>
                  <p className="text-sm text-ink-2 mt-1">Tax year {taxReturn.tax_year}</p>
                </div>
                {sarsRef && (
                  <div className="rounded-xl border border-edge bg-surface/40 px-4 py-3 inline-block">
                    <p className="text-xs text-ink-2">SARS reference number</p>
                    <p className="text-lg font-mono font-bold text-ink-1 mt-0.5">{sarsRef}</p>
                  </div>
                )}
                <p className="text-sm text-ink-2">SARS will assess your return and notify you of the outcome. Check your eFiling dashboard for status updates.</p>
                <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-raised hover:bg-edge text-ink-1 text-sm font-medium transition-all">
                  Back to dashboard
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h1 className="text-xl font-bold text-ink-1">Record your submission</h1>
                  <p className="text-sm text-ink-2 mt-1">After filing on eFiling, enter your SARS reference number here to mark your return as submitted.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-ink-2">SARS reference number</label>
                  <input
                    type="text"
                    value={sarsRef}
                    onChange={(e) => setSarsRef(e.target.value)}
                    placeholder="e.g. 12345678901234"
                    className="input w-full font-mono"
                  />
                  <p className="text-xs text-ink-3">Found on your SARS eFiling confirmation page after submission.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => setStep(4)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!sarsRef.trim() || submitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {submitting ? 'Saving…' : 'Mark as submitted'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────

function FilingNav({ step, totalSteps, onPrev, onNext, canNext }: {
  step:       number
  totalSteps: number
  onPrev:     () => void
  onNext:     () => void
  canNext:    boolean
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      <button onClick={onPrev} disabled={step === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-raised text-ink-2 hover:bg-edge disabled:opacity-0 transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </button>
      {step < totalSteps - 1 && (
        <button onClick={onNext} disabled={!canNext} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-all">
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function StepNav({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button onClick={onPrev} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </button>
      <button onClick={onNext} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all">
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

type ReturnSectionStatus = 'Ready' | 'Needs document' | 'Needs info' | 'Check carefully' | 'Not applicable'

interface ReturnSection {
  id: string
  section: string
  applies: boolean
  plain: string
  answer: string
  examples: string
  code: string
  sars: string
  value: string
  status: ReturnSectionStatus
  hint: string
  documentTypes: DocumentType[]
  documentNames: string[]
}

interface MissingItem {
  title: string
  detail: string
  href?: string
}

function hasDoc(documents: KlippaDocument[], types: DocumentType[]) {
  return documents.some((d) => types.includes(d.document_type))
}

function docNames(documents: KlippaDocument[], types: DocumentType[]) {
  return documents
    .filter((d) => types.includes(d.document_type))
    .map((d) => d.original_filename || `${d.document_type} document`)
}

function sectionStatus(applies: boolean, hasEvidence: boolean, needsInfo = false, review = false): ReturnSectionStatus {
  if (!applies) return 'Not applicable'
  if (needsInfo) return 'Needs info'
  if (!hasEvidence) return 'Needs document'
  if (review) return 'Check carefully'
  return 'Ready'
}

function buildReturnSections(input: {
  profile: KlippaProfile
  incomeRecords: KlippaIncomeRecord[]
  expenseRecords: KlippaExpenseRecord[]
  documents: KlippaDocument[]
  taxResult: ReturnType<typeof calculateTax>
  payeInput: number
  businessKm: number
}): ReturnSection[] {
  const { profile, incomeRecords, expenseRecords, documents, taxResult, payeInput, businessKm } = input
  const groupedIncome = incomeRecords.reduce((groups, r) => {
    const existing = groups.find((g) => g.type === r.income_type)
    if (existing) existing.amount += r.amount
    else groups.push({ type: r.income_type, amount: r.amount })
    return groups
  }, [] as { type: KlippaIncomeRecord['income_type']; amount: number }[])

  const confirmedExpenseTotal = expenseRecords.reduce((s, r) => s + r.deductible_amount, 0)
  const incomeDocTypes: Partial<Record<KlippaIncomeRecord['income_type'], DocumentType[]>> = {
    salary:         ['irp5'],
    freelance:      ['invoice', 'bank_statement'],
    commission:     ['irp5', 'invoice'],
    rental:         ['bank_statement', 'other'],
    interest:       ['investment_certificate', 'bank_statement'],
    dividends:      ['investment_certificate'],
    capital_gains:  ['investment_certificate'],
    crypto:         ['investment_certificate', 'other'],
    foreign_income: ['invoice', 'bank_statement', 'other'],
    other:          ['bank_statement', 'other'],
  }

  const sections: ReturnSection[] = groupedIncome.map(({ type, amount }) => {
    const meta = INCOME_TYPE_META[type]
    const docs = incomeDocTypes[type] ?? ['other']
    const hasEvidence = hasDoc(documents, docs)
    return {
      id: `income-${type}`,
      section: meta.section,
      applies: true,
      plain: meta.question,
      answer: 'Yes, based on income records you added.',
      examples: meta.examples,
      code: meta.sarsCode,
      sars: meta.sarsLabel,
      value: formatRand(amount),
      status: sectionStatus(true, hasEvidence, false, needsHumanReview(type)),
      hint: meta.documentHint,
      documentTypes: docs,
      documentNames: docNames(documents, docs),
    }
  })

  const addSection = (row: ReturnSection | null) => {
    if (row) sections.push(row)
  }

  addSection(profile.has_ra ? {
    id: 'retirement-ra',
    section: 'Retirement savings',
    applies: true,
    plain: 'Did you pay into your own retirement plan?',
    answer: taxResult.section11fRa > 0 ? 'Yes, an amount is included.' : 'Yes, but no amount has been entered yet.',
    examples: 'Examples: Allan Gray RA, Sygnia RA, 10X RA, Old Mutual RA.',
    code: SARS_DEDUCTION_CODES.section11f.code,
    sars: SARS_DEDUCTION_CODES.section11f.label,
    value: taxResult.section11fRa > 0 ? formatRand(taxResult.section11fRa) : 'R0',
    status: sectionStatus(true, hasDoc(documents, ['ra_certificate']), taxResult.section11fRa === 0),
    hint: 'Upload or keep the retirement tax certificate from your provider.',
    documentTypes: ['ra_certificate'],
    documentNames: docNames(documents, ['ra_certificate']),
  } : null)

  addSection(profile.has_pension ? {
    id: 'retirement-employer',
    section: 'Employer retirement',
    applies: true,
    plain: 'Did your employer take retirement money off your payslip?',
    answer: (profile.pension_contributions ?? 0) > 0 ? 'Yes, an amount is included.' : 'Yes, but no amount has been entered yet.',
    examples: 'Examples: pension fund, provident fund, company retirement fund.',
    code: SARS_DEDUCTION_CODES.pension.code,
    sars: SARS_DEDUCTION_CODES.pension.label,
    value: formatRand(profile.pension_contributions ?? 0),
    status: sectionStatus(true, hasDoc(documents, ['irp5']), (profile.pension_contributions ?? 0) === 0),
    hint: 'This is usually shown on your employer tax certificate.',
    documentTypes: ['irp5'],
    documentNames: docNames(documents, ['irp5']),
  } : null)

  addSection(profile.has_medical ? {
    id: 'medical',
    section: 'Medical aid',
    applies: true,
    plain: 'Did you pay for medical aid?',
    answer: `Yes, ${profile.medical_aid_members || 1} member${(profile.medical_aid_members || 1) === 1 ? '' : 's'} included.`,
    examples: 'Examples: Discovery, Bonitas, Momentum, Medihelp, Bestmed.',
    code: SARS_DEDUCTION_CODES.medical.code,
    sars: SARS_DEDUCTION_CODES.medical.label,
    value: formatRand(taxResult.medicalAidCredits),
    status: sectionStatus(true, hasDoc(documents, ['medical'])),
    hint: 'Upload or keep the medical aid tax certificate for the tax year.',
    documentTypes: ['medical'],
    documentNames: docNames(documents, ['medical']),
  } : null)

  addSection(profile.works_from_home ? {
    id: 'home-office',
    section: 'Working from home',
    applies: true,
    plain: 'Did you work from a dedicated space at home?',
    answer: taxResult.homeOffice > 0 ? 'Yes, a home office amount is included.' : 'Yes, but home costs or percentage are incomplete.',
    examples: 'Examples: separate study, office room, work-only room.',
    code: SARS_DEDUCTION_CODES.home_office.code,
    sars: SARS_DEDUCTION_CODES.home_office.label,
    value: taxResult.homeOffice > 0 ? formatRand(taxResult.homeOffice) : 'R0',
    status: sectionStatus(true, true, taxResult.homeOffice === 0, true),
    hint: 'Keep proof of home costs, floor area, and how you calculated the work percentage.',
    documentTypes: ['other'],
    documentNames: docNames(documents, ['other']),
  } : null)

  addSection(profile.has_vehicle ? {
    id: 'travel',
    section: 'Driving for work',
    applies: true,
    plain: 'Did you drive for work and keep a logbook?',
    answer: taxResult.travel > 0 ? 'Yes, a travel amount is included.' : 'Yes, but vehicle value or kilometres are incomplete.',
    examples: 'Examples: client visits, site trips, business travel.',
    code: SARS_DEDUCTION_CODES.travel.code,
    sars: SARS_DEDUCTION_CODES.travel.label,
    value: taxResult.travel > 0 ? `${formatRand(taxResult.travel)} (${businessKm.toLocaleString('en-ZA')} business km)` : 'R0',
    status: sectionStatus(true, true, taxResult.travel === 0),
    hint: 'Keep the vehicle logbook and opening/closing odometer readings.',
    documentTypes: ['other'],
    documentNames: docNames(documents, ['other']),
  } : null)

  addSection(confirmedExpenseTotal > 0 ? {
    id: 'business-expenses',
    section: 'Business expenses',
    applies: true,
    plain: 'Did you spend money to earn your income?',
    answer: 'Yes, confirmed expenses are included.',
    examples: 'Examples: software, data, equipment, training, bank fees, professional fees.',
    code: SARS_DEDUCTION_CODES.other_biz.code,
    sars: SARS_DEDUCTION_CODES.other_biz.label,
    value: formatRand(confirmedExpenseTotal),
    status: sectionStatus(true, hasDoc(documents, ['receipt', 'invoice', 'bank_statement'])),
    hint: 'Keep receipts and proof that each expense was for work.',
    documentTypes: ['receipt', 'invoice', 'bank_statement'],
    documentNames: docNames(documents, ['receipt', 'invoice', 'bank_statement']),
  } : null)

  addSection(payeInput > 0 || profile.employment_type !== 'freelance' ? {
    id: 'paye',
    section: 'Tax already taken off',
    applies: true,
    plain: 'Did an employer already pay some tax for you?',
    answer: payeInput > 0 ? 'Yes, PAYE is included.' : 'Maybe, but no amount has been entered yet.',
    examples: 'This is the tax deducted from your payslip during the year.',
    code: SARS_DEDUCTION_CODES.employees_tax.code,
    sars: SARS_DEDUCTION_CODES.employees_tax.label,
    value: payeInput > 0 ? formatRand(payeInput) : 'R0',
    status: sectionStatus(true, hasDoc(documents, ['irp5']), payeInput === 0),
    hint: 'Check this against the employer tax certificate.',
    documentTypes: ['irp5'],
    documentNames: docNames(documents, ['irp5']),
  } : null)

  addSection(profile.has_tfsa ? {
    id: 'tfsa',
    section: 'Tax-free savings',
    applies: true,
    plain: 'Do you have a tax-free savings account?',
    answer: 'Yes, keep the statement even if no tax is due on growth.',
    examples: 'Examples: EasyEquities TFSA, bank TFSA, Satrix TFSA.',
    code: 'N/A',
    sars: 'Tax-free investment disclosure / supporting record',
    value: 'No tax amount',
    status: sectionStatus(true, hasDoc(documents, ['investment_certificate', 'bank_statement'])),
    hint: 'Upload or keep the TFSA certificate or annual statement.',
    documentTypes: ['investment_certificate', 'bank_statement'],
    documentNames: docNames(documents, ['investment_certificate', 'bank_statement']),
  } : null)

  return sections
}

function buildMissingItems(sections: ReturnSection[], profile: KlippaProfile, incomeRecords: KlippaIncomeRecord[], payeInput: number): MissingItem[] {
  const missing = sections
    .filter((s) => ['Needs document', 'Needs info', 'Check carefully'].includes(s.status))
    .map((s) => ({
      title: `${s.section}: ${s.status}`,
      detail: s.status === 'Needs document' ? s.hint : `${s.answer} ${s.hint}`,
      href: s.id.startsWith('income-') ? '/income' : s.id === 'paye' || s.id.includes('retirement') || s.id === 'medical' || s.id === 'tfsa' ? '/settings' : undefined,
    }))

  if (profile.has_interest_savings && !incomeRecords.some(r => r.income_type === 'interest')) {
    missing.push({
      title: 'Bank interest amount missing',
      detail: 'You said a bank or savings account pays you interest, but no bank interest amount has been added yet.',
      href: '/income?add=1',
    })
  }
  if (profile.employment_type !== 'freelance' && payeInput === 0) {
    missing.push({
      title: 'Tax already taken off is R0',
      detail: 'If your employer took tax off your payslip, add the full-year amount so the refund or amount due is realistic.',
      href: '/income',
    })
  }

  return missing
}

function buildLifeEvents(sections: ReturnSection[], profile: KlippaProfile) {
  const active = new Set(sections.filter((s) => s.applies).map((s) => s.id))
  return [
    { question: 'Did you have a job where tax was taken off your payslip?', answer: profile.employment_type !== 'freelance' || active.has('income-salary') || active.has('paye') },
    { question: 'Did clients pay you for work you did yourself?', answer: active.has('income-freelance') || profile.employment_type !== 'employee' },
    { question: 'Did a bank or savings account pay you interest?', answer: profile.has_interest_savings || active.has('income-interest') },
    { question: 'Did shares, ETFs, crypto, property, or investments pay out or get sold?', answer: ['income-dividends', 'income-capital_gains', 'income-crypto', 'tfsa'].some((id) => active.has(id)) },
    { question: 'Did someone pay you rent for a property, room, cottage, or Airbnb?', answer: active.has('income-rental') },
    { question: 'Did someone outside South Africa pay you?', answer: active.has('income-foreign_income') },
    { question: 'Did you pay medical aid?', answer: profile.has_medical },
    { question: 'Did you pay into retirement savings?', answer: profile.has_ra || profile.has_pension },
    { question: 'Did you drive for work?', answer: profile.has_vehicle },
    { question: 'Did you work from a dedicated space at home?', answer: profile.works_from_home },
  ]
}

function buildFilingPackChecklist({ profile, incomeRecords, expenseRecords, documents }: {
  profile: KlippaProfile
  incomeRecords: KlippaIncomeRecord[]
  expenseRecords: KlippaExpenseRecord[]
  documents: KlippaDocument[]
}) {
  const investmentIncome = incomeRecords.some(r => ['interest', 'dividends', 'capital_gains', 'crypto'].includes(r.income_type))
  return [
    { label: 'Proof of money clients paid you', required: incomeRecords.some(r => ['freelance', 'commission', 'other'].includes(r.income_type)), ready: hasDoc(documents, ['invoice', 'bank_statement']), hint: 'Upload invoices, bank statements, or proof of payment.' },
    { label: 'Bank statements for the full tax year', required: incomeRecords.length > 0 || expenseRecords.length > 0, ready: hasDoc(documents, ['bank_statement']), hint: 'Upload a bank statement if income or expenses came from your bank account.' },
    { label: 'Receipts for claimed expenses', required: expenseRecords.length > 0, ready: hasDoc(documents, ['receipt', 'invoice']), hint: 'Upload receipts or invoices for expenses you want to claim.' },
    { label: 'Retirement certificate', required: profile.has_ra, ready: hasDoc(documents, ['ra_certificate']), hint: 'Upload the certificate from your retirement provider.' },
    { label: 'Medical aid certificate', required: profile.has_medical, ready: hasDoc(documents, ['medical']), hint: 'Upload the annual certificate from your medical aid.' },
    { label: 'Employer tax certificate', required: profile.employment_type !== 'freelance' || incomeRecords.some(r => r.income_type === 'salary'), ready: hasDoc(documents, ['irp5']), hint: 'Upload the employer tax certificate if you had a job.' },
    { label: 'Bank or investment tax certificate', required: profile.has_interest_savings || profile.has_tfsa || investmentIncome, ready: hasDoc(documents, ['investment_certificate', 'bank_statement']), hint: 'Upload the certificate or statement from your bank or investment app.' },
    { label: 'Vehicle logbook', required: profile.has_vehicle, ready: false, hint: 'Export or keep the Klippa vehicle logbook for SARS.' },
    { label: 'Home office proof', required: profile.works_from_home, ready: false, hint: 'Keep photos, floor area calculation, and home cost proof.' },
  ].filter((item) => item.required)
}

function SarsPreview({ profile, incomeRecords, expenseRecords, documents, taxResult, payeInput, businessKm, taxYear, onPrev, onNext }: {
  profile: KlippaProfile
  incomeRecords: KlippaIncomeRecord[]
  expenseRecords: KlippaExpenseRecord[]
  documents: KlippaDocument[]
  taxResult: ReturnType<typeof calculateTax>
  payeInput: number
  businessKm: number
  taxYear: number
  onPrev: () => void
  onNext: () => void
}) {
  const previewRows = buildReturnSections({ profile, incomeRecords, expenseRecords, documents, taxResult, payeInput, businessKm })
  const missingRows = buildMissingItems(previewRows, profile, incomeRecords, payeInput)
  const lifeEvents = buildLifeEvents(previewRows, profile)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Your SARS return preview</h1>
        <p className="text-sm text-ink-2 mt-1">This is a plain-English mirror of the sections Klippa expects on your ITR12 for tax year {taxYear}.</p>
      </div>

      <div className="rounded-2xl border border-edge bg-surface/30 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-ink-1 uppercase tracking-wider">What happened this year</p>
          <p className="text-xs text-ink-3 mt-0.5">Klippa answers these from your profile and records, then maps them to SARS sections.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {lifeEvents.map((event) => (
            <div key={event.question} className="flex items-start gap-2 rounded-lg bg-raised/50 px-3 py-2">
              <span className={`mt-0.5 inline-flex w-4 h-4 rounded-full items-center justify-center flex-shrink-0 ${event.answer ? 'bg-emerald-500 text-white' : 'border border-edge text-ink-3'}`}>
                {event.answer ? <Check className="w-3 h-3" /> : null}
              </span>
              <p className="text-xs text-ink-2 leading-snug">{event.question}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-edge overflow-hidden">
        <div className="px-4 py-3 bg-surface/60 border-b border-edge">
          <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">What Klippa will help you fill in</p>
        </div>
        {previewRows.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-ink-2">No SARS sections are ready yet. Add income, documents, or profile details first.</p>
          </div>
        ) : previewRows.map((row, i) => (
          <div key={`${row.section}-${i}`} className="px-4 py-4 border-b border-edge/60 last:border-b-0 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink-1">{row.section}</p>
                <p className="text-sm text-ink-2 mt-0.5">{row.plain}</p>
                <p className="text-xs text-emerald-500/80 mt-1">{row.answer}</p>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${row.status === 'Ready' ? 'bg-emerald-500/15 text-emerald-400' : row.status === 'Needs document' || row.status === 'Needs info' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {row.status}
                </span>
                <span className="font-bold text-ink-1 tabular-nums">{row.value}</span>
              </div>
            </div>
            <p className="text-xs text-ink-3">{row.examples}</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-xs">
              <span className="font-mono text-ink-2">SARS {row.code}</span>
              <span className="text-ink-3">{row.sars}</span>
            </div>
            <div className="rounded-lg bg-raised/40 px-3 py-2">
              <p className="text-xs text-ink-2">
                Evidence: {row.documentNames.length > 0 ? row.documentNames.join(', ') : row.hint}
              </p>
            </div>
          </div>
        ))}
      </div>

      {missingRows.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 space-y-2">
          <p className="text-sm text-amber-200 font-medium">Things to check before filing</p>
          {missingRows.map((row, i) => (
            <div key={i} className="flex items-start justify-between gap-3 rounded-lg bg-amber-500/5 px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-amber-200">{row.title}</p>
                <p className="text-xs text-amber-300/80 leading-relaxed mt-0.5">{row.detail}</p>
              </div>
              {row.href && <Link href={row.href} className="text-xs text-amber-200 underline whitespace-nowrap">Fix</Link>}
            </div>
          ))}
        </div>
      )}

      <StepNav onPrev={onPrev} onNext={onNext} />
    </div>
  )
}

function CheatRow({ code, label, value }: { code: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-edge/60 last:border-0">
      <span className="font-mono text-xs text-ink-2 w-12 flex-shrink-0">{code}</span>
      <span className="flex-1 text-sm text-ink-1">{label}</span>
      <span className="font-bold text-ink-1 tabular-nums">{value}</span>
    </div>
  )
}

function SectionRow({ label, value, sub, href, highlight }: {
  label:     string
  value:     string
  sub?:      string
  href?:     string
  highlight?: boolean
}) {
  const content = (
    <div className={`flex items-center justify-between px-4 py-3 ${highlight ? 'bg-emerald-500/5' : ''}`}>
      <div>
        <p className={`text-sm ${highlight ? 'font-semibold text-ink-1' : 'text-ink-1'}`}>{label}</p>
        {sub && <p className="text-xs text-ink-2 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`tabular-nums ${highlight ? 'font-bold text-emerald-400' : 'text-ink-1'}`}>{value}</span>
        {href && <ChevronRight className="w-3.5 h-3.5 text-ink-3" />}
      </div>
    </div>
  )
  if (href) return <Link href={href} className="block hover:bg-surface/30 transition-colors">{content}</Link>
  return content
}
