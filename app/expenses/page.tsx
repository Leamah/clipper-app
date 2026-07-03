'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  Plus, FileSpreadsheet, Trash2, Loader2,
  X, Check, ChevronDown, Sparkles, AlertTriangle, ShieldAlert, ShieldCheck, Camera, Zap,
} from 'lucide-react'
import type { KlippaExpenseRecord, KlippaTaxReturn, KlippaProfile, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'
import { parseBankCSV, type ParsedTransaction } from '@/lib/csv-parser'
import { isStarterOrAbove, isProfessionalOrAbove, FREE_EXPENSE_LIMIT } from '@/lib/tier'
import RecurringManager from '@/components/RecurringManager'
// pdf-export lazy-loaded on demand — jsPDF (~300 kB) only needed when user clicks "Export Audit Pack"

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(n)
}
function formatDate(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

// ── Pre-fill from capture ─────────────────────────────────

interface CapturePreFill {
  merchant_name: string
  amount:        string
  expense_date:  string
  receipt_id:    string | null
}

// ── AI Classification card ────────────────────────────────

function AiResultCard({ record, onAccept, onReject, loading }: {
  record:   KlippaExpenseRecord
  onAccept: () => void
  onReject: () => void
  loading:  boolean
}) {
  const [showDetails, setShowDetails] = useState(false)

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

  const hasRange   = !!(isMixed && conservative != null && aggressive != null)
  const hasDetails = !!(
    record.ai_sars_rule ||
    record.ai_reasoning ||
    record.ai_behavioral_tip ||
    hasRange ||
    (record.ai_required_evidence?.length ?? 0) > 0 ||
    (record.ai_audit_triggers?.length ?? 0) > 0
  )

  return (
    <div className="rounded-xl border border-edge bg-raised/50 p-4 space-y-3">
      {/* Header — merchant + amount */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink-1">{record.merchant_name || '(no merchant)'}</p>
            {isMixed && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 uppercase">Mixed use</span>
            )}
          </div>
          <p className="text-xs text-ink-2">{formatDate(record.expense_date)} · {EXPENSE_CATEGORY_LABELS[record.category]}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-ink-1 tabular-nums">{formatRand(record.amount)}</p>
          <p className="text-xs text-emerald-400 tabular-nums font-medium">Claim {formatRand(record.deductible_amount)}</p>
        </div>
      </div>

      {/* Decision row — always visible: the number + how sure + risk */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        <span className="text-sm font-semibold text-ink-1">{recommended}% deductible</span>
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

      {/* One disclosure for all the reasoning — keeps the card decision-first */}
      {hasDetails && (
        <button onClick={() => setShowDetails((v) => !v)}
          className="text-xs text-ink-2 hover:text-ink-1 transition-colors flex items-center gap-1">
          <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          {showDetails ? 'Hide details' : 'Why this number?'}
        </button>
      )}

      {showDetails && (
        <div className="space-y-3 pt-1">
          {record.ai_sars_rule && (
            <div className="rounded-lg bg-surface/80 border border-edge px-3 py-2.5">
              <p className="text-[10px] font-semibold text-ink-2 uppercase tracking-wide mb-1">SARS says</p>
              <p className="text-xs text-ink-1 leading-relaxed">{record.ai_sars_rule}</p>
            </div>
          )}

          {record.ai_reasoning && (
            <p className="text-xs text-ink-2 leading-relaxed italic px-1">&ldquo;{record.ai_reasoning}&rdquo;</p>
          )}

          {hasRange && (
            <div className="rounded-lg bg-surface/60 p-3 space-y-2.5">
              <p className="text-[10px] font-semibold text-ink-2 uppercase tracking-wide">Deductibility range</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="space-y-0.5">
                  <p className="text-xs text-ink-2">Conservative</p>
                  <p className="text-sm font-bold text-ink-2">{conservative}%</p>
                  <p className="text-xs text-ink-3">{formatRand(record.amount * conservative! / 100)}</p>
                </div>
                <div className="space-y-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 py-1">
                  <p className="text-xs text-emerald-400 font-medium">Recommended</p>
                  <p className="text-sm font-bold text-emerald-300">{recommended}%</p>
                  <p className="text-xs text-emerald-500">{formatRand(record.deductible_amount)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-ink-2">Maximum</p>
                  <p className="text-sm font-bold text-ink-2">{aggressive}%</p>
                  <p className="text-xs text-ink-3">{formatRand(record.amount * aggressive! / 100)}</p>
                </div>
              </div>
            </div>
          )}

          {record.ai_behavioral_tip && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/8 border border-blue-500/15 px-3 py-2">
              <span className="text-blue-400 mt-0.5 flex-shrink-0">💡</span>
              <p className="text-xs text-blue-300 leading-relaxed">{record.ai_behavioral_tip}</p>
            </div>
          )}

          {(record.ai_required_evidence?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-2">Keep on file</p>
              {record.ai_required_evidence!.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-ink-2">
                  <span className="text-emerald-500 mt-0.5">•</span>{e}
                </div>
              ))}
            </div>
          )}

          {(record.ai_audit_triggers?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-2">SARS audit triggers</p>
              {record.ai_audit_triggers!.map((t, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400/80">
                  <span className="mt-0.5">⚠</span>{t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onReject} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors disabled:opacity-50">
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

function AddExpenseModal({ taxReturnId, prefilled, merchantHistory, allowAI, onClose, onSaved }: {
  taxReturnId:     string | null
  prefilled?:      CapturePreFill
  merchantHistory: string[]
  allowAI:         boolean
  onClose:         () => void
  onSaved:         (r: KlippaExpenseRecord, classify: boolean) => void
}) {
  const [form, setForm] = useState({
    merchant_name: prefilled?.merchant_name ?? '',
    amount:        prefilled?.amount        ?? '',
    expense_date:  prefilled?.expense_date  ?? '',
    description:   '',
    category:      'other' as ExpenseCategory,
    receipt_id:    prefilled?.receipt_id    ?? null as string | null,
  })
  const [doClassify, setDoClassify] = useState(allowAI)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/expenses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          merchant_name: form.merchant_name,
          amount:        form.amount,
          expense_date:  form.expense_date,
          description:   form.description,
          category:      form.category,
          receipt_id:    form.receipt_id,
          tax_return_id: taxReturnId,
          classify:      doClassify,
        }),
      })
      const data = await res.json()
      if (res.status === 402 && data.error === 'free_limit_reached') {
        setError('limit_reached')
        return
      }
      if (res.status === 401) {
        setError('Your session has expired. Please refresh the page.')
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onSaved(data.record, doClassify)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const hasPrefill = !!prefilled?.merchant_name || !!prefilled?.amount

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-edge bg-surface shadow-2xl flex flex-col max-h-[92vh]">
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-edge" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-ink-1">Add expense</h3>
            {hasPrefill && (
              <p className="text-xs text-emerald-400 mt-0.5">Receipt scanned, check and confirm</p>
            )}
          </div>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1"><X className="w-4 h-4" /></button>
        </div>

        {/* Scrollable form body */}
        <div className="overflow-y-auto flex-1 px-6 pb-6">
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Merchant — datalist from history */}
          <Field label="Merchant">
            <input
              type="text"
              list="merchant-history"
              value={form.merchant_name}
              onChange={(e) => setForm((f) => ({ ...f, merchant_name: e.target.value }))}
              placeholder="Select or type merchant name"
              className="input"
            />
            <datalist id="merchant-history">
              {merchantHistory.map((m) => <option key={m} value={m} />)}
            </datalist>
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

          <Field label="Description">
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

          {/* Receipt attachment indicator */}
          {form.receipt_id && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 text-xs text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              Receipt photo attached, audit risk eliminated
            </div>
          )}

          {allowAI ? (
            <button
              type="button"
              onClick={() => setDoClassify((v) => !v)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                doClassify
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-edge text-ink-2 hover:border-zinc-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {doClassify ? 'AI will classify this expense' : 'Classify manually'}
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-edge text-xs text-ink-3">
              <Sparkles className="w-3.5 h-3.5" />
              AI classification · <a href="/pricing" className="underline text-emerald-400">Starter plan</a>
            </div>
          )}

          {error === 'limit_reached' ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-amber-300">Monthly limit reached</p>
              </div>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Free plan includes {FREE_EXPENSE_LIMIT} expense records per month.
                Upgrade to Starter for unlimited tracking + AI classification.
              </p>
              <a
                href="/pricing"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors"
              >
                <Zap className="w-3 h-3" /> Upgrade now
              </a>
            </div>
          ) : error ? (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || error === 'limit_reached'}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? (doClassify ? 'Classifying…' : 'Saving…') : 'Add expense'}
            </button>
          </div>
        </form>
        </div>{/* end scrollable body */}
      </div>
    </div>
  )
}

// ── CSV Import Modal ──────────────────────────────────────

function CsvExpenseImportModal({ taxReturnId, onClose, onImported }: {
  taxReturnId: string | null
  onClose:     () => void
  onImported:  (records: KlippaExpenseRecord[]) => void
}) {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [bankName,     setBankName]     = useState<string | null>(null)
  const [csvFile,      setCsvFile]      = useState<File | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const result = parseBankCSV(text)
      const debits = result.transactions.filter((t) => t.amount < 0)
      setTransactions(debits)
      setBankName(result.bank)
      setSelected(new Set(debits.map((_, i) => i)))
    }
    reader.readAsText(file)
  }

  const toggle = (i: number) => setSelected((s) => {
    const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n
  })

  const handleImport = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Save CSV file to storage
      let csvDocumentId: string | null = null
      if (csvFile) {
        const storagePath = `${user.id}/csv-${Date.now()}-${csvFile.name}`
        const { error: upErr } = await supabase.storage
          .from('klippa_documents')
          .upload(storagePath, csvFile, { contentType: 'text/csv' })

        if (!upErr) {
          const { data: docRow } = await supabase
            .from('klippa_documents')
            .insert({
              user_id:           user.id,
              tax_return_id:     taxReturnId ?? null,
              document_type:     'bank_statement',
              original_filename: csvFile.name,
              storage_path:      storagePath,
              file_size_bytes:   csvFile.size,
              ocr_status:        'complete',
              upload_method:     'csv_import',
            })
            .select('id')
            .single()
          csvDocumentId = docRow?.id ?? null
        }
      }

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
      <div className="w-full max-w-2xl rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-ink-1">Import from CSV</h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1"><X className="w-4 h-4" /></button>
        </div>

        {transactions.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Upload your bank CSV. Debit transactions are detected as expenses. The file is saved for audit purposes.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center gap-3 py-10 rounded-xl border-2 border-dashed border-edge hover:border-emerald-500/50 text-ink-2 hover:text-ink-1 transition-colors"
            >
              <FileSpreadsheet className="w-8 h-8" />
              <span className="text-sm">Select CSV file</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-2 flex-shrink-0">
              {bankName && `${bankName} · `}{transactions.length} debit transactions · AI classifies after import
            </p>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {transactions.map((t, i) => (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                    selected.has(i)
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-raised/50 border border-transparent'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                    selected.has(i) ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'
                  }`}>
                    {selected.has(i) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-ink-1">{t.description}</p>
                    <p className="text-xs text-ink-2">{formatDate(t.date)}</p>
                  </div>
                  <span className="text-ink-1 font-medium tabular-nums flex-shrink-0">{formatRand(Math.abs(t.amount))}</span>
                </button>
              ))}
            </div>
            {saveError && <p className="text-xs text-red-400 flex-shrink-0">{saveError}</p>}
            <div className="flex gap-2 flex-shrink-0 pt-2">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
                Cancel
              </button>
              <button onClick={handleImport} disabled={saving || selected.size === 0}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
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

// ── Image compression helper ──────────────────────────────
// Resizes phone photos to max 1600 px and re-encodes as JPEG 85%.
// Keeps the payload well under Vercel's 4.5 MB serverless body limit.
// PDFs are passed through unchanged.
function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1600
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
        else                 { width  = Math.round(width  * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => resolve(blob
          ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
          : file
        ),
        'image/jpeg',
        0.85,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// ── Main page ─────────────────────────────────────────────

function ExpensesPage() {
  const searchParams = useSearchParams()
  const [records,      setRecords]      = useState<KlippaExpenseRecord[]>([])
  const [taxReturn,    setTaxReturn]    = useState<KlippaTaxReturn | null>(null)
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [exportingPack, setExportingPack] = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [showAdd,      setShowAdd]      = useState(searchParams.get('add') === '1')
  const [showCSV,      setShowCSV]      = useState(false)
  const [classifying,  setClassifying]  = useState<string | null>(null)
  const [activeTab,    setActiveTab]    = useState<'pending' | 'confirmed' | 'all'>('pending')
  const [capturing,    setCapturing]    = useState(false)
  const [capturePreFill, setCapturePreFill] = useState<CapturePreFill | undefined>(undefined)
  const [captureError,   setCaptureError]   = useState<string | null>(null)
  const captureRef = useRef<HTMLInputElement>(null)

  const loadRecords = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: ret } = await supabase.from('klippa_tax_returns').select('*').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single()
    setTaxReturn(ret as KlippaTaxReturn | null)
    const { data: prof } = await supabase.from('klippa_profiles').select('*').eq('id', user.id).single()
    setProfile(prof as KlippaProfile | null)
    const { data } = await supabase.from('klippa_expense_records').select('*').eq('user_id', user.id).order('expense_date', { ascending: false })
    setRecords((data ?? []) as KlippaExpenseRecord[])
    setLoading(false)
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  // Unique merchants from history for the datalist
  const merchantHistory = useMemo(() =>
    [...new Set(records.map((r) => r.merchant_name).filter(Boolean) as string[])].sort(),
    [records]
  )

  // ── Capture: file → compress → OCR → pre-fill Add modal ─────
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCapturing(true)
    setCaptureError(null)
    try {
      // Compress images before upload — phone photos can be 5-8 MB which
      // exceeds Vercel's 4.5 MB serverless body limit and returns a plain-text
      // "Request Entity Too Large" that breaks res.json(). Cap at 1600 px wide,
      // JPEG 85% — enough for OCR, typically < 400 KB.
      const fileToUpload = file.type.startsWith('image/') ? await compressImage(file) : file

      const fd = new FormData()
      fd.append('file', fileToUpload)
      if (taxReturn?.id) fd.append('tax_return_id', taxReturn.id)
      const res  = await fetch('/api/documents/ocr', { method: 'POST', body: fd })

      // Guard against non-JSON responses (e.g. Vercel 413 as plain HTML)
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* non-JSON body */ }
      if (!res.ok) throw new Error(
        data.error === 'premium_required'
          ? 'Receipt scanning requires a Starter plan or above'
          : (data.error as string) ?? 'OCR failed. Please try again.'
      )

      const ext = data.extracted as Record<string, unknown> | null ?? {}

      // If OCR failed server-side, warn the user but still open the form
      if (data.ocr_failed) {
        setCaptureError('OCR couldn\'t read the receipt. Please fill in the details manually.')
      }

      setCapturePreFill({
        merchant_name: (ext.merchant_name as string) ?? '',
        amount:        ext.amount != null ? String(ext.amount) : '',
        expense_date:  (ext.expense_date as string) ?? '',
        receipt_id:    (data.document_id as string) ?? null,
      })
      setShowAdd(true)
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Capture failed')
    } finally {
      setCapturing(false)
      if (captureRef.current) captureRef.current.value = ''
    }
  }

  const handleConfirm = async (id: string) => {
    setClassifying(id)
    const res = await fetch('/api/expenses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, classification_status: 'confirmed' }) })
    const data = await res.json()
    if (data.record) setRecords((prev) => prev.map((r) => r.id === id ? data.record : r))
    setClassifying(null)
  }

  const handleReject = async (id: string) => {
    setClassifying(id)
    const res = await fetch('/api/expenses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, classification_status: 'rejected' }) })
    const data = await res.json()
    if (data.record) setRecords((prev) => prev.map((r) => r.id === id ? data.record : r))
    setClassifying(null)
  }

  const handleDelete = async (id: string) => {
    await fetch('/api/expenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRecords((r) => r.filter((x) => x.id !== id))
  }

  const closeAdd = () => {
    setShowAdd(false)
    setCapturePreFill(undefined)
  }

  const handleAuditPack = async () => {
    const confirmedRecs = records.filter((r) => r.classification_status === 'confirmed')
    if (confirmedRecs.length === 0) return
    setExportingPack(true)
    try {
      const taxYear = taxReturn?.tax_year ?? new Date().getFullYear()
      const { exportAuditPackPDF } = await import('@/lib/pdf-export')
      await exportAuditPackPDF(
        { full_name: profile?.full_name ?? '', tax_number: profile?.tax_number ?? null },
        confirmedRecs,
        taxYear,
      )
    } catch (err) {
      console.error('Audit pack export failed', err)
    } finally {
      setExportingPack(false)
    }
  }

  const pending   = records.filter((r) => r.classification_status === 'pending')
  const confirmed = records.filter((r) => r.classification_status === 'confirmed')
  const displayed = activeTab === 'pending' ? pending : activeTab === 'confirmed' ? confirmed : records

  const totalDeductible = confirmed.reduce((s, r) => s + r.deductible_amount, 0)

  // Tier flags
  const isStarter = isStarterOrAbove(profile)
  const isPro     = isProfessionalOrAbove(profile)

  // Monthly usage counter for free users
  const thisMonthCount = !isStarter && !loading ? (() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return records.filter((r) => r.created_at && new Date(r.created_at) >= monthStart).length
  })() : 0

  return (
    <div className="app-shell bg-base text-ink-1">
      <AppNav activePage="expenses" />

      {/* Hidden capture file input */}
      <input
        ref={captureRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleCapture}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-1">Expenses</h1>
            <p className="text-sm text-ink-2 mt-1">
              {confirmed.length > 0
                ? `${confirmed.length} confirmed · ${formatRand(totalDeductible)} deductible`
                : 'No confirmed expenses yet'}
            </p>
            {/* Free-tier monthly usage counter */}
            {!loading && !isStarter && (
              <p className={`text-xs mt-1 font-medium ${thisMonthCount >= FREE_EXPENSE_LIMIT ? 'text-red-400' : 'text-ink-3'}`}>
                {thisMonthCount}/{FREE_EXPENSE_LIMIT} expenses this month
                {thisMonthCount >= FREE_EXPENSE_LIMIT && (
                  <a href="/pricing" className="ml-2 underline text-emerald-400">Upgrade for unlimited</a>
                )}
              </p>
            )}
          </div>

          {/* Action bar: Capture (Starter+) | CSV (Starter+) | Audit Pack (Pro+) | Add */}
          <div className="flex items-center flex-wrap gap-1.5">
            {isStarter && (
              <button
                onClick={() => captureRef.current?.click()}
                disabled={capturing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised disabled:opacity-50 transition-colors"
              >
                {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {capturing ? 'Scanning…' : 'Capture'}
              </button>
            )}
            {isStarter && (
              <button
                onClick={() => setShowCSV(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
              </button>
            )}
            {isPro && confirmed.length > 0 && (
              <button
                onClick={handleAuditPack}
                disabled={exportingPack}
                title="Export a SARS-ready audit pack of every confirmed expense"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised disabled:opacity-50 transition-colors"
              >
                {exportingPack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                {exportingPack ? 'Building…' : 'Audit Pack'}
              </button>
            )}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {captureError && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">
            Capture failed: {captureError}
          </p>
        )}

        {/* Recurring expense templates (subscriptions, rent etc.) */}
        {!loading && <RecurringManager kind="expense" isStarter={isStarter} />}

        {/* Pending review banner */}
        {pending.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-200">
              <span className="font-semibold">{pending.length} expenses</span> need your review. Accept or reject the AI classification.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-edge">
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
                  : 'border-transparent text-ink-2 hover:text-ink-1'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-edge p-16 text-center space-y-4">
            <p className="text-sm text-ink-2">No expenses in this tab.</p>
            {activeTab === 'pending' && records.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add expense
              </button>
            )}
          </div>
        ) : activeTab === 'pending' ? (
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
          <div className="rounded-2xl border border-edge overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge bg-surface/60">
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Merchant</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-2">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-2">Claim</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.id} className="border-b border-edge/60 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-ink-1">{r.merchant_name || '—'}</p>
                      {r.ai_reasoning && (
                        <p className="text-xs text-ink-3 mt-0.5 italic truncate max-w-[200px]">{r.ai_reasoning}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-raised text-ink-2">
                        {EXPENSE_CATEGORY_LABELS[r.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">{formatDate(r.expense_date)}</td>
                    <td className="px-4 py-3 text-right text-ink-1 tabular-nums">{formatRand(r.amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-medium tabular-nums">{formatRand(r.deductible_amount)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(r.id)} className="text-ink-3 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {activeTab === 'confirmed' && confirmed.length > 0 && (
                  <tr className="bg-surface/40">
                    <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-ink-2">Total deductible</td>
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
          prefilled={capturePreFill}
          merchantHistory={merchantHistory}
          allowAI={isStarter}
          onClose={closeAdd}
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
      <label className="text-xs font-medium text-ink-2">{label}</label>
      {children}
    </div>
  )
}

export default function ExpensesPageWrapper() {
  return <Suspense><ExpensesPage /></Suspense>
}
