'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { GitCompare, Loader2, Lock, X, Plus } from 'lucide-react'
import type { KlippaProfile, InvestCompany, FeatureFlags } from '@/lib/types'

const FAIS_DISCLAIMER = 'Multi-company comparison is for informational screening only and does not constitute financial advice as defined by the FAIS Act.'

export default function InvestComparePage() {
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [searchResults, setSearchResults] = useState<InvestCompany[]>([])
  const [selected,     setSelected]     = useState<InvestCompany[]>([])
  const [comparing,    setComparing]    = useState(false)
  const [comparison,   setComparison]   = useState<Record<string, unknown> | null>(null)
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
      setLoading(false)
    }
    load()
  }, [])

  async function searchCompanies(q: string) {
    if (!q.trim()) { setSearchResults([]); return }
    const { data } = await supabase
      .from('klippa_invest_companies')
      .select('*')
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .limit(8)
    setSearchResults((data ?? []) as InvestCompany[])
  }

  function addCompany(c: InvestCompany) {
    if (selected.length >= 5 || selected.find((s) => s.code === c.code)) return
    setSelected((p) => [...p, c])
    setSearch('')
    setSearchResults([])
  }

  async function runComparison() {
    if (selected.length < 2) return
    setComparing(true)
    const res = await fetch('/api/invest/compare', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ codes: selected.map((c) => c.code) }),
    })
    if (res.ok) setComparison(await res.json())
    setComparing(false)
  }

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

        <div>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-teal-400" />
            Multi-Company Comparison
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">Side-by-side analysis of up to 5 JSE companies</p>
        </div>

        {!isFull ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center space-y-4">
            <Lock className="w-10 h-10 text-amber-400 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-ink-1">Comparison Engine requires Full Invest</p>
              <p className="text-xs text-ink-2 mt-1">Available on Starter and Professional plans.</p>
            </div>
            <Link href="/subscription" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Upgrade to Starter</Link>
          </div>
        ) : (
          <>
            {/* Company picker */}
            <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
              <p className="text-sm font-semibold text-ink-1">Select companies to compare ({selected.length}/5)</p>

              {/* Selected chips */}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selected.map((c) => (
                    <span key={c.code} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                      {c.code}
                      <button onClick={() => setSelected((p) => p.filter((s) => s.code !== c.code))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search */}
              {selected.length < 5 && (
                <div className="relative">
                  <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); searchCompanies(e.target.value) }}
                    placeholder="Search for a company or ticker…"
                    className="w-full px-4 py-2.5 rounded-xl border border-edge bg-surface text-sm text-ink-1 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 rounded-xl border border-edge bg-base shadow-lg z-10">
                      {searchResults.map((c) => (
                        <button key={c.code} onClick={() => addCompany(c)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface/60 transition-colors first:rounded-t-xl last:rounded-b-xl">
                          <Plus className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-ink-1">{c.name}</p>
                            <p className="text-xs text-ink-3">{c.code} · {c.sector ?? '—'}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={runComparison}
                disabled={selected.length < 2 || comparing}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-all"
              >
                {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
                {comparing ? 'Comparing…' : `Compare ${selected.length < 2 ? '(select at least 2)' : selected.length + ' companies'}`}
              </button>
            </div>

            {/* Comparison results */}
            {comparison && (() => {
              const data = comparison as {
                companies: { code: string; name: string; sector: string | null }[]
                analyses:  Record<string, { health_score: number; module_outputs: Record<string, { label: string; value: number | null; unit: string }> }>
              }
              const companies = data.companies ?? []
              const ROWS = [
                { key: 'M01', label: 'ROE' },
                { key: 'M02', label: 'D/E' },
                { key: 'M03', label: 'Current Ratio' },
                { key: 'M04', label: 'EPS Growth' },
                { key: 'M05', label: 'Net Margin' },
                { key: 'M06', label: 'Cash Flow Quality' },
                { key: 'M07', label: 'Gross Margin' },
                { key: 'M08', label: 'Revenue Growth' },
                { key: 'M09', label: 'Interest Coverage' },
                { key: 'M10', label: 'Asset Turnover' },
                { key: 'M11', label: 'Retained Earnings' },
                { key: 'M12', label: 'Payout Ratio' },
                { key: 'M13', label: 'Altman Z\'' },
              ]
              return (
                <div className="rounded-2xl border border-edge bg-surface/40 overflow-x-auto">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-edge bg-surface/60">
                        <th className="text-left px-4 py-3 text-ink-3 font-medium w-36">Metric</th>
                        {companies.map((c) => (
                          <th key={c.code} className="text-left px-4 py-3 font-medium">
                            <Link href={`/invest/companies/${c.code}`} className="text-emerald-400 hover:underline">{c.code}</Link>
                            <p className="text-[10px] text-ink-3 font-normal truncate max-w-[120px]">{c.name}</p>
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b border-edge bg-surface/30">
                        <td className="px-4 py-2 text-ink-3">Health Score</td>
                        {companies.map((c) => {
                          const hs = data.analyses[c.code]?.health_score ?? null
                          return (
                            <td key={c.code} className="px-4 py-2 font-semibold text-emerald-400">
                              {hs !== null ? `${hs}%` : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {ROWS.map((row, i) => (
                        <tr key={row.key} className={`border-b border-edge/50 ${i % 2 === 0 ? '' : 'bg-surface/20'}`}>
                          <td className="px-4 py-2.5 text-ink-3">{row.label}</td>
                          {companies.map((c) => {
                            const m = data.analyses[c.code]?.module_outputs?.[row.key]
                            return (
                              <td key={c.code} className="px-4 py-2.5 text-ink-1">
                                {m?.value != null ? `${m.value}${m.unit}` : '—'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>
      </main>
    </div>
  )
}
