'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { useRouter } from 'next/navigation'
import { AlertCircle, Receipt, Car, FileSpreadsheet, Clock } from 'lucide-react'
import type { KlippaProfile, KlippaTaxReturn, KlippaIncomeRecord, KlippaExpenseRecord, KlippaMileageTrip } from '@/lib/types'
import { calculateTax, ageFromDob, getITR12Deadline, daysUntilDeadline, nextProvisionalPayment, currentRunningTaxYear, VAT_THRESHOLD, VAT_WARNING_THRESHOLD } from '@/lib/tax-engine'
import { isIncludedInTaxEstimate } from '@/lib/sars-return-map'
import { countPendingLogbookWeeks, formatRand, calcProfileCompletion, computeAuditReadiness } from '@/lib/dashboard-utils'
import HeroTaxPosition from '@/components/dashboard/HeroTaxPosition'
import QuestBoard from '@/components/dashboard/QuestBoard'
import RefundMeter from '@/components/gamification/RefundMeter'
import CelebrationLayer from '@/components/gamification/CelebrationLayer'
import { useGamification, activeQuests, type QuestCtx } from '@/lib/gamification'
import QuickActions from '@/components/dashboard/QuickActions'
import AttentionList, { type AttentionItem } from '@/components/dashboard/AttentionList'
import OrgCard from '@/components/dashboard/OrgCard'
import MoreInsight from '@/components/dashboard/MoreInsight'
import { HeroSkeleton, RowSkeleton } from '@/components/dashboard/Skeletons'

interface OpenInvoice { id: string; total: number; due_date: string | null; status: string }

export default function Dashboard() {
  const router = useRouter()
  const [profile,        setProfile]        = useState<KlippaProfile | null>(null)
  const [taxReturn,      setTaxReturn]      = useState<KlippaTaxReturn | null>(null)
  const [incomeRecords,  setIncomeRecords]  = useState<KlippaIncomeRecord[]>([])
  const [expenseRecords, setExpenseRecords] = useState<KlippaExpenseRecord[]>([])
  const [mileageTrips,   setMileageTrips]   = useState<KlippaMileageTrip[]>([])
  const [openInvoices,   setOpenInvoices]   = useState<OpenInvoice[]>([])
  const [logbookPending, setLogbookPending] = useState(0)
  const [pendingExpenses, setPendingExpenses] = useState(0)
  const [userId,         setUserId]         = useState<string | null>(null)
  // Progressive loading: the shell renders immediately, the hero fills in
  // when profile+return land (phase 1), numbers when records land (phase 2).
  const [phase1Done,     setPhase1Done]     = useState(false)
  const [phase2Done,     setPhase2Done]     = useState(false)
  // Org membership
  const [orgName,              setOrgName]              = useState<string | null>(null)
  const [orgLoading,           setOrgLoading]           = useState(true)
  const [latestTsStatus,       setLatestTsStatus]       = useState<string | null>(null)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)

  const loadData = useCallback(async (uid: string) => {
    // ── Phase 1: identity — profile, return, logbook reviews ──
    const [profileRes, returnRes, reviewsRes] = await Promise.all([
      supabase.from('klippa_profiles').select('*').eq('id', uid).single(),
      supabase.from('klippa_tax_returns').select('*').eq('user_id', uid).order('tax_year', { ascending: false }).limit(1).single(),
      supabase.from('klippa_logbook_reviews').select('review_week').eq('user_id', uid),
    ])

    const prof = profileRes.data as KlippaProfile | null
    const ret  = returnRes.data as KlippaTaxReturn | null

    setProfile(prof)
    setTaxReturn(ret)
    setPhase1Done(true)

    if (prof?.commute_km && prof.commute_km > 0) {
      const reviewedKeys = (reviewsRes.data ?? []).map((r: { review_week: string }) => r.review_week)
      setLogbookPending(countPendingLogbookWeeks(prof.tax_year, reviewedKeys))
    }

    // ── Phase 2: records — fills the hero numbers in place ──
    if (ret) {
      const [incRes, expRes, mileRes, pendRes, invRes] = await Promise.all([
        supabase.from('klippa_income_records').select('*').eq('tax_return_id', ret.id).order('created_at', { ascending: false }),
        supabase.from('klippa_expense_records').select('*').eq('tax_return_id', ret.id).eq('classification_status', 'confirmed'),
        supabase.from('klippa_mileage_trips').select('*').eq('tax_return_id', ret.id),
        supabase.from('klippa_expense_records').select('id', { count: 'exact', head: true }).eq('tax_return_id', ret.id).eq('classification_status', 'pending'),
        supabase.from('klippa_invoices').select('id, total, due_date, status').eq('user_id', uid).eq('status', 'sent'),
      ])
      setIncomeRecords((incRes.data ?? []) as KlippaIncomeRecord[])
      setExpenseRecords((expRes.data ?? []) as KlippaExpenseRecord[])
      setMileageTrips((mileRes.data ?? []) as KlippaMileageTrip[])
      setPendingExpenses(pendRes.count ?? 0)
      setOpenInvoices((invRes.data ?? []) as OpenInvoice[])
    }
    setPhase2Done(true)

    // ── Phase 3: org context — only blocks the org card ──────
    if (prof?.organisation_id) {
      const [orgRes, tsRes] = await Promise.all([
        supabase.from('klippa_organisations').select('name').eq('id', prof.organisation_id).single(),
        supabase.from('klippa_timesheets').select('status').eq('user_id', uid)
          .order('month', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (orgRes.data) setOrgName(orgRes.data.name)
      if (tsRes.data)  setLatestTsStatus(tsRes.data.status)

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
    setOrgLoading(false)
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

  // ── Realtime: patch state in place instead of reloading ──
  const refreshPendingCount = useCallback(async (retId: string) => {
    const { count } = await supabase
      .from('klippa_expense_records')
      .select('id', { count: 'exact', head: true })
      .eq('tax_return_id', retId)
      .eq('classification_status', 'pending')
    setPendingExpenses(count ?? 0)
  }, [])

  useEffect(() => {
    if (!userId || !taxReturn) return
    const retId = taxReturn.id

    const channel = supabase
      .channel('klippa_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klippa_income_records', filter: `user_id=eq.${userId}` }, (payload) => {
        setIncomeRecords((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((r) => r.id !== (payload.old as { id: string }).id)
          const rec = payload.new as KlippaIncomeRecord
          if (rec.tax_return_id !== retId) return prev
          const rest = prev.filter((r) => r.id !== rec.id)
          return [rec, ...rest]
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klippa_expense_records', filter: `user_id=eq.${userId}` }, (payload) => {
        setExpenseRecords((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((r) => r.id !== (payload.old as { id: string }).id)
          const rec = payload.new as KlippaExpenseRecord
          if (rec.tax_return_id !== retId || rec.classification_status !== 'confirmed') {
            return prev.filter((r) => r.id !== rec.id)
          }
          const rest = prev.filter((r) => r.id !== rec.id)
          return [rec, ...rest]
        })
        // Pending-review count can shift on any expense event — one cheap head count
        refreshPendingCount(retId)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, taxReturn, refreshPendingCount])

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

  const taxYear  = taxReturn?.tax_year ?? new Date().getFullYear()
  const deadline = getITR12Deadline(taxYear)
  const daysLeft = daysUntilDeadline(deadline)

  const isProvisional = !!profile?.feature_provisional && profile?.employment_type !== 'employee'
  const provisionalRunway = isProvisional
    ? nextProvisionalPayment({
        taxYear:    currentRunningTaxYear(),
        annualTax:  Math.max(0, taxToSave),
        firstPaid:  taxReturn?.payment1_status === 'paid',
        secondPaid: taxReturn?.payment2_status === 'paid',
      })
    : null

  const profileCompletion = profile ? calcProfileCompletion(profile) : null
  const drivesForWork = !!profile?.feature_logbook && (profile?.commute_km ?? 0) > 0
  const auditReadiness = computeAuditReadiness({
    confirmed:      expenseRecords,
    pendingCount:   pendingExpenses,
    drivesForWork,
    logbookPending,
  })

  const hasIncome   = incomeRecords.length > 0
  const hasExpenses = expenseRecords.length > 0

  // ── Gamification: XP/badges state + refund meter inputs ──
  // Baseline = the same calculation with every deduction input zeroed;
  // the gap between the two taxPayable figures is the honest "tax saved".
  const baselineResult = profile
    ? calculateTax({
        grossIncome:          taxEstimateIncome,
        raContributions:      0,
        pensionContributions: 0,
        homeofficePct:        0,
        homeExpenses:         0,
        businessKm:           0,
        totalKm:              0,
        vehicleValue:         0,
        medicalAidMembers:    0,
        interestIncome:       dashInterest,
        otherDeductions:      0,
        age:                  ageFromDob(profile.date_of_birth ?? null),
        employeesTaxPaid:     taxReturn?.employees_tax_paid ?? 0,
        taxYear:              taxReturn?.tax_year,
      })
    : null
  const taxSaved        = Math.max(0, (baselineResult?.taxPayable ?? 0) - (taxResult?.taxPayable ?? 0))
  const deductionsTotal = taxResult?.totalDeductions ?? 0

  const gamification = useGamification({
    userId,
    profile,
    hasIncome,
    hasExpenses,
    deductionsTotal,
    ready: phase2Done,
  })
  const xp = gamification.progress?.xp ?? 0
  const questCtx: QuestCtx | null = profile
    ? { profile, events: gamification.events, hasIncome, hasExpenses }
    : null
  const questsActive = questCtx ? activeQuests(questCtx, xp).length > 0 : false
  const completionPct = (hasIncome ? 50 : 0) + (hasExpenses ? 30 : 0) + (taxReturn?.status === 'submitted' ? 20 : 0)

  const nextAction = !hasIncome
    ? { label: 'Add your first income source',            href: '/income'   }
    : !hasExpenses
      ? { label: 'Add and classify your business expenses', href: '/expenses' }
      : taxReturn?.status === 'draft'
        ? { label: 'Review your return and file',           href: '/filing'   }
        : { label: 'View your filing status',               href: '/filing'   }

  // ── Attention items: only what's actionable right now ────

  const today = new Date().toISOString().slice(0, 10)
  const overdueInvoices = openInvoices.filter((i) => i.due_date && i.due_date < today)
  const overdueTotal    = overdueInvoices.reduce((s, i) => s + i.total, 0)

  const attentionItems: AttentionItem[] = []
  if (totalIncome >= VAT_THRESHOLD) {
    attentionItems.push({
      key: 'vat-mandatory', icon: AlertCircle, tone: 'red',
      label: 'VAT registration required',
      detail: 'Income has exceeded the R1,000,000 threshold — SARS requires registration within 21 days.',
      href: 'https://www.sars.gov.za/businesses-and-employers/vat/how-to-register-for-vat/',
    })
  }
  if (overdueInvoices.length > 0) {
    attentionItems.push({
      key: 'invoices-overdue', icon: FileSpreadsheet, tone: 'red',
      label: `${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''} overdue`,
      detail: `${formatRand(overdueTotal)} outstanding — chase or mark as paid.`,
      href: '/invoices',
    })
  }
  if (latestTsStatus === 'rejected') {
    attentionItems.push({
      key: 'timesheet-rejected', icon: Clock, tone: 'amber',
      label: 'Timesheet returned for revision',
      detail: 'Your last timesheet was rejected — fix and resubmit it.',
      href: '/timesheets',
    })
  }
  if (pendingExpenses > 0) {
    attentionItems.push({
      key: 'expenses-pending', icon: Receipt, tone: 'amber',
      label: `${pendingExpenses} expense${pendingExpenses !== 1 ? 's' : ''} awaiting review`,
      detail: 'Confirm the AI classifications so they count toward your deductions.',
      href: '/expenses',
    })
  }
  if (totalIncome >= VAT_WARNING_THRESHOLD && totalIncome < VAT_THRESHOLD) {
    attentionItems.push({
      key: 'vat-warning', icon: AlertCircle, tone: 'amber',
      label: 'Approaching the VAT threshold',
      detail: `${formatRand(VAT_THRESHOLD - totalIncome)} away from mandatory VAT registration — start preparing.`,
      href: 'https://www.sars.gov.za/businesses-and-employers/vat/how-to-register-for-vat/',
    })
  }
  if (drivesForWork && logbookPending > 0) {
    attentionItems.push({
      key: 'logbook', icon: Car, tone: 'neutral',
      label: `${logbookPending} logbook week${logbookPending !== 1 ? 's' : ''} to confirm`,
      detail: 'Keep your SARS travel logbook current to protect the deduction.',
      href: '/mileage',
    })
  }

  const featureFlags = {
    timesheets:  profile?.feature_timesheets  ?? false,
    logbook:     profile?.feature_logbook     ?? true,
    provisional: profile?.feature_provisional ?? false,
  }

  return (
    <div className="app-shell bg-base text-ink-1">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-600/[0.06] blur-[120px] rounded-full" />
      </div>

      <AppNav
        activePage="dashboard"
        featureFlags={phase1Done ? featureFlags : undefined}
        progress={gamification.loaded
          ? { has_income: (gamification.progress?.has_income ?? false) || hasIncome, has_expense: (gamification.progress?.has_expense ?? false) || hasExpenses }
          : null}
        logbookPending={logbookPending}
        pendingApprovals={pendingApprovalCount}
      />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* Quest board: what to do next, why it's worth XP, and the refund
            meter as the score. Renders nothing once all quests are done. */}
        {phase2Done && questCtx && userId && (
          <QuestBoard
            ctx={questCtx}
            xp={xp}
            taxSaved={taxSaved}
            deductionsTotal={deductionsTotal}
            userId={userId}
            onProfilePatch={(patch) => setProfile((prev) => prev ? { ...prev, ...patch } : prev)}
            onAwarded={() => gamification.refresh()}
          />
        )}

        {/* Hero: the one answer */}
        {phase2Done ? (
          <HeroTaxPosition
            totalIncome={totalIncome}
            taxToSave={taxToSave}
            safeToSpend={safeToSpend}
            hasTaxResult={!!taxResult}
            taxYear={taxYear}
            daysLeft={daysLeft}
            provisionalRunway={provisionalRunway}
          />
        ) : (
          <HeroSkeleton />
        )}

        {/* Once the quest board retires, the score stays visible here */}
        {phase2Done && !questsActive && (
          <RefundMeter taxSaved={taxSaved} deductionsTotal={deductionsTotal} compact />
        )}

        {/* Everyday actions — render instantly */}
        <QuickActions showInvoices={!profile?.organisation_id || !phase1Done} />

        {/* Contextual attention items — skip the "up to date" reassurance
            before there's any income; GetStarted already tells them what's next. */}
        {phase2Done ? (hasIncome ? <AttentionList items={attentionItems} /> : null) : <RowSkeleton />}

        {/* Org membership — org consultants only */}
        {profile?.organisation_id && (
          orgLoading ? <RowSkeleton /> : orgName ? (
            <OrgCard orgName={orgName} latestTsStatus={latestTsStatus} />
          ) : null
        )}

        {/* Everything secondary, behind one disclosure */}
        {phase2Done && profile && (
          <MoreInsight
            profile={profile}
            taxReturn={taxReturn}
            taxResult={taxResult}
            totalIncome={totalIncome}
            hasIncome={hasIncome}
            hasExpenses={hasExpenses}
            completionPct={completionPct}
            nextAction={nextAction}
            profileCompletion={profileCompletion}
            auditReadiness={auditReadiness}
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            businessKm={dashBusinessKm}
            totalKm={dashTotalKm}
          />
        )}

      </main>

      {/* Confetti + toasts for new levels/badges; dedupe is persisted */}
      <CelebrationLayer
        progress={gamification.progress}
        badges={gamification.badges}
        onBadgeCelebrated={gamification.markBadgeCelebrated}
        onLevelCelebrated={gamification.markLevelCelebrated}
      />
    </div>
  )
}
