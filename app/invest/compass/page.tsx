'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { Compass, Loader2 } from 'lucide-react'
import type { KlippaProfile, FeatureFlags } from '@/lib/types'

const FAIS_DISCLAIMER = 'Investment Compass outputs are a screened shortlist — not financial advice as defined by the FAIS Act. For personalised advice, consult an authorised Financial Services Provider.'

interface CompassResult {
  category:       string
  description:    string
  allocation_pct: number
  allocation_zar: number
}

interface CompassResponse {
  amount:          number
  horizon:         string
  risk_band:       string
  recommendations: CompassResult[]
  tax_note:        string
}

export default function InvestCompassPage() {
  const [profile,        setProfile]        = useState<KlippaProfile | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [running,        setRunning]        = useState(false)
  const [results,        setResults]        = useState<CompassResult[]>([])
  const [taxNote,        setTaxNote]        = useState<string>('')
  const [amount,         setAmount]         = useState('')
  const [horizon,        setHorizon]        = useState('1y')
  const [risk,           setRisk]           = useState('balanced')
  const [sessionCount,   setSessionCount]   = useState(0)
  const [featureFlags,   setFeatureFlags]   = useState<FeatureFlags>({ timesheets: false, logbook: false, provisional: false })

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

        // Pre-fill from Safe-to-Spend proxy (latest month income − expenses)
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const [{ data: income }, { data: expenses }] = await Promise.all([
          supabase.from('klippa_income_records').select('amount').eq('user_id', user.id).gte('received_date', monthStart),
          supabase.from('klippa_expense_records').select('deductible_amount').eq('user_id', user.id).gte('expense_date', monthStart),
        ])
        const totalIncome   = (income ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)
        const totalExpenses = (expenses ?? []).reduce((s, r) => s + (r.deductible_amount ?? 0), 0)
        const sts = Math.max(0, totalIncome - totalExpenses)
        if (sts > 0) setAmount(String(Math.round(sts * 0.2))) // suggest 20% of STS as invest amount
      }

      setLoading(false)
    }
    load()
  }, [])

  async function runCompass() {
    if (!amount || parseFloat(amount) <= 0) return
    if (!isFull && sessionCount >= 1) return

    setRunning(true)
    const res = await fetch('/api/invest/compass', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ amount: parseFloat(amount), horizon, risk_band: risk }),
    })

    if (res.ok) {
      const data: CompassResponse = await res.json()
      setResults(data.recommendations ?? [])
      setTaxNote(data.tax_note ?? '')
      setSessionCount((n) => n + 1)
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

  const isFull          = profile?.feature_invest_full ?? false
  const basicLimitHit   = !isFull && sessionCount >= 1

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-2xl mx-auto space-y-6">

        <div>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <Compass className="w-5 h-5 text-sky-400" />
            Investment Compass
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">Tell us your amount and goals — we&apos;ll show you a screened shortlist</p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink-2 uppercase tracking-wide">How much do you want to invest? (R)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5 000"
              className="w-full px-4 py-2.5 rounded-xl border border-edge bg-surface text-sm text-ink-1 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            {amount && <p className="text-[10px] text-ink-3">Pre-filled from your estimated Safe-to-Spend — you can adjust this</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink-2 uppercase tracking-wide">Investment horizon</label>
            <div className="flex flex-wrap gap-2">
              {[
                { v: '3m', l: '3 Months' }, { v: '6m', l: '6 Months' },
                { v: '1y', l: '1 Year' },   { v: '3y', l: '3 Years' },
                { v: '5y_plus', l: '5+ Years' },
              ].map(({ v, l }) => (
                <button key={v} onClick={() => setHorizon(v)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                    horizon === v ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-edge text-ink-2 hover:text-ink-1'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink-2 uppercase tracking-wide">Risk appetite</label>
            <div className="flex gap-2">
              {[
                { v: 'conservative', l: 'Conservative' },
                { v: 'balanced',     l: 'Balanced' },
                { v: 'aggressive',   l: 'Aggressive' },
              ].map(({ v, l }) => (
                <button key={v} onClick={() => setRisk(v)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                    risk === v ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-edge text-ink-2 hover:text-ink-1'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {basicLimitHit ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-ink-2">
              Basic Invest allows 1 recommendation per session. <Link href="/subscription" className="text-emerald-500 hover:underline">Upgrade to Starter</Link> for unlimited runs.
            </div>
          ) : (
            <button onClick={runCompass} disabled={running || !amount}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-all">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
              {running ? 'Finding matches…' : 'Get recommendations'}
            </button>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            {taxNote && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-ink-2 leading-relaxed">
                {taxNote}
              </div>
            )}
            <p className="text-xs text-ink-3">{results.length} asset categories · R{parseFloat(amount).toLocaleString('en-ZA')} · {horizon} · {risk}</p>
            {results.map((r, i) => (
              <div key={r.category} className="rounded-2xl border border-edge bg-surface/40 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-ink-3 mr-1.5">#{i + 1}</span>
                    <span className="text-sm font-semibold text-ink-1">{r.category}</span>
                    <p className="text-xs text-ink-3 mt-0.5">{r.allocation_pct}% allocation</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-500 flex-shrink-0">R{r.allocation_zar.toLocaleString('en-ZA')}</p>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">{r.description}</p>
                <p className="text-[10px] text-ink-3">Screened shortlist — not financial advice</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">{FAIS_DISCLAIMER}</p>
      </main>
    </div>
  )
}
