'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck, ArrowLeft, Loader2, AlertTriangle, Check, X, Plus,
  CalendarClock, Wallet, FileText, Trash2, Save, ListChecks, Hash, Mail,
} from 'lucide-react'
import {
  FILING_STATUS_FLOW, FILING_STATUS_LABELS, ENTITY_TYPE_LABELS,
} from '@/lib/types'
import type {
  KlippaPracticeClient, FilingStatus, ChecklistItem, ClientReturnType,
} from '@/lib/types'

const zar = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
const dayLabel = (s: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))

type LinkedReturn = {
  status: string; gross_income: number; total_deductions: number
  taxable_income: number; net_tax_payable: number
  sars_reference: string | null; submitted_at: string | null
} | null

export default function PracticeClientDetail() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [client,  setClient]  = useState<KlippaPracticeClient | null>(null)
  const [linked,  setLinked]  = useState<LinkedReturn>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [busy,    setBusy]    = useState(false)

  // editable local state
  const [deadline, setDeadline] = useState('')
  const [fee,      setFee]      = useState('')
  const [notes,    setNotes]    = useState('')
  const [newItem,  setNewItem]  = useState('')
  const [dirty,    setDirty]    = useState(false)

  const load = useCallback(async () => {
    const res  = await fetch(`/api/practice/clients/${id}`)
    const json = await res.json()
    if (json.error) { setError(json.error); setLoading(false); return }
    const c = json.client as KlippaPracticeClient
    setClient(c)
    setLinked(json.linkedReturn ?? null)
    setDeadline(c.deadline ?? '')
    setFee(String(c.fee ?? 0))
    setNotes(c.notes ?? '')
    setDirty(false)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try {
      const res  = await fetch(`/api/practice/clients/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Update failed') }
    finally { setBusy(false) }
  }

  const saveDetails = () => patch({
    deadline: deadline || null,
    fee:      Number(fee) || 0,
    notes,
  })

  const setStatus = (s: FilingStatus) => { if (client && s !== client.filing_status) patch({ filing_status: s }) }

  const toggleItem = (itemId: string) => {
    if (!client) return
    const next = client.doc_checklist.map(it => it.id === itemId ? { ...it, received: !it.received } : it)
    patch({ doc_checklist: next })
  }
  const removeItem = (itemId: string) => {
    if (!client) return
    patch({ doc_checklist: client.doc_checklist.filter(it => it.id !== itemId) })
  }
  const addItem = () => {
    if (!client || !newItem.trim()) return
    const item: ChecklistItem = { id: crypto.randomUUID(), label: newItem.trim(), received: false }
    setNewItem('')
    patch({ doc_checklist: [...client.doc_checklist, item] })
  }

  const archive = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/practice/clients/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      router.push('/practice/dashboard')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); setBusy(false) }
  }

  if (loading) {
    return <div className="min-h-screen bg-base flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-3" /></div>
  }
  if (error && !client) {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm text-ink-2">{error}</p>
        <Link href="/practice/dashboard" className="text-xs text-emerald-500 hover:underline">Back to clients</Link>
      </div>
    )
  }

  const c        = client!
  const stageIdx = FILING_STATUS_FLOW.indexOf(c.filing_status)
  const dl       = c.deadline ? Math.ceil((new Date(c.deadline).getTime() - Date.now()) / 86_400_000) : null
  const overdue  = dl != null && dl < 0 && c.filing_status !== 'filed' && c.filing_status !== 'assessed'
  const received = c.doc_checklist.filter(i => i.received).length

  return (
    <div className="min-h-screen bg-base text-ink-1">
      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href="/practice/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Clients
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 sm:space-y-6">
        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* Identity */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 flex flex-wrap items-start gap-4 sm:gap-5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center text-white text-lg sm:text-xl font-bold flex-shrink-0">
            {c.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-1">{c.full_name}</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-edge text-ink-2">{ENTITY_TYPE_LABELS[c.entity_type]}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-ink-2">
              <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{c.return_type} · {c.tax_year}</span>
              {c.tax_number && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{c.tax_number}</span>}
              {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
            </div>
          </div>
          <button onClick={archive} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Archive
          </button>
        </div>

        {/* Filing pipeline stepper */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <p className="text-sm font-semibold">Filing pipeline</p>
          <div className="flex flex-wrap gap-2">
            {FILING_STATUS_FLOW.map((s, i) => {
              const done    = i < stageIdx
              const current = i === stageIdx
              return (
                <button key={s} onClick={() => setStatus(s)} disabled={busy}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-60 ${
                    current ? 'bg-amber-500 text-white'
                    : done  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-raised text-ink-2 hover:bg-edge'
                  }`}>
                  {done ? <Check className="w-3 h-3" /> : <span className="w-4 text-center tabular-nums">{i + 1}</span>}
                  {FILING_STATUS_LABELS[s]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Key facts + editable details */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-edge bg-surface p-5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-2"><CalendarClock className="w-3.5 h-3.5" /> Deadline</div>
            <p className={`text-lg font-bold ${overdue ? 'text-red-400' : dl != null && dl <= 14 ? 'text-amber-500' : 'text-ink-1'}`}>
              {c.deadline ? dayLabel(c.deadline) : '—'}
            </p>
            {dl != null && <p className="text-xs text-ink-3">{overdue ? `${Math.abs(dl)}d overdue` : dl === 0 ? 'Due today' : `${dl}d remaining`}</p>}
          </div>
          <div className="rounded-2xl border border-edge bg-surface p-5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-2"><Wallet className="w-3.5 h-3.5" /> Fee</div>
            <p className="text-lg font-bold text-ink-1">{zar(c.fee)}</p>
            <button onClick={() => patch({ fee_paid: !c.fee_paid })} disabled={busy || c.fee === 0}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${c.fee_paid ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'}`}>
              {c.fee_paid ? 'Paid ✓' : 'Mark paid'}
            </button>
          </div>
          <div className="rounded-2xl border border-edge bg-surface p-5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-2"><ListChecks className="w-3.5 h-3.5" /> Documents</div>
            <p className="text-lg font-bold text-ink-1">{received}/{c.doc_checklist.length || 0}</p>
            <p className="text-xs text-ink-3">received</p>
          </div>
        </div>

        {/* Document checklist */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold">Document checklist</p>
          </div>
          {c.doc_checklist.length > 0 && (
            <div className="space-y-2">
              {c.doc_checklist.map(it => (
                <div key={it.id} className="flex items-center gap-3 rounded-xl bg-raised/40 border border-edge px-3.5 py-2.5">
                  <button onClick={() => toggleItem(it.id)} disabled={busy}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                      it.received ? 'bg-emerald-500 border-emerald-500' : 'border-edge hover:border-ink-2'
                    }`}>
                    {it.received && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <span className={`text-sm flex-1 ${it.received ? 'text-ink-3 line-through' : 'text-ink-1'}`}>{it.label}</span>
                  <button onClick={() => removeItem(it.id)} disabled={busy} className="text-ink-3 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="e.g. IRP5, medical certificate, RA certificate…"
              className="input flex-1" />
            <button onClick={addItem} disabled={busy || !newItem.trim()}
              className="flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors flex-shrink-0">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Linked return snapshot */}
        {linked && (
          <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
            <p className="text-sm font-semibold">Linked Klippa return — {c.tax_year}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-ink-3">Gross income</p><p className="font-semibold tabular-nums">{zar(linked.gross_income)}</p></div>
              <div><p className="text-xs text-ink-3">Deductions</p><p className="font-semibold tabular-nums">{zar(linked.total_deductions)}</p></div>
              <div><p className="text-xs text-ink-3">Taxable</p><p className="font-semibold tabular-nums">{zar(linked.taxable_income)}</p></div>
              <div><p className="text-xs text-ink-3">{linked.net_tax_payable >= 0 ? 'Owed to SARS' : 'Refund'}</p>
                <p className={`font-semibold tabular-nums ${linked.net_tax_payable >= 0 ? 'text-red-400' : 'text-emerald-500'}`}>{zar(Math.abs(linked.net_tax_payable))}</p></div>
            </div>
          </div>
        )}

        {/* Editable details */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <p className="text-sm font-semibold">Details</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">Filing deadline</label>
              <input type="date" value={deadline} onChange={e => { setDeadline(e.target.value); setDirty(true) }} className="input w-full" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">Fee (R)</label>
              <input type="number" value={fee} onChange={e => { setFee(e.target.value); setDirty(true) }} className="input w-full" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-2">Notes</label>
            <textarea value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }} rows={3}
              placeholder="Internal notes about this client's return…" className="input w-full resize-none" />
          </div>
          <button onClick={saveDetails} disabled={busy || !dirty}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save details
          </button>
        </div>
      </main>
    </div>
  )
}
