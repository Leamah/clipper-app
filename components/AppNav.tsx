'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ShieldCheck, LayoutDashboard, TrendingUp, Receipt, FileText,
  Clock, Car, CalendarDays, ClipboardCheck, Settings, Users,
} from 'lucide-react'
import UserNav       from '@/components/UserNav'
import ThemeToggle   from '@/components/ThemeToggle'
import { supabase } from '@/lib/supabase'

export type ActivePage =
  | 'dashboard'
  | 'income'
  | 'expenses'
  | 'documents'
  | 'provisional'
  | 'filing'
  | 'mileage'
  | 'timesheets'
  | 'settings'
  | 'pricing'
  | 'subscription'
  | 'org'

export interface FeatureFlags {
  timesheets:  boolean
  logbook:     boolean
  provisional: boolean
  is_org_user?: boolean   // company_owner | practitioner
}

interface AppNavProps {
  activePage:      ActivePage
  featureFlags?:   FeatureFlags
  logbookPending?: number
}

const NAV_BASE   = 'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors'
const NAV_ACTIVE = `${NAV_BASE} text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 font-medium`
const NAV_IDLE   = `${NAV_BASE} text-ink-2 hover:text-ink-1 hover:bg-raised/50`

function navCls(page: ActivePage, active: ActivePage) {
  return page === active ? NAV_ACTIVE : NAV_IDLE
}

const DEFAULT_FLAGS: FeatureFlags = { timesheets: false, logbook: true, provisional: false, is_org_user: false }

export default function AppNav({
  activePage,
  featureFlags: propFlags,
  logbookPending = 0,
}: AppNavProps) {
  const [flags, setFlags] = useState<FeatureFlags>(propFlags ?? DEFAULT_FLAGS)

  useEffect(() => {
    if (propFlags) { setFlags(propFlags); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('klippa_profiles')
        .select('feature_timesheets, feature_logbook, feature_provisional, user_type')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setFlags({
              timesheets:  data.feature_timesheets  ?? false,
              logbook:     data.feature_logbook     ?? true,
              provisional: data.feature_provisional ?? false,
              is_org_user: data.user_type === 'company_owner' || data.user_type === 'practitioner',
            })
          }
        })
    })
  }, [propFlags])

  return (
    <aside className="fixed left-0 top-0 h-screen w-52 bg-base border-r border-edge/60 flex flex-col z-30">
      {/* Logo */}
      <div className="h-14 px-4 flex items-center border-b border-edge/60 flex-shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-ink-1">Klippa</span>
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        <Link href="/dashboard" className={navCls('dashboard', activePage)}>
          <LayoutDashboard className="w-4 h-4 shrink-0" /> Dashboard
        </Link>
        <Link href="/income" className={navCls('income', activePage)}>
          <TrendingUp className="w-4 h-4 shrink-0" /> Income
        </Link>
        <Link href="/expenses" className={navCls('expenses', activePage)}>
          <Receipt className="w-4 h-4 shrink-0" /> Expenses
        </Link>
        <Link href="/documents" className={navCls('documents', activePage)}>
          <FileText className="w-4 h-4 shrink-0" /> Documents
        </Link>

        {flags.timesheets && (
          <Link href="/timesheets" className={navCls('timesheets', activePage)}>
            <Clock className="w-4 h-4 shrink-0" /> Timesheets
          </Link>
        )}

        {flags.logbook && (
          <Link href="/mileage" className={navCls('mileage', activePage)}>
            <Car className="w-4 h-4 shrink-0" />
            <span className="flex-1">Mileage</span>
            {logbookPending > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold tabular-nums">
                {logbookPending}
              </span>
            )}
          </Link>
        )}

        {flags.provisional && (
          <Link href="/provisional" className={navCls('provisional', activePage)}>
            <CalendarDays className="w-4 h-4 shrink-0" /> Provisional
          </Link>
        )}

        <div className="pt-2 mt-1 border-t border-edge/40">
          <Link href="/filing" className={navCls('filing', activePage)}>
            <ClipboardCheck className="w-4 h-4 shrink-0" /> File Return
          </Link>
        </div>

        {flags.is_org_user && (
          <div className="pt-2 mt-1 border-t border-edge/40">
            <Link href="/org/dashboard" className={navCls('org' as ActivePage, activePage)}>
              <Users className="w-4 h-4 shrink-0" /> My Team
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom: Settings, theme toggle + user */}
      <div className="px-2 py-3 border-t border-edge/60 space-y-0.5">
        <Link href="/settings" className={navCls('settings', activePage)}>
          <Settings className="w-4 h-4 shrink-0" /> Settings
        </Link>
        <div className="flex items-center justify-between px-1 pt-1">
          <ThemeToggle />
        </div>
        <div className="px-1">
          <UserNav sidebar />
        </div>
      </div>
    </aside>
  )
}
