'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import UserNav from '@/components/UserNav'
import {
  ShieldCheck, TrendingUp, AlertCircle, CheckCircle2,
  ChevronRight, ChevronDown, Clock, Plus, FileText, Receipt, ArrowUpRight, Car, Zap,
} from 'lucide-react'
import type { KlippaProfile, KlippaTaxReturn, KlippaIncomeRecord, KlippaExpenseRecord, KlippaMileageTrip } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { calculateTax, ageFromDob, getITR12Deadline, daysUntilDeadline, VAT_THRESHOLD, VAT_WARNING_THRESHOLD } from '@/lib/tax-engine'
import { startOfWeek, addWeeks, isBefore, getISOWeek, getISOWeekYear } from 'date-fns'

function countPendingLogbookWeeks(taxYear: number, reviewedWeekKeys: string[]): number {
  const taxStart = new Date(taxYear - 1, 2, 1)
  const cutoff   = startOfWeek(new Date(), { weekStartsOn: 1 })
  const reviewed = new Set(reviewedWeekKeys)
  let count = 0
  let ws    = startOfWeek(taxStart, { weekStartsOn: 1 })
  while (isBefore(ws, cutoff)) {
    const key = `${getISOWeekYear(ws)}-W${String(getISOWeek(ws)).padStart(2, '0')}`
    if (!reviewed.has(key)) count++
    ws = addWeeks(ws, 1)
  }
  return count
}

function formatRand(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}

function NavBar({ logbookPending }: { logbookPending: number }) {
  return (
    <header className="relative z-30 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Klippa</span>
        </Link>
        <nav className="flex items-center gap-1 ml-4">
          <span className="px-3 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-500/10 font-medium">Dashboard</span>
          <Link href="/income"      className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Income</Link>
          <Link href="/expenses"    className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Expenses</Link>
          <Link href="/documents"   className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Documents</Link>
          <Link href="/provisional" className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Provisional</Link>
          <Link href="/filing"      className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">File Return</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {logbookPending > 0 && (
            <Link
              href="/mileage"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/50 transition-colors text-[11px] text-amber-300 font-medium"
            >
              <AlertCircle className="w-3 h-3" />
              {logbookPending}w logbook
            </Link>
          )}
          <UserNav />
        </div>
      </div>
    </header>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [profile,        setProfile]        = useState<KlippaProfile | null>(null)
  const [taxReturn,      setTaxReturn]      = useState<KlippaTaxReturn | null>(null)
  const [incomeRecords,  setIncomeRecords]  = useState<KlippaIncomeRecord[]>([])
  const [expenseRecords, setExpenseRecords] = useState<KlippaExpenseRecord[]>([])
  const [mileageTrips,   setMileageTrips]   = useState<KlippaMileageTrip[]>([])
  const [logbookPending, setLogbookPending] = useState(0)
  const [userId,         setUserId]         = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [showBreakdown,  setShowBreakdown]  = useState(false)

  const loadData = useCallback(async (uid: string) => {
    const [profileRes, returnRes, reviewsRes] = await Promise.all([
      supabase.from('klippa_profiles').select('*').eq('id', uid).single(),
      supabase.from('klippa_tax_returns').select('*').eq('user_id', uid).order('tax_year', { ascending: false }).limit(1).single(),
      supabase.from('klippa_logbook_reviews').select('review_week').eq('user_id', uid),
    ])

    const prof = profileRes.data as KlippaProfile | null
    const ret  = returnRes.data as KlippaTaxReturn | null

    setProfile(prof)
    setTaxReturn(ret)

    if (prof?.commute_km && prof.commute_km > 0) {
      const reviewedKeys = (reviewsRes.data ?? []).map((r: { review_week: string }) => r.review_week)
      setLogbookPending(countPendingLogbookWeeks(prof.tax_year, reviewedKeys))
    }

    if (ret) {
      const [incRes, expRes, mileRes] = await Promise.all([
        supabase.from('klippa_income_records').select('*').eq('tax_return_id', ret.id).order('created_at', { ascending: false }),
        supabase.from('klippa_expense_records').select('*').eq('tax_return_id', ret.id).eq('classification_status', 'confirmed'),
        supabase.from('klippa_mileage_trips').select('*').eq('tax_return_id', ret.id),
      ])
      setIncomeRecords((incRes.data ?? []) as KlippaIncomeRecord[])
      setExpenseRecords((expRes.data ?? []) as KlippaExpenseRecord[])
      setMileageTrips((mileRes.data ?? []) as KlippaMileageTrip[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      // Belt-and-suspenders onboarding guard — catches the rare case where
      // the middleware couldn't check the profile (e.g. session not yet in cookies).
      supabase
        .from('klippa_profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .single()
        .then(({ data: p }) => {
          if (!p || !p.onboarding_complete) { router.replace('/onboarding'); return }
          loadData(user.id)
        })
    })
  }, [loadData, router])

  useEffect(() => {
    if (!userId || !taxReturn) return
    const channel = supabase
      .channel('klippa_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klippa_income_records', filter: `user_id=eq.${userId}` }, () => loadData(userId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klippa_expense_records', filter: `user_id=eq.${userId}` }, () => loadData(userId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, taxReturn, loadData])

  // ── Calculations ──────────────────────────────────────────

  const totalIncome        = incomeRecords.reduce((s, r) => s + r.amount, 0)
  const totalExpDeductible = expenseRecords.reduce((s, r) => s + r.deductible_amount, 0)

  const dashBusinessKm  = mileageTrips.filter(t => t.trip_type === 'business').reduce((s, t) => s + t.distance_km, 0)
  const dashTotalKm     = mileageTrips.reduce((s, t) => s + t.distance_km, 0)
  const dashInterest    = incomeRecords.filter(r => r.income_type === 'interest').reduce((s, r) => s + r.amount, 0)

  const taxResult = profile
    ? calculateTax({
        grossIncome:          totalIncome,
        raContributions:      profile.has_ra ? Math.min(profile.ra_contributions ?? 0, totalIncome * 0.275, 350_000) : 0,
        pensionContributions: profile.has_pension ? (profile.pension_contributions ?? 0) : 0,
        homeofficePct:        profile.works_from_home ? profile.home_office_pct : 0,
        homeExpenses:         profile.works_from_home ? (profile.home_expenses_annual ?? 0) : 0,
        businessKm:           dashBusinessKm,
        totalKm:              dashTotalKm,
        vehicleValue:         profile.vehicle_value ?? 0,
        medicalAidMembers:    profile.has_medical ? (profile.medical_aid_members ?? 1) : 0,
        interestIncome:       dashInterest,
        otherDeductions:      totalExpDeductible,
        age:                  ageFromDob(profile.date_of_birth ?? null),
        employeesTaxPaid:     taxReturn?.employees_tax_paid ?? 0,
        taxYear:              taxReturn?.tax_year,
      })
    : null

  const taxToSave   = taxResult?.netTaxPayable ?? 0
  const safeToSpend = totalIncome - (taxToSave > 0 ? taxToSave : 0) - totalExpDeductible

  // ── Deadline ──────────────────────────────────────────────

  const taxYear  = taxReturn?.tax_year ?? new Date().getFullYear()
  const deadline = getITR12Deadline(taxYear)
  const daysLeft = daysUntilDeadline(deadline)

  // ── Profile completion ───────────────────────────────────

  const profileCompletion = profile ? calcProfileCompletion(profile) : null

  // ── Return completion % ──────────────────────────────────

  const hasIncome   = incomeRecords.length > 0
  const hasExpenses = expenseRecords.length > 0
  const completionPct = (hasIncome ? 50 : 0) + (hasExpenses ? 30 : 0) + (taxReturn?.status === 'submitted' ? 20 : 0)

  // ── Next action ──────────────────────────────────────────

  function getNextAction(): { label: string; href: string } {
    if (!hasIncome)   return { label: 'Add your first income source',           href: '/income'   }
    if (!hasExpenses) return { label: 'Add and classify your business expenses', href: '/expenses' }
    if (taxReturn?.status === 'draft') return { label: 'Review your return and file', href: '/filing' }
    return { label: 'View your filing status', href: '/filing' }
  }

  const nextAction = getNextAction()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <NavBar logbookPending={0} />
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-600/[0.06] blur-[120px] rounded-full" />
      </div>

      <NavBar logbookPending={logbookPending} />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Tax year {taxYear}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">ITR12 — Freelancer / Consultant</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            daysLeft > 30
              ? 'bg-zinc-800 text-zinc-400'
              : daysLeft > 7
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'bg-red-500/15 text-red-300 border border-red-500/30'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {daysLeft > 0 ? `${daysLeft} days until filing deadline` : 'Filing deadline passed'}
          </div>
        </div>

        {/* Three primary metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Total Earned"
            value={formatRand(totalIncome)}
            sub={`${incomeRecords.length} income records`}
            color="zinc"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <MetricCard
            label="Tax Provision"
            value={formatRand(Math.max(0, taxToSave))}
            sub={taxResult ? `${((taxResult.taxPayable / Math.max(1, totalIncome)) * 100).toFixed(1)}% effective rate — set this aside` : 'Add income to calculate'}
            color="amber"
            icon={<AlertCircle className="w-4 h-4" />}
          />
          <MetricCard
            label="Safe to Spend"
            value={formatRand(Math.max(0, safeToSpend))}
            sub="After tax &amp; business expenses"
            color="emerald"
            icon={<CheckCircle2 className="w-4 h-4" />}
            highlight
          />
        </div>

        {/* Profile completion */}
        {profileCompletion && (
          <ProfileCompletionCard completion={profileCompletion} />
        )}

        {/* Upgrade nudge for free-tier users */}
        {profile && !['starter', 'professional', 'admin'].includes(profile.subscription_tier ?? '') && (
          <Link
            href="/pricing"
            className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-600/30 bg-emerald-950/20 px-5 py-4 hover:bg-emerald-950/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-300">You&apos;re on the free plan</p>
                <p className="text-xs text-zinc-500 mt-0.5">Unlock unlimited expenses, the full filing wizard and audit-readiness tools from R149/mo.</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap group-hover:translate-x-0.5 transition-transform">
              View plans →
            </span>
          </Link>
        )}

        {/* Progress + next action */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Completion */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Return completion</p>
            <div className="space-y-3">
              <CompletionRow label="Income"        done={hasIncome}   pct={50} href="/income"   />
              <CompletionRow label="Expenses"      done={hasExpenses} pct={30} href="/expenses" />
              <CompletionRow label="Filed with SARS" done={taxReturn?.status === 'submitted'} pct={20} href="/filing" />
            </div>
            <div className="pt-1">
              <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                <span>Overall</span>
                <span>{completionPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${completionPct}%` }} />
              </div>
            </div>
          </div>

          {/* Next action */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Next step</p>
              <p className="text-sm font-semibold text-zinc-100 leading-snug">{nextAction.label}</p>
            </div>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Link
                href={nextAction.href}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all"
              >
                Continue <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Quick-add chips — compact single row */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Add income',    href: '/income?add=1',    icon: <Plus      className="w-3.5 h-3.5" /> },
            { label: 'Add expense',   href: '/expenses?add=1',  icon: <Receipt   className="w-3.5 h-3.5" /> },
            { label: 'Upload doc',    href: '/documents?add=1', icon: <FileText  className="w-3.5 h-3.5" /> },
            { label: 'Mileage',       href: '/mileage',         icon: <Car       className="w-3.5 h-3.5" /> },
            { label: 'File return',   href: '/filing',          icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
          ].map((item) => (
            <motion.div key={item.href} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
              <Link
                href={item.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-emerald-500/30 hover:bg-zinc-900 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-all"
              >
                <span className="text-emerald-500">{item.icon}</span>
                {item.label}
              </Link>
            </motion.div>
          ))}
        </div>

        {/* VAT threshold alert */}
        {totalIncome >= VAT_WARNING_THRESHOLD && (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
            totalIncome >= VAT_THRESHOLD
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
          }`}>
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-0.5">
              {totalIncome >= VAT_THRESHOLD ? (
                <>
                  <p className="font-semibold">VAT registration required</p>
                  <p className="text-xs opacity-80">Your income has exceeded the R1,000,000 VAT threshold. You are legally required to register for VAT within 21 days of exceeding it. <a href="https://www.sars.gov.za/businesses-and-employers/vat/how-to-register-for-vat/" target="_blank" rel="noopener noreferrer" className="underline">Register on SARS eFiling →</a></p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Approaching VAT threshold</p>
                  <p className="text-xs opacity-80">You are {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(VAT_THRESHOLD - totalIncome)} away from the R1,000,000 mandatory VAT registration threshold. Start preparing now.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tax breakdown — collapsed by default */}
        {taxResult && totalIncome > 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <button
              onClick={() => setShowBreakdown(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
            >
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tax breakdown estimate</p>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
            </button>

            {showBreakdown && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="px-5 pb-5 space-y-4"
              >
                <div className="space-y-2 text-sm">
                  <BreakdownRow label="Gross income"    value={formatRand(taxResult.grossIncome)} />
                  {taxResult.section11fRa > 0      && <BreakdownRow label="RA deduction (Section 11F)"     value={`− ${formatRand(taxResult.section11fRa)}`}     muted />}
                  {taxResult.homeOffice > 0        && <BreakdownRow label="Home office deduction"          value={`− ${formatRand(taxResult.homeOffice)}`}       muted />}
                  {taxResult.travel > 0            && <BreakdownRow label="Travel deduction (fixed cost)"  value={`− ${formatRand(taxResult.travel)}`}           muted />}
                  {taxResult.interestExemption > 0 && <BreakdownRow label="Interest exemption"             value={`− ${formatRand(taxResult.interestExemption)}`} muted />}
                  {taxResult.otherDeductions > 0   && <BreakdownRow label="Business expense deductions"    value={`− ${formatRand(taxResult.otherDeductions)}`}  muted />}
                  <div className="border-t border-zinc-800 pt-2">
                    <BreakdownRow label="Taxable income" value={formatRand(taxResult.taxableIncome)} bold />
                  </div>
                  <BreakdownRow label="Tax on taxable income" value={formatRand(taxResult.grossTax)} />
                  <BreakdownRow label="Primary rebate"        value={`− ${formatRand(taxResult.primaryRebate)}`} muted />
                  {taxResult.secondaryRebate > 0   && <BreakdownRow label="Secondary rebate (age 65+)"    value={`− ${formatRand(taxResult.secondaryRebate)}`}  muted />}
                  {taxResult.tertiaryRebate > 0    && <BreakdownRow label="Tertiary rebate (age 75+)"     value={`− ${formatRand(taxResult.tertiaryRebate)}`}   muted />}
                  {taxResult.medicalAidCredits > 0 && <BreakdownRow label="Medical aid credits (Section 6A)" value={`− ${formatRand(taxResult.medicalAidCredits)}`} muted />}
                  <div className="border-t border-zinc-800 pt-2">
                    <BreakdownRow label="Tax payable" value={formatRand(taxResult.taxPayable)} bold />
                  </div>
                  {taxResult.employeesTaxPaid > 0  && <BreakdownRow label="PAYE already deducted (IRP5)"  value={`− ${formatRand(taxResult.employeesTaxPaid)}`} muted />}
                  {taxResult.employeesTaxPaid > 0  && (
                    <div className="border-t border-zinc-800 pt-2">
                      <BreakdownRow label="Net tax payable / refund" value={taxResult.netTaxPayable >= 0 ? formatRand(taxResult.netTaxPayable) : `Refund ${formatRand(Math.abs(taxResult.netTaxPayable))}`} bold />
                    </div>
                  )}
                </div>
                <p className="text-xs text-zinc-600">
                  Estimate only · {taxReturn?.tax_year ? `${taxReturn.tax_year - 1}/${taxReturn.tax_year} SARS tables` : 'SARS tables'}. Final figure on your eFiling return may differ.
                </p>
              </motion.div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

// ── Profile completion helpers ────────────────────────────

interface ProfileCompletionResult {
  pct:     number
  done:    number
  total:   number
  missing: string[]
}

function calcProfileCompletion(profile: KlippaProfile): ProfileCompletionResult {
  const checks: Array<{ label: string; done: boolean; applicable: boolean }> = [
    { label: 'Full name',              done: !!profile.full_name?.trim(),             applicable: true },
    { label: 'Date of birth',          done: !!profile.date_of_birth,                  applicable: true },
    { label: 'SARS tax number',        done: !!profile.tax_number?.trim(),             applicable: true },
    { label: 'ID / passport number',   done: !!profile.id_number?.trim(),              applicable: true },
    { label: 'Home office %',          done: (profile.home_office_pct   ?? 0) > 0,    applicable: profile.works_from_home },
    { label: 'Annual home costs',      done: (profile.home_expenses_annual ?? 0) > 0, applicable: profile.works_from_home },
    { label: 'Vehicle value',          done: (profile.vehicle_value     ?? 0) > 0,    applicable: profile.has_vehicle },
    { label: 'Daily commute (km)',     done: (profile.commute_km        ?? 0) > 0,    applicable: profile.has_vehicle },
    { label: 'RA contributions',       done: (profile.ra_contributions  ?? 0) > 0,    applicable: profile.has_ra },
    { label: 'Pension contributions',  done: (profile.pension_contributions ?? 0) > 0,applicable: profile.has_pension },
    { label: 'Medical aid members',    done: (profile.medical_aid_members ?? 0) > 0,  applicable: profile.has_medical },
  ]

  const applicable = checks.filter(c => c.applicable)
  const done       = applicable.filter(c => c.done).length
  const total      = applicable.length
  const pct        = total === 0 ? 100 : Math.round((done / total) * 100)
  const missing    = applicable.filter(c => !c.done).map(c => c.label)

  return { pct, done, total, missing }
}

function ProfileCompletionCard({ completion }: { completion: ProfileCompletionResult }) {
  const { pct, done, total, missing } = completion
  const complete = pct === 100

  // SVG donut ring — circumference ≈ 100 with r = 15.915
  const r   = 15.915
  const circ = 2 * Math.PI * r  // ≈ 100

  return (
    <Link
      href="/settings"
      className={`group flex items-center gap-4 rounded-2xl border p-4 transition-all ${
        complete
          ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-emerald-500/30 hover:bg-zinc-900/60'
      }`}
    >
      {/* Donut progress ring */}
      <div className="relative flex-shrink-0 w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle
            cx="18" cy="18" r={r}
            fill="none" stroke="#27272a" strokeWidth="2.5"
          />
          <circle
            cx="18" cy="18" r={r}
            fill="none"
            stroke={complete ? '#10b981' : '#10b981'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${complete ? 'text-emerald-400' : 'text-white'}`}>
          {pct}%
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-100">
            {complete ? 'Tax profile complete' : 'Tax profile setup'}
          </p>
          <span className="text-xs text-zinc-500 flex-shrink-0">{done}/{total} items</span>
        </div>

        {complete ? (
          <p className="text-xs text-emerald-400">All details filled in — your tax calculations are accurate</p>
        ) : (
          <>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-zinc-500 leading-snug">
                <span className="text-zinc-400">Still needed: </span>
                {missing.slice(0, 2).join(', ')}
                {missing.length > 2 && <span className="text-zinc-600"> +{missing.length - 2} more</span>}
              </p>
            )}
          </>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${complete ? 'text-emerald-500/50 group-hover:text-emerald-400' : 'text-zinc-600 group-hover:text-emerald-400'}`} />
    </Link>
  )
}

// ── Sub-components ─────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon, highlight }: {
  label: string; value: string; sub: string; color: 'zinc' | 'amber' | 'emerald'
  icon: React.ReactNode; highlight?: boolean
}) {
  const colors = {
    zinc:    { border: 'border-zinc-800',       bg: 'bg-zinc-900/40',    icon: 'text-zinc-400'    },
    amber:   { border: 'border-amber-500/25',   bg: 'bg-amber-500/5',    icon: 'text-amber-400'   },
    emerald: { border: 'border-emerald-500/25', bg: 'bg-emerald-500/5',  icon: 'text-emerald-400' },
  }[color]

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 space-y-3 ${highlight ? 'ring-1 ring-emerald-500/20' : ''}`}
    >
      <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider ${colors.icon}`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500" dangerouslySetInnerHTML={{ __html: sub }} />
    </motion.div>
  )
}

function CompletionRow({ label, done, pct, href }: { label: string; done?: boolean; pct: number; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 text-sm hover:opacity-80 transition-opacity">
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${done ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-700'}`}>
        {done && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <span className={done ? 'text-zinc-300' : 'text-zinc-500'}>{label}</span>
      <span className="ml-auto text-xs text-zinc-600">{pct}%</span>
    </Link>
  )
}

function Check({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function BreakdownRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-zinc-500' : bold ? 'text-zinc-100 font-semibold' : 'text-zinc-300'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
