'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, CalendarDays, ArrowLeft, Plus, Loader2,
  Check, Trash2, AlertCircle, Lock, Unlock, Download,
} from 'lucide-react'
import type { KlippaPayrollPeriod, OrgIntelligence } from '@/lib/types'

const STATUS_PILL: Record<string, string> = {
  open:       'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  closed:     'bg-edge text-ink-2',
  processing: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
}

function formatDate(s: string) {
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

// Auto-generate period name from start date
function periodName(start: string) {
  if (!start) return ''
  return new Date(start + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function PayrollPage() {
  const router = useRouter()
  const [periods,  setPeriods]  = useState<KlippaPayrollPeriod[]>([])
  const [loading,  setLoading]  = useState(true)
  const [isOwner,  setIsOwner]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [intel, setIntel] = useState<OrgIntelligence | null>(null)

  const [form, setForm] = useState({
    period_start: '',
    period_end:   '',
    deadline:     '',
    name:         '',
  })

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('organisation_id, org_role')
      .eq('id', user.id)
      .single()

    if (!profile?.organisation_id) { router.replace('/dashboard'); return }
    setIsOwner(profile.org_role === 'org-admin')

    const [res, intelRes] = await Promise.all([
      fetch('/api/org/payroll'),
      fetch('/api/org/intelligence'),
    ])
    const [json, intelJson] = await Promise.all([res.json(), intelRes.json()])
    setPeriods(json.periods ?? [])
    if (!intelJson.error) setIntel(intelJson as OrgIntelligence)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const res  = await fetch('/api/org/payroll', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          name: form.name || periodName(form.period_start),
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setPeriods(prev => [json.period, ...prev])
      setShowForm(false)
      setForm({ period_start: '', period_end: '', deadline: '', name: '' })
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  const toggleStatus = async (id: string, current: string) => {
    const next = current === 'open' ? 'closed' : 'open'
    if (next === 'closed' && (intel?.placement_summary?.blocked ?? 0) > 0) {
      const ok = confirm(`${intel?.placement_summary?.blocked ?? 0} placement${intel?.placement_summary?.blocked === 1 ? '' : 's'} still blocked. Close this payment period anyway?`)
      if (!ok) return
    }
    const res  = await fetch('/api/org/payroll', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status: next }),
    })
    const json = await res.json()
    if (!json.error) setPeriods(prev => prev.map(p => p.id === id ? json.period : p))
  }

  const exportClosePack = (period?: KlippaPayrollPeriod) => {
    const generatedAt = new Date().toISOString()
    const rows: (string | number | null | undefined)[][] = [
      ['Payment period', period?.name ?? intel?.current_period?.name ?? 'Current period'],
      ['Generated at', generatedAt],
      ['Active placements', intel?.placement_summary?.active ?? 0],
      ['Ready to invoice', intel?.placement_summary?.ready_to_bill ?? 0],
      ['Ready to pay', intel?.placement_summary?.ready_to_pay ?? 0],
      ['Blocked', intel?.placement_summary?.blocked ?? 0],
      [],
      ['Client', 'Contractor', 'Role', 'Hours', 'Expected invoice', 'Expected pay', 'Margin', 'Ready to invoice', 'Ready to pay', 'Blockers', 'Risk flags'],
      ...(intel?.placements ?? []).map(row => [
        row.client?.name ?? '',
        row.consultant.full_name ?? row.consultant.email,
        row.placement.role_title,
        row.timesheet?.hours ?? 0,
        row.expected_bill,
        row.expected_pay,
        row.expected_margin,
        row.ready_to_bill ? 'Yes' : 'No',
        row.ready_to_pay ? 'Yes' : 'No',
        row.blockers.join('; '),
        row.risk_flags.join('; '),
      ]),
    ]
    const safeName = (period?.name ?? intel?.current_period?.name ?? 'current-period').replace(/[^a-zA-Z0-9_.-]/g, '_')
    downloadCsv(`klippa-payment-close-pack-${safeName}.csv`, rows)
  }

  const deletePeriod = async (id: string) => {
    if (!confirm('Delete this payment period?')) return
    setDeletingId(id)
    await fetch('/api/org/payroll', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    setPeriods(prev => prev.filter(p => p.id !== id))
    setDeletingId(null)
  }

  if (loading) {
    return <div className="min-h-screen bg-base flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-3" /></div>
  }

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/org/dashboard" className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-emerald-500" />
              <h1 className="text-lg font-semibold">Payment periods</h1>
            </div>
          </div>
          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportClosePack(periods.find(p => p.status === 'open') ?? periods[0])}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-edge hover:bg-raised transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Close pack
              </button>
              <button
                onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New period
              </button>
            </div>
          )}
        </div>

        {intel?.placement_summary && intel.placement_summary.active > 0 && (
          <div className={`rounded-2xl border px-4 py-3 text-xs ${
            intel.placement_summary.blocked > 0
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
              : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          }`}>
            {intel.placement_summary.ready_to_bill}/{intel.placement_summary.active} ready to invoice · {intel.placement_summary.ready_to_pay}/{intel.placement_summary.active} ready to pay · {intel.placement_summary.blocked} blocked.
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* ── Create form ─────────────────────────────────────── */}
        {showForm && (
          <form onSubmit={handleCreate} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4">
            <p className="text-sm font-semibold text-ink-1">New payment period</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-2">Period start</label>
                <input type="date" required value={form.period_start}
                  onChange={e => setForm(f => ({ ...f, period_start: e.target.value, name: periodName(e.target.value) }))}
                  className="input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-2">Period end</label>
                <input type="date" required value={form.period_end}
                  onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                  className="input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-2">Contractor submission deadline</label>
                <input type="date" required value={form.deadline}
                  onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                  className="input" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">Period name (auto-filled)</label>
              <input type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. June 2026"
                className="input" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {saving ? 'Creating…' : 'Create period'}
              </button>
            </div>
          </form>
        )}

        {/* ── Periods list ────────────────────────────────────── */}
        {periods.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-edge p-16 text-center space-y-3">
            <CalendarDays className="w-8 h-8 text-edge mx-auto" />
            <p className="text-sm text-ink-2">No payment periods yet</p>
            <p className="text-xs text-ink-3">Create a period to track placement time, client sign-off, billing readiness, and contractor payment readiness.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-edge overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-edge/50 bg-surface/60">
                  {['Period', 'Dates', 'Deadline', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-ink-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map(p => (
                  <tr key={p.id} className="border-b border-edge/40 last:border-0 hover:bg-surface/60 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-ink-1">{p.name}</td>
                    <td className="px-5 py-3.5 text-xs text-ink-2">{formatDate(p.period_start)} – {formatDate(p.period_end)}</td>
                    <td className="px-5 py-3.5 text-xs text-ink-1 font-medium">{formatDate(p.deadline)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[p.status] ?? 'bg-edge text-ink-2'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {isOwner && (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => toggleStatus(p.id, p.status)}
                            className="text-ink-3 hover:text-ink-1 transition-colors"
                            title={p.status === 'open' ? 'Close period' : 'Reopen period'}
                          >
                            {p.status === 'open' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => exportClosePack(p)}
                            className="text-ink-3 hover:text-ink-1 transition-colors"
                            title="Export close pack"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deletePeriod(p.id)}
                            disabled={deletingId === p.id}
                            className="text-ink-3 hover:text-red-400 transition-colors"
                          >
                            {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
