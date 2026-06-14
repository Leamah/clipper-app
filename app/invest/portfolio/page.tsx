'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { BarChart2, Loader2, Plus, Lock } from 'lucide-react'
import type { KlippaProfile, InvestPortfolio, FeatureFlags } from '@/lib/types'

const FAIS_DISCLAIMER = 'FINscope Invest provides data-driven screening and AI-generated education. This is not financial advice as defined by the FAIS Act.'

export default function InvestPortfolioPage() {
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [portfolios,   setPortfolios]   = useState<InvestPortfolio[]>([])
  const [loading,      setLoading]      = useState(true)
  const [newName,      setNewName]      = useState('')
  const [creating,     setCreating]     = useState(false)
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

        if (prof.feature_invest_full) {
          const { data: pf } = await supabase
            .from('klippa_invest_portfolios')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

          setPortfolios((pf ?? []) as InvestPortfolio[])
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  async function createPortfolio() {
    if (!newName.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setCreating(true)
    const { data } = await supabase
      .from('klippa_invest_portfolios')
      .insert({ user_id: user.id, name: newName.trim() })
      .select()
      .single()

    if (data) setPortfolios((p) => [data as InvestPortfolio, ...p])
    setNewName('')
    setCreating(false)
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
      <main className="app-main px-4 py-8 max-w-3xl mx-auto space-y-6">

        <div>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-violet-400" />
            Portfolio Builder
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">Track your virtual JSE holdings and monitor performance</p>
        </div>

        {!isFull ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center space-y-4">
            <Lock className="w-10 h-10 text-amber-400 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-ink-1">Portfolio Builder requires Full Invest</p>
              <p className="text-xs text-ink-2 mt-1">Available on Starter and Professional plans.</p>
            </div>
            <Link href="/subscription" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Upgrade to Starter</Link>
          </div>
        ) : (
          <>
            {/* Create portfolio */}
            <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-3">
              <p className="text-sm font-semibold text-ink-1">New portfolio</p>
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createPortfolio()}
                  placeholder="Portfolio name…"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-edge bg-surface text-sm text-ink-1 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
                <button onClick={createPortfolio} disabled={creating || !newName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
              </div>
            </div>

            {/* Portfolio list */}
            {portfolios.length === 0 ? (
              <div className="rounded-2xl border border-edge bg-surface/40 p-8 text-center">
                <p className="text-sm text-ink-3">No portfolios yet. Create one above to start tracking your virtual holdings.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {portfolios.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-edge bg-surface/40 p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink-1">{p.name}</p>
                      <p className="text-xs text-ink-3 mt-0.5">Created {new Date(p.created_at).toLocaleDateString('en-ZA')}</p>
                    </div>
                    <Link href={`/api/invest/portfolio/${p.id}`}
                      className="text-xs text-emerald-500 hover:underline">
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>
      </main>
    </div>
  )
}
