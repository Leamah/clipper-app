'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  Plus, FileSpreadsheet, Trash2, Loader2,
  X, Check, ChevronDown, Sparkles, AlertTriangle, ShieldAlert, ShieldCheck, Camera, Zap, Receipt, Pencil, CheckCheck, Paperclip,
} from 'lucide-react'
import type { KlippaExpenseRecord, KlippaTaxReturn, KlippaProfile, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/types'
import { parseBankCSV, type ParsedTransaction } from '@/lib/csv-parser'
import { compressImage } from '@/lib/image'
import { isStarterOrAbove, isProfessionalOrAbove, FREE_EXPENSE_LIMIT, FREE_AI_TASTE_LIMIT, FREE_SCAN_LIMIT } from '@/lib/tier'
import { awardXp } from '@/lib/gamification'
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

function AddExpenseModal({ taxReturnId, prefilled, merchantHistory, allowAI, freeAiRemaining, onClose, onSaved }: {
  taxReturnId:     string | null
  prefilled?:      CapturePreFill
  merchantHistory: string[]
  allowAI:         boolean
  /** null = Starter+ (unlimited); a number = free-taste credits left */
  freeAiRemaining: number | null
  onClose:         () => void
  onSaved:         (r: KlippaExpenseRecord, classify: boolean, freeAiRemaining: number | null) => void
}) {
  const [form, setForm] = useState({
    merchant_name: prefilled?.merchant_name ?? '',
    amount:        prefilled?.amount        ?? '',
    // Most captures happen same-day — default to today instead of blank
    expense_date:  prefilled?.expense_date || new Date().toISOString().slice(0, 10),
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
      onSaved(data.record, doClassify, data.free_ai_remaining ?? null)
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
              Receipt photo attached — audit evidence on file
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
              <span className="flex-1 text-left">{doClassify ? 'AI will classify this expense' : 'Classify manually'}</span>
              {freeAiRemaining !== null && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
                  {freeAiRemaining} free left
                </span>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-edge text-xs text-ink-3">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Your {FREE_AI_TASTE_LIMIT} free AI classifications are used up —{' '}
                <a href="/pricing" className="underline text-emerald-400">upgrade to Starter</a> and never guess a deduction again.
              </span>
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

// ── Edit Expense Modal ────────────────────────────────────
// Edits the facts of a record (merchant, amount, date, description,
// category, deductible %) without touching its AI classification.
// deductible_amount is a DB-generated column, so it stays consistent.

function EditExpenseModal({ record, onClose, onSaved }: {
  record:  KlippaExpenseRecord
  onClose: () => void
  onSaved: (r: KlippaExpenseRecord) => void
}) {
  const [form, setForm] = useState({
    merchant_name:         record.merchant_name ?? '',
    amount:                String(record.amount),
    expense_date:          record.expense_date ?? '',
    description:           record.description ?? '',
    category:              record.category,
    deductible_percentage: String(record.deductible_percentage),
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  // Attach evidence after the fact — receipts shouldn't only be attachable
  // at capture time.
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const receiptRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Upload the new receipt first (storage + document row), then link it
      let receiptId: string | undefined
      if (receiptFile) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        const fileToUpload = receiptFile.type.startsWith('image/') ? await compressImage(receiptFile) : receiptFile
        const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'receipt'
        const storagePath = `${user.id}/${Date.now()}-${safeName}`
        const { error: upErr } = await supabase.storage
          .from('klippa_documents')
          .upload(storagePath, fileToUpload, { contentType: fileToUpload.type })
        if (upErr) throw new Error(`Receipt upload failed: ${upErr.message}`)
        const { data: docRow, error: docErr } = await supabase
          .from('klippa_documents')
          .insert({
            user_id:           user.id,
            tax_return_id:     record.tax_return_id ?? null,
            document_type:     'receipt',
            original_filename: receiptFile.name,
            storage_path:      storagePath,
            file_size_bytes:   fileToUpload.size,
            ocr_status:        'complete',
            upload_method:     'upload',
          })
          .select('id')
          .single()
        if (docErr) throw new Error(`Receipt record failed: ${docErr.message}`)
        receiptId = docRow.id
      }

      const res = await fetch('/api/expenses', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:                    record.id,
          merchant_name:         form.merchant_name,
          amount:                form.amount,
          expense_date:          form.expense_date || null,
          description:           form.description,
          category:              form.category,
          deductible_percentage: Math.min(100, Math.max(0, parseFloat(form.deductible_percentage) || 0)),
          ...(receiptId ? { receipt_id: receiptId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onSaved(data.record)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink-1">Edit expense</h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Merchant">
            <input
              type="text"
              value={form.merchant_name}
              onChange={(e) => setForm((f) => ({ ...f, merchant_name: e.target.value }))}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (R)">
              <input
                type="number" min="0" step="0.01" required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
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
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
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
            <Field label="Deductible %">
              <input
                type="number" min="0" max="100" step="1"
                value={form.deductible_percentage}
                onChange={(e) => setForm((f) => ({ ...f, deductible_percentage: e.target.value }))}
                className="input"
              />
            </Field>
          </div>

          {/* Evidence: show existing attachment, or let the user add one */}
          {record.receipt_id && !receiptFile ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 text-xs text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              Receipt attached — audit evidence on file
            </div>
          ) : (
            <div className="space-y-1.5">
              {receiptFile ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 text-xs text-emerald-300">
                  <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 truncate">{receiptFile.name}</span>
                  <button type="button" onClick={() => setReceiptFile(null)} className="text-ink-2 hover:text-ink-1 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => receiptRef.current?.click()}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-edge text-xs text-ink-2 hover:text-ink-1 hover:border-emerald-500/40 transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Attach receipt photo or PDF
                </button>
              )}
              <input
                ref={receiptRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── CSV Import Modal ──────────────────────────────────────

// A row matching an existing record on date + amount is almost certainly the
// same transaction re-imported — descriptions vary between bank exports, so
// they're deliberately excluded from the key.
function duplicateKey(date: string | null, amount: number) {
  return `${date ?? ''}|${Math.abs(amount).toFixed(2)}`
}

function CsvExpenseImportModal({ taxReturnId, existing, onClose, onImported }: {
  taxReturnId: string | null
  existing:    { expense_date: string | null; amount: number }[]
  onClose:     () => void
  onImported:  (records: KlippaExpenseRecord[]) => void
}) {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [duplicates,   setDuplicates]   = useState<Set<number>>(new Set())
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
      // Flag rows that look like already-imported records and leave them
      // unselected — re-importing a statement must not double-count expenses.
      const existingKeys = new Set(existing.map((r) => duplicateKey(r.expense_date, r.amount)))
      const dups = new Set(debits.flatMap((t, i) => existingKeys.has(duplicateKey(t.date, t.amount)) ? [i] : []))
      setDuplicates(dups)
      setSelected(new Set(debits.map((_, i) => i).filter((i) => !dups.has(i))))
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
            <div className="flex-shrink-0 space-y-1">
              <p className="text-xs text-ink-2">
                {bankName && `${bankName} · `}{transactions.length} debit transactions · you&apos;ll review and confirm each one after import
              </p>
              {duplicates.size > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {duplicates.size} row{duplicates.size !== 1 ? 's' : ''} match existing records (same date and amount) and {duplicates.size !== 1 ? 'were' : 'was'} unselected to avoid double-counting.
                </p>
              )}
            </div>
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
                    <p className="truncate text-ink-1">
                      {t.description}
                      {duplicates.has(i) && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 uppercase">Duplicate?</span>
                      )}
                    </p>
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

// ── Main page ─────────────────────────────────────────────

// Rows fetched per page — full rows (with their heavy ai_* text fields) are
// paginated, while a slim column fetch covers totals/counts/dedupe across
// the entire history.
const PAGE_SIZE = 300

interface SlimExpenseRow {
  id: string
  amount: number
  deductible_amount: number
  classification_status: string
  created_at: string | null
  expense_date: string | null
}

function ExpensesPage() {
  const searchParams = useSearchParams()
  const [records,      setRecords]      = useState<KlippaExpenseRecord[]>([])
  const [slimRows,     setSlimRows]     = useState<SlimExpenseRow[]>([])
  const [totalCount,   setTotalCount]   = useState(0)
  const [loadingMore,  setLoadingMore]  = useState(false)
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
  const [freeAiUsed,     setFreeAiUsed]     = useState(0)
  // null = column not readable yet (migration 025 not applied) → fail closed
  const [freeScansLeft,  setFreeScansLeft]  = useState<number | null>(null)
  const [editRecord,     setEditRecord]     = useState<KlippaExpenseRecord | null>(null)
  const [bulkConfirming, setBulkConfirming] = useState(false)
  // Two-tap delete: first tap arms the row, second tap within 3s deletes
  const [confirmDelete,  setConfirmDelete]  = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const autoCaptureFired = useRef(false)

  const armDelete = (id: string) => {
    setConfirmDelete(id)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmDelete(null), 3000)
  }

  const loadRecords = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: ret } = await supabase.from('klippa_tax_returns').select('*').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single()
    setTaxReturn(ret as KlippaTaxReturn | null)
    const { data: prof } = await supabase.from('klippa_profiles').select('*').eq('id', user.id).single()
    setProfile(prof as KlippaProfile | null)
    // Slim fetch across the whole history for totals/tab counts/dedupe;
    // full rows (heavy ai_* text) load in pages.
    const [slimRes, fullRes] = await Promise.all([
      supabase
        .from('klippa_expense_records')
        .select('id, amount, deductible_amount, classification_status, created_at, expense_date')
        .eq('user_id', user.id),
      supabase
        .from('klippa_expense_records')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false })
        .range(0, PAGE_SIZE - 1),
    ])
    setSlimRows((slimRes.data ?? []) as SlimExpenseRow[])
    setRecords((fullRes.data ?? []) as KlippaExpenseRecord[])
    setTotalCount(fullRes.count ?? (fullRes.data?.length ?? 0))
    // free_scans_used only exists once migration 025 is applied — a read
    // error leaves freeScansLeft null and the capture taste stays hidden.
    const { data: prog, error: progErr } = await supabase
      .from('klippa_user_progress')
      .select('free_ai_used, free_scans_used')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!progErr) {
      setFreeAiUsed(prog?.free_ai_used ?? 0)
      setFreeScansLeft(Math.max(0, FREE_SCAN_LIMIT - ((prog as { free_scans_used?: number } | null)?.free_scans_used ?? 0)))
    } else {
      const { data: aiOnly } = await supabase.from('klippa_user_progress').select('free_ai_used').eq('user_id', user.id).maybeSingle()
      setFreeAiUsed(aiOnly?.free_ai_used ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('klippa_expense_records')
        .select('*')
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false })
        .range(records.length, records.length + PAGE_SIZE - 1)
      setRecords((prev) => [...prev, ...((data ?? []) as KlippaExpenseRecord[])])
    } finally {
      setLoadingMore(false)
    }
  }

  // Keep the slim (whole-history) set in sync with mutations
  const toSlim = (r: KlippaExpenseRecord): SlimExpenseRow => ({
    id: r.id, amount: r.amount, deductible_amount: r.deductible_amount,
    classification_status: r.classification_status, created_at: r.created_at, expense_date: r.expense_date,
  })
  const addRecordLocal = (r: KlippaExpenseRecord) => {
    setRecords((prev) => [r, ...prev])
    setSlimRows((prev) => [toSlim(r), ...prev])
    setTotalCount((n) => n + 1)
  }
  const patchRecordLocal = (r: KlippaExpenseRecord) => {
    setRecords((prev) => prev.map((x) => x.id === r.id ? r : x))
    setSlimRows((prev) => prev.map((x) => x.id === r.id ? toSlim(r) : x))
  }

  // Deep link from the dashboard "Snap receipt" quick action: try to open the
  // camera as soon as the page knows the user has capture access. Browsers may
  // block a programmatic file-input click without a user gesture — in that
  // case the user simply lands here with the Capture button one tap away.
  const wantsCapture = searchParams.get('capture') === '1'
  useEffect(() => {
    if (!wantsCapture || loading || autoCaptureFired.current) return
    if (!isStarterOrAbove(profile) && (freeScansLeft ?? 0) <= 0) return
    autoCaptureFired.current = true
    captureRef.current?.click()
  }, [wantsCapture, loading, profile, freeScansLeft])

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
          ? 'Your free receipt scans are used up — upgrade to Starter for unlimited scanning.'
          : (data.error as string) ?? 'OCR failed. Please try again.'
      )

      if (typeof data.free_scans_remaining === 'number') setFreeScansLeft(data.free_scans_remaining)

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
    if (data.record) {
      patchRecordLocal(data.record)
      // First confirmed AI classification earns XP (idempotent, best-effort)
      if (profile && data.record.ai_confidence != null) awardXp(profile.id, 'first_ai_confirmed')
    }
    setClassifying(null)
  }

  const handleReject = async (id: string) => {
    setClassifying(id)
    const res = await fetch('/api/expenses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, classification_status: 'rejected' }) })
    const data = await res.json()
    if (data.record) patchRecordLocal(data.record)
    setClassifying(null)
  }

  const handleDelete = async (id: string) => {
    setConfirmDelete(null)
    await fetch('/api/expenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRecords((r) => r.filter((x) => x.id !== id))
    setSlimRows((r) => r.filter((x) => x.id !== id))
    setTotalCount((n) => Math.max(0, n - 1))
  }

  // Bulk-confirm every pending record the AI is highly confident about —
  // turns a card-by-card chore into one tap; uncertain ones stay for review.
  const handleBulkConfirm = async (ids: string[]) => {
    setBulkConfirming(true)
    try {
      for (const id of ids) {
        const res = await fetch('/api/expenses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, classification_status: 'confirmed' }) })
        const data = await res.json()
        if (data.record) patchRecordLocal(data.record)
      }
      if (profile) awardXp(profile.id, 'first_ai_confirmed')
    } finally {
      setBulkConfirming(false)
    }
  }

  const closeAdd = () => {
    setShowAdd(false)
    setCapturePreFill(undefined)
  }

  // Open the receipt evidence behind an expense in a new tab (signed URL)
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null)
  const handleViewReceipt = async (receiptId: string) => {
    setViewingReceipt(receiptId)
    try {
      const { data: doc } = await supabase
        .from('klippa_documents')
        .select('storage_path')
        .eq('id', receiptId)
        .maybeSingle()
      if (!doc?.storage_path) { setCaptureError('The receipt file for this expense could not be found.'); return }
      const { data } = await supabase.storage
        .from('klippa_documents')
        .createSignedUrl(doc.storage_path, 120)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setViewingReceipt(null)
    }
  }

  const handleAuditPack = async () => {
    setExportingPack(true)
    try {
      // Fetch every confirmed record directly — the page list may be
      // paginated and the audit pack must always be complete.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: allConfirmed } = await supabase
        .from('klippa_expense_records')
        .select('*')
        .eq('user_id', user.id)
        .eq('classification_status', 'confirmed')
        .order('expense_date', { ascending: false })
      const confirmedRecs = (allConfirmed ?? []) as KlippaExpenseRecord[]
      if (confirmedRecs.length === 0) return
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

  // Loaded rows drive the lists; slim rows drive counts and totals so
  // they stay correct even before every page is loaded.
  const pending   = records.filter((r) => r.classification_status === 'pending')
  const highConfidencePending = pending.filter((r) => r.ai_confidence === 'high')
  const confirmed = records.filter((r) => r.classification_status === 'confirmed')
  const displayed = activeTab === 'pending' ? pending : activeTab === 'confirmed' ? confirmed : records

  const pendingCount   = slimRows.filter((r) => r.classification_status === 'pending').length
  const confirmedCount = slimRows.filter((r) => r.classification_status === 'confirmed').length
  const totalDeductible = slimRows.filter((r) => r.classification_status === 'confirmed').reduce((s, r) => s + r.deductible_amount, 0)

  // Tier flags
  const isStarter = isStarterOrAbove(profile)
  const isPro     = isProfessionalOrAbove(profile)

  // Free AI taste: first FREE_AI_TASTE_LIMIT classifications are free
  const freeAiRemaining = isStarter ? null : Math.max(0, FREE_AI_TASTE_LIMIT - freeAiUsed)
  const allowAI         = isStarter || (freeAiRemaining ?? 0) > 0

  // Free scan taste: capture stays visible for free users while they have
  // scans left (null = counter not available yet → Starter-only as before)
  const canCapture = isStarter || (freeScansLeft ?? 0) > 0

  // Monthly usage counter for free users
  const thisMonthCount = !isStarter && !loading ? (() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return slimRows.filter((r) => r.created_at && new Date(r.created_at) >= monthStart).length
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
              {confirmedCount > 0
                ? `${confirmedCount} confirmed · ${formatRand(totalDeductible)} deductible`
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
            {canCapture && (
              <button
                onClick={() => captureRef.current?.click()}
                disabled={capturing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised disabled:opacity-50 transition-colors"
              >
                {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {capturing ? 'Scanning…' : 'Capture'}
                {!isStarter && freeScansLeft !== null && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
                    {freeScansLeft} free
                  </span>
                )}
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
            {isPro && confirmedCount > 0 && (
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
        {pendingCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex-wrap">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="flex-1 text-sm text-amber-200 min-w-[200px]">
              <span className="font-semibold">{pendingCount} expense{pendingCount !== 1 ? 's' : ''}</span> need{pendingCount === 1 ? 's' : ''} your review. Accept or reject the AI classification.
            </p>
            {highConfidencePending.length > 1 && (
              <button
                onClick={() => handleBulkConfirm(highConfidencePending.map((r) => r.id))}
                disabled={bulkConfirming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {bulkConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                {bulkConfirming ? 'Confirming…' : `Confirm ${highConfidencePending.length} high-confidence`}
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-edge">
          {([
            { key: 'pending',   label: `Needs review (${pendingCount})` },
            { key: 'confirmed', label: `Confirmed (${confirmedCount})` },
            { key: 'all',       label: `All (${totalCount})` },
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
            {totalCount === 0 ? (
              <>
                <Receipt className="w-8 h-8 text-ink-3 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink-1">Every expense you log shrinks your tax bill</p>
                  <p className="text-sm text-ink-2">Coffee with a client? Data? Software? It counts — add your first one.</p>
                </div>
                <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add expense
                </button>
              </>
            ) : (
              <p className="text-sm text-ink-2">No expenses in this tab.</p>
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
          <div className="rounded-2xl border border-edge overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-ink-1">{r.merchant_name || '—'}</p>
                        {r.receipt_id && (
                          <button
                            onClick={() => handleViewReceipt(r.receipt_id!)}
                            disabled={viewingReceipt === r.receipt_id}
                            title="View attached receipt"
                            className="text-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            {viewingReceipt === r.receipt_id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Paperclip className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditRecord(r)}
                          title="Edit"
                          className="text-ink-3 hover:text-ink-1 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {confirmDelete === r.id ? (
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors whitespace-nowrap"
                          >
                            Delete?
                          </button>
                        ) : (
                          <button onClick={() => armDelete(r.id)} title="Delete" className="text-ink-3 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {activeTab === 'confirmed' && confirmedCount > 0 && (
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

        {/* Pagination: full rows load in pages; totals above cover everything */}
        {!loading && records.length < totalCount && (
          <div className="flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-ink-1 hover:bg-raised disabled:opacity-50 transition-colors"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loadingMore ? 'Loading…' : `Load more (showing ${records.length} of ${totalCount})`}
            </button>
          </div>
        )}
      </main>

      {showAdd && (
        <AddExpenseModal
          taxReturnId={taxReturn?.id ?? null}
          prefilled={capturePreFill}
          merchantHistory={merchantHistory}
          allowAI={allowAI}
          freeAiRemaining={freeAiRemaining}
          onClose={closeAdd}
          onSaved={(r, _classified, remaining) => {
            addRecordLocal(r)
            setActiveTab('pending')
            if (remaining !== null) setFreeAiUsed(FREE_AI_TASTE_LIMIT - remaining)
          }}
        />
      )}

      {editRecord && (
        <EditExpenseModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={patchRecordLocal}
        />
      )}

      {showCSV && (
        <CsvExpenseImportModal
          taxReturnId={taxReturn?.id ?? null}
          existing={slimRows}
          onClose={() => setShowCSV(false)}
          onImported={(recs) => { recs.forEach(addRecordLocal); setActiveTab('pending') }}
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
