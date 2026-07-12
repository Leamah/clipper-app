'use client'

import { useState, useEffect } from 'react'
import { useSpring, useMotionValueEvent } from 'framer-motion'
import { PiggyBank } from 'lucide-react'
import { formatRand } from '@/lib/dashboard-utils'

/**
 * Money-as-score: tax saved so far, springing upward whenever a new
 * record lands (realtime patches recompute the target; a target-value
 * animation is idempotent under event churn).
 */
export default function RefundMeter({
  taxSaved, deductionsTotal, compact = false,
}: {
  taxSaved:        number
  deductionsTotal: number
  compact?:        boolean
}) {
  const spring = useSpring(0, { stiffness: 60, damping: 18 })
  const [display, setDisplay] = useState(0)

  useEffect(() => { spring.set(Math.max(0, taxSaved)) }, [taxSaved, spring])
  useMotionValueEvent(spring, 'change', (v) => setDisplay(Math.round(v)))

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <PiggyBank className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-ink-2">Tax saved so far</p>
            <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatRand(display)}</p>
          </div>
        </div>
        <p className="text-xs text-ink-2 text-right shrink-0">
          {formatRand(deductionsTotal)} in deductions unlocked
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-ink-2">Tax saved so far</p>
      <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatRand(display)}</p>
      <p className="text-xs text-ink-3">{formatRand(deductionsTotal)} in deductions unlocked</p>
    </div>
  )
}
