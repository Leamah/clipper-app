'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AppNav from '@/components/AppNav'
import {
  TrendingUp, AlertCircle, CheckCircle2,
  ChevronRight, ChevronDown, Clock, Plus, FileText, Receipt, ArrowUpRight, Car, Zap,
  ShieldCheck, ShieldAlert, PiggyBank, Users, BarChart2,
} from 'lucide-react'
import type { KlippaProfile, KlippaTaxReturn, KlippaIncomeRecord, KlippaExpenseRecord, KlippaMileageTrip } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { calculateTax, ageFromDob, getITR12Deadline, daysUntilDeadline, nextProvisionalPayment, currentRunningTaxYear, VAT_THRESHOLD, VAT_WARNING_THRESHOLD } from '@/lib/tax-engine'
import { startOfWeek, addWeeks, isBefore, getISOWeek, getISOWeekYear } from 'date-fns'
import { isIncludedInTaxEstimate } from '@/lib/sars-return-map'

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


export default function Dashboard() {
  const router = useRouter()
  const [profile,        setProfile]        = useState<KlippaProfile | null>(null)
  const [taxReturn,      setTaxReturn]      = useState<KlippaTaxReturn | null>(null)
  const [incomeRecords,  setIncomeRecords]  = useState<KlippaIncomeRecord[]>([])
  const [expenseRecords, setExpenseRecords] = useState<KlippaExpenseRecord[]>([])
  const [mileageTrips,   setMileageTrips]   = useState<KlippaMileageTrip[]>([])
  const [logbookPending, setLogbookPending] = useState(0)
  const [pendingExpenses, setPendingExpenses] = useState(0)
  const [userId,         setUserId]         = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [showBreakdown,  setShowBreakdown]  = useState(false)
  // Org membership
  const [orgName,              setOrgName]              = useState<string | null>(null)
  const [latestTsStatus,       setLatestTsStatus]       = useState<string | null>(null)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)

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
      const [incRes, expRes, mileRes, pendRes] = await Promise.all([
        supabase.from('klippa_income_records').select('*').eq('tax_return_id', ret.id).order('created_at', { ascending: false }),
        supabase.from('klippa_expense_records').select('*').eq('tax_return_id', ret.id).eq('classification_status', 'confirmed'),
        supabase.from('klippa_mileage_trips').select('*').eq('tax_return_id', ret.id),
        supabase.from('klippa_expense_records').select('id', { count: 'exact', head: true }).eq('tax_return_id', ret.id).eq('classification_status', 'pending'),
      ])
      setIncomeRecords((incRes.data ?? []) as KlippaIncomeRecord[])
      setExpenseRecords((expRes.data ?? []) as KlippaExpenseRecord[])
      setMileageTrips((mileRes.data ?? []) as KlippaMileageTrip[])
      setPendingExpenses(pendRes.count ?? 0)
    }
    // ── Org membership context ──────────────────────────────
    // Only fires for consultants who accepted an org invite
    if (prof?.organisation_id) {
      const [orgRes, tsRes] = await Promise.all([
        supabase.from('klippa_organisations').select('name').eq('id', prof.organisation_id).single(),
        supabase.from('klippa_timesheets').select('status').eq('user_id', uid)
          .order('month', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (orgRes.data) setOrgName(orgRes.data.name)
      if (tsRes.data)  setLatestTsStatus(tsRes.data.status)

      // Org admins: count pending timesheet approvals for AppNav badge
      if (prof.org_role === 'org-admin') {
        try {
          const res  = await fetch('/api/org/intelligence')
          const json = await res.json()
          const cnt  = (json.consultants ?? []).filter((c: { latest_timesheet?: { status: string; org_approved_at?: string | null } | null }) =>
            c.latest_timesheet?.status === 'submitted' && !c.latest_timesheet?.org_approved_at
          ).length
          setPendingApprovalCount(cnt)
        } catch {
          // non-fatal — badge just stays at 0
        }
      }
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      // Belt-and-suspenders onboarding guard — catches the rare case where
      // the middleware couldn't check the profile (e.g. session not yet in cookies).
      // Note: org owners / practitioners land on their org home after login
      // (handled by middleware), but they can still open this personal tax
      // workspace via the "My profile" link — so we no longer redirect them away.
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
  const taxEstimateIncome  = incomeRecords.filter(r => isIncludedInTaxEstimate(r.income_type)).reduce((s, r) => s + r.amount, 0)
  const totalExpDeductible = expenseRecords.reduce((s, r) => s + r.deductible_amount, 0)

  const dashBusinessKm  = mileageTrips.filter(t => t.trip_type === 'business').reduce((s, t) => s + t.distance_km, 0)
  const dashTotalKm     = mileageTrips.reduce((s, t) => s + t.distance_km, 0)
  const dashInterest    = incomeRecords.filter(r => r.income_type === 'interest').reduce((s, r) => s + r.amount, 0)

  const taxResult = profile
    ? calculateTax({
        grossIncome:          taxEstimateIncome,
        raContributions:      profile.has_ra ? Math.min(profile.ra_contributions ?? 0, taxEstimateIncome * 0.275, 350_000) : 0,
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

  // ── Provisional tax nudge ────────────────────────────────
  const isProvisional = !!profile?.feature_provisional && profile?.employment_type !== 'employee'
  const provisionalRunway = isProvisional
    ? nextProvisionalPayment({
        taxYear:    currentRunningTaxYear(),
        annualTax:  Math.max(0, taxToSave),
        firstPaid:  taxReturn?.payment1_status === 'paid',
        secondPaid: taxReturn?.payment2_status === 'paid',
      })
    : null

  // ── Profile completion ───────────────────────────────────

  const profileCompletion = profile ? calcProfileCompletion(profile) : null

  // ── Audit readiness ──────────────────────────────────────
  const drivesForWork = !!profile?.feature_logbook && (profile?.commute_km ?? 0) > 0
  const auditReadiness = computeAuditReadiness({
    confirmed:      expenseRecords,
    pendingCount:   pendingExpenses,
    drivesForWork,
    logbookPending,
  })

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

  const featureFlags = {
    timesheets:  profile?.feature_timesheets  ?? false,
    logbook:     profile?.feature_logbook     ?? true,
    provisional: profile?.feature_provisional ?? false,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base">
        <AppNav activePage="dashboard" featureFlags={featureFlags} pendingApprovals={pendingApprovalCount} />
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell bg-base text-ink-1">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-600/[0.06] blur-[120px] rounded-full" />
      </div>

      <AppNav activePage="dashboard" featureFlags={featureFlags} logbookPending={logbookPending} pendingApprovals={pendingApprovalCount} />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-1">Tax year {taxYear}</h1>
            <p className="text-sm text-ink-2 mt-1">ITR12: Freelancer / Consultant</p>
          </div>
          <div className={`self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            daysLeft > 30
              ? 'bg-raised text-ink-2'
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
            sub={taxResult ? `${((taxResult.taxPayable / Math.max(1, totalIncome)) * 100).toFixed(1)}% effective rate, set this aside` : 'Add income to calculate'}
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

        {/* Org membership card — org-invited consultants only */}
        {profile?.organisation_id && orgName && (
          <div className="rounded-2xl border border-edge bg-surface p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-1 truncate">{orgName}</p>
                <p className="text-xs text-ink-2">Placement workspace</p>
                {latestTsStatus && (
                  <span className={`mt-1 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    latestTsStatus === 'approved'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : latestTsStatus === 'submitted'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-raised text-ink-2'
                  }`}>
                    {latestTsStatus === 'approved'  ? 'Last TS approved'
                     : latestTsStatus === 'submitted' ? 'Awaiting review'
                     : latestTsStatus === 'draft'    ? 'Draft in progress'
                     : latestTsStatus}
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/timesheets"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
            >
              View timesheets
            </Link>
          </div>
        )}

        {/* FINscope Invest card — freelancers only, suppressed for org members */}
        {!profile?.organisation_id && (
          profile?.invest_enabled ? (
            /* Variant B: opted in */
            <Link href="/invest/dashboard"
              className="group flex items-center justify-between gap-4 rounded-2xl border border-edge bg-surface/40 hover:border-emerald-500/30 hover:bg-surface/60 p-4 transition-all">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <BarChart2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-1">FINscope Invest</p>
                  <p className="text-xs text-ink-2">JSE analysis, screener &amp; portfolio</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-500 shrink-0 transition-colors" />
            </Link>
          ) : (
            /* Variant A: opt-in teaser */
            profile?.feature_invest_basic ? (
              <div className="rounded-2xl border border-edge bg-surface/40 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <BarChart2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-1">Grow money on the JSE</p>
                    <p className="text-xs text-ink-2">FINscope Invest is ready for you — enable it in Settings</p>
                  </div>
                </div>
                <Link href="/settings"
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-edge text-xs text-ink-2 hover:text-ink-1 hover:border-zinc-500 transition-colors">
                  Enable →
                </Link>
              </div>
            ) : null
          )
        )}

        {/* Provisional tax deadline nudge */}
        {provisionalRunway && (
          <Link
            href="/provisional"
            className={`group flex items-center gap-4 rounded-2xl border p-4 transition-all ${
              provisionalRunway.daysLeft < 0
                ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10'
                : provisionalRunway.daysLeft <= 30
                  ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                  : 'border-edge bg-surface/40 hover:border-emerald-500/30 hover:bg-surface/60'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              provisionalRunway.daysLeft < 0 ? 'bg-red-500/15' : provisionalRunway.daysLeft <= 30 ? 'bg-amber-500/15' : 'bg-emerald-500/15'
            }`}>
              <PiggyBank className={`w-5 h-5 ${provisionalRunway.daysLeft < 0 ? 'text-red-400' : provisionalRunway.daysLeft <= 30 ? 'text-amber-400' : 'text-emerald-400'}`} />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-ink-1">
                {provisionalRunway.daysLeft < 0
                  ? `Provisional payment overdue`
                  : `Provisional tax: ${provisionalRunway.instalment} payment in ${provisionalRunway.daysLeft} days`}
              </p>
              <p className="text-xs text-ink-2 leading-snug">
                {provisionalRunway.daysLeft < 0
                  ? <>The {formatRand(provisionalRunway.amountDue)} {provisionalRunway.instalment} instalment was due {provisionalRunway.deadline.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}. Settle it to limit SARS interest.</>
                  : <>Set aside <strong className="text-emerald-400">{formatRand(provisionalRunway.perMonth)}/month</strong> to have the {formatRand(provisionalRunway.amountDue)} ready by {provisionalRunway.deadline.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}.</>}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-ink-3 group-hover:text-emerald-400 transition-colors" />
          </Link>
        )}

        {/* Profile completion */}
        {profileCompletion && (
          <ProfileCompletionCard completion={profileCompletion} />
        )}

        {/* Audit readiness */}
        {auditReadiness && (
          <AuditReadinessCard readiness={auditReadiness} />
        )}

        {/* Upgrade nudge — only for standalone free users, not org/practice members */}
        {profile && !['starter', 'professional', 'admin'].includes(profile.subscription_tier ?? '') && !profile.organisation_id && (
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
                <p className="text-xs text-ink-2 mt-0.5">Unlock unlimited expenses, the full filing wizard and audit-readiness tools from R149/mo.</p>
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
          <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
            <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Return completion</p>
            <div className="space-y-3">
              <CompletionRow label="Income"        done={hasIncome}   pct={50} href="/income"   />
              <CompletionRow label="Expenses"      done={hasExpenses} pct={30} href="/expenses" />
              <CompletionRow label="Filed with SARS" done={taxReturn?.status === 'submitted'} pct={20} href="/filing" />
            </div>
            <div className="pt-1">
              <div className="flex justify-between text-xs text-ink-2 mb-1.5">
                <span>Overall</span>
                <span>{completionPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${completionPct}%` }} />
              </div>
            </div>
          </div>

          {/* Next action */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Next step</p>
              <p className="text-sm font-semibold text-ink-1 leading-snug">{nextAction.label}</p>
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-edge bg-surface/40 hover:border-emerald-500/30 hover:bg-surface text-xs font-medium text-ink-2 hover:text-ink-1 transition-all"
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
          <div className="rounded-2xl border border-edge bg-surface/40 overflow-hidden">
            <button
              onClick={() => setShowBreakdown(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-raised/30 transition-colors"
            >
              <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Tax breakdown estimate</p>
              <ChevronDown className={`w-4 h-4 text-ink-2 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
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
                  <div className="border-t border-edge pt-2">
                    <BreakdownRow label="Taxable income" value={formatRand(taxResult.taxableIncome)} bold />
                  </div>
                  <BreakdownRow label="Tax on taxable income" value={formatRand(taxResult.grossTax)} />
                  <BreakdownRow label="Primary rebate"        value={`− ${formatRand(taxResult.primaryRebate)}`} muted />
                  {taxResult.secondaryRebate > 0   && <BreakdownRow label="Secondary rebate (age 65+)"    value={`− ${formatRand(taxResult.secondaryRebate)}`}  muted />}
                  {taxResult.tertiaryRebate > 0    && <BreakdownRow label="Tertiary rebate (age 75+)"     value={`− ${formatRand(taxResult.tertiaryRebate)}`}   muted />}
                  {taxResult.medicalAidCredits > 0 && <BreakdownRow label="Medical aid credits (Section 6A)" value={`− ${formatRand(taxResult.medicalAidCredits)}`} muted />}
                  <div className="border-t border-edge pt-2">
                    <BreakdownRow label="Tax payable" value={formatRand(taxResult.taxPayable)} bold />
                  </div>
                  {taxResult.employeesTaxPaid > 0  && <BreakdownRow label="PAYE already deducted (IRP5)"  value={`− ${formatRand(taxResult.employeesTaxPaid)}`} muted />}
                  {taxResult.employeesTaxPaid > 0  && (
                    <div className="border-t border-edge pt-2">
                      <BreakdownRow label="Net tax payable / refund" value={taxResult.netTaxPayable >= 0 ? formatRand(taxResult.netTaxPayable) : `Refund ${formatRand(Math.abs(taxResult.netTaxPayable))}`} bold />
                    </div>
                  )}
                </div>
                <p className="text-xs text-ink-3">
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
          : 'border-edge bg-surface/40 hover:border-emerald-500/30 hover:bg-surface/60'
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
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${complete ? 'text-emerald-400' : 'text-ink-1'}`}>
          {pct}%
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-1">
            {complete ? 'Tax profile complete' : 'Tax profile setup'}
          </p>
          <span className="text-xs text-ink-2 flex-shrink-0">{done}/{total} items</span>
        </div>

        {complete ? (
          <p className="text-xs text-emerald-400">All details filled in, your tax calculations are accurate</p>
        ) : (
          <>
            <div className="h-1.5 bg-raised rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-ink-2 leading-snug">
                <span className="text-ink-2">Still needed: </span>
                {missing.slice(0, 2).join(', ')}
                {missing.length > 2 && <span className="text-ink-3"> +{missing.length - 2} more</span>}
              </p>
            )}
          </>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${complete ? 'text-emerald-500/50 group-hover:text-emerald-400' : 'text-ink-3 group-hover:text-emerald-400'}`} />
    </Link>
  )
}

// ── Audit readiness ───────────────────────────────────────

interface AuditFactor { label: string; ok: boolean; detail: string }
interface AuditReadinessResult {
  pct:     number
  factors: AuditFactor[]
}

function computeAuditReadiness(input: {
  confirmed:     KlippaExpenseRecord[]
  pendingCount:  number
  drivesForWork: boolean
  logbookPending: number
}): AuditReadinessResult | null {
  const { confirmed, pendingCount, drivesForWork, logbookPending } = input

  // Nothing to be audit-ready about yet.
  if (confirmed.length === 0 && pendingCount === 0) return null

  const withReceipt   = confirmed.filter(r => r.receipt_id).length
  const highRisk      = confirmed.filter(r => r.ai_audit_risk === 'high')
  const highRiskNoDoc = highRisk.filter(r => !r.receipt_id).length

  let score = 0
  let max   = 0
  const factors: AuditFactor[] = []

  // Evidence on file (weight 50)
  if (confirmed.length > 0) {
    max += 50
    score += 50 * (withReceipt / confirmed.length)
    const gap = confirmed.length - withReceipt
    factors.push({
      label:  'Receipts on file',
      ok:     gap === 0,
      detail: gap === 0
        ? `All ${confirmed.length} confirmed expenses have a receipt`
        : `${gap} of ${confirmed.length} confirmed expenses have no receipt attached`,
    })
  }

  // Review backlog (weight 20)
  max += 20
  score += pendingCount === 0 ? 20 : Math.max(0, 20 - pendingCount * 5)
  factors.push({
    label:  'Nothing awaiting review',
    ok:     pendingCount === 0,
    detail: pendingCount === 0
      ? 'Every captured expense has been classified'
      : `${pendingCount} expense${pendingCount !== 1 ? 's' : ''} still need accept/reject`,
  })

  // Logbook current (weight 15) — only if they drive for work
  if (drivesForWork) {
    max += 15
    score += logbookPending === 0 ? 15 : Math.max(0, 15 - logbookPending)
    factors.push({
      label:  'Logbook up to date',
      ok:     logbookPending === 0,
      detail: logbookPending === 0
        ? 'No outstanding logbook weeks'
        : `${logbookPending} week${logbookPending !== 1 ? 's' : ''} of business travel unconfirmed`,
    })
  }

  // High-risk items documented (weight 15)
  if (highRisk.length > 0) {
    max += 15
    score += 15 * ((highRisk.length - highRiskNoDoc) / highRisk.length)
    factors.push({
      label:  'High-risk claims backed up',
      ok:     highRiskNoDoc === 0,
      detail: highRiskNoDoc === 0
        ? `All ${highRisk.length} high-audit-risk claims have a receipt`
        : `${highRiskNoDoc} high-risk claim${highRiskNoDoc !== 1 ? 's' : ''} lack supporting documents`,
    })
  }

  const pct = max > 0 ? Math.round((score / max) * 100) : 100
  return { pct, factors }
}

function AuditReadinessCard({ readiness }: { readiness: AuditReadinessResult }) {
  const { pct, factors } = readiness
  const strong = pct >= 85
  const weak   = pct < 55

  const r    = 15.915
  const circ = 2 * Math.PI * r
  const ring = strong ? '#10b981' : weak ? '#ef4444' : '#f59e0b'
  const tone = strong
    ? { label: 'Audit-ready',  text: 'text-emerald-400' }
    : weak
      ? { label: 'At risk',    text: 'text-red-400' }
      : { label: 'Building',   text: 'text-amber-400' }

  const failing = factors.filter(f => !f.ok)

  return (
    <Link
      href="/expenses"
      className={`group flex items-center gap-4 rounded-2xl border p-4 transition-all ${
        strong
          ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
          : 'border-edge bg-surface/40 hover:border-emerald-500/30 hover:bg-surface/60'
      }`}
    >
      {/* Donut ring */}
      <div className="relative flex-shrink-0 w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#27272a" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r={r}
            fill="none" stroke={ring} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${tone.text}`}>
          {pct}
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-1 flex items-center gap-1.5">
            {strong
              ? <ShieldCheck className="w-4 h-4 text-emerald-400" />
              : <ShieldAlert className={`w-4 h-4 ${tone.text}`} />}
            Audit readiness
          </p>
          <span className={`text-xs font-medium flex-shrink-0 ${tone.text}`}>{tone.label}</span>
        </div>

        {failing.length === 0 ? (
          <p className="text-xs text-emerald-400">Every confirmed claim is backed by evidence. Export your SARS Audit Pack any time.</p>
        ) : (
          <>
            <div className="h-1.5 bg-raised rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: ring }}
              />
            </div>
            <p className="text-xs text-ink-2 leading-snug">
              <span className="text-ink-2">To improve: </span>
              {failing[0].detail}
              {failing.length > 1 && <span className="text-ink-3"> +{failing.length - 1} more</span>}
            </p>
          </>
        )}
      </div>

      <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${strong ? 'text-emerald-500/50 group-hover:text-emerald-400' : 'text-ink-3 group-hover:text-emerald-400'}`} />
    </Link>
  )
}

// ── Sub-components ─────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon, highlight }: {
  label: string; value: string; sub: string; color: 'zinc' | 'amber' | 'emerald'
  icon: React.ReactNode; highlight?: boolean
}) {
  const colors = {
    zinc:    { border: 'border-edge',       bg: 'bg-surface/40',    icon: 'text-ink-2'    },
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
      <p className="text-2xl font-bold text-ink-1 tabular-nums">{value}</p>
      <p className="text-xs text-ink-2">{sub}</p>
    </motion.div>
  )
}

function CompletionRow({ label, done, pct, href }: { label: string; done?: boolean; pct: number; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 text-sm hover:opacity-80 transition-opacity">
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${done ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
        {done && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <span className={done ? 'text-ink-1' : 'text-ink-2'}>{label}</span>
      <span className="ml-auto text-xs text-ink-3">{pct}%</span>
    </Link>
  )
}

function Check({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function BreakdownRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-ink-2' : bold ? 'text-ink-1 font-semibold' : 'text-ink-1'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
