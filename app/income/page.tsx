'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import { ShieldCheck, Plus, Upload, FileSpreadsheet, Trash2, Loader2, X, Check } from 'lucide-react'
import type { KlippaIncomeRecord, KlippaTaxReturn, IncomeType } from '@/lib/types'
import { INCOME_TYPE_LABELS } from '@/lib/types'
import Papa from 'papaparse'
import { parseBankCSV, type ParsedTransaction } from '@/lib/csv-parser'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(n)
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

// ── Add Income Modal ──────────────────────────────────────

function AddIncomeModal({ taxReturnId, onClose, onSaved }: {
  taxReturnId: string | null
  onClose:     () => void
  onSaved:     (record: KlippaIncomeRecord) => void
}) {
  const [form, setForm] = useState({
    source_name:   '',
    income_type:   'freelance' as IncomeType,
    amount:        '',
    received_date: '',
    description:   '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/income', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, tax_return_id: taxReturnId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onSaved(data.record)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Add income</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Source / Client name">
            <input
              type="text"
              value={form.source_name}
              onChange={(e) => setForm((f) => ({ ...f, source_name: e.target.value }))}
              placeholder="e.g. Acme Corp, MTN, Consulting fee"
              required
              className="input"
            />
          </Field>

          <Field label="Income type">
            <select
              value={form.income_type}
              onChange={(e) => setForm((f) => ({ ...f, income_type: e.target.value as IncomeType }))}
              className="input"
            >
              {(Object.entries(INCOME_TYPE_LABELS) as [IncomeType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (R)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                required
                className="input"
              />
            </Field>
            <Field label="Date received">
              <input
                type="date"
                value={form.received_date}
                onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))}
                className="input"
              />
            </Field>
          </div>

          <Field label="Description (optional)">
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Invoice #123, Project name, etc."
              className="input"
            />
          </Field>

          {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Add income'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── CSV Import Modal ──────────────────────────────────────

function CsvImportModal({ taxReturnId, onClose, onImported }: {
  taxReturnId: string | null
  onClose:     () => void
  onImported:  (records: KlippaIncomeRecord[]) => void
}) {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [bankName,     setBankName]     = useState<string | null>(null)
  const [errors,       setErrors]       = useState<string[]>([])
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const result = parseBankCSV(text)
      const credits = result.transactions.filter((t) => t.amount > 0)
      setTransactions(credits)
      setBankName(result.bank)
      setErrors(result.errors)
      setSelected(new Set(credits.map((_, i) => i)))
    }
    reader.readAsText(file)
  }

  const toggle = (i: number) => setSelected((s) => {
    const next = new Set(s)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const handleImport = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const toImport = [...selected].map((i) => transactions[i])
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const rows = toImport.map((t) => ({
        user_id:        user.id,
        tax_return_id:  taxReturnId ?? null,
        source_name:    t.description || 'Bank credit',
        income_type:    'freelance' as IncomeType,
        amount:         t.amount,
        received_date:  t.date,
        description:    t.description,
        capture_method: 'csv_import',
      }))

      const { data, error } = await supabase.from('klippa_income_records').insert(rows).select()
      if (error) throw error
      onImported(data as KlippaIncomeRecord[])
      onClose()
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl p-6 space-y-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-white">Import from bank statement</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>

        {transactions.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Export a CSV from your bank app (FNB, Standard Bank, Absa, Capitec, Nedbank, Investec) and upload it here. We&apos;ll detect credits (money in) as income.</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center gap-3 py-10 rounded-xl border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <FileSpreadsheet className="w-8 h-8" />
              <span className="text-sm">Click to select CSV file</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            {errors.length > 0 && <p className="text-xs text-amber-400">{errors[0]}</p>}
          </div>
        ) : (
          <>
            <div className="flex-shrink-0 space-y-1">
              <p className="text-xs text-zinc-500">{bankName && `Detected: ${bankName} · `}{transactions.length} credit transactions found</p>
              <p className="text-xs text-zinc-600">Select the ones to import as income. Deselect personal transfers.</p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {transactions.map((t, i) => (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                    selected.has(i) ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-800/50 border border-transparent'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected.has(i) ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'}`}>
                    {selected.has(i) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-zinc-200">{t.description}</p>
                    <p className="text-xs text-zinc-500">{formatDate(t.date)}</p>
                  </div>
                  <span className="text-emerald-400 font-medium tabular-nums flex-shrink-0">{formatRand(t.amount)}</span>
                </button>
              ))}
            </div>
            {saveError && <p className="text-xs text-red-400 flex-shrink-0">{saveError}</p>}
            <div className="flex gap-2 flex-shrink-0 pt-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors">Cancel</button>
              <button onClick={handleImport} disabled={saving || selected.size === 0} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {saving ? 'Importing…' : `Import ${selected.size} records`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────

function IncomePage() {
  const searchParams = useSearchParams()
  const [records,      setRecords]      = useState<KlippaIncomeRecord[]>([])
  const [taxReturn,    setTaxReturn]    = useState<KlippaTaxReturn | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [showAdd,      setShowAdd]      = useState(searchParams.get('add') === '1')
  const [showCSV,      setShowCSV]      = useState(false)
  const [deleting,     setDeleting]     = useState<string | null>(null)

  const loadRecords = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: ret } = await supabase
      .from('klippa_tax_returns')
      .select('*')
      .eq('user_id', user.id)
      .order('tax_year', { ascending: false })
      .limit(1)
      .single()

    setTaxReturn(ret as KlippaTaxReturn | null)

    const { data } = await supabase
      .from('klippa_income_records')
      .select('*')
      .eq('user_id', user.id)
      .order('received_date', { ascending: false })

    setRecords((data ?? []) as KlippaIncomeRecord[])
    setLoading(false)
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await fetch('/api/income', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRecords((r) => r.filter((x) => x.id !== id))
    setDeleting(null)
  }

  const totalIncome = records.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/dashboard"  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Dashboard</Link>
            <span className="px-3 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-500/10 font-medium">Income</span>
            <Link href="/expenses"   className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Expenses</Link>
            <Link href="/documents"  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Documents</Link>
            <Link href="/filing"     className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">File Return</Link>
          </nav>
          <div className="ml-auto"><UserNav /></div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Income</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {records.length > 0 ? `${records.length} records · Total ${formatRand(totalIncome)}` : 'No income records yet'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCSV(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add income
            </button>
          </div>
        </div>

        {/* Records table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center space-y-4">
            <Upload className="w-8 h-8 text-zinc-700 mx-auto" />
            <div>
              <p className="text-sm font-medium text-zinc-400">No income yet</p>
              <p className="text-xs text-zinc-600 mt-1">Add your freelance income manually or import from your bank statement.</p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add manually
              </button>
              <button onClick={() => setShowCSV(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400">Amount</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-zinc-200 font-medium">{r.source_name}</p>
                      {r.description && <p className="text-xs text-zinc-500 mt-0.5">{r.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-400">
                        {INCOME_TYPE_LABELS[r.income_type as IncomeType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{formatDate(r.received_date)}</td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-100 tabular-nums">{formatRand(r.amount)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {deleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-zinc-900/40">
                  <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-zinc-400">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-zinc-100 tabular-nums">{formatRand(totalIncome)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showAdd && (
        <AddIncomeModal
          taxReturnId={taxReturn?.id ?? null}
          onClose={() => setShowAdd(false)}
          onSaved={(r) => setRecords((prev) => [r, ...prev])}
        />
      )}

      {showCSV && (
        <CsvImportModal
          taxReturnId={taxReturn?.id ?? null}
          onClose={() => setShowCSV(false)}
          onImported={(recs) => setRecords((prev) => [...recs, ...prev])}
        />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  )
}

export default function IncomePageWrapper() {
  return <Suspense><IncomePage /></Suspense>
}
