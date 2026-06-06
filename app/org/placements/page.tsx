'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  AlertCircle, ArrowLeft, BriefcaseBusiness, Building2, Check,
  CircleDollarSign, Loader2, Plus, ShieldCheck, TriangleAlert, Users,
  Archive, Download, Pencil,
} from 'lucide-react'
import type {
  KlippaOrgClient,
  OrgConsultantRow,
  OrgIntelligence,
  OrgPlacementReadiness,
  RateType,
} from '@/lib/types'

function money(n: number | null | undefined) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0))
}

function formatDate(s: string | null | undefined) {
  if (!s) return 'Open'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

function statusClass(ready: boolean, blocked: boolean) {
  if (ready) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (blocked) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  return 'bg-edge text-ink-2'
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

function SummaryCard({ label, value, sub, icon: Icon, alert = false }: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  alert?: boolean
}) {
  return (
    <div className={`rounded-2xl border ${alert ? 'border-amber-500/40' : 'border-edge'} bg-surface p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2 uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-ink-2 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function PlacementsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [savingClient, setSavingClient] = useState(false)
  const [savingPlacement, setSavingPlacement] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clients, setClients] = useState<KlippaOrgClient[]>([])
  const [consultants, setConsultants] = useState<OrgConsultantRow[]>([])
  const [placements, setPlacements] = useState<OrgPlacementReadiness[]>([])
  const [summary, setSummary] = useState<OrgIntelligence['placement_summary'] | null>(null)
  const [showClientForm, setShowClientForm] = useState(false)
  const [showPlacementForm, setShowPlacementForm] = useState(false)
  const [editingPlacementId, setEditingPlacementId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  const [clientForm, setClientForm] = useState({
    name: '',
    contact_person: '',
    contact_email: '',
    default_site: '',
    notes: '',
  })

  const [placementForm, setPlacementForm] = useState({
    client_id: '',
    user_id: '',
    role_title: '',
    site: '',
    client_manager_name: '',
    client_manager_email: '',
    start_date: '',
    end_date: '',
    bill_rate: '',
    pay_rate: '',
    rate_type: 'hourly' as RateType,
    compliance_requirements: '',
    notes: '',
  })

  const resetPlacementForm = () => {
    setPlacementForm({
      client_id: '', user_id: '', role_title: '', site: '', client_manager_name: '',
      client_manager_email: '', start_date: '', end_date: '', bill_rate: '',
      pay_rate: '', rate_type: 'hourly', compliance_requirements: '', notes: '',
    })
    setEditingPlacementId(null)
  }

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

    const res = await fetch('/api/org/intelligence')
    const json = await res.json()
    if (!res.ok || json.error) {
      setError(json.error ?? 'Could not load placements')
      setLoading(false)
      return
    }

    setClients(json.clients ?? [])
    setConsultants(json.consultants ?? [])
    setPlacements(json.placements ?? [])
    setSummary(json.placement_summary ?? null)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const consultantOptions = useMemo(
    () => consultants.map(c => ({ id: c.id, name: c.full_name ?? c.email })),
    [consultants],
  )

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingClient(true); setError(null)
    try {
      const res = await fetch('/api/org/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientForm),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Could not save client')
      setClientForm({ name: '', contact_person: '', contact_email: '', default_site: '', notes: '' })
      setShowClientForm(false)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save client')
    } finally {
      setSavingClient(false)
    }
  }

  const createPlacement = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPlacement(true); setError(null)
    try {
      const requirements = placementForm.compliance_requirements
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const res = await fetch('/api/org/placements', {
        method: editingPlacementId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingPlacementId ? { id: editingPlacementId } : {}),
          ...placementForm,
          compliance_requirements: requirements,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Could not save placement')
      resetPlacementForm()
      setShowPlacementForm(false)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save placement')
    } finally {
      setSavingPlacement(false)
    }
  }

  const editPlacement = (row: OrgPlacementReadiness) => {
    setPlacementForm({
      client_id: row.placement.client_id,
      user_id: row.placement.user_id,
      role_title: row.placement.role_title,
      site: row.placement.site ?? '',
      client_manager_name: row.placement.client_manager_name ?? '',
      client_manager_email: row.placement.client_manager_email ?? '',
      start_date: row.placement.start_date ?? '',
      end_date: row.placement.end_date ?? '',
      bill_rate: row.placement.bill_rate?.toString() ?? '',
      pay_rate: row.placement.pay_rate?.toString() ?? '',
      rate_type: row.placement.rate_type,
      compliance_requirements: (row.placement.compliance_requirements ?? []).join(', '),
      notes: row.placement.notes ?? '',
    })
    setEditingPlacementId(row.placement.id)
    setShowPlacementForm(true)
  }

  const archivePlacement = async (id: string) => {
    if (!confirm('Archive this placement? It will no longer appear in readiness totals.')) return
    setArchivingId(id); setError(null)
    try {
      const res = await fetch('/api/org/placements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'ended' }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Could not archive placement')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not archive placement')
    } finally {
      setArchivingId(null)
    }
  }

  const exportBillingPack = () => {
    downloadCsv('klippa-placement-billing-readiness-pack.csv', [
      ['Client', 'Contractor', 'Role', 'Site', 'Hours', 'Bill rate', 'Expected bill', 'Client signed', 'Ready to invoice', 'Blockers'],
      ...placements.map(row => [
        row.client?.name ?? '',
        row.consultant.full_name ?? row.consultant.email,
        row.placement.role_title,
        row.placement.site ?? '',
        row.timesheet?.hours ?? 0,
        row.placement.bill_rate ?? 0,
        row.expected_bill,
        row.timesheet?.client_signed_at ? 'Yes' : 'No',
        row.ready_to_bill ? 'Yes' : 'No',
        row.blockers.join('; '),
      ]),
    ])
  }

  const exportPaymentPack = () => {
    downloadCsv('klippa-contractor-payment-readiness-pack.csv', [
      ['Contractor', 'Client', 'Role', 'Hours', 'Pay rate', 'Expected pay', 'Placement house approved', 'Compliance score', 'Ready to pay', 'Blockers', 'Risk flags'],
      ...placements.map(row => [
        row.consultant.full_name ?? row.consultant.email,
        row.client?.name ?? '',
        row.placement.role_title,
        row.timesheet?.hours ?? 0,
        row.placement.pay_rate ?? 0,
        row.expected_pay,
        row.timesheet?.org_approved_at || row.timesheet?.status === 'approved' ? 'Yes' : 'No',
        `${row.compliance_score}/5`,
        row.ready_to_pay ? 'Yes' : 'No',
        row.blockers.join('; '),
        row.risk_flags.join('; '),
      ]),
    ])
  }

  if (loading) {
    return <div className="min-h-screen bg-base flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-3" /></div>
  }

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href="/org/dashboard" className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BriefcaseBusiness className="w-5 h-5 text-emerald-500" />
            <div>
              <h1 className="text-lg font-semibold">Placement control centre</h1>
              <p className="text-xs text-ink-2 mt-0.5">Track each contractor placement, what can be invoiced, what can be paid, and what is blocking the run.</p>
            </div>
          </div>
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              <button onClick={exportBillingPack}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-edge hover:bg-raised transition-colors">
                <Download className="w-3.5 h-3.5" /> Invoice pack
              </button>
              <button onClick={exportPaymentPack}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-edge hover:bg-raised transition-colors">
                <Download className="w-3.5 h-3.5" /> Pay pack
              </button>
              <button onClick={() => setShowClientForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-edge hover:bg-raised transition-colors">
                <Building2 className="w-3.5 h-3.5" /> Client
              </button>
              <button onClick={() => { resetPlacementForm(); setShowPlacementForm(v => !v) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Placement
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryCard icon={BriefcaseBusiness} label="Active placements" value={summary?.active ?? 0} />
          <SummaryCard icon={Check} label="Ready to invoice" value={summary?.ready_to_bill ?? 0} sub="client billing ready" />
          <SummaryCard icon={Users} label="Ready to pay" value={summary?.ready_to_pay ?? 0} sub="contractor payment ready" />
          <SummaryCard icon={TriangleAlert} label="Blocked" value={summary?.blocked ?? 0} alert={(summary?.blocked ?? 0) > 0} sub={`${summary?.client_approval_due ?? 0} need client sign-off`} />
          <SummaryCard icon={CircleDollarSign} label="Margin" value={money(summary?.projected_margin ?? 0)} sub={summary?.margin_pct == null ? 'no billable hours yet' : `${summary.margin_pct}% projected`} />
        </div>

        {showClientForm && isOwner && (
          <form onSubmit={createClient} className="rounded-2xl border border-edge bg-surface/50 p-5 space-y-4">
            <p className="text-sm font-semibold">Add client company</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input required value={clientForm.name} onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))} placeholder="Client company name" className="input" />
              <input value={clientForm.contact_person} onChange={e => setClientForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="Client contact person" className="input" />
              <input type="email" value={clientForm.contact_email} onChange={e => setClientForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="client.manager@company.co.za" className="input" />
              <input value={clientForm.default_site} onChange={e => setClientForm(f => ({ ...f, default_site: e.target.value }))} placeholder="Site or department" className="input" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowClientForm(false)} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
              <button disabled={savingClient} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                {savingClient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save client
              </button>
            </div>
          </form>
        )}

        {showPlacementForm && isOwner && (
          <form onSubmit={createPlacement} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
            <p className="text-sm font-semibold">{editingPlacementId ? 'Edit contractor placement' : 'Add contractor placement'}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select required value={placementForm.client_id} onChange={e => setPlacementForm(f => ({ ...f, client_id: e.target.value }))} className="input">
                <option value="">Select client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select required value={placementForm.user_id} onChange={e => setPlacementForm(f => ({ ...f, user_id: e.target.value }))} className="input">
                <option value="">Select contractor</option>
                {consultantOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input required value={placementForm.role_title} onChange={e => setPlacementForm(f => ({ ...f, role_title: e.target.value }))} placeholder="Role, e.g. Fitter, analyst" className="input" />
              <input value={placementForm.site} onChange={e => setPlacementForm(f => ({ ...f, site: e.target.value }))} placeholder="Client site / department" className="input" />
              <input value={placementForm.client_manager_name} onChange={e => setPlacementForm(f => ({ ...f, client_manager_name: e.target.value }))} placeholder="Client approver name" className="input" />
              <input type="email" value={placementForm.client_manager_email} onChange={e => setPlacementForm(f => ({ ...f, client_manager_email: e.target.value }))} placeholder="Approver email" className="input" />
              <input type="date" value={placementForm.start_date} onChange={e => setPlacementForm(f => ({ ...f, start_date: e.target.value }))} className="input" />
              <input type="date" value={placementForm.end_date} onChange={e => setPlacementForm(f => ({ ...f, end_date: e.target.value }))} className="input" />
              <input type="number" min="0" value={placementForm.bill_rate} onChange={e => setPlacementForm(f => ({ ...f, bill_rate: e.target.value }))} placeholder="Bill client R/hr" className="input" />
              <input type="number" min="0" value={placementForm.pay_rate} onChange={e => setPlacementForm(f => ({ ...f, pay_rate: e.target.value }))} placeholder="Pay contractor R/hr" className="input" />
              <select value={placementForm.rate_type} onChange={e => setPlacementForm(f => ({ ...f, rate_type: e.target.value as RateType }))} className="input">
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
                <option value="project">Project</option>
              </select>
              <input value={placementForm.compliance_requirements} onChange={e => setPlacementForm(f => ({ ...f, compliance_requirements: e.target.value }))} placeholder="Docs needed, comma separated" className="input" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { resetPlacementForm(); setShowPlacementForm(false) }} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
              <button disabled={savingPlacement || clients.length === 0 || consultants.length === 0} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                {savingPlacement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {editingPlacementId ? 'Update placement' : 'Save placement'}
              </button>
            </div>
          </form>
        )}

        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60">
            <p className="text-sm font-semibold">Billing and pay readiness</p>
            <p className="text-xs text-ink-2 mt-0.5">A placement is ready when client sign-off is recorded, your team has approved it, compliance is complete, and bill/pay rates are valid.</p>
          </div>
          {placements.length === 0 ? (
            <div className="px-5 py-14 text-center space-y-2">
              <BriefcaseBusiness className="w-8 h-8 text-edge mx-auto" />
              <p className="text-sm text-ink-2">No placements yet</p>
              <p className="text-xs text-ink-3">Add a client, then place a contractor against that client.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1080px]">
                <thead>
                  <tr className="border-b border-edge/50 bg-surface/40">
                    {['Client / contractor', 'Placement', 'Readiness', 'Bill', 'Pay', 'Margin', 'Blockers', 'Risk', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-ink-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {placements.map(row => (
                    <tr key={row.placement.id} className="border-b border-edge/40 last:border-0 hover:bg-surface/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-ink-1">{row.client?.name ?? 'Client missing'}</p>
                        <p className="text-xs text-ink-3">{row.consultant.full_name ?? row.consultant.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-medium text-ink-1">{row.placement.role_title}</p>
                        <p className="text-xs text-ink-3">{formatDate(row.placement.start_date)} - {formatDate(row.placement.end_date)}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className={`w-fit px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(row.ready_to_bill, row.blockers.length > 0)}`}>
                            {row.ready_to_bill ? 'Ready to invoice' : row.blockers.length ? 'Blocked' : 'Waiting'}
                          </span>
                          <span className={`w-fit px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(row.ready_to_pay, false)}`}>
                            {row.ready_to_pay ? 'Ready to pay' : 'Pay not ready'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-ink-1 font-medium">{money(row.expected_bill)}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-1 font-medium">{money(row.expected_pay)}</td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-semibold text-ink-1">{money(row.expected_margin)}</p>
                        <p className="text-xs text-ink-3">{row.margin_pct == null ? 'No hours' : `${row.margin_pct}%`}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        {row.blockers.length === 0 ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {row.blockers.slice(0, 3).map(b => (
                              <span key={b} className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-300">{b}</span>
                            ))}
                            {row.blockers.length > 3 && <span className="text-[11px] text-ink-3">+{row.blockers.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {row.risk_flags.length === 0 ? (
                          <span className="text-xs text-ink-3">Low</span>
                        ) : (
                          <div className="space-y-1">
                            <span className={`w-fit px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              row.risk_score >= 60
                                ? 'bg-red-500/15 text-red-500'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}>
                              Risk {row.risk_score}
                            </span>
                            <div className="flex flex-wrap gap-1.5 max-w-xs">
                              {row.risk_flags.slice(0, 2).map(flag => (
                                <span key={flag} className="px-2 py-0.5 rounded-full text-[11px] bg-edge text-ink-2">{flag}</span>
                              ))}
                              {row.risk_flags.length > 2 && <span className="text-[11px] text-ink-3">+{row.risk_flags.length - 2}</span>}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {isOwner && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => editPlacement(row)} className="p-1.5 rounded-lg text-ink-3 hover:text-ink-1 hover:bg-raised transition-colors" title="Edit placement">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => archivePlacement(row.placement.id)} disabled={archivingId === row.placement.id}
                              className="p-1.5 rounded-lg text-ink-3 hover:text-red-400 hover:bg-raised disabled:opacity-50 transition-colors" title="Archive placement">
                              {archivingId === row.placement.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
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
        </div>
      </main>
    </div>
  )
}
