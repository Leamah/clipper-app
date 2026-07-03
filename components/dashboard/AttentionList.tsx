'use client'

import Link from 'next/link'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface AttentionItem {
  key:    string
  icon:   LucideIcon
  label:  string
  detail: string
  href:   string
  tone:   'red' | 'amber' | 'neutral'
}

const TONES = {
  red:     { card: 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10',     icon: 'bg-red-500/15 text-red-400' },
  amber:   { card: 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10', icon: 'bg-amber-500/15 text-amber-400' },
  neutral: { card: 'border-edge bg-surface/40 hover:bg-surface/60',           icon: 'bg-emerald-500/10 text-emerald-500' },
}

/**
 * Rule-based surfacing: shows at most three things that actually need
 * the user right now, instead of permanent banners. Empty = one calm line.
 */
export default function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-edge/60 bg-surface/30 text-sm text-ink-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        You&apos;re up to date — nothing needs your attention.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-2 uppercase tracking-wider">Needs attention</p>
      {items.slice(0, 3).map(({ key, icon: Icon, label, detail, href, tone }) => (
        <Link
          key={key}
          href={href}
          className={`group flex items-center gap-3 rounded-2xl border p-3.5 transition-all ${TONES[tone].card}`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${TONES[tone].icon}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-1">{label}</p>
            <p className="text-xs text-ink-2 leading-snug">{detail}</p>
          </div>
          <ChevronRight className="w-4 h-4 flex-shrink-0 text-ink-3 group-hover:text-emerald-400 transition-colors" />
        </Link>
      ))}
    </div>
  )
}
