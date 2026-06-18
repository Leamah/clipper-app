'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { Star, Loader2, ArrowLeft, Lock } from 'lucide-react'
import type { KlippaProfile, InvestPhilosophy, FeatureFlags } from '@/lib/types'
import { INVEST_PHILOSOPHY_LABELS, INVEST_PHILOSOPHY_TAGLINES } from '@/lib/types'

const FAIS_DISCLAIMER = `Philosophy Engine results are presented "in the style of" the named investor — not financial advice. FINscope Invest provides data-driven screening and AI-generated education only.`

const ALL_PHILOSOPHIES: InvestPhilosophy[] = ['buffett', 'lynch', 'pabrai', 'graham', 'greenblatt']

interface PhilosophyResult {
  company_code: string
  company_name: string
  fit_score:    number
  max_score:    number
  rationale:    string
}

export default function PhilosophyPage() {
  const params = useParams<{ name: string }>()
  const name   = params.name as InvestPhilosophy

  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [results,      setResults]      = useState<PhilosophyResult[]>([])
  const [loading,      setLoading]      = useState(true)
  const [running,      setRunning]      = useState(false)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ timesheets: false, logbook: false, provisional: false })

  const label    = INVEST_PHILOSOPHY_LABELS[name]   ?? name
  const tagline  = INVEST_PHILOSOPHY_TAGLINES[name] ?? ''

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

  async function runPhilosophy() {
    setRunning(true)
    const res  = await fetch(`/api/invest/philosophy/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    if (res.ok) {
      const data = await res.json()
      setResults(data.results ?? [])
    }
    setRunning(false)
  }

  if (loading) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
      </main>
    </div>
  )

  const isFull        = profile?.feature_invest_full ?? false
  const isBasicLocked = name !== 'buffett' && !isFull

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-3xl mx-auto space-y-6">

        <div>
          <Link href="/invest/dashboard" className="text-xs text-ink-3 hover:text-ink-1 flex items-center gap-1 mb-4 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back
          </Link>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            {label}
          </h1>
          <p className="text-sm text-ink-2 mt-1 italic">&ldquo;{tagline}&rdquo;</p>
        </div>

        {/* Philosophy switcher */}
        <div className="flex flex-wrap gap-2">
          {ALL_PHILOSOPHIES.map((p) => {
            const locked = p !== 'buffett' && !isFull
            return (
              <Link key={p} href={`/invest/philosophies/${p}`}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  p === name
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-edge text-ink-2 hover:text-ink-1'
                } ${locked ? 'opacity-50' : ''}`}>
                {locked && <Lock className="w-3 h-3" />}
                {INVEST_PHILOSOPHY_LABELS[p]}
              </Link>
            )
          })}
        </div>

        {isBasicLocked ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
            <Lock className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="text-sm font-medium text-ink-1">This philosophy requires Full Invest</p>
            <p className="text-xs text-ink-2">Buffett is available on Basic. Lynch, Pabrai, Graham, and Greenblatt are unlocked on Starter and above.</p>
            <Link href="/subscription" className="inline-block mt-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Upgrade to Starter</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-3">Top JSE companies ranked by {label} fit score</p>
              <button onClick={runPhilosophy} disabled={running}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                {running ? 'Ranking…' : 'Run'}
              </button>
            </div>

            {results.length === 0 ? (
              <div className="rounded-2xl border border-edge bg-surface/40 p-8 text-center">
                <p className="text-sm text-ink-3">Click Run to screen the JSE through the {label} lens.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((r, i) => (
                  <div key={r.company_code} className="rounded-2xl border border-edge bg-surface/40 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold text-ink-3 mr-1.5">#{i + 1}</span>
                        <Link href={`/invest/companies/${r.company_code}`} className="text-sm font-semibold text-ink-1 hover:text-emerald-500 transition-colors">
                          {r.company_name}
                        </Link>
                        <p className="text-xs text-ink-3 mt-0.5">{r.company_code}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-lg font-bold text-emerald-500">
                          {r.fit_score}
                          <span className="text-sm font-normal text-ink-3"> / {r.max_score}</span>
                        </p>
                        <p className="text-[10px] text-ink-3">fit score</p>
                      </div>
                    </div>
                    <p className="text-xs text-ink-2 leading-relaxed">{r.rationale}</p>
                    <p className="text-[10px] text-ink-3">In the style of {label} — not financial advice</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>
      </main>
    </div>
  )
}
