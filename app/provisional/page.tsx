'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  AlertCircle, Clock, ChevronRight, ExternalLink,
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
            : 'border-edge bg-surface/40'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</p>
          <p className="text-sm font-medium text-ink-1">
            {date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {!paid && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${
              overdue ? 'text-red-400' : soon ? 'text-amber-400' : 'text-ink-2'
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
              : 'bg-raised text-ink-2 hover:bg-edge hover:text-ink-1'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {paid ? 'Paid ✓' : 'Mark paid'}
        </button>
      </div>
      <div>
        <p className="text-2xl font-bold text-ink-1 tabular-nums">{formatRand(amount)}</p>
        <p className="text-xs text-ink-2 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

export default function ProvisionalPage() {
  const [profile,         setProfile]         = useState<KlippaProfile | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [estimatedIncome, setEstimatedIncome] = useState(0)
  const [rawEstimate,     setRawEstimate]     = useState('')
  const [firstPaid,       setFirstPaid]       = useState(false)
  const [secondPaid,      setSecondPaid]       = useState(false)
  const [taxReturnId,     setTaxReturnId]     = useState<string | null>(null)

  const runningYear = currentRunningTaxYear()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profileData } = await supabase
      .from('klippa_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileData) setProfile(profileData as KlippaProfile)

    // Load tax return — including payment status
    const { data: returnData } = await supabase
      .from('klippa_tax_returns')
      .select('id, tax_year, payment1_status, payment2_status')
      .eq('user_id', user.id)
      .order('tax_year', { ascending: false })
      .limit(1)
      .single()

    if (returnData) {
      setTaxReturnId(returnData.id)
      setFirstPaid(returnData.payment1_status === 'paid')
      setSecondPaid(returnData.payment2_status === 'paid')

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

  async function togglePayment(which: 1 | 2) {
    const newStatus = which === 1 ? !firstPaid : !secondPaid
    if (which === 1) setFirstPaid(newStatus)
    else             setSecondPaid(newStatus)

    if (taxReturnId) {
      const field     = which === 1 ? 'payment1_status'  : 'payment2_status'
      const fieldTime = which === 1 ? 'payment1_paid_at' : 'payment2_paid_at'
      await supabase
        .from('klippa_tax_returns')
        .update({
          [field]:     newStatus ? 'paid' : 'unpaid',
          [fieldTime]: newStatus ? new Date().toISOString() : null,
          updated_at:  new Date().toISOString(),
        })
        .eq('id', taxReturnId)
    }
  }

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

  const featureFlags = {
    timesheets:  profile?.feature_timesheets  ?? false,
    logbook:     profile?.feature_logbook     ?? true,
    provisional: profile?.feature_provisional ?? false,
  }

  if (loading) {
    return (
      <div className="app-shell bg-base">
        <AppNav activePage="provisional" featureFlags={featureFlags} />
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell bg-base text-ink-1">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/[0.04] blur-[100px] rounded-full" />
      </div>

      <AppNav activePage="provisional" featureFlags={featureFlags} />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-ink-1">Provisional Tax (IRP6)</h1>
          <p className="text-sm text-ink-2 mt-1">
            Tax year {runningYear} · 1 March {runningYear - 1} – 28 February {runningYear}
          </p>
        </div>

        {/* What is provisional tax */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-ink-2 flex-shrink-0" />
            <p className="text-xs font-semibold text-ink-1 uppercase tracking-wider">What is provisional tax?</p>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed">
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
              <div key={item.label} className="rounded-xl bg-raised/60 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-ink-2">{item.label}</p>
                <p className="text-xs text-ink-1 leading-relaxed">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Registration status */}
        {profile && !needsProvisional && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-edge bg-surface/40 text-sm text-ink-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-500" />
            Based on your profile (employee income only), you may not be required to register as a provisional taxpayer.
            If you have any freelance or other non-employment income, provisional tax applies.
          </div>
        )}

        {/* Income estimate input */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <p className="text-xs font-semibold text-ink-1 uppercase tracking-wider">
              Estimate your annual income for tax year {runningYear}
            </p>
          </div>
          <p className="text-sm text-ink-2">
            Pre-filled from your most recent year&apos;s records. Adjust if your expected income this year is different.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-2">Estimated gross income (R)</label>
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
            <div className="rounded-xl bg-raised/60 divide-y divide-edge/50">
              <div className="flex justify-between px-4 py-2.5 text-sm text-ink-2">
                <span>Estimated taxable income</span>
                <span className="tabular-nums text-ink-1">{formatRand(taxResult.taxableIncome)}</span>
              </div>
              {taxResult.section11fRa > 0 && (
                <div className="flex justify-between px-4 py-2.5 text-sm text-ink-2">
                  <span>RA deduction</span>
                  <span className="tabular-nums">− {formatRand(taxResult.section11fRa)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2.5 text-sm text-ink-2">
                <span>Estimated annual tax payable</span>
                <span className="tabular-nums font-semibold text-amber-400">{formatRand(taxResult.netTaxPayable)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Payment cards */}
        {taxResult && annualTax > 0 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Your payment schedule</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DeadlineCard
                label="First provisional payment"
                date={deadlines.first}
                amount={firstPayment}
                sub={`50% of your estimated annual tax of ${formatRand(annualTax)}`}
                paid={firstPaid}
                onTogglePaid={() => togglePayment(1)}
              />
              <DeadlineCard
                label="Second provisional payment"
                date={deadlines.second}
                amount={secondPayment}
                sub={firstPaid ? 'Remaining balance after first payment' : 'Remaining balance (mark first payment as paid to update)'}
                paid={secondPaid}
                onTogglePaid={() => togglePayment(2)}
              />
            </div>
            <div className="flex items-start gap-2 text-xs text-ink-3 px-1">
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
        <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
          <p className="text-xs font-semibold text-ink-1 uppercase tracking-wider">How to pay on SARS eFiling</p>
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
                <span className="text-xs font-bold text-ink-3 w-5 flex-shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-sm text-ink-2 leading-relaxed">{step}</p>
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
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-edge bg-surface/40">
          <div>
            <p className="text-sm font-medium text-ink-1">Ready to file your annual return?</p>
            <p className="text-xs text-ink-2 mt-0.5">After year end, file your ITR12 to settle the final tax assessment.</p>
          </div>
          <Link
            href="/filing"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-raised hover:bg-edge text-ink-1 text-xs font-semibold transition-all flex-shrink-0"
          >
            File Return <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

      </main>
    </div>
  )
}

