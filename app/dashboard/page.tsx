'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import UserNav from '@/components/UserNav'
import { ShieldCheck, TrendingUp, AlertCircle, CheckCircle2, ChevronRight, Clock, Plus, FileText, Receipt, ArrowUpRight } from 'lucide-react'
import type { KlippaProfile, KlippaTaxReturn, KlippaIncomeRecord, KlippaExpenseRecord } from '@/lib/types'
import { calculateTax, getITR12Deadline, daysUntilDeadline } from '@/lib/tax-engine'
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

function NavBar() {
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
          <span className="px-3 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-500/10 font-medium">Dashboard</span>
          <Link href="/income"    className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Income</Link>
          <Link href="/expenses"  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Expenses</Link>
          <Link href="/documents" className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Documents</Link>
          <Link href="/filing"    className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">File Return</Link>
        </nav>
        <div className="ml-auto">
          <UserNav />
        </div>
      </div>
    </header>
  )
}

export default function Dashboard() {
  const [profile,           setProfile]           = useState<KlippaProfile | null>(null)
  const [taxReturn,         setTaxReturn]         = useState<KlippaTaxReturn | null>(null)
  const [incomeRecords,     setIncomeRecords]     = useState<KlippaIncomeRecord[]>([])
  const [expenseRecords,    setExpenseRecords]    = useState<KlippaExpenseRecord[]>([])
  const [logbookPending,    setLogbookPending]    = useState(0)
  const [userId,            setUserId]            = useState<string | null>(null)
  const [loading,           setLoading]           = useState(true)

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
      const [incRes, expRes] = await Promise.all([
        supabase.from('klippa_income_records').select('*').eq('tax_return_id', ret.id).order('created_at', { ascending: false }),
        supabase.from('klippa_expense_records').select('*').eq('tax_return_id', ret.id).eq('classification_status', 'confirmed'),
      ])
      setIncomeRecords((incRes.data ?? []) as KlippaIncomeRecord[])
      setExpenseRecords((expRes.data ?? []) as KlippaExpenseRecord[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      loadData(user.id)
    })
  }, [loadData])

  // Realtime: re-fetch when income/expense records change
  useEffect(() => {
    if (!userId || !taxReturn) return
    const channel = supabase
      .channel('klippa_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klippa_income_records', filter: `user_id=eq.${userId}` }, () => loadData(userId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klippa_expense_records', filter: `user_id=eq.${userId}` }, () => loadData(userId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, taxReturn, loadData])

  // ── Calculations ────────────────────────────────────────

  const totalIncome  = incomeRecords.reduce((s, r) => s + r.amount, 0)
  const totalExpDeductible = expenseRecords.reduce((s, r) => s + r.deductible_amount, 0)

  const taxResult = profile
    ? calculateTax({
        grossIncome:          totalIncome,
        raContributions:      profile.has_ra ? Math.min(profile.ra_contributions ?? 0, totalIncome * 0.275, 350_000) : 0,
        pensionContributions: profile.has_pension ? (profile.pension_contributions ?? 0) : 0,
        homeofficePct:        profile.works_from_home ? profile.home_office_pct : 0,
        homeExpenses:         0,
        businessKm:           0,
        totalKm:              0,
        vehicleValue:         profile.vehicle_value ?? 0,
        medicalAidMembers:    profile.has_medical ? (profile.medical_aid_members ?? 1) : 0,
        interestIncome:       0,
        otherDeductions:      totalExpDeductible,
        age:                  35,
        employeesTaxPaid:     0,
      })
    : null

  const taxToSave   = taxResult?.netTaxPayable ?? 0
  const safeToSpend = totalIncome - (taxToSave > 0 ? taxToSave : 0) - totalExpDeductible

  // ── Deadline ────────────────────────────────────────────

  const taxYear   = taxReturn?.tax_year ?? new Date().getFullYear()
  const deadline  = getITR12Deadline(taxYear)
  const daysLeft  = daysUntilDeadline(deadline)

  // ── Completion % ────────────────────────────────────────

  const hasIncome   = incomeRecords.length > 0
  const hasExpenses = expenseRecords.length > 0
  const completionPct = (hasIncome ? 50 : 0) + (hasExpenses ? 30 : 0) + (taxReturn?.status === 'submitted' ? 20 : 0)

  // ── Next action ─────────────────────────────────────────

  function getNextAction(): { label: string; href: string } {
    if (!hasIncome)    return { label: 'Add your first income source',          href: '/income'    }
    if (!hasExpenses)  return { label: 'Add and classify your business expenses', href: '/expenses'  }
    if (taxReturn?.status === 'draft') return { label: 'Review your return and file', href: '/filing' }
    return { label: 'View your filing status', href: '/filing' }
  }

  const nextAction = getNextAction()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <NavBar />
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

      <NavBar />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Header */}
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
            {daysLeft > 0
              ? `${daysLeft} days until filing deadline`
              : 'Filing deadline passed'}
          </div>
        </div>

        {/* The three primary metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Total Earned"
            value={formatRand(totalIncome)}
            sub={`${incomeRecords.length} income records`}
            color="zinc"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <MetricCard
            label="Tax to Save"
            value={formatRand(Math.max(0, taxToSave))}
            sub={taxResult ? `${((taxResult.taxPayable / Math.max(1, totalIncome)) * 100).toFixed(1)}% effective rate` : 'Add income to calculate'}
            color="amber"
            icon={<AlertCircle className="w-4 h-4" />}
          />
          <MetricCard
            label="Safe to Spend"
            value={formatRand(Math.max(0, safeToSpend))}
            sub="After tax &amp; business expenses"
            color="emerald"
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
        </div>

        {/* Progress + next action */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Completion */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Return completion</p>
            <div className="space-y-3">
              <CompletionRow label="Income" done={hasIncome} pct={50} href="/income" />
              <CompletionRow label="Expenses" done={hasExpenses} pct={30} href="/expenses" />
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
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Next step</p>
              <p className="text-sm font-semibold text-zinc-100 leading-snug">{nextAction.label}</p>
            </div>
            <Link
              href={nextAction.href}
              className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all"
            >
              Continue <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Quick add shortcuts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Add income',    href: '/income?add=1',    icon: <Plus className="w-4 h-4" /> },
            { label: 'Add expense',   href: '/expenses?add=1',  icon: <Receipt className="w-4 h-4" /> },
            { label: 'Upload doc',    href: '/documents?add=1', icon: <FileText className="w-4 h-4" /> },
            { label: 'View tax calc', href: '/filing',          icon: <ArrowUpRight className="w-4 h-4" /> },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900 text-xs font-medium text-zinc-300 transition-all"
            >
              <span className="text-emerald-500">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>

        {/* Logbook review prompt */}
        {logbookPending > 0 && (
          <Link href="/mileage"
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/50 transition-colors">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-200 flex-1">
              <span className="font-semibold">{logbookPending} {logbookPending === 1 ? 'week' : 'weeks'} of logbook</span> {logbookPending === 1 ? 'needs' : 'need'} your review
            </p>
            <ChevronRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
          </Link>
        )}

        {/* Tax breakdown (visible when there's data) */}
        {taxResult && totalIncome > 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tax breakdown estimate</p>
            <div className="space-y-2 text-sm">
              <BreakdownRow label="Gross income"    value={formatRand(taxResult.grossIncome)} />
              {taxResult.section11fRa > 0 && <BreakdownRow label="RA deduction (Section 11F)" value={`− ${formatRand(taxResult.section11fRa)}`} muted />}
              {taxResult.otherDeductions > 0 && <BreakdownRow label="Business expense deductions" value={`− ${formatRand(taxResult.otherDeductions)}`} muted />}
              <div className="border-t border-zinc-800 pt-2">
                <BreakdownRow label="Taxable income" value={formatRand(taxResult.taxableIncome)} bold />
              </div>
              <BreakdownRow label="Tax on taxable income" value={formatRand(taxResult.grossTax)} />
              <BreakdownRow label="Primary rebate" value={`− ${formatRand(taxResult.primaryRebate)}`} muted />
              {taxResult.medicalAidCredits > 0 && <BreakdownRow label="Medical aid credits (Section 6A)" value={`− ${formatRand(taxResult.medicalAidCredits)}`} muted />}
              <div className="border-t border-zinc-800 pt-2">
                <BreakdownRow label="Tax payable" value={formatRand(taxResult.taxPayable)} bold />
              </div>
            </div>
            <p className="text-xs text-zinc-600">Estimate only. Based on 2024/2025 SARS tables. Final figure on your eFiling return may differ.</p>
          </div>
        )}
      </main>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: 'zinc' | 'amber' | 'emerald'; icon: React.ReactNode
}) {
  const colors = {
    zinc:    { border: 'border-zinc-800',          bg: 'bg-zinc-900/40',          icon: 'text-zinc-400' },
    amber:   { border: 'border-amber-500/25',      bg: 'bg-amber-500/5',          icon: 'text-amber-400' },
    emerald: { border: 'border-emerald-500/25',    bg: 'bg-emerald-500/5',        icon: 'text-emerald-400' },
  }[color]

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 space-y-3`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider ${colors.icon}`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500" dangerouslySetInnerHTML={{ __html: sub }} />
    </div>
  )
}

function CompletionRow({ label, done, pct, href }: { label: string; done: boolean; pct: number; href: string }) {
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
