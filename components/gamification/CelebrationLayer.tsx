'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { badgeById, levelForXp, LEVELS } from '@/lib/gamification'
import type { KlippaUserProgress, KlippaUserBadge } from '@/lib/types'

interface Celebration {
  kind:  'badge' | 'level'
  key:   string          // badge_id or level number as string
  title: string
  sub:   string
  Icon?: React.ComponentType<{ className?: string }>
}

/**
 * Watches progress + badges and fires confetti + a toast for anything not
 * yet celebrated, then persists the dedupe flag so nothing re-fires on
 * refresh. One celebration at a time, ~4s each.
 */
export default function CelebrationLayer({
  progress, badges, onBadgeCelebrated, onLevelCelebrated,
}: {
  progress: KlippaUserProgress | null
  badges:   KlippaUserBadge[]
  onBadgeCelebrated: (badgeId: string) => Promise<void>
  onLevelCelebrated: (level: number) => Promise<void>
}) {
  const [current, setCurrent] = useState<Celebration | null>(null)
  const queue   = useRef<Celebration[]>([])
  const queued  = useRef<Set<string>>(new Set())
  const showing = useRef(false)

  const showNext = useCallback(() => {
    const next = queue.current.shift()
    if (!next) { showing.current = false; return }
    showing.current = true
    setCurrent(next)
    confetti({
      particleCount: 90,
      spread:        70,
      origin:        { y: 0.7 },
      colors:        ['#10b981', '#14b8a6', '#f59e0b', '#ffffff'],
    })
    setTimeout(() => {
      setCurrent(null)
      setTimeout(showNext, 350) // let the exit animation finish
    }, 4000)
  }, [])

  useEffect(() => {
    // Level-ups first (bigger moment), then badges
    if (progress) {
      const level = levelForXp(progress.xp).level
      for (let l = progress.last_level_celebrated + 1; l <= level; l++) {
        const id = `level:${l}`
        if (queued.current.has(id)) continue
        queued.current.add(id)
        const def = LEVELS.find((x) => x.level === l)
        queue.current.push({
          kind: 'level', key: String(l),
          title: `Level ${l} — ${def?.title ?? ''}`,
          sub:   'Keep going. Every action sharpens your tax position.',
        })
        onLevelCelebrated(l) // persist immediately so a refresh mid-toast can't re-fire
      }
    }
    for (const b of badges) {
      if (b.celebrated) continue
      const id = `badge:${b.badge_id}`
      if (queued.current.has(id)) continue
      const def = badgeById(b.badge_id)
      if (!def) continue
      queued.current.add(id)
      queue.current.push({
        kind: 'badge', key: b.badge_id,
        title: `Badge earned: ${def.name}`,
        sub:   def.description,
        Icon:  def.icon,
      })
      onBadgeCelebrated(b.badge_id)
    }
    if (!showing.current && queue.current.length > 0) showNext()
  }, [progress, badges, onBadgeCelebrated, onLevelCelebrated, showNext])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <AnimatePresence>
        {current && (
          <motion.div
            key={`${current.kind}:${current.key}`}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-emerald-500/40 bg-surface shadow-2xl shadow-emerald-900/40"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              {current.Icon
                ? <current.Icon className="w-5 h-5 text-emerald-400" />
                : <span className="text-lg">🎉</span>}
            </div>
            <div>
              <p className="text-sm font-bold text-ink-1">{current.title}</p>
              <p className="text-xs text-ink-2">{current.sub}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
