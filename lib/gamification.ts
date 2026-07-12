'use client'

/**
 * Gamification: XP events, levels, badges, and quests.
 *
 * All catalogues live here as data. XP values must mirror the
 * klippa_xp_catalog seed in migrations/023_gamification.sql — the DB wins
 * (a BEFORE-INSERT trigger overwrites client-sent points), so these copies
 * exist only for display.
 *
 * Award idempotency is schema-level: klippa_xp_events PK (user_id,
 * event_key) makes every event one-time; awardXp just swallows the
 * duplicate-key error. first_income / first_expense / first_document /
 * first_mileage_trip / first_invoice are awarded by DB triggers on the
 * record tables — the client never needs to fire those.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { calcProfileCompletion } from '@/lib/dashboard-utils'
import type { KlippaProfile, KlippaUserProgress, KlippaUserBadge } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'
import {
  Rocket, TrendingUp, Receipt, Sparkles, FileText, Car,
  UserCheck, PiggyBank, Trophy, ClipboardCheck,
} from 'lucide-react'

// ── XP events (mirror of klippa_xp_catalog — DB wins) ─────────────────

export const XP_EVENTS = {
  onboarding_complete:       { xp: 25,  label: 'Set up your profile' },
  first_income:              { xp: 50,  label: 'Logged first income' },
  first_expense:             { xp: 50,  label: 'Captured first expense' },
  first_ai_confirmed:        { xp: 40,  label: 'Confirmed an AI classification' },
  first_document:            { xp: 30,  label: 'Uploaded first document' },
  first_invoice:             { xp: 40,  label: 'Created first invoice' },
  first_mileage_trip:        { xp: 30,  label: 'Logged first business trip' },
  answered_vehicle:          { xp: 20,  label: 'Answered: do you drive for work?' },
  answered_work_location:    { xp: 20,  label: 'Answered: where do you work?' },
  answered_products:         { xp: 30,  label: 'Answered: money products' },
  personal_details_complete: { xp: 25,  label: 'Added name & birth date' },
  home_office_setup:         { xp: 40,  label: 'Home office set up' },
  vehicle_setup:             { xp: 40,  label: 'Vehicle & commute set up' },
  five_expenses:             { xp: 40,  label: '5 expenses captured' },
  tax_profile_complete:      { xp: 75,  label: 'Tax profile 100%' },
  return_filed:              { xp: 150, label: 'Filed your return' },
} as const

export type XpEventKey = keyof typeof XP_EVENTS

// ── Levels ────────────────────────────────────────────────────────────

export interface LevelDef { level: number; minXp: number; title: string }

export const LEVELS: LevelDef[] = [
  { level: 1, minXp: 0,    title: 'Getting Started'  },
  { level: 2, minXp: 100,  title: 'Tracker'          },
  { level: 3, minXp: 250,  title: 'Deduction Hunter' },
  { level: 4, minXp: 500,  title: 'Tax Tactician'    },
  { level: 5, minXp: 900,  title: 'SARS Whisperer'   },
  { level: 6, minXp: 1500, title: 'Refund Legend'    },
]

export function levelForXp(xp: number) {
  let current = LEVELS[0]
  for (const l of LEVELS) if (xp >= l.minXp) current = l
  return current
}

/** Progress toward the next level, for the ring/bar. pct = 100 at max level. */
export function levelProgress(xp: number) {
  const current = levelForXp(xp)
  const next    = LEVELS.find((l) => l.level === current.level + 1) ?? null
  const pct = next
    ? Math.min(100, Math.round(((xp - current.minXp) / (next.minXp - current.minXp)) * 100))
    : 100
  return { current, next, pct }
}

// ── Badges ────────────────────────────────────────────────────────────

export interface BadgeDef {
  id:   string
  name: string
  icon: LucideIcon
  description: string
}

export const BADGES: BadgeDef[] = [
  { id: 'quick_start',      name: 'Quick Start',      icon: Rocket,         description: 'Set up your profile' },
  { id: 'money_maker',      name: 'First Rand In',    icon: TrendingUp,     description: 'Logged your first income' },
  { id: 'deduction_hunter', name: 'Deduction Hunter', icon: Receipt,        description: 'Captured your first expense' },
  { id: 'ai_believer',      name: 'Robo-Approved',    icon: Sparkles,       description: 'Confirmed an AI classification' },
  { id: 'paper_trail',      name: 'Paper Trail',      icon: FileText,       description: 'Uploaded your first document' },
  { id: 'road_warrior',     name: 'Road Warrior',     icon: Car,            description: 'Logged your first business trip' },
  { id: 'full_picture',     name: 'Full Picture',     icon: UserCheck,      description: 'Completed your tax profile' },
  { id: 'refund_1k',        name: 'R1k Club',         icon: PiggyBank,      description: 'R1,000+ in deductions unlocked' },
  { id: 'refund_10k',       name: 'R10k Club',        icon: Trophy,         description: 'R10,000+ in deductions unlocked' },
  { id: 'filed',            name: 'Filed & Chilled',  icon: ClipboardCheck, description: 'Filed your return with SARS' },
]

export function badgeById(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id)
}

/** Badges earned automatically when the matching XP event exists. */
const EVENT_BADGES: Partial<Record<XpEventKey, string>> = {
  onboarding_complete:  'quick_start',
  first_income:         'money_maker',
  first_expense:        'deduction_hunter',
  first_ai_confirmed:   'ai_believer',
  first_document:       'paper_trail',
  first_mileage_trip:   'road_warrior',
  tax_profile_complete: 'full_picture',
  return_filed:         'filed',
}

/** Badges earned when total deductions cross a rand threshold. */
const THRESHOLD_BADGES: { id: string; minDeductions: number }[] = [
  { id: 'refund_1k',  minDeductions: 1_000 },
  { id: 'refund_10k', minDeductions: 10_000 },
]

// ── Quests ────────────────────────────────────────────────────────────

export interface QuestCtx {
  profile:     KlippaProfile
  events:      Set<string>
  hasIncome:   boolean
  hasExpenses: boolean
}

export type QuestAction = { href: string } | { modal: 'vehicle' | 'work_location' | 'products' }

export interface QuestDef {
  id:     string
  level:  number
  title:  string
  sub:    string
  xp:     number
  action: QuestAction
  isDone(ctx: QuestCtx): boolean
  visible?(ctx: QuestCtx): boolean
}

export const QUESTS: QuestDef[] = [
  // Level 1 — the core loop
  {
    id: 'add_income', level: 1, xp: 50,
    title: 'Log your first income',
    sub:   'What you’ve earned this tax year — Klippa works out what SARS owes you.',
    action: { href: '/income?add=1' },
    isDone: (c) => c.hasIncome || c.events.has('first_income'),
  },
  {
    id: 'add_expense', level: 1, xp: 50,
    title: 'Capture your first expense',
    sub:   'Every business cost you log shrinks your tax bill.',
    action: { href: '/expenses?add=1' },
    isDone: (c) => c.hasExpenses || c.events.has('first_expense'),
  },
  {
    id: 'try_ai', level: 1, xp: 40,
    title: 'Let AI classify an expense',
    sub:   'Add an expense with AI on, then confirm its deduction call.',
    action: { href: '/expenses?add=1' },
    isDone: (c) => c.events.has('first_ai_confirmed'),
  },
  // Level 2 — the deferred onboarding questions + habits
  {
    id: 'vehicle_q', level: 2, xp: 20,
    title: 'Do you drive for work?',
    sub:   'Client visits and site trips are one of the biggest freelancer deductions.',
    action: { modal: 'vehicle' },
    isDone: (c) => c.events.has('answered_vehicle'),
  },
  {
    id: 'worklocation_q', level: 2, xp: 20,
    title: 'Where do you work from?',
    sub:   'Working from home can unlock a home office deduction.',
    action: { modal: 'work_location' },
    isDone: (c) => c.events.has('answered_work_location'),
  },
  {
    id: 'products_q', level: 2, xp: 30,
    title: 'Unlock extra deductions',
    sub:   'RA, medical aid, TFSA — tell us what you have and we’ll claim what counts.',
    action: { modal: 'products' },
    isDone: (c) => c.events.has('answered_products'),
  },
  {
    id: 'upload_receipt', level: 2, xp: 30,
    title: 'Upload your first document',
    sub:   'Receipts and certificates back up your claims if SARS ever asks.',
    action: { href: '/documents?add=1' },
    isDone: (c) => c.events.has('first_document'),
  },
  {
    id: 'personal_details', level: 2, xp: 25,
    title: 'Add your name & birth date',
    sub:   'Your age changes your tax rebates — takes 20 seconds.',
    action: { href: '/settings' },
    isDone: (c) => !!c.profile.full_name && !!c.profile.date_of_birth,
  },
  // Level 3 — deepening the profile, then filing
  {
    id: 'home_office_setup', level: 3, xp: 40,
    title: 'Set up your home office claim',
    sub:   'Your work-from-home percentage and running costs become a deduction.',
    action: { href: '/settings' },
    isDone:  (c) => (c.profile.home_office_pct ?? 0) > 0 && (c.profile.home_expenses_annual ?? 0) > 0,
    visible: (c) => !!c.profile.works_from_home,
  },
  {
    id: 'vehicle_setup', level: 3, xp: 40,
    title: 'Add your vehicle & commute',
    sub:   'Vehicle value and commute distance power your travel deduction.',
    action: { href: '/settings' },
    isDone:  (c) => (c.profile.vehicle_value ?? 0) > 0 && (c.profile.commute_km ?? 0) > 0,
    visible: (c) => !!c.profile.has_vehicle,
  },
  {
    id: 'tax_profile', level: 3, xp: 75,
    title: 'Complete your tax profile',
    sub:   'A 100% profile means your tax estimate is as accurate as it gets.',
    action: { href: '/settings' },
    isDone: (c) => calcProfileCompletion(c.profile).pct === 100,
  },
  {
    id: 'file_return', level: 3, xp: 150,
    title: 'Review and file your return',
    sub:   'The final boss. Klippa maps everything to your ITR12.',
    action: { href: '/filing' },
    isDone:  (c) => c.events.has('return_filed'),
    visible: (c) => c.hasIncome,
  },
]

/**
 * Quests to show right now: visible, not done, level-gated.
 * A level unlocks when the user's XP level reaches it OR every visible
 * quest of the levels below is done (so nobody is ever stuck waiting).
 */
export function activeQuests(ctx: QuestCtx, xp: number): QuestDef[] {
  const userLevel = levelForXp(xp).level
  const visible   = QUESTS.filter((q) => q.visible?.(ctx) ?? true)
  const unlocked  = (level: number): boolean =>
    level <= 1 ||
    userLevel >= level ||
    visible.filter((q) => q.level < level).every((q) => q.isDone(ctx))
  return visible.filter((q) => !q.isDone(ctx) && unlocked(q.level))
}

/** Count of not-yet-unlocked (locked-level) undone quests, for the teaser row. */
export function lockedQuestCount(ctx: QuestCtx, xp: number): number {
  const active = new Set(activeQuests(ctx, xp).map((q) => q.id))
  return QUESTS.filter((q) => (q.visible?.(ctx) ?? true) && !q.isDone(ctx) && !active.has(q.id)).length
}

// ── Awarding ──────────────────────────────────────────────────────────

/**
 * Idempotent XP award — never blocks the primary action.
 * Returns true only when newly awarded (caller may celebrate).
 */
export async function awardXp(userId: string, eventKey: XpEventKey): Promise<boolean> {
  const { error } = await supabase
    .from('klippa_xp_events')
    .insert({ user_id: userId, event_key: eventKey })
  if (!error) return true
  if (error.code === '23505') return false // duplicate — already earned
  console.warn('awardXp failed', eventKey, error.message)
  return false
}

/** Ensure the progress row exists (called at onboarding completion). */
export async function ensureProgressRow(userId: string): Promise<void> {
  const { error } = await supabase
    .from('klippa_user_progress')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (error) console.warn('ensureProgressRow failed', error.message)
}

// ── Dashboard hook: state + self-healing reconciliation ──────────────

export interface GamificationState {
  progress: KlippaUserProgress | null
  events:   Set<string>
  badges:   KlippaUserBadge[]
  loaded:   boolean
  refresh:  () => Promise<void>
  markBadgeCelebrated: (badgeId: string) => Promise<void>
  markLevelCelebrated: (level: number) => Promise<void>
}

export function useGamification(args: {
  userId:          string | null
  profile:         KlippaProfile | null
  hasIncome:       boolean
  hasExpenses:     boolean
  deductionsTotal: number
  /** true once records are loaded — gates the reconcile pass */
  ready:           boolean
}): GamificationState {
  const { userId, profile, hasIncome, hasExpenses, deductionsTotal, ready } = args
  const [progress, setProgress] = useState<KlippaUserProgress | null>(null)
  const [events,   setEvents]   = useState<Set<string>>(new Set())
  const [badges,   setBadges]   = useState<KlippaUserBadge[]>([])
  const [loaded,   setLoaded]   = useState(false)
  const reconciled = useRef(false)

  const refresh = useCallback(async () => {
    if (!userId) return
    const [progRes, evRes, badgeRes] = await Promise.all([
      supabase.from('klippa_user_progress').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('klippa_xp_events').select('event_key').eq('user_id', userId),
      supabase.from('klippa_user_badges').select('*').eq('user_id', userId),
    ])
    setProgress((progRes.data as KlippaUserProgress | null) ?? null)
    setEvents(new Set(((evRes.data ?? []) as { event_key: string }[]).map((e) => e.event_key)))
    setBadges((badgeRes.data ?? []) as KlippaUserBadge[])
    setLoaded(true)
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  // One reconcile pass per mount, once everything is loaded: award
  // derivable events a save path may have missed, and sync badges from
  // events + deduction thresholds. Self-healing, all idempotent.
  useEffect(() => {
    if (!ready || !loaded || !userId || !profile || reconciled.current) return
    reconciled.current = true
    ;(async () => {
      let changed = false

      const derivable: { key: XpEventKey; due: boolean }[] = [
        { key: 'personal_details_complete', due: !!profile.full_name && !!profile.date_of_birth },
        { key: 'home_office_setup',         due: (profile.home_office_pct ?? 0) > 0 && (profile.home_expenses_annual ?? 0) > 0 },
        { key: 'vehicle_setup',             due: (profile.vehicle_value ?? 0) > 0 && (profile.commute_km ?? 0) > 0 },
        { key: 'tax_profile_complete',      due: calcProfileCompletion(profile).pct === 100 },
      ]
      for (const { key, due } of derivable) {
        if (due && !events.has(key) && await awardXp(userId, key)) changed = true
      }

      // Event-mapped + threshold badges
      const owned = new Set(badges.map((b) => b.badge_id))
      const dueBadges: string[] = []
      for (const [eventKey, badgeId] of Object.entries(EVENT_BADGES)) {
        if ((events.has(eventKey) || derivable.some((d) => d.key === eventKey && d.due)) && !owned.has(badgeId)) {
          dueBadges.push(badgeId)
        }
      }
      for (const { id, minDeductions } of THRESHOLD_BADGES) {
        if (deductionsTotal >= minDeductions && !owned.has(id)) dueBadges.push(id)
      }
      if (dueBadges.length > 0) {
        const { error } = await supabase.from('klippa_user_badges').upsert(
          dueBadges.map((badge_id) => ({ user_id: userId, badge_id })),
          { onConflict: 'user_id,badge_id', ignoreDuplicates: true },
        )
        if (!error) changed = true
      }

      if (changed) await refresh()
    })()
  }, [ready, loaded, userId, profile, events, badges, deductionsTotal, refresh])

  // Threshold badges can also be crossed live (realtime expense confirm)
  useEffect(() => {
    if (!loaded || !userId) return
    const owned = new Set(badges.map((b) => b.badge_id))
    const due = THRESHOLD_BADGES.filter((t) => deductionsTotal >= t.minDeductions && !owned.has(t.id))
    if (due.length === 0) return
    ;(async () => {
      const { error } = await supabase.from('klippa_user_badges').upsert(
        due.map((t) => ({ user_id: userId, badge_id: t.id })),
        { onConflict: 'user_id,badge_id', ignoreDuplicates: true },
      )
      if (!error) await refresh()
    })()
  }, [deductionsTotal, loaded, userId, badges, refresh])

  // hasIncome / hasExpenses flips (realtime) don't need refetching — quest
  // ctx consumes them directly — but a flip means DB triggers just awarded
  // first_* events, so pull those in for the events set / XP total.
  const flipKey = `${hasIncome}|${hasExpenses}`
  const prevFlipKey = useRef(flipKey)
  useEffect(() => {
    if (!loaded) return
    if (prevFlipKey.current !== flipKey) {
      prevFlipKey.current = flipKey
      refresh()
    }
  }, [flipKey, loaded, refresh])

  const markBadgeCelebrated = useCallback(async (badgeId: string) => {
    if (!userId) return
    setBadges((prev) => prev.map((b) => b.badge_id === badgeId ? { ...b, celebrated: true } : b))
    await supabase.from('klippa_user_badges')
      .update({ celebrated: true })
      .eq('user_id', userId).eq('badge_id', badgeId)
  }, [userId])

  const markLevelCelebrated = useCallback(async (level: number) => {
    if (!userId) return
    setProgress((prev) => prev ? { ...prev, last_level_celebrated: level } : prev)
    await supabase.from('klippa_user_progress')
      .update({ last_level_celebrated: level })
      .eq('user_id', userId)
  }, [userId])

  return { progress, events, badges, loaded, refresh, markBadgeCelebrated, markLevelCelebrated }
}
