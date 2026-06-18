'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase }  from '@/lib/supabase'
import AppNav        from '@/components/AppNav'
import { BookOpen, Loader2, Lock, ChevronRight } from 'lucide-react'
import type { KlippaProfile, FeatureFlags } from '@/lib/types'

const MODULES = [
  { id: 'M01', label: 'Liquidity',             ifrs: 'IAS 1 — Presentation of Financial Statements' },
  { id: 'M02', label: 'Profitability',          ifrs: 'IAS 1 / IFRS 15 — Revenue & Margins' },
  { id: 'M03', label: 'Activity',               ifrs: 'IAS 2 / IAS 7 — Inventory & Cash Flow' },
  { id: 'M04', label: 'Solvency',               ifrs: 'IFRS 9 / IAS 32 — Financial Instruments' },
  { id: 'M05', label: 'Cash Flow Quality',      ifrs: 'IAS 7 — Statement of Cash Flows' },
  { id: 'M06', label: 'Earnings Quality',       ifrs: 'IAS 8 / IAS 10 — Accounting Policies' },
  { id: 'M07', label: 'Growth Momentum',        ifrs: 'IFRS 15 / IFRS 16 — Revenue & Leases' },
  { id: 'M08', label: 'Valuation',              ifrs: 'IFRS 13 — Fair Value Measurement' },
  { id: 'M09', label: 'Capital Efficiency',     ifrs: 'IAS 38 / IAS 36 — Intangibles & Impairment' },
  { id: 'M10', label: 'Dividend Sustainability', ifrs: 'IAS 10 / IAS 32 — Events & Equity' },
  { id: 'M11', label: 'Management Effectiveness', ifrs: 'IFRS 8 — Operating Segments' },
  { id: 'M12', label: 'Relative Value',         ifrs: 'IFRS 13 — Fair Value Measurement' },
  { id: 'M13', label: 'Risk-Adjusted Return',   ifrs: 'IFRS 7 — Financial Instruments Disclosures' },
]

interface ModuleContent {
  standard:       string
  description:    string
  ratios:         string[]
  worked_example: string
}

export default function InvestLearningPage() {
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [content,      setContent]      = useState<Record<string, ModuleContent>>({})
  const [fetching,     setFetching]     = useState<string | null>(null)
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

  if (loading) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
      </main>
    </div>
  )

  async function toggleModule(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (content[id]) return
    setFetching(id)
    const res = await fetch(`/api/invest/learning/${id}`)
    if (res.ok) {
      const d = await res.json()
      setContent((prev) => ({ ...prev, [id]: d }))
    }
    setFetching(null)
  }

  const isFull = profile?.feature_invest_full ?? false

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-3xl mx-auto space-y-6">

        <div>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-ink-2" />
            IFRS Teaching Layer
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">Learn the accounting standard behind every analysis module</p>
        </div>

        {!isFull ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center space-y-4">
            <Lock className="w-10 h-10 text-amber-400 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-ink-1">Learning Mode requires Full Invest</p>
              <p className="text-xs text-ink-2 mt-1">Available on Starter and Professional plans.</p>
            </div>
            <Link href="/subscription" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Upgrade to Starter</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {MODULES.map((m) => {
              const isOpen = expanded === m.id
              const c      = content[m.id]
              return (
                <div key={m.id} className="rounded-xl border border-edge bg-surface/40 overflow-hidden transition-all">
                  <button
                    onClick={() => toggleModule(m.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface transition-colors group text-left"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-edge font-mono text-ink-3">{m.id}</span>
                        <p className="text-sm font-medium text-ink-1">{m.label}</p>
                      </div>
                      <p className="text-xs text-ink-3 mt-0.5">{m.ifrs}</p>
                    </div>
                    {fetching === m.id
                      ? <Loader2 className="w-4 h-4 text-ink-3 animate-spin flex-shrink-0" />
                      : <ChevronRight className={`w-4 h-4 text-ink-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    }
                  </button>
                  {isOpen && c && (
                    <div className="border-t border-edge px-4 py-4 space-y-3">
                      <p className="text-xs text-ink-2 leading-relaxed">{c.description}</p>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide">Key ratios</p>
                        {c.ratios.map((r) => (
                          <p key={r} className="text-xs font-mono text-emerald-400 bg-surface border border-edge rounded-lg px-3 py-1.5">{r}</p>
                        ))}
                      </div>
                      <div className="rounded-lg bg-surface/60 border border-edge px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1">Worked example</p>
                        <p className="text-xs text-ink-2 leading-relaxed">{c.worked_example}</p>
                      </div>
                      <p className="text-[10px] text-ink-3">{c.standard}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
