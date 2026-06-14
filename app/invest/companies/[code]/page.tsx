'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { BarChart2, Loader2, ArrowLeft, Bell, BellOff, Lock } from 'lucide-react'
import type { KlippaProfile, InvestCompany, InvestAnalysisRun, FeatureFlags } from '@/lib/types'

const FAIS_DISCLAIMER = 'FINscope Invest provides data-driven screening, analysis, and AI-generated education. This is not financial advice as defined by the FAIS Act. For personalised advice, consult an authorised Financial Services Provider.'

const MODULE_LABELS: Record<string, string> = {
  M01: 'Liquidity',
  M02: 'Profitability',
  M03: 'Activity',
  M04: 'Solvency',
  M05: 'Cash Flow Quality',
  M06: 'Earnings Quality',
  M07: 'Growth Momentum',
  M08: 'Valuation',
  M09: 'Capital Efficiency',
  M10: 'Dividend Sustainability',
  M11: 'Management Effectiveness',
  M12: 'Relative Value',
  M13: 'Risk-Adjusted Return',
}

const BASIC_MODULES = ['M01', 'M02', 'M03', 'M04']

export default function CompanyDetailPage() {
  const { code }        = useParams<{ code: string }>()
  const [profile,       setProfile]       = useState<KlippaProfile | null>(null)
  const [company,       setCompany]       = useState<InvestCompany | null>(null)
  const [analysis,      setAnalysis]      = useState<InvestAnalysisRun | null>(null)
  const [onWatchlist,   setOnWatchlist]   = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [analysing,     setAnalysing]     = useState(false)
  const [featureFlags,  setFeatureFlags]  = useState<FeatureFlags>({ timesheets: false, logbook: false, provisional: false })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: prof }, { data: co }, { data: wl }] = await Promise.all([
        supabase.from('klippa_profiles').select('*').eq('id', user.id).single(),
        supabase.from('klippa_invest_companies').select('*').eq('code', code).single(),
        supabase.from('klippa_invest_watchlist').select('company_code').eq('user_id', user.id).eq('company_code', code).maybeSingle(),
      ])

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

      if (co) setCompany(co as InvestCompany)
      setOnWatchlist(!!wl)

      // Fetch latest cached analysis
      const { data: run } = await supabase
        .from('klippa_invest_analysis_runs')
        .select('*')
        .eq('company_code', code)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (run) setAnalysis(run as InvestAnalysisRun)

      setLoading(false)
    }
    load()
  }, [code])

  async function runAnalysis() {
    setAnalysing(true)
    const res = await fetch(`/api/invest/analyse/${code}`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setAnalysis(data)
    }
    setAnalysing(false)
  }

  async function toggleWatchlist() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (onWatchlist) {
      await supabase.from('klippa_invest_watchlist').delete().eq('user_id', user.id).eq('company_code', code)
      setOnWatchlist(false)
    } else {
      await supabase.from('klippa_invest_watchlist').upsert(
        { user_id: user.id, company_code: code, sens_alerts_enabled: true },
        { onConflict: 'user_id,company_code' }
      )
      setOnWatchlist(true)
    }
  }

  if (loading) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
      </main>
    </div>
  )

  const isFull    = profile?.feature_invest_full ?? false
  const visibleModules = isFull ? Object.keys(MODULE_LABELS) : BASIC_MODULES

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-4xl mx-auto space-y-6">

        {/* Back + header */}
        <div>
          <Link href="/invest/screener" className="text-xs text-ink-3 hover:text-ink-1 flex items-center gap-1 mb-4 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to Screener
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-ink-1">{company?.name ?? code}</h1>
              <p className="text-xs text-ink-3 mt-0.5">{code} · {company?.sector ?? '—'} · {company?.industry ?? '—'}</p>
            </div>
            <button onClick={toggleWatchlist}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                onWatchlist
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                  : 'border-edge text-ink-2 hover:text-ink-1'
              }`}>
              {onWatchlist ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              {onWatchlist ? 'Unwatch' : 'Watch'}
            </button>
          </div>
        </div>

        {/* Company meta */}
        {company && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Market Cap', value: company.market_cap_zar ? `R${(company.market_cap_zar / 1e9).toFixed(1)}bn` : '—' },
              { label: 'FY End',     value: company.fiscal_year_end ?? '—' },
              { label: 'Auditor',    value: company.auditor ?? '—' },
              { label: 'Listed',     value: company.listed_at ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-edge bg-surface/40 px-4 py-3">
                <p className="text-[10px] text-ink-3 uppercase tracking-wide">{label}</p>
                <p className="text-sm font-semibold text-ink-1 mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Health score donut placeholder */}
        {analysis?.health_score != null && (
          <div className="rounded-2xl border border-edge bg-surface/40 p-5 flex items-center gap-6">
            <div className="flex-shrink-0 w-16 h-16 rounded-full border-4 border-emerald-500/40 flex items-center justify-center">
              <span className="text-xl font-bold text-emerald-500">{analysis.health_score}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-1">Health Score</p>
              <p className="text-xs text-ink-3 mt-0.5">Composite across {isFull ? 'all 13' : '4'} modules · {new Date(analysis.computed_at).toLocaleDateString('en-ZA')}</p>
            </div>
          </div>
        )}

        {/* Module grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-1">Analysis Modules</h2>
            {!analysis && (
              <button onClick={runAnalysis} disabled={analysing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
                {analysing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
                {analysing ? 'Analysing…' : 'Run Analysis'}
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {Object.entries(MODULE_LABELS).map(([id, label]) => {
              const isVisible  = visibleModules.includes(id)
              const output     = analysis?.module_outputs?.[id] as Record<string, unknown> | undefined
              const commentary = analysis?.ai_commentary?.[id] as string | undefined

              if (!isVisible) return (
                <div key={id} className="rounded-xl border border-edge bg-surface/20 p-4 flex items-center gap-3 opacity-50">
                  <Lock className="w-4 h-4 text-ink-3 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-ink-2">{id} · {label}</p>
                    <p className="text-[10px] text-ink-3 mt-0.5">Full tier required</p>
                  </div>
                </div>
              )

              return (
                <div key={id} className="rounded-xl border border-edge bg-surface/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-1">{id} · {label}</p>
                    {output && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-semibold">Done</span>}
                  </div>
                  {commentary ? (
                    <p className="text-xs text-ink-2 leading-relaxed">{commentary}</p>
                  ) : (
                    <p className="text-xs text-ink-3">{analysis ? 'No commentary generated' : 'Run analysis to see results'}</p>
                  )}
                  {output && (
                    <p className="text-[10px] text-ink-3">Source: {id} — {analysis?.fiscal_year_range ?? '—'}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {!isFull && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-ink-2">
            <span className="font-medium">Basic access</span> — M01–M04 only. <Link href="/subscription" className="text-emerald-500 hover:underline">Upgrade to Starter</Link> for all 13 modules, Going Concern Engine, and Learning Mode.
          </div>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>
      </main>
    </div>
  )
}
