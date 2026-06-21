'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  BarChart2, Search, Compass, Star, BookOpen, GitCompare,
  TrendingUp, Loader2, AlertCircle, Plus, Bell,
} from 'lucide-react'
import type { KlippaProfile, InvestWatchlistEntry, FeatureFlags } from '@/lib/types'

const FAIS_DISCLAIMER = 'FINscope Invest provides data-driven screening, analysis, and AI-generated education. This is not financial advice as defined by the FAIS Act. For personalised advice, consult an authorised Financial Services Provider.'

export default function InvestDashboardPage() {
  const [profile,   setProfile]   = useState<KlippaProfile | null>(null)
  const [watchlist, setWatchlist] = useState<InvestWatchlistEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ timesheets: false, logbook: false, provisional: false })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('klippa_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (prof) {
        setProfile(prof as KlippaProfile)
        setFeatureFlags({
          timesheets:     prof.feature_timesheets  ?? false,
          logbook:        prof.feature_logbook     ?? false,
          provisional:    prof.feature_provisional ?? false,
          is_org_user:    prof.user_type === 'company_owner' || prof.user_type === 'practitioner',
          invest_basic:   prof.feature_invest_basic  ?? false,
          invest_enabled: prof.invest_enabled ?? false,
        })

        const { data: wl } = await supabase
          .from('klippa_invest_watchlist')
          .select('*, company:klippa_invest_companies(*)')
          .eq('user_id', user.id)
          .order('added_at', { ascending: false })
          .limit(5)

        setWatchlist((wl ?? []) as InvestWatchlistEntry[])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
      </main>
    </div>
  )

  const isFull = profile?.feature_invest_full ?? false

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-500" />
              FINscope Invest
            </h1>
            <p className="text-xs text-ink-3 mt-0.5">Johannesburg Stock Exchange · AI-powered analysis</p>
          </div>
          <Link href="/invest/screener"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">
            <Search className="w-3.5 h-3.5" /> Screener
          </Link>
        </div>

        {/* Upgrade nudge for basic users */}
        {!isFull && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-1">You have Basic Invest</p>
              <p className="text-xs text-ink-2 mt-0.5">Screener, Buffett philosophy, and M01–M04 company snapshots. <Link href="/subscription" className="text-emerald-500 hover:underline">Upgrade to Starter</Link> for all 13 modules and the Portfolio Builder.</p>
            </div>
          </div>
        )}

        {/* Quick nav grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { href: '/invest/screener',            icon: <TrendingUp className="w-5 h-5 text-emerald-400" />, label: 'Best Return Screener', gate: true },
            { href: '/invest/philosophies/buffett', icon: <Star className="w-5 h-5 text-amber-400" />,        label: 'Buffett Philosophy',    gate: true },
            { href: '/invest/compass',              icon: <Compass className="w-5 h-5 text-sky-400" />,       label: 'Investment Compass',    gate: true },
            { href: '/invest/portfolio',            icon: <BarChart2 className="w-5 h-5 text-violet-400" />,  label: 'Portfolio Builder',     gate: isFull },
            { href: '/invest/compare',              icon: <GitCompare className="w-5 h-5 text-teal-400" />,   label: 'Compare Companies',     gate: isFull },
            { href: '/invest/learning',             icon: <BookOpen className="w-5 h-5 text-ink-2" />,        label: 'IFRS Learning Mode',    gate: isFull },
            { href: '/invest/sens',                 icon: <Bell className="w-5 h-5 text-amber-400" />,       label: 'SENS Alerts',           gate: isFull },
          ].map(({ href, icon, label, gate }) => (
            gate ? (
              <Link key={href} href={href}
                className="rounded-2xl border border-edge bg-surface/40 hover:bg-surface hover:border-emerald-500/30 p-4 flex flex-col gap-3 transition-all group">
                {icon}
                <p className="text-xs font-medium text-ink-1 group-hover:text-ink-1 leading-snug">{label}</p>
              </Link>
            ) : (
              <div key={href}
                className="rounded-2xl border border-edge bg-surface/20 p-4 flex flex-col gap-3 opacity-50 cursor-not-allowed relative">
                {icon}
                <p className="text-xs font-medium text-ink-2 leading-snug">{label}</p>
                <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold">Full</span>
              </div>
            )
          ))}
        </div>

        {/* Watchlist */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-1">Watchlist</h2>
            <Link href="/invest/screener" className="text-xs text-emerald-500 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add
            </Link>
          </div>
          {watchlist.length === 0 ? (
            <p className="text-xs text-ink-3 py-4 text-center">No companies on your watchlist yet. Use the screener to find companies and add them.</p>
          ) : (
            <div className="space-y-2">
              {watchlist.map((entry) => (
                <Link key={entry.company_code} href={`/invest/companies/${entry.company_code}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-raised/50 transition-colors group">
                  <div>
                    <p className="text-sm font-medium text-ink-1">{entry.company?.name ?? entry.company_code}</p>
                    <p className="text-xs text-ink-3">{entry.company_code} · {entry.company?.sector ?? '—'}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* FAIS disclaimer */}
        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>

      </main>
    </div>
  )
}
