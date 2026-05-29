'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import {
  ShieldCheck, Check, ChevronRight, ChevronLeft, Loader2,
  FileText, ClipboardList, ExternalLink, Download, AlertCircle
} from 'lucide-react'
import type { KlippaProfile, KlippaTaxReturn, KlippaIncomeRecord, KlippaExpenseRecord, KlippaMileageTrip } from '@/lib/types'
import { calculateTax, ageFromDob, SARS_INCOME_CODES, SARS_DEDUCTION_CODES, getITR12Deadline } from '@/lib/tax-engine'
import { INCOME_TYPE_LABELS, EXPENSE_CATEGORY_LABELS } from '@/lib/types'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}

const STEPS = ['Review', 'Cheat Sheet', 'eFiling Guide', 'Checklist', 'Submit']

interface FilingData {
  profile:       KlippaProfile
  taxReturn:     KlippaTaxReturn
  incomeRecords: KlippaIncomeRecord[]
  expenseRecords: KlippaExpenseRecord[]
  mileageTrips:  KlippaMileageTrip[]
}

export default function FilingPage() {
  const [step,   setStep]   = useState(0)
  const [data,   setData]   = useState<FilingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sarsRef, setSarsRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

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

    const [incRes, expRes, mileRes] = await Promise.all([
      supabase.from('klippa_income_records').select('*').eq('tax_return_id', taxReturn.id).order('received_date', { ascending: false }),
      supabase.from('klippa_expense_records').select('*').eq('tax_return_id', taxReturn.id).eq('classification_status', 'confirmed'),
      supabase.from('klippa_mileage_trips').select('*').eq('tax_return_id', taxReturn.id),
    ])

    setData({
      profile,
      taxReturn,
      incomeRecords:  (incRes.data ?? []) as KlippaIncomeRecord[],
      expenseRecords: (expRes.data ?? []) as KlippaExpenseRecord[],
      mileageTrips:   (mileRes.data ?? []) as KlippaMileageTrip[],
    })
    setSarsRef(taxReturn.sars_reference ?? '')
    setSubmitted(taxReturn.status === 'submitted')
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
      <div className="min-h-screen bg-zinc-950">
        <FilingNav step={-1} totalSteps={5} onPrev={() => {}} onNext={() => {}} canNext={false} />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <FilingNav step={-1} totalSteps={5} onPrev={() => {}} onNext={() => {}} canNext={false} />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-zinc-300">No tax return found. Please complete onboarding first.</p>
          <Link href="/onboarding" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Start onboarding</Link>
        </div>
      </div>
    )
  }

  const { profile, taxReturn, incomeRecords, expenseRecords, mileageTrips } = data
  const totalIncome       = incomeRecords.reduce((s, r) => s + r.amount, 0)
  const totalDeductible   = expenseRecords.reduce((s, r) => s + r.deductible_amount, 0)
  const businessKm        = mileageTrips.filter(t => t.trip_type === 'business').reduce((s, t) => s + t.distance_km, 0)
  const totalKm           = mileageTrips.reduce((s, t) => s + t.distance_km, 0)
  const interestIncome    = incomeRecords.filter(r => r.income_type === 'interest').reduce((s, r) => s + r.amount, 0)

  const taxResult = calculateTax({
    grossIncome:          totalIncome,
    raContributions:      profile.has_ra ? Math.min(profile.ra_contributions ?? 0, totalIncome * 0.275, 350_000) : 0,
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
    employeesTaxPaid:     taxReturn.employees_tax_paid ?? 0,
    taxYear:              taxReturn.tax_year,
  })

  const deadline = getITR12Deadline(taxReturn.tax_year)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/[0.05] blur-[100px] rounded-full" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/dashboard"  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Dashboard</Link>
            <Link href="/income"      className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Income</Link>
            <Link href="/expenses"    className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Expenses</Link>
            <Link href="/documents"   className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Documents</Link>
            <Link href="/provisional" className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Provisional</Link>
            <span className="px-3 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-500/10 font-medium">File Return</span>
          </nav>
          <div className="ml-auto"><UserNav /></div>
        </div>
      </header>

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
                      ? 'bg-zinc-800 text-emerald-400 cursor-pointer hover:bg-zinc-700'
                      : 'bg-zinc-900 text-zinc-600 cursor-default'
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`w-6 h-px ${i < step ? 'bg-emerald-500' : 'bg-zinc-800'}`} />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Review ──────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">Review your return</h1>
              <p className="text-sm text-zinc-500 mt-1">Tax year {taxReturn.tax_year} · ITR12 · Filing deadline {deadline.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800">
              <SectionRow label="Income records" value={`${incomeRecords.length} records`} sub={formatRand(totalIncome)} href="/income" />
              <SectionRow label="Confirmed expenses" value={`${expenseRecords.length} records`} sub={`${formatRand(totalDeductible)} deductible`} href="/expenses" />
              <SectionRow label="Taxable income" value={formatRand(taxResult.taxableIncome)} />
              <SectionRow label="Tax payable" value={formatRand(taxResult.taxPayable)} highlight />
            </div>

            {incomeRecords.length === 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No income records yet. <Link href="/income" className="underline">Add income</Link> before filing.
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all"
              >
                Continue to cheat sheet <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Cheat Sheet ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">Your eFiling cheat sheet</h1>
              <p className="text-sm text-zinc-500 mt-1">Enter these exact values on SARS eFiling. Copy each line into the corresponding field on your ITR12.</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Income (ITR12 — Local income)</p>
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

              <div className="px-4 py-3 bg-zinc-900/60 border-t border-b border-zinc-800 mt-2">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Deductions</p>
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
                  <div className="px-4 py-3 bg-zinc-900/60 border-t border-b border-zinc-800 mt-2">
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Credits</p>
                  </div>
                  <CheatRow code={SARS_DEDUCTION_CODES.employees_tax.code} label={SARS_DEDUCTION_CODES.employees_tax.label} value={`− ${formatRand(taxResult.employeesTaxPaid)}`} />
                </>
              )}

              <div className="px-4 py-3 bg-zinc-800/60 border-t border-zinc-700">
                <div className="flex justify-between text-sm font-bold text-white">
                  <span>Net tax payable</span>
                  <span className={taxResult.netTaxPayable > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {taxResult.netTaxPayable > 0 ? formatRand(taxResult.netTaxPayable) : `Refund ${formatRand(Math.abs(taxResult.netTaxPayable))}`}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-600">These values are based on the 2024/2025 SARS tax tables and the information you&apos;ve entered. Always verify against your actual documents before submitting.</p>

            <StepNav onPrev={() => setStep(0)} onNext={() => setStep(2)} />
          </div>
        )}

        {/* ── Step 2: eFiling guide ───────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">eFiling walkthrough</h1>
              <p className="text-sm text-zinc-500 mt-1">Follow these steps on the SARS eFiling portal to submit your ITR12.</p>
            </div>

            <div className="space-y-4">
              {[
                { n: '01', title: 'Log in to SARS eFiling', body: 'Go to secure.sarsefiling.co.za and log in with your username and password. If you haven\'t registered, click "Register" and complete the process.', link: 'https://secure.sarsefiling.co.za/app/login', linkLabel: 'Open eFiling portal' },
                { n: '02', title: 'Select "Returns" → "Returns Issued" → "Personal Income Tax (ITR12)"', body: 'From your dashboard, navigate to the Returns menu. Find the ITR12 for the current tax year and click "Open."' },
                { n: '03', title: 'Enter your income', body: `In the "Income" section, find "Local income" and enter your freelance/consulting income. Use the values from your cheat sheet:\n• Code 3699 (Freelance): ${formatRand(totalIncome)}` },
                { n: '04', title: 'Enter your deductions', body: `In the "Deductions" section, enter your business expense deductions:\n${taxResult.section11fRa > 0 ? `• Code 4001 (RA / Section 11F): ${formatRand(taxResult.section11fRa)}\n` : ''}${taxResult.homeOffice > 0 ? `• Code 4011 (Home office): ${formatRand(taxResult.homeOffice)}\n` : ''}${taxResult.travel > 0 ? `• Code 4016 (Travel — fixed cost): ${formatRand(taxResult.travel)}\n` : ''}${taxResult.otherDeductions > 0 ? `• Code 4018 (Other business expenses): ${formatRand(taxResult.otherDeductions)}` : ''}` },
                { n: '05', title: 'Review the calculated tax', body: 'SARS eFiling will automatically calculate your tax. Compare it against your cheat sheet. If the figures differ significantly, review your entries.' },
                { n: '06', title: 'Submit your return', body: 'Once satisfied, click "File Return" and confirm. Save your SARS reference number — you\'ll need it in the next step.' },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border border-zinc-800 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-black text-zinc-800 leading-none flex-shrink-0">{s.n}</span>
                    <div className="space-y-1 flex-1">
                      <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
                      <p className="text-sm text-zinc-500 leading-relaxed whitespace-pre-line">{s.body}</p>
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

            <StepNav onPrev={() => setStep(1)} onNext={() => setStep(3)} />
          </div>
        )}

        {/* ── Step 3: Document checklist ──────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-white">Document checklist</h1>
              <p className="text-sm text-zinc-500 mt-1">Keep these documents for 5 years in case SARS audits your return. Do not submit them unless SARS specifically asks.</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
              {[
                { label: 'Proof of all freelance income',          required: true },
                { label: 'Bank statements for the full tax year',   required: true },
                { label: 'All receipts for claimed expenses',       required: expenseRecords.length > 0 },
                { label: 'RA certificate from your fund provider',  required: profile.has_ra },
                { label: 'Home office floor plan or photos',        required: profile.works_from_home },
                { label: 'Vehicle logbook (business km)',           required: profile.has_vehicle },
                { label: 'IRP5 from any employer (if applicable)',  required: profile.employment_type !== 'freelance' },
              ].filter((i) => i.required).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-4 h-4 rounded-full border-2 border-emerald-500/50 flex-shrink-0" />
                  <p className="text-sm text-zinc-300">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3">
              <p className="text-sm text-amber-200 font-medium">SARS retention rule</p>
              <p className="text-xs text-amber-300/70 mt-0.5">Keep all supporting documents for at least 5 years after your assessment date.</p>
            </div>

            <StepNav onPrev={() => setStep(2)} onNext={() => setStep(4)} />
          </div>
        )}

        {/* ── Step 4: Submission record ───────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            {submitted ? (
              <div className="space-y-6 text-center py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Return submitted</h1>
                  <p className="text-sm text-zinc-500 mt-1">Tax year {taxReturn.tax_year}</p>
                </div>
                {sarsRef && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 inline-block">
                    <p className="text-xs text-zinc-500">SARS reference number</p>
                    <p className="text-lg font-mono font-bold text-zinc-100 mt-0.5">{sarsRef}</p>
                  </div>
                )}
                <p className="text-sm text-zinc-500">SARS will assess your return and notify you of the outcome. Check your eFiling dashboard for status updates.</p>
                <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-all">
                  Back to dashboard
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h1 className="text-xl font-bold text-white">Record your submission</h1>
                  <p className="text-sm text-zinc-500 mt-1">After filing on eFiling, enter your SARS reference number here to mark your return as submitted.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-zinc-400">SARS reference number</label>
                  <input
                    type="text"
                    value={sarsRef}
                    onChange={(e) => setSarsRef(e.target.value)}
                    placeholder="e.g. 12345678901234"
                    className="input w-full font-mono"
                  />
                  <p className="text-xs text-zinc-600">Found on your SARS eFiling confirmation page after submission.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors">
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
      <button onClick={onPrev} disabled={step === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-0 transition-colors">
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
      <button onClick={onPrev} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </button>
      <button onClick={onNext} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all">
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

function CheatRow({ code, label, value }: { code: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0">
      <span className="font-mono text-xs text-zinc-500 w-12 flex-shrink-0">{code}</span>
      <span className="flex-1 text-sm text-zinc-300">{label}</span>
      <span className="font-bold text-zinc-100 tabular-nums">{value}</span>
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
        <p className={`text-sm ${highlight ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>{label}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`tabular-nums ${highlight ? 'font-bold text-emerald-400' : 'text-zinc-300'}`}>{value}</span>
        {href && <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
      </div>
    </div>
  )
  if (href) return <Link href={href} className="block hover:bg-zinc-900/30 transition-colors">{content}</Link>
  return content
}

