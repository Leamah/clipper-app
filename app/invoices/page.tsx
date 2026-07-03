'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  Plus, Trash2, Loader2, X, Check, Zap, Download, Send, Banknote,
  FileSpreadsheet, Landmark, Pencil,
} from 'lucide-react'
import type { KlippaInvoice, KlippaInvoiceItem, KlippaFreelancerClient, KlippaProfile, InvoiceStatus } from '@/lib/types'
import { INVOICE_STATUS_LABELS } from '@/lib/types'
import { exportInvoicePDF } from '@/lib/pdf-export'
import { isStarterOrAbove, FREE_INVOICE_LIMIT } from '@/lib/tier'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(n)
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

function invoiceRef(n: number) {
  return `INV-${String(n).padStart(4, '0')}`
}

/** Sent + past due date renders as overdue without a separate DB write */
function displayStatus(inv: KlippaInvoice): InvoiceStatus {
  if (inv.status === 'sent' && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) return 'overdue'
  return inv.status
}

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft:     'bg-raised text-ink-2',
  sent:      'bg-sky-500/15 text-sky-400',
  paid:      'bg-emerald-500/15 text-emerald-400',
  overdue:   'bg-red-500/15 text-red-400',
  cancelled: 'bg-raised text-ink-3 line-through',
}

interface ItemDraft { description: string; quantity: string; unit_price: string }

const EMPTY_ITEM: ItemDraft = { description: '', quantity: '1', unit_price: '' }

// ── Invoice create/edit modal ─────────────────────────────

function InvoiceModal({ invoice, clients, onClose, onSaved, onClientAdded }: {
  invoice:       KlippaInvoice | null      // null = create
  clients:       KlippaFreelancerClient[]
  onClose:       () => void
  onSaved:       (inv: KlippaInvoice) => void
  onClientAdded: (c: KlippaFreelancerClient) => void
}) {
  const [clientId,   setClientId]   = useState(invoice?.client_id ?? clients[0]?.id ?? '')
  const [issueDate,  setIssueDate]  = useState(invoice?.issue_date ?? new Date().toISOString().slice(0, 10))
  const [dueDate,    setDueDate]    = useState(invoice?.due_date ?? '')
  const [vatEnabled, setVatEnabled] = useState(invoice?.vat_enabled ?? false)
  const [vatRate,    setVatRate]    = useState(String(invoice?.vat_rate ?? 15))
  const [notes,      setNotes]      = useState(invoice?.notes ?? '')
  const [payRef,     setPayRef]     = useState(invoice?.payment_reference ?? '')
  const [items,      setItems]      = useState<ItemDraft[]>(
    invoice?.items?.length
      ? invoice.items.map((it) => ({ description: it.description, quantity: String(it.quantity), unit_price: String(it.unit_price) }))
      : [{ ...EMPTY_ITEM }]
  )
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Inline new-client mini form
  const [addingClient, setAddingClient] = useState(clients.length === 0)
  const [newClient, setNewClient] = useState({ name: '', email: '', contact_person: '' })
  const [savingClient, setSavingClient] = useState(false)

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0)
  const vatAmt   = vatEnabled ? subtotal * ((parseFloat(vatRate) || 15) / 100) : 0

  const setItem = (i: number, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))

  const saveClient = async () => {
    if (!newClient.name.trim()) return
    setSavingClient(true)
    try {
      const res  = await fetch('/api/invoice-clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add client')
      onClientAdded(data.client)
      setClientId(data.client.id)
      setAddingClient(false)
      setNewClient({ name: '', email: '', contact_person: '' })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add client')
    } finally {
      setSavingClient(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientId) { setError('Pick or add a client first'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        client_id:         clientId,
        issue_date:        issueDate,
        due_date:          dueDate || null,
        vat_enabled:       vatEnabled,
        vat_rate:          parseFloat(vatRate) || 15,
        notes:             notes || null,
        payment_reference: payRef || null,
        items: items
          .filter((it) => it.description.trim())
          .map((it) => ({ description: it.description, quantity: parseFloat(it.quantity) || 1, unit_price: parseFloat(it.unit_price) || 0 })),
      }
      const res  = await fetch(invoice ? `/api/invoices/${invoice.id}` : '/api/invoices', {
        method:  invoice ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.status === 402 && data.error === 'free_limit_reached') { setError('limit_reached'); return }
      if (!res.ok) throw new Error(data.error ?? 'Failed to save invoice')
      onSaved(data.invoice)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-5 my-8">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink-1">{invoice ? `Edit ${invoiceRef(invoice.invoice_number)}` : 'New invoice'}</h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client */}
          <Field label="Client">
            {addingClient ? (
              <div className="rounded-xl border border-edge bg-raised/40 p-3 space-y-2">
                <input type="text" value={newClient.name} onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))} placeholder="Client / company name" className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="email" value={newClient.email} onChange={(e) => setNewClient((c) => ({ ...c, email: e.target.value }))} placeholder="Email (for sending)" className="input" />
                  <input type="text" value={newClient.contact_person} onChange={(e) => setNewClient((c) => ({ ...c, contact_person: e.target.value }))} placeholder="Contact person" className="input" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={saveClient} disabled={savingClient || !newClient.name.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                    {savingClient ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save client
                  </button>
                  {clients.length > 0 && (
                    <button type="button" onClick={() => setAddingClient(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input flex-1">
                  {clients.filter((c) => c.status === 'active' || c.id === clientId).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setAddingClient(true)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors flex-shrink-0">
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date">
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required className="input" />
            </Field>
            <Field label="Due date (optional)">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            </Field>
          </div>

          {/* Line items */}
          <Field label="Line items">
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input type="text" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Description of work" className="input flex-1" />
                  <input type="number" min="0" step="0.5" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} placeholder="Qty" className="input w-16" title="Quantity" />
                  <input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value })} placeholder="Price (R)" className="input w-28" title="Unit price" />
                  <button type="button" onClick={() => setItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)} className="p-2 text-ink-3 hover:text-red-400 transition-colors" title="Remove line">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                <Plus className="w-3 h-3" /> Add line
              </button>
            </div>
          </Field>

          {/* VAT + totals */}
          <div className="rounded-xl border border-edge bg-raised/30 p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
              <input type="checkbox" checked={vatEnabled} onChange={(e) => setVatEnabled(e.target.checked)} className="accent-emerald-500" />
              I&apos;m VAT registered — add VAT
              {vatEnabled && (
                <input type="number" min="0" max="100" step="0.5" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="input w-16 ml-1" />
              )}
            </label>
            <div className="flex justify-between text-xs text-ink-2"><span>Subtotal</span><span className="tabular-nums">{formatRand(subtotal)}</span></div>
            {vatEnabled && <div className="flex justify-between text-xs text-ink-2"><span>VAT</span><span className="tabular-nums">{formatRand(vatAmt)}</span></div>}
            <div className="flex justify-between text-sm font-bold text-ink-1 pt-1 border-t border-edge/60"><span>Total</span><span className="tabular-nums">{formatRand(subtotal + vatAmt)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment reference (optional)">
              <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={`e.g. ${invoice ? invoiceRef(invoice.invoice_number) : 'INV-0001'}`} className="input" />
            </Field>
            <Field label="Notes (optional)">
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you for your business" className="input" />
            </Field>
          </div>

          {error === 'limit_reached' ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-amber-300">Monthly limit reached</p>
              </div>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Free plan includes {FREE_INVOICE_LIMIT} invoices per month. Upgrade to Starter for unlimited invoicing.
              </p>
              <a href="/pricing" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors">
                <Zap className="w-3 h-3" /> Upgrade now
              </a>
            </div>
          ) : error ? (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
            <button type="submit" disabled={saving || error === 'limit_reached'} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : invoice ? 'Save changes' : 'Create invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Banking details modal ─────────────────────────────────

function BankingModal({ profile, onClose, onSaved }: {
  profile: KlippaProfile
  onClose: () => void
  onSaved: (details: string) => void
}) {
  const [details, setDetails] = useState(profile.invoice_banking_details ?? '')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('klippa_profiles')
      .update({ invoice_banking_details: details || null })
      .eq('id', profile.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(details)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink-1">Banking details</h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-ink-2 leading-relaxed">Printed on every invoice PDF so clients know where to pay. E.g. bank name, account holder, account number, branch code.</p>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          placeholder={'FNB · Cheque account\nAccount holder: Your Name\nAccount no: 62000000000\nBranch code: 250655'}
          className="input w-full font-mono text-xs"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<KlippaInvoice[]>([])
  const [clients,  setClients]  = useState<KlippaFreelancerClient[]>([])
  const [profile,  setProfile]  = useState<KlippaProfile | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState<KlippaInvoice | null>(null)
  const [showBanking, setShowBanking] = useState(false)
  const [busy,        setBusy]        = useState<string | null>(null)  // invoice id with an action in flight
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [invRes, clRes, profRes] = await Promise.all([
      fetch('/api/invoices').then((r) => r.json()),
      fetch('/api/invoice-clients').then((r) => r.json()),
      supabase.from('klippa_profiles').select('*').eq('id', user.id).single(),
    ])
    setInvoices(invRes.invoices ?? [])
    setClients(clRes.clients ?? [])
    setProfile(profRes.data as KlippaProfile | null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const patchInvoice = (inv: KlippaInvoice) =>
    setInvoices((prev) => {
      const exists = prev.some((i) => i.id === inv.id)
      return exists ? prev.map((i) => i.id === inv.id ? { ...i, ...inv } : i) : [inv, ...prev]
    })

  const withItems = async (inv: KlippaInvoice): Promise<KlippaInvoice> => {
    if (inv.items?.length) return inv
    const res  = await fetch(`/api/invoices/${inv.id}`)
    const data = await res.json()
    return data.invoice ?? inv
  }

  const handleDownload = async (inv: KlippaInvoice) => {
    if (!profile) return
    setBusy(inv.id)
    setActionError(null)
    try {
      const full   = await withItems(inv)
      const client = full.client ?? clients.find((c) => c.id === inv.client_id)
      if (!client) throw new Error('Client not found')
      await exportInvoicePDF(full, full.items ?? [], client, profile)
      patchInvoice(full)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusy(null)
    }
  }

  const handleSend = async (inv: KlippaInvoice) => {
    if (!profile) return
    const client = inv.client ?? clients.find((c) => c.id === inv.client_id)
    if (!client?.email) { setActionError(`${client?.name ?? 'This client'} has no email address — edit the client first.`); return }
    setBusy(inv.id)
    setActionError(null)
    // Optimistic: show as sent immediately
    const prev = invoices
    patchInvoice({ ...inv, status: 'sent' })
    try {
      const full = await withItems(inv)
      const blob = await exportInvoicePDF(full, full.items ?? [], client, profile, { blob: true }) as Blob
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const res  = await fetch(`/api/invoices/${inv.id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_base64: base64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')
      patchInvoice({ ...data.invoice, items: full.items })
    } catch (e: unknown) {
      setInvoices(prev)  // roll back optimistic update
      setActionError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(null)
    }
  }

  const handleMarkPaid = async (inv: KlippaInvoice) => {
    setBusy(inv.id)
    setActionError(null)
    const prev = invoices
    patchInvoice({ ...inv, status: 'paid', paid_at: new Date().toISOString() })
    try {
      const res  = await fetch(`/api/invoices/${inv.id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark as paid')
      patchInvoice(data.invoice)
    } catch (e: unknown) {
      setInvoices(prev)
      setActionError(e instanceof Error ? e.message : 'Failed to mark as paid')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (inv: KlippaInvoice) => {
    setBusy(inv.id)
    const prev = invoices
    setInvoices((p) => p.filter((i) => i.id !== inv.id))
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: 'DELETE' })
      if (!res.ok) { const data = await res.json(); throw new Error(data.error) }
    } catch (e: unknown) {
      setInvoices(prev)
      setActionError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const openEdit = async (inv: KlippaInvoice) => {
    const full = await withItems(inv)
    patchInvoice(full)
    setEditing(full)
    setShowModal(true)
  }

  const isStarter    = isStarterOrAbove(profile)
  const outstanding  = invoices.filter((i) => displayStatus(i) === 'sent' || displayStatus(i) === 'overdue')
  const outstandingR = outstanding.reduce((s, i) => s + i.total, 0)

  const thisMonthCount = !isStarter && !loading ? (() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    return invoices.filter((i) => new Date(i.created_at) >= monthStart).length
  })() : 0

  return (
    <div className="app-shell bg-base text-ink-1">
      <AppNav activePage="invoices" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-1">Invoices</h1>
            <p className="text-sm text-ink-2 mt-1">
              {outstanding.length > 0
                ? `${outstanding.length} awaiting payment · ${formatRand(outstandingR)} outstanding`
                : invoices.length > 0 ? 'All invoices settled 🎉' : 'Bill your clients and track payments'}
            </p>
            {!loading && !isStarter && (
              <p className={`text-xs mt-1 font-medium ${thisMonthCount >= FREE_INVOICE_LIMIT ? 'text-red-400' : 'text-ink-3'}`}>
                {thisMonthCount}/{FREE_INVOICE_LIMIT} invoices this month
                {thisMonthCount >= FREE_INVOICE_LIMIT && (
                  <a href="/pricing" className="ml-2 underline text-emerald-400">Upgrade for unlimited</a>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBanking(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors"
              title="Banking details shown on your invoices"
            >
              <Landmark className="w-3.5 h-3.5" /> Banking details
            </button>
            <button
              onClick={() => { setEditing(null); setShowModal(true) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New invoice
            </button>
          </div>
        </div>

        {actionError && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{actionError}</p>
        )}

        {/* Invoice list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-edge p-16 text-center space-y-4">
            <FileSpreadsheet className="w-8 h-8 text-ink-3 mx-auto" />
            <div>
              <p className="text-sm font-medium text-ink-2">No invoices yet</p>
              <p className="text-xs text-ink-3 mt-1">Create your first invoice — when it&apos;s paid, the income is logged for tax automatically.</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true) }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> New invoice
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-edge overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge bg-surface/60">
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Invoice</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Due</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-2">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-ink-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const st       = displayStatus(inv)
                  const isBusy   = busy === inv.id
                  const editable = st === 'draft' || st === 'sent' || st === 'overdue'
                  return (
                    <tr key={inv.id} className="border-b border-edge/60 hover:bg-surface/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-ink-1 font-medium font-mono text-xs">{invoiceRef(inv.invoice_number)}</p>
                        <p className="text-[11px] text-ink-3 mt-0.5">{formatDate(inv.issue_date)}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-1">{inv.client?.name ?? clients.find((c) => c.id === inv.client_id)?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-ink-2">{formatDate(inv.due_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[st]}`}>{INVOICE_STATUS_LABELS[st]}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink-1 tabular-nums">{formatRand(inv.total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-3" />
                          ) : (
                            <>
                              {editable && (
                                <button onClick={() => openEdit(inv)} className="p-1.5 text-ink-3 hover:text-ink-1 transition-colors" title="Edit">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => handleDownload(inv)} className="p-1.5 text-ink-3 hover:text-ink-1 transition-colors" title="Download PDF">
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              {(st === 'draft' || st === 'sent' || st === 'overdue') && (
                                <button onClick={() => handleSend(inv)} className="p-1.5 text-ink-3 hover:text-sky-400 transition-colors" title={st === 'draft' ? 'Send to client' : 'Resend to client'}>
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(st === 'sent' || st === 'overdue' || st === 'draft') && (
                                <button onClick={() => handleMarkPaid(inv)} className="p-1.5 text-ink-3 hover:text-emerald-400 transition-colors" title="Mark as paid — logs the income">
                                  <Banknote className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {st === 'draft' && (
                                <button onClick={() => handleDelete(inv)} className="p-1.5 text-ink-3 hover:text-red-400 transition-colors" title="Delete draft">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paid invoices feed income automatically — small explainer */}
        {!loading && invoices.length > 0 && (
          <p className="text-xs text-ink-3">
            Marking an invoice as paid automatically logs the amount under <a href="/income" className="underline">Income</a> for your tax return.
          </p>
        )}
      </main>

      {showModal && (
        <InvoiceModal
          invoice={editing}
          clients={clients}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSaved={patchInvoice}
          onClientAdded={(c) => setClients((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}

      {showBanking && profile && (
        <BankingModal
          profile={profile}
          onClose={() => setShowBanking(false)}
          onSaved={(details) => setProfile((p) => p ? { ...p, invoice_banking_details: details || null } : p)}
        />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-ink-2">{label}</label>
      {children}
    </div>
  )
}
