'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import {
  ShieldCheck, Plus, FileSpreadsheet, Trash2, Loader2,
  X, Check, ChevronDown, Sparkles, AlertTriangle, ShieldAlert, Camera
} from 'lucide-react'
import type { KlippaExpenseRecord, KlippaTaxReturn, ExpenseCategory, IncomeType } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS, CATEGORY_DEFAULT_DEDUCTIBLE_PCT } from '@/lib/types'
import { parseBankCSV, type ParsedTransaction } from '@/lib/csv-parser'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(n)
}
function formatDate(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

// ── AI Classification card (with mixed-use intelligence) ──

function AiResultCard({ record, onAccept, onReject, loading }: {
  record:   KlippaExpenseRecord
  onAccept: () => void
  onReject: () => void
  loading:  boolean
}) {
  const [showEvidence, setShowEvidence] = useState(false)

  const riskColor = {
    high:   'text-red-400 bg-red-500/10',
    medium: 'text-amber-400 bg-amber-500/10',
    low:    'text-emerald-400 bg-emerald-500/10',
  }[record.ai_audit_risk ?? 'low']

  const confidenceColor = {
    high:   'bg-emerald-500/15 text-emerald-300',
    medium: 'bg-amber-500/15 text-amber-300',
    low:    'bg-red-500/15 text-red-300',
  }[record.ai_confidence ?? 'medium']

  const isMixed      = record.ai_is_mixed_use
  const conservative = record.ai_conservative_pct
  const aggressive   = record.ai_aggressive_pct
  const recommended  = record.deductible_percentage

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-100">{record.merchant_name || '(no merchant)'}</p>
            {isMixed && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 uppercase">Mixed use</span>
            )}
          </div>
          <p className="text-xs text-zinc-500">{formatDate(record.expense_date)} · {EXPENSE_CATEGORY_LABELS[record.category]}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-zinc-100 tabular-nums">{formatRand(record.amount)}</p>
          <p className="text-xs text-emerald-400 tabular-nums font-medium">Claim {formatRand(record.deductible_amount)}</p>
        </div>
      </div>

      {/* SARS Rule — plain English */}
      {record.ai_sars_rule && (
        <div className="rounded-lg bg-zinc-900/80 border border-zinc-800 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">SARS says</p>
          <p className="text-xs text-zinc-300 leading-relaxed">{record.ai_sars_rule}</p>
        </div>
      )}

      {/* Reasoning */}
      {record.ai_reasoning && (
        <p className="text-xs text-zinc-400 leading-relaxed italic px-1">&ldquo;{record.ai_reasoning}&rdquo;</p>
      )}

      {/* Deductibility range (mixed-use) */}
      {isMixed && conservative != null && aggressive != null ? (
        <div className="rounded-lg bg-zinc-900/60 p-3 space-y-2.5">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Deductibility range</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="space-y-0.5">
              <p className="text-xs text-zinc-500">Conservative</p>
              <p className="text-sm font-bold text-zinc-400">{conservative}%</p>
              <p className="text-xs text-zinc-600">{formatRand(record.amount * conservative / 100)}</p>
            </div>
            <div className="space-y-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 py-1">
              <p className="text-xs text-emerald-400 font-medium">Recommended</p>
              <p className="text-sm font-bold text-emerald-300">{recommended}%</p>
              <p className="text-xs text-emerald-500">{formatRand(record.deductible_amount)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-zinc-500">Maximum</p>
              <p className="text-sm font-bold text-zinc-400">{aggressive}%</p>
              <p className="text-xs text-zinc-600">{formatRand(record.amount * aggressive / 100)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap px-1">
          <span className="text-xs text-zinc-400">{recommended}% deductible</span>
          {record.ai_confidence && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${confidenceColor}`}>
              {record.ai_confidence}
            </span>
          )}
          {record.ai_audit_risk && (
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${riskColor}`}>
              <ShieldAlert className="w-3 h-3" />
              {record.ai_audit_risk} audit risk
            </span>
          )}
        </div>
      )}

      {/* Behavioral tip */}
      {record.ai_behavioral_tip && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-500/8 border border-blue-500/15 px-3 py-2">
          <span className="text-blue-400 mt-0.5 flex-shrink-0">💡</span>
          <p className="text-xs text-blue-300 leading-relaxed">{record.ai_behavioral_tip}</p>
        </div>
      )}

      {/* Evidence & triggers toggle */}
      {((record.ai_required_evidence?.length ?? 0) > 0 || (record.ai_audit_triggers?.length ?? 0) > 0) && (
        <button onClick={() => setShowEvidence((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
          <ChevronDown className={`w-3 h-3 transition-transform ${showEvidence ? 'rotate-180' : ''}`} />
          {showEvidence ? 'Hide' : 'Show'} evidence required &amp; audit triggers
        </button>
      )}
      {showEvidence && (
        <div className="space-y-2 pt-1">
          {(record.ai_required_evidence?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Keep on file</p>
              {record.ai_required_evidence!.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-400">
                  <span className="text-emerald-500 mt-0.5">•</span>{e}
                </div>
              ))}
            </div>
          )}
          {(record.ai_audit_triggers?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">SARS audit triggers</p>
              {record.ai_audit_triggers!.map((t, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400/80">
                  <span className="mt-0.5">⚠</span>{t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accept / Reject */}
      <div className="flex gap-2 pt-1">
        <button onClick={onReject} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors disabled:opacity-50">
          <X className="w-3.5 h-3.5" /> Not deductible
        </button>
        <button onClick={onAccept} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Confirm {recommended}% claim
        </button>
      </div>
    </div>
  )
}

// ── Add Expense Modal ─────────────────────────────────────

function AddExpenseModal({ taxReturnId, onClose, onSaved }: {
  taxReturnId: string | null
  onClose:     () => void
  onSaved:     (r: KlippaExpenseRecord, classify: boolean) => void
}) {
  const [form, setForm] = useState({
    merchant_name: '',
    amount:        '',
    expense_date:  '',
    description:   '',
    category:      'other' as ExpenseCategory,
  })
  const [doClassify,  setDoClassify]  = useState(true)
  const [scanning,    setScanning]    = useState(false)
  const [scanStatus,  setScanStatus]  = useState<'idle' | 'scanning' | 'done' | 'failed'>('idle')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Receipt scan via OCR ──────────────────────────────────
  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setScanStatus('scanning')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (taxReturnId) fd.append('tax_return_id', taxReturnId)
      const res  = await fetch('/api/documents/ocr', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'OCR failed')

      const ext = data.extracted
      // Pre-fill whatever was extracted — user can correct
      setForm((f) => ({
        ...f,
        merchant_name: ext.merchant_name ?? f.merchant_name,
        amount:        ext.amount != null ? String(ext.amount) : f.amount,
        expense_date:  ext.expense_date ?? f.expense_date,
      }))
      setScanStatus('done')
      setDoClassify(true)   // auto-enable AI classify after scan
    } catch (e: unknown) {
      setScanStatus('failed')
      setError(e instanceof Error ? e.message : 'Receipt scan failed')
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/expenses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, tax_return_id: taxReturnId, classify: doClassify }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onSaved(data.record, doClassify)
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
          <h3 className="font-semibold text-white">Add expense</h3>
          <div className="flex items-center gap-2">
            {/* Scan receipt button */}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleScan} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              title="Scan receipt"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                scanStatus === 'done'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : scanStatus === 'failed'
                  ? 'border-red-500/50 text-red-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
              }`}
            >
              {scanning
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Camera className="w-3.5 h-3.5" />
              }
              {scanning ? 'Scanning…' : scanStatus === 'done' ? 'Receipt scanned ✓' : 'Scan receipt'}
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {scanStatus === 'done' && (
          <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            Receipt scanned — fields pre-filled. Check and confirm below.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Merchant / Description">
            <input
              type="text"
              value={form.merchant_name}
              onChange={(e) => setForm((f) => ({ ...f, merchant_name: e.target.value }))}
              placeholder="e.g. Takealot, MTN, Computicket"
              className="input"
            />
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
            <Field label="Date">
              <input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                className="input"
              />
            </Field>
          </div>

          <Field label="Description (optional)">
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Add context to help with classification"
              className="input"
            />
          </Field>

          <Field label="Category">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              className="input"
            >
              {(Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>

          <button
            type="button"
            onClick={() => setDoClassify((v) => !v)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
              doClassify
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {doClassify ? 'AI will classify this expense' : 'Classify manually'}
          </button>

          {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? (doClassify ? 'Classifying…' : 'Saving…') : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── CSV Import for expenses ───────────────────────────────

function CsvExpenseImportModal({ taxReturnId, onClose, onImported }: {
  taxReturnId: string | null
  onClose:     () => void
  onImported:  (records: KlippaExpenseRecord[]) => void
}) {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [bankName,     setBankName]     = useState<string | null>(null)
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
      // Debits = negative amounts = expenses
      const debits = result.transactions.filter((t) => t.amount < 0)
      setTransactions(debits)
      setBankName(result.bank)
      setSelected(new Set(debits.map((_, i) => i)))
    }
    reader.readAsText(file)
  }

  const toggle = (i: number) => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const handleImport = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const toImport = [...selected].map((i) => transactions[i])
      const rows = toImport.map((t) => ({
        user_id:               user.id,
        tax_return_id:         taxReturnId ?? null,
        category:              'other' as ExpenseCategory,
        merchant_name:         t.description || null,
        amount:                Math.abs(t.amount),
        deductible_percentage: 100,
        expense_date:          t.date,
        description:           t.description,
        classification_status: 'pending',
        capture_method:        'csv_import',
      }))

      const { data, error } = await supabase.from('klippa_expense_records').insert(rows).select()
      if (error) throw error
      onImported(data as KlippaExpenseRecord[])
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
          <h3 className="font-semibold text-white">Import expenses from CSV</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>

        {transactions.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Upload your bank CSV. We&apos;ll detect debit transactions as expenses. You&apos;ll be able to review them before importing.</p>
            <button onClick={() => fileRef.current?.click()} className="w-full flex flex-col items-center gap-3 py-10 rounded-xl border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 text-zinc-500 hover:text-zinc-300 transition-colors">
              <FileSpreadsheet className="w-8 h-8" />
              <span className="text-sm">Select CSV file</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 flex-shrink-0">{bankName && `${bankName} · `}{transactions.length} debit transactions. AI classification happens after import.</p>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {transactions.map((t, i) => (
                <button key={i} onClick={() => toggle(i)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${selected.has(i) ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-800/50 border border-transparent'}`}>
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected.has(i) ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'}`}>
                    {selected.has(i) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-zinc-200">{t.description}</p>
                    <p className="text-xs text-zinc-500">{formatDate(t.date)}</p>
                  </div>
                  <span className="text-zinc-300 font-medium tabular-nums flex-shrink-0">{formatRand(Math.abs(t.amount))}</span>
                </button>
              ))}
            </div>
            {saveError && <p className="text-xs text-red-400 flex-shrink-0">{saveError}</p>}
            <div className="flex gap-2 flex-shrink-0 pt-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors">Cancel</button>
              <button onClick={handleImport} disabled={saving || selected.size === 0} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {saving ? 'Importing…' : `Import ${selected.size} expenses`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────

function ExpensesPage() {
  const searchParams = useSearchParams()
  const [records,      setRecords]   = useState<KlippaExpenseRecord[]>([])
  const [taxReturn,    setTaxReturn] = useState<KlippaTaxReturn | null>(null)
  const [loading,      setLoading]   = useState(true)
  const [showAdd,      setShowAdd]   = useState(searchParams.get('add') === '1')
  const [showCSV,      setShowCSV]   = useState(false)
  const [classifying,  setClassifying] = useState<string | null>(null)
  const [activeTab,    setActiveTab] = useState<'pending' | 'confirmed' | 'all'>('pending')

  const loadRecords = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: ret } = await supabase.from('klippa_tax_returns').select('*').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single()
    setTaxReturn(ret as KlippaTaxReturn | null)

    const { data } = await supabase.from('klippa_expense_records').select('*').eq('user_id', user.id).order('expense_date', { ascending: false })
    setRecords((data ?? []) as KlippaExpenseRecord[])
    setLoading(false)
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  const handleConfirm = async (id: string) => {
    setClassifying(id)
    const res = await fetch('/api/expenses', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, classification_status: 'confirmed' }),
    })
    const data = await res.json()
    if (data.record) setRecords((prev) => prev.map((r) => r.id === id ? data.record : r))
    setClassifying(null)
  }

  const handleReject = async (id: string) => {
    setClassifying(id)
    const res = await fetch('/api/expenses', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, classification_status: 'rejected' }),
    })
    const data = await res.json()
    if (data.record) setRecords((prev) => prev.map((r) => r.id === id ? data.record : r))
    setClassifying(null)
  }

  const handleDelete = async (id: string) => {
    await fetch('/api/expenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRecords((r) => r.filter((x) => x.id !== id))
  }

  const pending   = records.filter((r) => r.classification_status === 'pending')
  const confirmed = records.filter((r) => r.classification_status === 'confirmed')
  const displayed = activeTab === 'pending' ? pending : activeTab === 'confirmed' ? confirmed : records

  const totalDeductible = confirmed.reduce((s, r) => s + r.deductible_amount, 0)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="relative z-30 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/dashboard"  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Dashboard</Link>
            <Link href="/income"     className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Income</Link>
            <span className="px-3 py-1.5 rounded-lg text-xs text-emerald-300 bg-emerald-500/10 font-medium">Expenses</span>
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
            <h1 className="text-xl font-bold text-white">Expenses</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {confirmed.length > 0
                ? `${confirmed.length} confirmed · ${formatRand(totalDeductible)} deductible`
                : 'No confirmed expenses yet'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCSV(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add expense
            </button>
          </div>
        </div>

        {/* Pending review banner */}
        {pending.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-200">
              <span className="font-semibold">{pending.length} expenses</span> need your review — accept or reject the AI classification.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {([
            { key: 'pending',   label: `Needs review (${pending.length})` },
            { key: 'confirmed', label: `Confirmed (${confirmed.length})` },
            { key: 'all',       label: `All (${records.length})` },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? 'border-emerald-500 text-emerald-300'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center space-y-4">
            <p className="text-sm text-zinc-500">No expenses in this tab.</p>
            {activeTab === 'pending' && records.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add expense
              </button>
            )}
          </div>
        ) : activeTab === 'pending' ? (
          /* AI review cards */
          <div className="grid sm:grid-cols-2 gap-4">
            {pending.map((r) => (
              <AiResultCard
                key={r.id}
                record={r}
                onAccept={() => handleConfirm(r.id)}
                onReject={() => handleReject(r.id)}
                loading={classifying === r.id}
              />
            ))}
          </div>
        ) : (
          /* Table view for confirmed/all */
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Merchant</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400">Claim</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-zinc-200">{r.merchant_name || '—'}</p>
                      {r.ai_reasoning && (
                        <p className="text-xs text-zinc-600 mt-0.5 italic truncate max-w-[200px]">{r.ai_reasoning}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-400">
                        {EXPENSE_CATEGORY_LABELS[r.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{formatDate(r.expense_date)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">{formatRand(r.amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-medium tabular-nums">{formatRand(r.deductible_amount)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(r.id)} className="text-zinc-700 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {activeTab === 'confirmed' && confirmed.length > 0 && (
                  <tr className="bg-zinc-900/40">
                    <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-zinc-400">Total deductible</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400 tabular-nums">{formatRand(totalDeductible)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showAdd && (
        <AddExpenseModal
          taxReturnId={taxReturn?.id ?? null}
          onClose={() => setShowAdd(false)}
          onSaved={(r) => { setRecords((prev) => [r, ...prev]); setActiveTab('pending') }}
        />
      )}

      {showCSV && (
        <CsvExpenseImportModal
          taxReturnId={taxReturn?.id ?? null}
          onClose={() => setShowCSV(false)}
          onImported={(recs) => { setRecords((prev) => [...recs, ...prev]); setActiveTab('pending') }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  )
}

export default function ExpensesPageWrapper() {
  return <Suspense><ExpensesPage /></Suspense>
}
