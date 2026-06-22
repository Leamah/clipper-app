'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock3, FileSpreadsheet,
  Filter, Loader2, Mail, Plus, ShieldCheck, Users, Wallet,
} from 'lucide-react'
import type {
  ClientEntityType,
  ClientReturnType,
  FilingStatus,
  PracticeDashboardRow,
  PracticeQueueName,
  PracticeStats,
  PracticeTeamMember,
} from '@/lib/types'

const CURRENT_YEAR = new Date().getFullYear()
const QUEUES: Array<PracticeQueueName | 'All'> = ['All', 'Needs triage', 'Waiting on client', 'Ready to prepare', 'Ready for review', 'Ready to file', 'Filed', 'SARS follow-up']

const zar = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
const dayLabel = (s: string | null) => s ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s)) : 'No deadline'

const STATUS_LABELS: Record<FilingStatus, string> = {
  not_started: 'Not started',
  collecting: 'Collecting docs',
  in_progress: 'In progress',
  review: 'Review',
  filed: 'Filed',
  assessed: 'Assessed',
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-2">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-ink-1">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-ink-2">{sub}</p>}
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  full_name: '',
  email: '',
  entity_type: 'individual' as ClientEntityType,
  return_type: 'ITR12' as ClientReturnType,
  tax_number: '',
  tax_year: CURRENT_YEAR,
  deadline: '',
  fee: '',
}

export default function PracticeDashboardPage() {
  const router = useRouter()
  const [rows, setRows] = useState<PracticeDashboardRow[]>([])
  const [stats, setStats] = useState<PracticeStats | null>(null)
  const [team, setTeam] = useState<PracticeTeamMember[]>([])
  const [orgName, setOrgName] = useState('Practice')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [queue, setQueue] = useState<PracticeQueueName | 'All'>('All')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyReturnId, setBusyReturnId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkAction, setBulkAction] = useState<'assign_owner' | 'update_status' | 'send_reminder'>('send_reminder')
  const [bulkOwnerId, setBulkOwnerId] = useState('')
  const [bulkStatus, setBulkStatus] = useState<FilingStatus>('collecting')
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('organisation_id, user_type')
      .eq('id', user.id)
      .single()

    if (!profile?.organisation_id) { router.replace('/dashboard'); return }
    if (profile.user_type !== 'practitioner') { router.replace('/org/dashboard'); return }

    const [{ data: org }, dashRes] = await Promise.all([
      supabase.from('klippa_organisations').select('name').eq('id', profile.organisation_id).single(),
      fetch('/api/practice/dashboard'),
    ])

    setOrgName(org?.name ?? 'Practice')
    const dashJson = await dashRes.json()
    if (dashJson.error) { setError(dashJson.error); setLoading(false); return }

    setRows(dashJson.rows ?? [])
    setStats(dashJson.stats ?? null)
    setTeam(dashJson.team ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => rows.filter(row => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q
      || row.client.full_name.toLowerCase().includes(q)
      || (row.client.email ?? '').toLowerCase().includes(q)
      || (row.client.tax_number ?? '').toLowerCase().includes(q)
    const matchesQueue = queue === 'All' || row.queue === queue
    return matchesSearch && matchesQueue
  }), [queue, rows, search])

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => filtered.some(row => row.return.id === id)))
  }, [filtered])

  const addClient = async () => {
    if (!form.full_name.trim()) { setError('Client name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/practice/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tax_year: Number(form.tax_year),
          fee: Number(form.fee) || 0,
          deadline: form.deadline || null,
        }),
      })
      const json = await res.json()
      if (res.status === 402 && json.checkoutUrl) { router.push(json.checkoutUrl); return }
      if (json.error) throw new Error(json.error)
      setForm(EMPTY_FORM)
      setShowAdd(false)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add client')
    } finally {
      setSaving(false)
    }
  }

  const patchReturn = async (id: string, patch: Record<string, unknown>) => {
    setBusyReturnId(id)
    setError(null)
    try {
      const res = await fetch(`/api/practice/returns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyReturnId(null)
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every(row => selectedIds.includes(row.return.id))

  const runBulkAction = async () => {
    if (selectedIds.length === 0) { setError('Select at least one return'); return }
    setBulkBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { ids: selectedIds, action: bulkAction }
      if (bulkAction === 'assign_owner') payload.owner_user_id = bulkOwnerId || null
      if (bulkAction === 'update_status') payload.filing_status = bulkStatus

      const res = await fetch('/api/practice/returns/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setSelectedIds([])
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bulk action failed')
    } finally {
      setBulkBusy(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-base"><Loader2 className="h-5 w-5 animate-spin text-ink-3" /></div>
  }

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="sticky top-0 z-20 border-b border-edge/60 bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-700">
                <ShieldCheck className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold tracking-tight">Klippa</span>
            </Link>
            <span className="hidden text-edge sm:inline">·</span>
            <span className="hidden max-w-[34vw] truncate text-sm text-ink-2 sm:inline">{orgName}</span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">PRACTICE</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500">
              <Plus className="h-3.5 w-3.5" />
              Add client
            </button>
            <Link href="/dashboard" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              My profile
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-900/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard icon={Users} label="Clients" value={stats?.total_clients ?? 0} sub={`${stats?.total_returns ?? 0} active returns`} />
          <StatCard icon={Clock3} label="Waiting" value={stats?.waiting_on_client ?? 0} sub="document chase queue" />
          <StatCard icon={CheckCircle2} label="Review" value={stats?.ready_for_review ?? 0} sub="ready for reviewer" />
          <StatCard icon={FileSpreadsheet} label="File Now" value={stats?.ready_to_file ?? 0} sub="sign-off or SARS submit" />
          <StatCard icon={Wallet} label="Fees Open" value={zar(stats?.outstanding_fees ?? 0)} sub={`${stats?.filed_count ?? 0} filed or assessed`} />
        </div>

        <div className="rounded-2xl border border-edge bg-surface p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-md items-center gap-2 rounded-xl border border-edge bg-base px-3.5 py-2.5">
              <Filter className="h-4 w-4 text-ink-3" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search returns, names, tax numbers..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" />
            </div>
            <div className="flex flex-wrap gap-2">
              {QUEUES.map(label => (
                <button key={label} onClick={() => setQueue(label)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${queue === label ? 'bg-amber-600 text-white' : 'bg-base text-ink-2 hover:bg-raised hover:text-ink-1'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-edge bg-base px-3 py-3 lg:flex-row lg:items-center">
            <p className="text-xs font-medium text-ink-2">{selectedIds.length} selected</p>
            <select value={bulkAction} onChange={e => setBulkAction(e.target.value as typeof bulkAction)} className="rounded-lg border border-edge bg-surface px-3 py-2 text-xs outline-none">
              <option value="send_reminder">Send reminders</option>
              <option value="assign_owner">Assign owner</option>
              <option value="update_status">Update status</option>
            </select>
            {bulkAction === 'assign_owner' && (
              <select value={bulkOwnerId} onChange={e => setBulkOwnerId(e.target.value)} className="rounded-lg border border-edge bg-surface px-3 py-2 text-xs outline-none">
                <option value="">Unassigned</option>
                {team.map(member => <option key={member.id} value={member.id}>{member.full_name ?? member.email}</option>)}
              </select>
            )}
            {bulkAction === 'update_status' && (
              <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value as FilingStatus)} className="rounded-lg border border-edge bg-surface px-3 py-2 text-xs outline-none">
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            )}
            <button onClick={runBulkAction} disabled={bulkBusy || selectedIds.length === 0} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
              {bulkBusy ? 'Running...' : bulkAction === 'send_reminder' ? 'Run reminders' : 'Apply to selected'}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-edge">
          <div className="border-b border-edge bg-surface/60 px-5 py-4">
            <p className="text-sm font-semibold">Return workbench</p>
            <p className="mt-0.5 text-xs text-ink-2">{filtered.length} of {rows.length} returns</p>
          </div>

          {filtered.length === 0 ? (
            <div className="space-y-3 px-5 py-14 text-center">
              <Users className="mx-auto h-8 w-8 text-edge" />
              <p className="text-sm text-ink-2">No returns match this view.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1160px] w-full text-sm">
                <thead>
                  <tr className="border-b border-edge/60 bg-surface/40">
                    {['', 'Client', 'Queue', 'Return', 'Readiness', 'Documents', 'Owner', 'Status', 'Deadline'].map(header => (
                      <th key={header} className="px-5 py-3 text-left text-xs font-medium text-ink-2">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.return.id} className="border-b border-edge/40 align-top last:border-b-0">
                      <td className="px-5 py-4">
                        <input type="checkbox" checked={selectedIds.includes(row.return.id)} onChange={() => toggleSelected(row.return.id)} className="h-4 w-4 rounded border-edge bg-surface" />
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/practice/returns/${row.return.id}`} className="font-medium text-ink-1 hover:text-amber-500">{row.client.full_name}</Link>
                        <p className="mt-1 text-xs text-ink-2">{row.client.email ?? 'No email'}{row.client.tax_number ? ` · ${row.client.tax_number}` : ''}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-edge px-2.5 py-1 text-[11px] font-medium text-ink-2">{row.queue}</span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink-1">{row.return.return_type} · {row.return.tax_year}</p>
                        <p className="mt-1 text-xs text-ink-2">{row.assignees.preparer?.full_name ?? 'No preparer'} / {row.assignees.reviewer?.full_name ?? 'No reviewer'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className={`font-semibold ${row.readiness.label === 'Ready' ? 'text-emerald-500' : row.readiness.label === 'Nearly ready' ? 'text-blue-500' : row.readiness.label === 'At risk' ? 'text-amber-500' : 'text-red-400'}`}>
                          {row.readiness.score}% {row.readiness.label}
                        </p>
                        <p className="mt-1 text-xs text-ink-2">{row.readiness.blockers.length} blockers</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink-1">{row.received_documents}/{row.total_documents || 0}</p>
                        <p className="mt-1 text-xs text-ink-2">requested items in</p>
                      </td>
                      <td className="px-5 py-4">
                        <select value={row.return.owner_user_id ?? ''} onChange={e => patchReturn(row.return.id, { owner_user_id: e.target.value || null })} disabled={busyReturnId === row.return.id} className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-xs text-ink-1 outline-none">
                          <option value="">Unassigned</option>
                          {team.map(member => <option key={member.id} value={member.id}>{member.full_name ?? member.email}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <select value={row.return.filing_status} onChange={e => patchReturn(row.return.id, { filing_status: e.target.value })} disabled={busyReturnId === row.return.id} className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-xs text-ink-1 outline-none">
                          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <button onClick={() => setSelectedIds([row.return.id])} className="mt-2 text-[11px] text-amber-500 hover:underline">
                          Select only this
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink-1">{dayLabel(row.return.deadline)}</p>
                        <p className="mt-1 text-xs text-ink-2">{row.return.fee_paid ? 'Fee paid' : `${zar(row.return.fee)} open`}</p>
                        <button onClick={() => router.push(`/practice/returns/${row.return.id}`)} className="mt-2 flex items-center gap-1 text-[11px] text-ink-2 hover:text-ink-1">
                          <Mail className="h-3 w-3" />
                          Open detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="border-t border-edge bg-surface/40 px-5 py-3">
              <button onClick={() => setSelectedIds(allVisibleSelected ? [] : filtered.map(row => row.return.id))} className="text-xs text-ink-2 hover:text-ink-1">
                {allVisibleSelected ? 'Clear visible selection' : 'Select all visible'}
              </button>
            </div>
          )}
        </div>
      </main>

      {showAdd && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-edge bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Add client and first return</p>
                <p className="mt-0.5 text-xs text-ink-2">Creates the client master and its initial tax-year return.</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="text-xs text-ink-2 hover:text-ink-1">Close</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={form.full_name} onChange={e => setForm(s => ({ ...s, full_name: e.target.value }))} placeholder="Client name" className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
              <input value={form.email} onChange={e => setForm(s => ({ ...s, email: e.target.value }))} placeholder="Email" className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
              <select value={form.entity_type} onChange={e => setForm(s => ({ ...s, entity_type: e.target.value as ClientEntityType }))} className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                <option value="individual">Individual</option>
                <option value="sole_prop">Sole proprietor</option>
                <option value="company">Company</option>
                <option value="trust">Trust</option>
              </select>
              <select value={form.return_type} onChange={e => setForm(s => ({ ...s, return_type: e.target.value as ClientReturnType }))} className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                <option value="ITR12">ITR12</option>
                <option value="IRP6">IRP6</option>
                <option value="ITR14">ITR14</option>
                <option value="IT12TR">IT12TR</option>
              </select>
              <input value={form.tax_number} onChange={e => setForm(s => ({ ...s, tax_number: e.target.value }))} placeholder="Tax number" className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
              <input value={String(form.tax_year)} onChange={e => setForm(s => ({ ...s, tax_year: Number(e.target.value) || CURRENT_YEAR }))} placeholder="Tax year" className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
              <input type="date" value={form.deadline} onChange={e => setForm(s => ({ ...s, deadline: e.target.value }))} className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
              <input value={form.fee} onChange={e => setForm(s => ({ ...s, fee: e.target.value }))} placeholder="Fee (ZAR)" className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-lg border border-edge px-3 py-2 text-xs text-ink-2">Cancel</button>
              <button onClick={addClient} disabled={saving} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
