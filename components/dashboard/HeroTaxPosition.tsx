'use client'

import Link from 'next/link'
import { Clock, PiggyBank } from 'lucide-react'
import { formatRand } from '@/lib/dashboard-utils'
import type { ProvisionalRunway } from '@/lib/tax-engine'

/**
 * The one answer the dashboard leads with: what's safe to spend,
 * what to set aside, and the next deadline that matters.
 */
export default function HeroTaxPosition({
  totalIncome, taxToSave, safeToSpend, hasTaxResult,
  taxYear, daysLeft, provisionalRunway,
}: {
  totalIncome:       number
  taxToSave:         number
  safeToSpend:       number
  hasTaxResult:      boolean
  taxYear:           number
  daysLeft:          number
  provisionalRunway: ProvisionalRunway | null
}) {
  // The nearest deadline wins the chip: an upcoming IRP6 instalment
  // beats the (usually distant) ITR12 filing date.
  const chip = provisionalRunway && provisionalRunway.daysLeft <= daysLeft
    ? {
        label: provisionalRunway.daysLeft < 0
          ? `${provisionalRunway.instalment} provisional payment overdue`
          : `${provisionalRunway.instalment} provisional payment in ${provisionalRunway.daysLeft} days`,
        days:  provisionalRunway.daysLeft,
        href:  '/provisional',
      }
    : {
        label: daysLeft > 0 ? `Filing deadline in ${daysLeft} days` : 'Filing deadline passed',
        days:  daysLeft,
        href:  '/filing',
      }

  const chipTone = chip.days < 0
    ? 'bg-red-500/15 text-red-300 border border-red-500/30'
    : chip.days <= 30
      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
      : 'bg-raised text-ink-2 border border-transparent'

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-surface/60 p-6 space-y-4 ring-1 ring-emerald-500/10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">
          Tax year {taxYear} · Safe to spend
        </p>
        <Link href={chip.href} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:opacity-80 ${chipTone}`}>
          <Clock className="w-3.5 h-3.5" />
          {chip.label}
        </Link>
      </div>

      {/* Show a negative position honestly — clamping to R0 hides exactly
          the situation the user most needs to see. */}
      <p className={`text-4xl font-bold tabular-nums ${safeToSpend < 0 ? 'text-red-400' : 'text-ink-1'}`}>
        {formatRand(safeToSpend)}
      </p>
      {safeToSpend < 0 && (
        <p className="text-xs text-red-400/80">
          Your expenses plus the tax set-aside exceed what you&apos;ve earned this year — review your expenses and tax position.
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <p className="text-ink-2">
          Earned <span className="text-ink-1 font-semibold tabular-nums">{formatRand(totalIncome)}</span>
        </p>
        <p className="text-ink-2">
          Set aside for tax{' '}
          <span className="text-amber-400 font-semibold tabular-nums">{formatRand(Math.max(0, taxToSave))}</span>
        </p>
        {provisionalRunway && provisionalRunway.daysLeft >= 0 && provisionalRunway.perMonth > 0 && (
          <p className="text-ink-2 flex items-center gap-1.5">
            <PiggyBank className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-semibold tabular-nums">{formatRand(provisionalRunway.perMonth)}/mo</span>
            &nbsp;to be ready
          </p>
        )}
      </div>

      {!hasTaxResult && totalIncome === 0 && (
        <p className="text-xs text-ink-3">Add your first income to see your live tax position.</p>
      )}
    </div>
  )
}
