'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import {
  ShieldCheck, AlertCircle, Clock, ChevronRight, ExternalLink,
  CheckCircle2, Info, Calculator
} from 'lucide-react'
import type { KlippaProfile } from '@/lib/types'
import {
  calculateTax, ageFromDob, getIRP6Deadlines, daysUntilDeadline,
  currentRunningTaxYear, PROVISIONAL_TAX_THRESHOLD
} from '@/lib/tax-engine'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}

function DeadlineCard({
  label,
  date,
  amount,
  sub,
  paid,
  onTogglePaid,
}: {
  label:         string
  date:          Date
  amount:        number
  sub:           string
  paid:          boolean
  onTogglePaid:  () => void
}) {
  const days    = daysUntilDeadline(date)
  const overdue = days < 0
  const soon    = days >= 0 && days <= 30

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${
      paid
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : overdue
          ? 'border-red-500/30 bg-red-500/5'
          : soon
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-zinc-800 bg-zinc-900/40'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
          <p className="text-sm font-medium text-zinc-200">
            {date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {!paid && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${
              overdue ? 'text-red-400' : soon ? 'text-amber-400' : 'text-zinc-500'
            }`}>
              <Clock className="w-3 h-3" />
              {overdue
                ? `${Math.abs(days)} days overdue`
                : days === 0
                  ? 'Due today'
                  : `${days} days away`}
            </div>
          )}
        </div>
        <button
          onClick={onTogglePaid}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0 ${
            paid
              ? 'bg-emerald-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {paid ? 'Paid ✓' : 'Mark paid'}
        </button>
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{formatRand(amount)}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

export default function ProvisionalPage() {
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [estimatedIncome, setEstimatedIncome] = useState(0)
  const [rawEstimate,  setRawEstimate]  = useState('')
  const [firstPaid,    setFirstPaid]    = useState(false)
  const [secondPaid,   setSecondPaid]   = useState(false)

  const runningYear = currentRunningTaxYear()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load profile
    const { data: profileData } = await supabase
      .from('klippa_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileData) {
      setProfile(profileData as KlippaProfile)
    }

    // Pre-populate estimate from the most recent year's income
    const { data: returnData } = await supabase
      .from('klippa_tax_returns')
      .select('id, tax_year')
      .eq('user_id', user.id)
      .order('tax_year', { ascending: false })
      .limit(1)
      .single()

    if (returnData) {
      const { data: incomeData } = await supabase
        .from('klippa_income_records')
        .select('amount')
        .eq('tax_return_id', returnData.id)

      const total = (incomeData ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
      if (total > 0) {
        setEstimatedIncome(total)
        setRawEstimate(String(Math.round(total)))
      }
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const deadlines = getIRP6Deadlines(runningYear)

  // Tax calculation on estimated income
  const taxResult = profile && estimatedIncome > 0
    ? calculateTax({
        grossIncome:          estimatedIncome,
        raContributions:      profile.has_ra ? Math.min(profile.ra_contributions ?? 0, estimatedIncome * 0.275, 350_000) : 0,
        pensionContributions: profile.has_pension ? (profile.pension_contributions ?? 0) : 0,
        homeofficePct:        profile.works_from_home ? profile.home_office_pct : 0,
        homeExpenses:         profile.works_from_home ? (profile.home_expenses_annual ?? 0) : 0,
        businessKm:           0,
        totalKm:              0,
        vehicleValue:         profile.vehicle_value ?? 0,
        medicalAidMembers:    profile.has_medical ? (profile.medical_aid_members ?? 1) : 0,
        interestIncome:       0,
        otherDeductions:      0,
        age:                  ageFromDob(profile.date_of_birth ?? null),
        employeesTaxPaid:     0,
        taxYear:              runningYear,
      })
    : null

  const annualTax     = taxResult?.netTaxPayable ?? 0
  const firstPayment  = annualTax > 0 ? Math.ceil(annualTax * 0.5) : 0
  const secondPayment = annualTax > 0 ? annualTax - (firstPaid ? firstPayment : 0) : 0

  const needsProvisional =
    profile &&
    profile.employment_type !== 'employee' &&
    estimatedIncome > PROVISIONAL_TAX_THRESHOLD

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <ProvisionalNav active />
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/[0.04] blur-[100px] rounded-full" />
      </div>

      <ProvisionalNav active />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Provisional Tax (IRP6)</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Tax year {runningYear} · 1 March {runningYear - 1} – 28 February {runningYear}
          </p>
        </div>

        {/* What is provisional tax */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">What is provisional tax?</p>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            If you earn income outside a regular salary (freelance, consulting, rental, commission),
            SARS requires you to pay your estimated annual tax in two instalments — one mid-year and one at year end.
            This prevents a large lump-sum payment at assessment time.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {[
              { label: 'Who must register', value: 'Any person with non-employment taxable income above R30,000/year' },
              { label: 'First payment', value: 'By 31 August — 50% of estimated annual tax' },
              { label: 'Second payment', value: 'By 28 February — balance of estimated annual tax' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-zinc-400">{item.label}</p>
                <p className="text-xs text-zinc-300 leading-relaxed">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Registration status */}
        {profile && !needsProvisional && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-400">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-500" />
            Based on your profile (employee income only), you may not be required to register as a provisional taxpayer.
            If you have any freelance or other non-employment income, provisional tax applies.
          </div>
        )}

        {/* Income estimate input */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Estimate your annual income for tax year {runningYear}
            </p>
          </div>
          <p className="text-sm text-zinc-500">
            Pre-filled from your most recent year&apos;s records. Adjust if your expected income this year is different.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Estimated gross income (R)</label>
            <input
              type="number"
              className="input w-full font-mono text-lg"
              value={rawEstimate}
              placeholder="e.g. 480000"
              onChange={(e) => {
                setRawEstimate(e.target.value)
                const n = parseFloat(e.target.value)
                if (!isNaN(n) && n >= 0) setEstimatedIncome(n)
              }}
              onFocus={(e) => e.target.select()}
            />
          </div>

          {taxResult && (
            <div className="rounded-xl bg-zinc-800/60 divide-y divide-zinc-700/50">
              <div className="flex justify-between px-4 py-2.5 text-sm text-zinc-400">
                <span>Estimated taxable income</span>
                <span className="tabular-nums text-zinc-200">{formatRand(taxResult.taxableIncome)}</span>
              </div>
              {taxResult.section11fRa > 0 && (
                <div className="flex justify-between px-4 py-2.5 text-sm text-zinc-500">
                  <span>RA deduction</span>
                  <span className="tabular-nums">− {formatRand(taxResult.section11fRa)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2.5 text-sm text-zinc-400">
                <span>Estimated annual tax payable</span>
                <span className="tabular-nums font-semibold text-amber-400">{formatRand(taxResult.netTaxPayable)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Payment cards */}
        {taxResult && annualTax > 0 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Your payment schedule</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DeadlineCard
                label="First provisional payment"
                date={deadlines.first}
                amount={firstPayment}
                sub={`50% of your estimated annual tax of ${formatRand(annualTax)}`}
                paid={firstPaid}
                onTogglePaid={() => setFirstPaid(v => !v)}
              />
              <DeadlineCard
                label="Second provisional payment"
                date={deadlines.second}
                amount={secondPayment}
                sub={firstPaid ? 'Remaining balance after first payment' : 'Remaining balance (mark first payment as paid to update)'}
                paid={secondPaid}
                onTogglePaid={() => setSecondPaid(v => !v)}
              />
            </div>
            <div className="flex items-start gap-2 text-xs text-zinc-600 px-1">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                These are estimates only. Your actual payment may differ based on your final income.
                SARS allows a third top-up payment by 30 September after year end.
                Always verify on your eFiling account before paying.
              </span>
            </div>
          </div>
        )}

        {/* Penalised if underpaid */}
        {taxResult && annualTax > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-amber-300">Underestimation penalty</p>
            <p className="text-xs text-amber-300/70 leading-relaxed">
              If your second provisional payment is less than 80% of the actual tax liability,
              SARS charges a 20% penalty on the shortfall. Keep your estimate accurate —
              it is better to slightly overpay (you&apos;ll receive a refund on assessment).
            </p>
          </div>
        )}

        {/* How to pay */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">How to pay on SARS eFiling</p>
          <div className="space-y-3">
            {[
              'Log in to secure.sarsefiling.co.za',
              'Navigate to Returns → Returns Issued → Provisional Tax (IRP6)',
              'Select the correct tax year period',
              'Enter your estimated income and confirm the calculated amount',
              'Use the SARS payment options (EFT or eFiling) to make the payment',
              'Save your payment receipt for your records',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-xs font-bold text-zinc-700 w-5 flex-shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-sm text-zinc-400 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
          <a
            href="https://secure.sarsefiling.co.za/app/login"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all mt-1"
          >
            Open SARS eFiling <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Link to ITR12 */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div>
            <p className="text-sm font-medium text-zinc-300">Ready to file your annual return?</p>
            <p className="text-xs text-zinc-500 mt-0.5">After year end, file your ITR12 to settle the final tax assessment.</p>
          </div>
          <Link
            href="/filing"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all flex-shrink-0"
          >
            File Return <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

      </main>
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────

function ProvisionalNav({ active }: { active?: boolean }) {
  return (
    <header className="relative z-10 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Klippa</span>
        </Link>
        <nav className="flex items-center gap-1 ml-4">
          <Link href="/dashboard"   className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Dashboard</Link>
          <Link href="/income"      className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Income</Link>
          <Link href="/expenses"    className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Expenses</Link>
          <Link href="/documents"   className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Documents</Link>
          <span className="px-3 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-500/10 font-medium">Provisional</span>
          <Link href="/filing"      className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">File Return</Link>
        </nav>
        <div className="ml-auto"><UserNav /></div>
      </div>
    </header>
  )
}
