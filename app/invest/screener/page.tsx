'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { TrendingUp, Loader2, Search, Plus } from 'lucide-react'
import type { KlippaProfile, InvestCompany, FeatureFlags } from '@/lib/types'

const PERIODS = ['3M', '6M', '1Y', '3Y', '5Y'] as const
type Period = typeof PERIODS[number]

const FAIS_DISCLAIMER = 'FINscope Invest provides data-driven screening and AI-generated education. This is not financial advice as defined by the FAIS Act.'

export default function InvestScreenerPage() {
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [companies,    setCompanies]    = useState<InvestCompany[]>([])
  const [loading,      setLoading]      = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [period,       setPeriod]       = useState<Period>('1Y')
  const [search,       setSearch]       = useState('')
  const [sector,       setSector]       = useState('')
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
      }

      await fetchCompanies()
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchCompanies() {
    setSearchLoading(true)
    let q = supabase
      .from('klippa_invest_companies')
      .select('*')
      .order('market_cap_zar', { ascending: false })
      .limit(50)

    if (search.trim()) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    if (sector.trim()) q = q.eq('sector', sector)

    const { data } = await q
    setCompanies((data ?? []) as InvestCompany[])
    setSearchLoading(false)
  }

  async function addToWatchlist(code: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('klippa_invest_watchlist').upsert(
      { user_id: user.id, company_code: code, sens_alerts_enabled: true },
      { onConflict: 'user_id,company_code' }
    )
  }

  if (loading) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
      </main>
    </div>
  )

  if (!profile?.feature_invest_basic) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-2xl mx-auto text-center space-y-4">
        <TrendingUp className="w-10 h-10 text-ink-3 mx-auto" />
        <h1 className="text-lg font-bold">FINscope Invest is not available on your plan</h1>
        <Link href="/subscription" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Upgrade to access</Link>
      </main>
    </div>
  )

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-4xl mx-auto space-y-6">

        <div>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Best Return Screener
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">JSE Main Board · screened shortlist — not financial advice</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCompanies()}
              placeholder="Search company name or ticker…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-edge bg-surface text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <button
            onClick={fetchCompanies}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
          >
            {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </div>

        {/* Period selector */}
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                period === p ? 'bg-emerald-600 text-white' : 'border border-edge text-ink-2 hover:text-ink-1'
              }`}>
              {p}
            </button>
          ))}
        </div>

        {/* Results table */}
        {companies.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-surface/40 p-8 text-center">
            <p className="text-sm text-ink-3">
              {searchLoading ? 'Loading companies…' : 'No JSE data available yet. The ShareData financial feed will populate this table once the data agreement is in place.'}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-edge overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-edge bg-surface/60">
                    <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Company</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Sector</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-2">Market Cap</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-2">Return ({period})</th>
                    <th className="px-4 py-3 text-xs font-medium text-ink-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.code} className="border-b border-edge/60 last:border-0 hover:bg-surface/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/invest/companies/${c.code}`} className="group">
                          <p className="text-sm font-medium text-ink-1 group-hover:text-emerald-500 transition-colors">{c.name}</p>
                          <p className="text-xs text-ink-3">{c.code}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-2">{c.sector ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-xs text-ink-2">
                        {c.market_cap_zar ? `R${(c.market_cap_zar / 1e9).toFixed(1)}bn` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-ink-3">
                        — {/* Return % computed from financials once data is loaded */}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => addToWatchlist(c.code)}
                          title="Add to watchlist"
                          className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-ink-3 hover:text-emerald-500 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>
      </main>
    </div>
  )
}
