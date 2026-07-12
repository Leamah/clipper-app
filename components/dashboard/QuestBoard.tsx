'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Lock } from 'lucide-react'
import { activeQuests, lockedQuestCount, levelForXp, type QuestCtx, type QuestDef } from '@/lib/gamification'
import QuestModal, { type QuestModalKind } from '@/components/quests/QuestModals'
import RefundMeter from '@/components/gamification/RefundMeter'
import XpBadge from '@/components/gamification/XpBadge'
import type { KlippaProfile } from '@/lib/types'

/**
 * The first thing a new user sees: what to do next, why it's worth XP,
 * and the refund meter as the score. Renders nothing once every visible
 * quest is done — the dashboard then shows the compact RefundMeter instead.
 */
export default function QuestBoard({
  ctx, xp, taxSaved, deductionsTotal, userId, onProfilePatch, onAwarded,
}: {
  ctx:             QuestCtx
  xp:              number
  taxSaved:        number
  deductionsTotal: number
  userId:          string
  onProfilePatch:  (patch: Partial<KlippaProfile>) => void
  onAwarded:       () => void
}) {
  const [modal, setModal] = useState<QuestModalKind | null>(null)

  const quests = activeQuests(ctx, xp)
  const locked = lockedQuestCount(ctx, xp)
  if (quests.length === 0) return null

  const level = levelForXp(xp)
  const shown = quests.slice(0, 3)

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Quests · Level {level.level}</p>
          <h2 className="text-lg font-bold text-ink-1 mt-1">Your refund is hiding in your paperwork</h2>
          <p className="text-sm text-ink-2 mt-1">Finish quests, watch your tax savings climb.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <XpBadge xp={xp} />
          <RefundMeter taxSaved={taxSaved} deductionsTotal={deductionsTotal} />
        </div>
      </div>

      <div className="space-y-2.5">
        {shown.map((q) => <QuestRow key={q.id} quest={q} onModal={setModal} />)}
        {locked > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-edge/60 bg-surface/30 p-3.5 text-ink-3">
            <Lock className="w-4 h-4 shrink-0" />
            <p className="text-xs">{locked} more quest{locked !== 1 ? 's' : ''} unlock as you level up</p>
          </div>
        )}
      </div>

      {modal && (
        <QuestModal
          kind={modal}
          userId={userId}
          onClose={() => setModal(null)}
          onAnswered={(patch) => {
            setModal(null)
            onProfilePatch(patch)
            onAwarded()
          }}
        />
      )}
    </div>
  )
}

function QuestRow({ quest, onModal }: { quest: QuestDef; onModal: (m: QuestModalKind) => void }) {
  const inner = (
    <>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-1">{quest.title}</p>
        <p className="text-xs text-ink-2 mt-0.5 leading-snug">{quest.sub}</p>
      </div>
      <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 tabular-nums">
        +{quest.xp} XP
      </span>
      <ArrowRight className="w-4 h-4 shrink-0 text-ink-3 group-hover:text-emerald-500 transition-colors" />
    </>
  )

  const cls = 'group w-full flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-surface/50 hover:bg-surface/80 hover:border-emerald-500/50 p-3.5 transition-all text-left'

  return 'href' in quest.action
    ? <Link href={quest.action.href} className={cls}>{inner}</Link>
    : <button onClick={() => onModal((quest.action as { modal: QuestModalKind }).modal)} className={cls}>{inner}</button>
}
