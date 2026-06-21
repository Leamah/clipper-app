'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { ArrowLeft, Plus, Loader2, Trash2, BarChart2 } from 'lucide-react'
import type { FeatureFlags } from '@/lib/types'

interface Holding {
  id:             string
  company_code:   string
  shares:         number
  cost_basis_zar: number
  acquired_at:    string
  in_tfsa:        boolean
  closed_at:      string | null
  company?:       { name: string; sector: string | null }
}

interface Portfolio {
  id:         string
  name:       string
  created_at: string
  holdings:   Holding[]
}

interface Company { code: string; name: string }

export default function PortfolioDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [portfolio,    setPortfolio]    = useState<Portfolio | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [deleting,     setDeleting]     = useState(false)
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ timesheets: false, logbook: false, provisional: false })

  // Add holding form
  const [showAdd,    setShowAdd]    = useState(false)
  const [companies,  setCompanies]  = useState<Company[]>([])
  const [compSearch, setCompSearch] = useState('')
  const [compResults,setCompResults]= useState<Company[]>([])
  const [selCode,    setSelCode]    = useState('')
  const [shares,     setShares]     = useState('')
  const [cost,       setCost]       = useState('')
  const [acquired,   setAcquired]   = useState(new Date().toISOString().split('T')[0])
  const [inTfsa,     setInTfsa]     = useState(false)
  const [adding,     setAdding]     = useState(false)
  const [addErr,     setAddErr]     = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase.from('klippa_profiles').select('*').eq('id', user.id).single()
    if (prof) {
      setFeatureFlags({
        timesheets:     prof.feature_timesheets  ?? false,
        logbook:        prof.feature_logbook     ?? false,
        provisional:    prof.feature_provisional ?? false,
        is_org_user:    prof.user_type === 'company_owner' || prof.user_type === 'practitioner',
        invest_basic:   prof.feature_invest_basic  ?? false,
        invest_enabled: prof.invest_enabled ?? false,
      })
    }

    const res = await fetch(`/api/invest/portfolio/${id}`)
    if (res.ok) setPortfolio(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function searchCompanies(q: string) {
    setCompSearch(q)
    if (!q.trim()) { setCompResults([]); return }
    const { data } = await supabase
      .from('klippa_invest_companies')
      .select('code, name')
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .limit(6)
    setCompResults((data ?? []) as Company[])
  }

  async function addHolding() {
    if (!selCode || !shares || !cost || !acquired) return
    setAdding(true); setAddErr(null)
    const res = await fetch('/api/invest/portfolio/holding', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        portfolio_id:   id,
        company_code:   selCode,
        shares:         parseFloat(shares),
        cost_basis_zar: parseFloat(cost),
        acquired_at:    acquired,
        in_tfsa:        inTfsa,
      }),
    })
    if (res.ok) {
      setShowAdd(false); setSelCode(''); setShares(''); setCost(''); setCompSearch('')
      await load()
    } else {
      const d = await res.json()
      setAddErr(d.error ?? 'Failed to add holding')
    }
    setAdding(false)
  }

  async function deletePortfolio() {
    if (!confirm(`Delete "${portfolio?.name}"? This cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch(`/api/invest/portfolio/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/invest/portfolio')
    else setDeleting(false)
  }

  if (loading) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-3" /></main>
    </div>
  )

  if (!portfolio) return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-3xl mx-auto">
        <p className="text-sm text-ink-3">Portfolio not found.</p>
        <Link href="/invest/portfolio" className="text-xs text-emerald-500 hover:underline mt-2 inline-block">← Back to portfolios</Link>
      </main>
    </div>
  )

  const openHoldings   = portfolio.holdings.filter(h => !h.closed_at)
  const closedHoldings = portfolio.holdings.filter(h => h.closed_at)
  const totalCost      = openHoldings.reduce((s, h) => s + h.cost_basis_zar, 0)

  return (
    <div className="app-shell">
      <AppNav activePage="invest" featureFlags={featureFlags} />
      <main className="app-main px-4 py-8 max-w-3xl mx-auto space-y-6">

        <div>
          <Link href="/invest/portfolio" className="text-xs text-ink-3 hover:text-ink-1 flex items-center gap-1 mb-4">
            <ArrowLeft className="w-3 h-3" /> Back to portfolios
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-violet-400" />
                {portfolio.name}
              </h1>
              <p className="text-xs text-ink-3 mt-0.5">
                {openHoldings.length} open holding{openHoldings.length !== 1 ? 's' : ''} · Total cost R{totalCost.toLocaleString('en-ZA')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add holding
              </button>
              <button
                onClick={deletePortfolio}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-edge hover:border-red-500/40 hover:text-red-400 text-xs text-ink-3 transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Add holding form */}
        {showAdd && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4">
            <p className="text-sm font-semibold text-ink-1">Add holding</p>

            {/* Company search */}
            <div className="relative">
              <input
                value={compSearch}
                onChange={(e) => {
                  if (selCode) setSelCode('')
                  searchCompanies(e.target.value)
                }}
                placeholder="Search company or ticker…"
                className="w-full px-4 py-2.5 rounded-xl border border-edge bg-surface text-sm text-ink-1 focus:outline-none focus:border-emerald-500/50"
              />
              {selCode && <p className="text-xs text-emerald-400 mt-1">Selected: {selCode} — {companies.find(c => c.code === selCode)?.name ?? compSearch}</p>}
              {compResults.length > 0 && !selCode && (
                <div className="absolute top-full mt-1 left-0 right-0 rounded-xl border border-edge bg-base shadow-lg z-10">
                  {compResults.map((c) => (
                    <button key={c.code} onClick={() => { setSelCode(c.code); setCompSearch(c.name); setCompResults([]); setCompanies(prev => [...prev.filter(x => x.code !== c.code), c]) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface/60 first:rounded-t-xl last:rounded-b-xl text-sm text-ink-1">
                      <span className="font-mono text-emerald-400 text-xs">{c.code}</span> {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide">Shares</label>
                <input type="number" value={shares} onChange={e => setShares(e.target.value)} placeholder="100"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-edge bg-surface text-sm text-ink-1 focus:outline-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide">Total cost (R)</label>
                <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="5000"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-edge bg-surface text-sm text-ink-1 focus:outline-none focus:border-emerald-500/50" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide">Date acquired</label>
                <input type="date" value={acquired} onChange={e => setAcquired(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-edge bg-surface text-sm text-ink-1 focus:outline-none focus:border-emerald-500/50" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input type="checkbox" checked={inTfsa} onChange={e => setInTfsa(e.target.checked)} className="rounded" />
                <span className="text-xs text-ink-2">Held in TFSA</span>
              </label>
            </div>

            {addErr && <p className="text-xs text-red-400">{addErr}</p>}

            <div className="flex gap-2">
              <button onClick={addHolding} disabled={adding || !selCode || !shares || !cost}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
              <button onClick={() => { setShowAdd(false); setAddErr(null) }}
                className="px-4 py-2 rounded-lg border border-edge text-xs text-ink-3 hover:text-ink-1">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Open holdings */}
        {openHoldings.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-surface/40 p-8 text-center">
            <p className="text-sm text-ink-3">No open holdings yet. Add one above.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-edge overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge bg-surface/60">
                  {['Company', 'Shares', 'Cost basis', 'Per share', 'Acquired', 'TFSA', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-ink-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openHoldings.map((h) => (
                  <tr key={h.id} className="border-b border-edge/50 last:border-0 hover:bg-surface/30">
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-emerald-400">{h.company_code}</p>
                      <p className="text-xs text-ink-3 truncate max-w-[140px]">{h.company?.name ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-1">{h.shares.toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-3 text-xs text-ink-1">R{h.cost_basis_zar.toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-3 text-xs text-ink-2">R{(h.cost_basis_zar / h.shares).toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-ink-3">{new Date(h.acquired_at).toLocaleDateString('en-ZA')}</td>
                    <td className="px-4 py-3 text-xs text-ink-3">{h.in_tfsa ? '✓' : '—'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/invest/companies/${h.company_code}`} className="text-[10px] text-emerald-500 hover:underline">
                        Analyse →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Closed holdings */}
        {closedHoldings.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Closed positions</p>
            {closedHoldings.map((h) => (
              <div key={h.id} className="rounded-xl border border-edge/50 bg-surface/20 px-4 py-3 flex items-center justify-between gap-4 opacity-60">
                <div>
                  <span className="text-xs font-mono text-ink-2">{h.company_code}</span>
                  <span className="text-xs text-ink-3 ml-2">{h.shares} shares</span>
                </div>
                <p className="text-xs text-ink-3">Closed {new Date(h.closed_at!).toLocaleDateString('en-ZA')}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-ink-3 leading-relaxed border-t border-edge/40 pt-4">
          FINscope Invest provides data-driven screening only — not financial advice as defined by the FAIS Act.
        </p>
      </main>
    </div>
  )
}
