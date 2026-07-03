// ============================================================
// Dashboard helpers — moved out of app/dashboard/page.tsx
// unchanged during the 2026-07 redesign.
// ============================================================

import { startOfWeek, addWeeks, isBefore, getISOWeek, getISOWeekYear } from 'date-fns'
import type { KlippaProfile, KlippaExpenseRecord } from '@/lib/types'

export function countPendingLogbookWeeks(taxYear: number, reviewedWeekKeys: string[]): number {
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

export function formatRand(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}

// ── Profile completion ────────────────────────────────────

export interface ProfileCompletionResult {
  pct:     number
  done:    number
  total:   number
  missing: string[]
}

export function calcProfileCompletion(profile: KlippaProfile): ProfileCompletionResult {
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

// ── Audit readiness ───────────────────────────────────────

export interface AuditFactor { label: string; ok: boolean; detail: string }
export interface AuditReadinessResult {
  pct:     number
  factors: AuditFactor[]
}

export function computeAuditReadiness(input: {
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
