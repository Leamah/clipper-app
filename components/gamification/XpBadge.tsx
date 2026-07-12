'use client'

import { levelProgress } from '@/lib/gamification'

/** Compact level pill: progress ring + "Lv 2 · Tracker · 140 XP". */
export default function XpBadge({ xp }: { xp: number }) {
  const { current, next, pct } = levelProgress(xp)

  const r    = 8
  const circ = 2 * Math.PI * r

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-edge bg-surface/60 text-xs">
      <div className="relative w-5 h-5">
        <svg viewBox="0 0 20 20" className="w-full h-full -rotate-90">
          <circle cx="10" cy="10" r={r} fill="none" stroke="#27272a" strokeWidth="2" />
          <circle
            cx="10" cy="10" r={r}
            fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-emerald-400">
          {current.level}
        </span>
      </div>
      <span className="font-semibold text-ink-1">{current.title}</span>
      <span className="text-ink-3 tabular-nums">
        {xp} XP{next ? ` · ${next.minXp - xp} to Lv ${next.level}` : ''}
      </span>
    </div>
  )
}
