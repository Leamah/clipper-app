'use client'

// ============================================================
// AppNav — Shared top navigation bar for all app pages
// ============================================================
// Feature-gated links: Mileage / Provisional / Timesheets are
// shown only when the corresponding feature flag is enabled
// in the user's profile (opt-in via Settings).
//
// When featureFlags is not passed, AppNav self-fetches a
// lightweight profile query (3 columns only) so all pages
// show the correct feature-gated links without each page
// needing to load the full profile.
// ============================================================

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ShieldCheck, AlertCircle } from 'lucide-react'
import UserNav from '@/components/UserNav'
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

export interface FeatureFlags {
  timesheets:  boolean
  logbook:     boolean
  provisional: boolean
}

interface AppNavProps {
  activePage:      ActivePage
  featureFlags?:   FeatureFlags
  logbookPending?: number
}

const NAV_BASE = 'px-3 py-1.5 rounded-lg text-xs transition-colors'
const NAV_ACTIVE = `${NAV_BASE} text-emerald-300 bg-emerald-500/10 font-medium`
const NAV_IDLE   = `${NAV_BASE} text-zinc-500 hover:text-zinc-300`

function navCls(page: ActivePage, active: ActivePage) {
  return page === active ? NAV_ACTIVE : NAV_IDLE
}

const DEFAULT_FLAGS: FeatureFlags = { timesheets: false, logbook: true, provisional: false }

export default function AppNav({
  activePage,
  featureFlags: propFlags,
  logbookPending = 0,
}: AppNavProps) {
  const [flags, setFlags] = useState<FeatureFlags>(propFlags ?? DEFAULT_FLAGS)

  // Self-fetch feature flags once when not provided by parent
  useEffect(() => {
    if (propFlags) { setFlags(propFlags); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('klippa_profiles')
        .select('feature_timesheets, feature_logbook, feature_provisional')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setFlags({
              timesheets:  data.feature_timesheets  ?? false,
              logbook:     data.feature_logbook     ?? true,
              provisional: data.feature_provisional ?? false,
            })
          }
        })
    })
  }, [propFlags])

  return (
    <header className="relative z-30 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Klippa</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 ml-4 overflow-x-auto scrollbar-none">
          <Link href="/dashboard" className={navCls('dashboard', activePage)}>Dashboard</Link>
          <Link href="/income"    className={navCls('income',    activePage)}>Income</Link>
          <Link href="/expenses"  className={navCls('expenses',  activePage)}>Expenses</Link>
          <Link href="/documents" className={navCls('documents', activePage)}>Documents</Link>

          {flags.timesheets && (
            <Link href="/timesheets" className={navCls('timesheets', activePage)}>Timesheets</Link>
          )}

          {flags.logbook && (
            <Link href="/mileage" className={navCls('mileage', activePage)}>Mileage</Link>
          )}

          {flags.provisional && (
            <Link href="/provisional" className={navCls('provisional', activePage)}>Provisional</Link>
          )}

          <Link href="/filing" className={navCls('filing', activePage)}>File Return</Link>
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {flags.logbook && logbookPending > 0 && (
            <Link
              href="/mileage"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/50 transition-colors text-[11px] text-amber-300 font-medium"
            >
              <AlertCircle className="w-3 h-3" />
              {logbookPending}w logbook
            </Link>
          )}
          <UserNav />
        </div>
      </div>
    </header>
  )
}
