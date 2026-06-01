'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, ArrowLeft, Loader2, AlertTriangle, Plus, X,
  Users, CalendarClock, CheckCircle2, Wallet, Search,
  FileText, Trash2, Check,
} from 'lucide-react'
import {
  FILING_STATUS_FLOW, FILING_STATUS_LABELS, ENTITY_TYPE_LABELS,
} from '@/lib/types'
import type {
  KlippaPracticeClient, PracticeStats, FilingStatus,
  ClientEntityType, ClientReturnType,
} from '@/lib/types'

const CURRENT_YEAR = new Date().getFullYear()

const zar = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
const dayLabel = (s: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))

const STATUS_STYLE: Record<FilingStatus, string> = {
  not_started: 'bg-edge text-ink-2',
  collecting:  'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  in_progress: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  review:      'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  filed:       'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  assessed:    'bg-emerald-600/20 text-emerald-700 dark:text-emerald-200',
}

function StatCard({ icon: Icon, label, value, sub, color = 'emerald' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string
  color?: 'emerald' | 'amber' | 'blue' | 'red'
}) {
  const c = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    amber:   'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    blue:    'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    red:     'text-red-500 dark:text-red-400 bg-red-500/10',
  }[color]
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c}`}><Icon className="w-4 h-4" /></div>
      </div>
      <div>
        <p className="text-2xl font-bold text-ink-1 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-ink-2 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  full_name: '', email: '', entity_type: 'individual' as ClientEntityType,
  return_type: 'ITR12' as ClientReturnType, tax_number: '',
  tax_year: CURRENT_YEAR, deadline: '', fee: '',
}

export default function PracticeDashboard() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [clients, setClients] = useState<KlippaPracticeClient[]>([])
  const [stats,   setStats]   = useState<PracticeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [search,  setSearch]  = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [saving,  setSaving]  = useState(false)
  const [busyId,  setBusyId]  = useState<string | null>(null)

  const loadClients = useCallback(async () => {
    const res  = await fetch('/api/practice/clients')
    const json = await res.json()
    if (json.error) { setError(json.error); setLoading(false); return }
    setClients(json.clients ?? [])
    setStats(json.stats ?? null)
    setLoading(false)
  }, [])

  const init = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('organisation_id, user_type')
      .eq('id', user.id)
      .single()
    if (!profile?.organisation_id) { router.replace('/dashboard'); return }
    if (profile.user_type !== 'practitioner') { router.replace('/org/dashboard'); return }
    const { data: org } = await supabase
      .from('klippa_organisations').select('name').eq('id', profile.organisation_id).single()
    setOrgName(org?.name ?? 'Practice')
    await loadClients()
  }, [router, loadClients])

  useEffect(() => { init() }, [init])

  const addClient = async () => {
    if (!form.full_name.trim()) { setError('Client name is required'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/practice/clients', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          tax_year: Number(form.tax_year),
          fee:      Number(form.fee) || 0,
          deadline: form.deadline || null,
        }),
      })
      const json = await res.json()
      if (res.status === 402 && json.checkoutUrl) { router.push(json.checkoutUrl); return }
      if (json.error) throw new Error(json.error)
      setShowAdd(false); setForm(EMPTY_FORM)
      await loadClients()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to add client') }
    finally { setSaving(false) }
  }

  const patchClient = async (id: string, patch: Record<string, unknown>) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/practice/clients/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await loadClients()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Update failed') }
    finally { setBusyId(null) }
  }

  const advanceStatus = (c: KlippaPracticeClient) => {
    const idx  = FILING_STATUS_FLOW.indexOf(c.filing_status)
    const next = FILING_STATUS_FLOW[Math.min(idx + 1, FILING_STATUS_FLOW.length - 1)]
    if (next !== c.filing_status) patchClient(c.id, { filing_status: next })
  }

  const archiveClient = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/practice/clients/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await loadClients()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setBusyId(null) }
  }

  if (loading) {
    return <div className="min-h-screen bg-base flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-3" /></div>
  }

  const filtered = clients.filter(c => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return c.full_name.toLowerCase().includes(q)
      || (c.email ?? '').toLowerCase().includes(q)
      || (c.tax_number ?? '').toLowerCase().includes(q)
  })

  const daysTo = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)

  return (
    <div className="min-h-screen bg-base text-ink-1">
      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight">Klippa</span>
            </Link>
            <span className="text-edge hidden sm:inline">·</span>
            <span className="text-sm font-medium text-ink-2 hidden sm:inline truncate max-w-[32vw]">{orgName}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400">PRACTICE</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add client</span>
            </button>
            <Link href="/org/settings" className="p-2 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-raised border border-edge transition-colors">
              <FileText className="w-3.5 h-3.5" />
            </Link>
            <Link href="/dashboard" className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">My profile</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users}        label="Clients"      value={stats?.total_clients ?? 0} color="blue" sub={`${stats?.in_progress ?? 0} in progress`} />
          <StatCard icon={CalendarClock} label="Due soon"    value={stats?.due_soon ?? 0} color={(stats?.due_soon ?? 0) > 0 ? 'amber' : 'emerald'} sub="within 14 days" />
          <StatCard icon={CheckCircle2} label="Filed"        value={stats?.filed_count ?? 0} color="emerald" sub="this season" />
          <StatCard icon={Wallet}       label="Outstanding"  value={zar(stats?.outstanding_fees ?? 0)} color={(stats?.outstanding_fees ?? 0) > 0 ? 'amber' : 'emerald'} sub="unpaid fees" />
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 rounded-xl border border-edge bg-surface px-3.5 py-2.5 max-w-sm">
          <Search className="w-4 h-4 text-ink-3" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            className="bg-transparent text-sm flex-1 outline-none placeholder:text-ink-3" />
        </div>

        {/* Client book */}
        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60">
            <p className="text-sm font-semibold">Client book</p>
            <p className="text-xs text-ink-2 mt-0.5">{filtered.length} of {clients.length} client{clients.length !== 1 ? 's' : ''}</p>
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-14 text-center space-y-3">
              <Users className="w-8 h-8 text-edge mx-auto" />
              <p className="text-sm text-ink-2">{clients.length === 0 ? 'No clients yet' : 'No matches'}</p>
              {clients.length === 0 && (
                <button onClick={() => setShowAdd(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add your first client
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-edge/50 bg-surface/40">
                    {['Client', 'Return', 'Status', 'Deadline', 'Fee', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-ink-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const dl = c.deadline ? daysTo(c.deadline) : null
                    const overdue = dl != null && dl < 0 && c.filing_status !== 'filed' && c.filing_status !== 'assessed'
                    return (
                      <tr key={c.id} className="border-b border-edge/40 last:border-0 hover:bg-surface/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <Link href={`/practice/clients/${c.id}`} className="group block">
                            <p className="font-medium text-ink-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">{c.full_name}</p>
                            <p className="text-xs text-ink-3">{ENTITY_TYPE_LABELS[c.entity_type]}{c.email ? ` · ${c.email}` : ''}</p>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs text-ink-2">{c.return_type}</span>
                          <span className="text-xs text-ink-3"> · {c.tax_year}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <select
                            value={c.filing_status}
                            onChange={e => patchClient(c.id, { filing_status: e.target.value })}
                            disabled={busyId === c.id}
                            className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 outline-none cursor-pointer ${STATUS_STYLE[c.filing_status]}`}
                          >
                            {FILING_STATUS_FLOW.map(s => (
                              <option key={s} value={s}>{FILING_STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3.5">
                          {c.deadline ? (
                            <span className={`text-xs ${overdue ? 'text-red-400 font-medium' : dl != null && dl <= 14 ? 'text-amber-500' : 'text-ink-2'}`}>
                              {dayLabel(c.deadline)}{overdue ? ' · overdue' : dl != null && dl <= 14 ? ` · ${dl}d` : ''}
                            </span>
                          ) : <span className="text-xs text-ink-3">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => patchClient(c.id, { fee_paid: !c.fee_paid })}
                            disabled={busyId === c.id || c.fee === 0}
                            className={`text-xs px-2 py-0.5 rounded-full transition-colors disabled:cursor-default ${
                              c.fee === 0 ? 'text-ink-3'
                              : c.fee_paid ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25'
                            }`}
                            title={c.fee === 0 ? '' : c.fee_paid ? 'Paid, click to mark unpaid' : 'Unpaid, click to mark paid'}
                          >
                            {c.fee === 0 ? '—' : `${zar(c.fee)}${c.fee_paid ? ' ✓' : ''}`}
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1">
                            {c.filing_status !== 'assessed' && (
                              <button onClick={() => advanceStatus(c)} disabled={busyId === c.id}
                                className="px-2 py-1 rounded-md text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                                title="Advance to next stage">
                                {busyId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              </button>
                            )}
                            <button onClick={() => archiveClient(c.id)} disabled={busyId === c.id}
                              className="p-1.5 text-ink-3 hover:text-red-400 transition-colors" title="Archive client">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add client modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setShowAdd(false)}>
          <div className="w-full max-w-md rounded-2xl border border-edge bg-surface p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Add a client</h2>
              <button onClick={() => setShowAdd(false)} className="text-ink-3 hover:text-ink-1"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <input autoFocus value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="Client name *" className="input w-full" />
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="Email (optional)" className="input w-full" />

              <div className="grid grid-cols-2 gap-3">
                <select value={form.entity_type} onChange={e => setForm({ ...form, entity_type: e.target.value as ClientEntityType })} className="input">
                  {Object.entries(ENTITY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={form.return_type} onChange={e => setForm({ ...form, return_type: e.target.value as ClientReturnType })} className="input">
                  {['ITR12', 'IRP6', 'ITR14', 'IT12TR'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <input value={form.tax_number} onChange={e => setForm({ ...form, tax_number: e.target.value })}
                placeholder="Tax number (optional)" className="input w-full" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-ink-3">Tax year</label>
                  <input type="number" value={form.tax_year} onChange={e => setForm({ ...form, tax_year: Number(e.target.value) })} className="input w-full" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-ink-3">Fee (R)</label>
                  <input type="number" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} placeholder="0" className="input w-full" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-ink-3">Filing deadline (optional)</label>
                <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className="input w-full" />
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
              <button onClick={addClient} disabled={saving || !form.full_name.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
