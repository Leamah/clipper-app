'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ChevronRight, ChevronDown, Check, Zap, BarChart2, ShieldCheck, ShieldAlert, Download,
} from 'lucide-react'
import { formatRand } from '@/lib/dashboard-utils'
import type { ProfileCompletionResult, AuditReadinessResult } from '@/lib/dashboard-utils'
import type { TaxCalculationResult, KlippaProfile, KlippaTaxReturn, KlippaIncomeRecord, KlippaExpenseRecord } from '@/lib/types'
import { exportTaxPackPDF, exportTaxPackCSV } from '@/lib/tax-pack-export'
import { isStarterOrAbove } from '@/lib/tier'

const OPEN_KEY = 'klippa_dash_insight_open'

interface MoreInsightProps {
  profile:           KlippaProfile
  taxReturn:         KlippaTaxReturn | null
  taxResult:         TaxCalculationResult | null
  totalIncome:       number
  hasIncome:         boolean
  hasExpenses:       boolean
  completionPct:     number
  nextAction:        { label: string; href: string }
  profileCompletion: ProfileCompletionResult | null
  auditReadiness:    AuditReadinessResult | null
  incomeRecords:     KlippaIncomeRecord[]
  expenseRecords:    KlippaExpenseRecord[]
  businessKm:        number
  totalKm:           number
}

/**
 * Progressive disclosure: everything secondary lives behind one
 * collapsed panel. Open state is remembered per browser.
 */
export default function MoreInsight(props: MoreInsightProps) {
  const { profile, taxReturn, taxResult, totalIncome } = props
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(OPEN_KEY) === '1') setOpen(true)
  }, [])

  const toggle = () => setOpen((o) => {
    localStorage.setItem(OPEN_KEY, o ? '0' : '1')
    return !o
  })

  const isFreeStandalone = !['starter', 'professional', 'admin'].includes(profile.subscription_tier ?? '') && !profile.organisation_id
  const taxYear = taxReturn?.tax_year ?? new Date().getFullYear()

  return (
    <div className="rounded-2xl border border-edge bg-surface/40 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-raised/30 transition-colors"
      >
        <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Progress &amp; insights</p>
        <ChevronDown className={`w-4 h-4 text-ink-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="px-5 pb-5 space-y-4"
        >
          {/* Return completion + next step */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
              <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Return completion</p>
              <div className="space-y-3">
                <CompletionRow label="Income"          done={props.hasIncome}   pct={50} href="/income"   />
                <CompletionRow label="Expenses"        done={props.hasExpenses} pct={30} href="/expenses" />
                <CompletionRow label="Filed with SARS" done={taxReturn?.status === 'submitted'} pct={20} href="/filing" />
              </div>
              <div className="pt-1">
                <div className="flex justify-between text-xs text-ink-2 mb-1.5">
                  <span>Overall</span>
                  <span>{props.completionPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${props.completionPct}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 flex flex-col justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Next step</p>
                <p className="text-sm font-semibold text-ink-1 leading-snug">{props.nextAction.label}</p>
              </div>
              <motion.div whileTap={{ scale: 0.97 }}>
                <Link
                  href={props.nextAction.href}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all"
                >
                  Continue <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </motion.div>
            </div>
          </div>

          {/* Health rings */}
          {props.profileCompletion && props.profileCompletion.pct < 100 && (
            <ProfileCompletionCard completion={props.profileCompletion} />
          )}
          {props.auditReadiness && (
            <AuditReadinessCard readiness={props.auditReadiness} />
          )}

          {/* Tax breakdown */}
          {taxResult && totalIncome > 0 && (
            <TaxBreakdown taxResult={taxResult} taxYear={taxReturn?.tax_year} />
          )}

          {/* Tax pack export */}
          <div className="flex flex-wrap items-center gap-2">
            {isStarterOrAbove(profile) ? (
              <button
                onClick={() => exportTaxPackPDF({
                  profile,
                  taxYear,
                  incomeRecords:  props.incomeRecords,
                  expenseRecords: props.expenseRecords,
                  taxResult,
                  businessKm:     props.businessKm,
                  totalKm:        props.totalKm,
                })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Tax pack PDF
              </button>
            ) : (
              <Link href="/pricing" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-3 hover:bg-raised transition-colors" title="Available on Starter">
                <Download className="w-3.5 h-3.5" /> Tax pack PDF (Starter)
              </Link>
            )}
            <button
              onClick={() => exportTaxPackCSV({ taxYear, incomeRecords: props.incomeRecords, expenseRecords: props.expenseRecords })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Records CSV
            </button>
          </div>

          {/* FINscope Invest — freelancers only */}
          {!profile.organisation_id && (
            profile.invest_enabled ? (
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
            ) : profile.feature_invest_basic ? (
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
          )}

          {/* Upgrade nudge — standalone free users only */}
          {isFreeStandalone && (
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
                  <p className="text-xs text-ink-2 mt-0.5">Unlock unlimited expenses, invoicing, recurring templates and the full filing wizard from R149/mo.</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap group-hover:translate-x-0.5 transition-transform">
                View plans →
              </span>
            </Link>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ── Internals (moved from the old dashboard page) ─────────

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

function ProfileCompletionCard({ completion }: { completion: ProfileCompletionResult }) {
  const { pct, done, total, missing } = completion
  const complete = pct === 100

  const r    = 15.915
  const circ = 2 * Math.PI * r

  return (
    <Link
      href="/settings"
      className={`group flex items-center gap-4 rounded-2xl border p-4 transition-all ${
        complete
          ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
          : 'border-edge bg-surface/40 hover:border-emerald-500/30 hover:bg-surface/60'
      }`}
    >
      <div className="relative flex-shrink-0 w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#27272a" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r={r}
            fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${complete ? 'text-emerald-400' : 'text-ink-1'}`}>
          {pct}%
        </span>
      </div>

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
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
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

      <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${complete ? 'text-emerald-500/50 group-hover:text-emerald-400' : 'text-ink-3 group-hover:text-emerald-400'}`} />
    </Link>
  )
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
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: ring }} />
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

function TaxBreakdown({ taxResult, taxYear }: { taxResult: TaxCalculationResult; taxYear?: number }) {
  return (
    <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
      <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Tax breakdown estimate</p>
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
        Estimate only · {taxYear ? `${taxYear - 1}/${taxYear} SARS tables` : 'SARS tables'}. Final figure on your eFiling return may differ.
      </p>
    </div>
  )
}

function BreakdownRow({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-ink-2' : bold ? 'text-ink-1 font-semibold' : 'text-ink-1'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
