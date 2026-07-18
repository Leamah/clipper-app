'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { Plus, Upload, FileSpreadsheet, Trash2, Loader2, X, Check, Briefcase, Zap, Pencil, AlertTriangle, Camera } from 'lucide-react'
import type { KlippaProfile, KlippaIncomeRecord, KlippaTaxReturn, IncomeType } from '@/lib/types'
import { INCOME_TYPE_LABELS } from '@/lib/types'
import { PLAIN_INCOME_OPTIONS, getIncomeTypeCopy, needsHumanReview } from '@/lib/sars-return-map'
import { isStarterOrAbove, FREE_INCOME_LIMIT } from '@/lib/tier'
import Papa from 'papaparse'
import { parseBankCSV, type ParsedTransaction } from '@/lib/csv-parser'
import { compressImage } from '@/lib/image'
import RecurringManager from '@/components/RecurringManager'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(n)
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

// ── Add Income Modal ──────────────────────────────────────

function AddIncomeModal({ taxReturnId, editRecord, onClose, onSaved }: {
  taxReturnId: string | null
  editRecord?: KlippaIncomeRecord
  onClose:     () => void
  onSaved:     (record: KlippaIncomeRecord) => void
}) {
  const isEdit = !!editRecord
  const [form, setForm] = useState({
    source_name:   editRecord?.source_name ?? '',
    income_type:   (editRecord?.income_type ?? 'freelance') as IncomeType,
    amount:        editRecord ? String(editRecord.amount) : '',
    // Most captures happen same-day — default to today instead of blank
    received_date: editRecord?.received_date ?? new Date().toISOString().slice(0, 10),
    description:   editRecord?.description ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const copy = getIncomeTypeCopy(form.income_type, { source: form.source_name, description: form.description })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/income', {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(isEdit ? { ...form, id: editRecord!.id } : { ...form, tax_return_id: taxReturnId }),
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
          <h3 className="font-semibold text-ink-1">{isEdit ? 'Edit income' : 'Add income'}</h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1 transition-colors"><X className="w-4 h-4" /></button>
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

          <Field label="What kind of money was this?">
            <select
              value={form.income_type}
              onChange={(e) => setForm((f) => ({ ...f, income_type: e.target.value as IncomeType }))}
              className="input"
            >
              {PLAIN_INCOME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-ink-3 leading-relaxed">
              {copy.examples}
            </p>
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

          {error === 'limit_reached' ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-amber-300">Monthly limit reached</p>
              </div>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Free plan includes {FREE_INCOME_LIMIT} income records per month.
                Upgrade to Starter for unlimited income tracking.
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
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
            <button type="submit" disabled={saving || error === 'limit_reached'} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add income'}
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

// Cheap description-based income-type suggestion — saves a dropdown tap per
// row for the obvious cases; everything else stays 'freelance' for review.
function suggestIncomeType(description: string): IncomeType {
  const d = description.toLowerCase()
  if (/salar|wage|payroll|irp5/.test(d))        return 'salary'
  if (/interest/.test(d))                        return 'interest'
  if (/dividend|\bdiv\b/.test(d))                return 'dividends'
  if (/\brent(al)?\b/.test(d))                   return 'rental'
  if (/commission/.test(d))                      return 'commission'
  return 'freelance'
}

function CsvImportModal({ taxReturnId, existing, onClose, onImported }: {
  taxReturnId: string | null
  existing:    { received_date: string | null; amount: number }[]
  onClose:     () => void
  onImported:  (records: KlippaIncomeRecord[]) => void
}) {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [duplicates,   setDuplicates]   = useState<Set<number>>(new Set())
  const [rowTypes,     setRowTypes]     = useState<Record<number, IncomeType>>({})
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
      // Flag rows that look like already-imported records and leave them
      // unselected — re-importing a statement must not double-count income.
      const existingKeys = new Set(existing.map((r) => duplicateKey(r.received_date, r.amount)))
      const dups = new Set(credits.flatMap((t, i) => existingKeys.has(duplicateKey(t.date, t.amount)) ? [i] : []))
      setDuplicates(dups)
      setSelected(new Set(credits.map((_, i) => i).filter((i) => !dups.has(i))))
      // Pre-suggest a type from the description — user can change per row
      const types: Record<number, IncomeType> = {}
      credits.forEach((t, i) => { types[i] = suggestIncomeType(t.description ?? '') })
      setRowTypes(types)
    }
    reader.readAsText(file)
  }

  const toggle = (i: number) => setSelected((s) => {
    const next = new Set(s)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const setRowType = (i: number, t: IncomeType) =>
    setRowTypes((prev) => ({ ...prev, [i]: t }))

  const handleImport = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const toImport = [...selected].map((i) => ({ idx: i, tx: transactions[i] }))
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const rows = toImport.map(({ idx, tx }) => ({
        user_id:        user.id,
        tax_return_id:  taxReturnId ?? null,
        source_name:    tx.description || 'Bank credit',
        income_type:    rowTypes[idx] ?? 'freelance',
        amount:         tx.amount,
        received_date:  tx.date,
        description:    tx.description,
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
      <div className="w-full max-w-2xl rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-5 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-ink-1">Import from bank statement</h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1"><X className="w-4 h-4" /></button>
        </div>

        {transactions.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">Export a CSV from your bank app (FNB, Standard Bank, Absa, Capitec, Nedbank, Investec) and upload it here. We&apos;ll detect credits (money in) as income.</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center gap-3 py-10 rounded-xl border-2 border-dashed border-edge hover:border-emerald-500/50 text-ink-2 hover:text-ink-1 transition-colors"
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
              <p className="text-xs text-ink-2">{bankName && `Detected: ${bankName} · `}{transactions.length} credit transactions found</p>
              <p className="text-xs text-ink-3">Check or uncheck rows to include. Types are pre-suggested from descriptions — check each row before importing.</p>
              {duplicates.size > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {duplicates.size} row{duplicates.size !== 1 ? 's' : ''} match existing records (same date and amount) and {duplicates.size !== 1 ? 'were' : 'was'} unselected to avoid double-counting.
                </p>
              )}
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 px-3 flex-shrink-0">
              <div className="w-4 flex-shrink-0" />
              <span className="flex-1 text-xs font-medium text-ink-2 uppercase tracking-wider">Description</span>
              <span className="w-32 text-xs font-medium text-ink-2 uppercase tracking-wider flex-shrink-0">Type</span>
              <span className="w-24 text-right text-xs font-medium text-ink-2 uppercase tracking-wider flex-shrink-0">Amount</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {transactions.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                    selected.has(i) ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-raised/50 border border-transparent'
                  }`}
                  onClick={() => toggle(i)}
                >
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected.has(i) ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
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
                  {/* Per-row income type selector — stop click propagation so it doesn't toggle the row */}
                  <select
                    value={rowTypes[i] ?? 'freelance'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRowType(i, e.target.value as IncomeType)}
                    className="w-32 flex-shrink-0 bg-raised border border-edge text-ink-1 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {PLAIN_INCOME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <span className="w-24 text-right text-emerald-400 font-medium tabular-nums flex-shrink-0">{formatRand(t.amount)}</span>
                </div>
              ))}
            </div>
            {saveError && <p className="text-xs text-red-400 flex-shrink-0">{saveError}</p>}
            <div className="flex gap-2 flex-shrink-0 pt-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
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

// ── PAYE Card ─────────────────────────────────────────────

function PayeCard({ taxReturn, onSaved }: {
  taxReturn: KlippaTaxReturn
  onSaved:   (amount: number) => void
}) {
  const [raw,     setRaw]     = useState(String(taxReturn.employees_tax_paid ?? 0))
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanSummary, setScanSummary] = useState<string | null>(null)
  const irp5Ref = useRef<HTMLInputElement>(null)

  // Scan an IRP5 photo/PDF → OCR extracts SARS source codes → 4102 (PAYE)
  // pre-fills the field. The user still reviews and taps Save.
  const handleIrp5Scan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setError(null)
    setScanSummary(null)
    try {
      const fileToUpload = file.type.startsWith('image/') ? await compressImage(file) : file
      const fd = new FormData()
      fd.append('file', fileToUpload)
      fd.append('doc_type', 'irp5')
      const res = await fetch('/api/documents/ocr', { method: 'POST', body: fd })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* non-JSON body */ }
      if (!res.ok) throw new Error(
        data.error === 'premium_required'
          ? 'IRP5 scanning needs a Starter plan (or remaining free scans).'
          : (data.error as string) ?? 'Scan failed. Please try again.'
      )
      const fields = (data.irp5_fields ?? {}) as Record<string, unknown>
      const paye = typeof fields['sars_4102'] === 'number' ? fields['sars_4102'] as number : null
      if (paye == null) {
        throw new Error('Could not find PAYE (source code 4102) on the certificate — enter it manually from your IRP5.')
      }
      setRaw(String(paye))
      setSaved(false)
      const employer = typeof fields['employer_name'] === 'string' ? fields['employer_name'] as string : null
      const gross    = typeof fields['sars_3601'] === 'number' ? fields['sars_3601'] as number
                     : typeof fields['sars_3699'] === 'number' ? fields['sars_3699'] as number : null
      setScanSummary(
        `Found PAYE R${paye.toLocaleString('en-ZA')}` +
        (employer ? ` · ${employer}` : '') +
        (gross != null ? ` · income R${gross.toLocaleString('en-ZA')}` : '') +
        ' — check against your certificate, then Save.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
      if (irp5Ref.current) irp5Ref.current.value = ''
    }
  }

  const handleSave = async () => {
    const amount = parseFloat(raw) || 0
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('klippa_tax_returns')
      .update({ employees_tax_paid: amount })
      .eq('id', taxReturn.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(amount)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-ink-2 flex-shrink-0" />
          <p className="text-xs font-semibold text-ink-1 uppercase tracking-wider">PAYE deducted by employer</p>
        </div>
        <button
          onClick={() => irp5Ref.current?.click()}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised disabled:opacity-50 transition-colors"
        >
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {scanning ? 'Reading IRP5…' : 'Scan IRP5'}
        </button>
        <input
          ref={irp5Ref}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={handleIrp5Scan}
        />
      </div>
      <p className="text-sm text-ink-2 leading-relaxed">
        If you also received a salary and your employer deducted PAYE (Employees&apos; Tax), enter the total
        for the year here — or snap a photo of your IRP5 and we&apos;ll read it (source code 4102).
        This reduces your net tax payable on assessment.
      </p>
      {scanSummary && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">{scanSummary}</p>
      )}
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-ink-2">Annual PAYE deducted (R)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setSaved(false) }}
            onFocus={(e) => e.target.select()}
            placeholder="e.g. 45000"
            className="input w-full font-mono"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────

// Rows fetched per page — full rows are paginated, while a slim column
// fetch covers totals/dedupe across the entire history.
const PAGE_SIZE = 300

interface SlimIncomeRow { id: string; amount: number; created_at: string | null; received_date: string | null }

function IncomePage() {
  const searchParams = useSearchParams()
  const [records,      setRecords]      = useState<KlippaIncomeRecord[]>([])
  const [slimRows,     setSlimRows]     = useState<SlimIncomeRow[]>([])
  const [totalCount,   setTotalCount]   = useState(0)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [taxReturn,    setTaxReturn]    = useState<KlippaTaxReturn | null>(null)
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [showAdd,      setShowAdd]      = useState(searchParams.get('add') === '1')
  const [showCSV,      setShowCSV]      = useState(false)
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const [editRecord,   setEditRecord]   = useState<KlippaIncomeRecord | null>(null)
  // Two-tap delete: first tap arms the row, second tap within 3s deletes
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const armDelete = (id: string) => {
    setConfirmDelete(id)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmDelete(null), 3000)
  }

  const loadRecords = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [retRes, profileRes] = await Promise.all([
      supabase.from('klippa_tax_returns').select('*').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single(),
      supabase.from('klippa_profiles').select('*').eq('id', user.id).single(),
    ])

    setTaxReturn(retRes.data as KlippaTaxReturn | null)
    setProfile(profileRes.data as KlippaProfile | null)

    // Slim fetch across the whole history: keeps the header total, the
    // free-tier month counter, and CSV dedupe accurate without shipping
    // every full row to the client.
    const [slimRes, fullRes] = await Promise.all([
      supabase
        .from('klippa_income_records')
        .select('id, amount, created_at, received_date')
        .eq('user_id', user.id),
      supabase
        .from('klippa_income_records')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('received_date', { ascending: false })
        .range(0, PAGE_SIZE - 1),
    ])

    setSlimRows((slimRes.data ?? []) as SlimIncomeRow[])
    setRecords((fullRes.data ?? []) as KlippaIncomeRecord[])
    setTotalCount(fullRes.count ?? (fullRes.data?.length ?? 0))
    setLoading(false)
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('klippa_income_records')
        .select('*')
        .eq('user_id', user.id)
        .order('received_date', { ascending: false })
        .range(records.length, records.length + PAGE_SIZE - 1)
      setRecords((prev) => [...prev, ...((data ?? []) as KlippaIncomeRecord[])])
    } finally {
      setLoadingMore(false)
    }
  }

  // Keep the slim (whole-history) set in sync with mutations so totals,
  // the month counter, and CSV dedupe stay accurate without a refetch.
  const toSlim = (r: KlippaIncomeRecord): SlimIncomeRow =>
    ({ id: r.id, amount: r.amount, created_at: r.created_at, received_date: r.received_date })
  const addRecord = (r: KlippaIncomeRecord) => {
    setRecords((prev) => [r, ...prev])
    setSlimRows((prev) => [toSlim(r), ...prev])
    setTotalCount((n) => n + 1)
  }
  const patchRecord = (r: KlippaIncomeRecord) => {
    setRecords((prev) => prev.map((x) => x.id === r.id ? r : x))
    setSlimRows((prev) => prev.map((x) => x.id === r.id ? toSlim(r) : x))
  }

  const handleDelete = async (id: string) => {
    setConfirmDelete(null)
    setDeleting(id)
    await fetch('/api/income', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRecords((r) => r.filter((x) => x.id !== id))
    setSlimRows((r) => r.filter((x) => x.id !== id))
    setTotalCount((n) => Math.max(0, n - 1))
    setDeleting(null)
  }

  const totalIncome = slimRows.reduce((s, r) => s + r.amount, 0)

  // Tier flags
  const isStarter = isStarterOrAbove(profile)

  // Monthly usage counter for free users
  const thisMonthCount = !isStarter && !loading ? (() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return slimRows.filter((r) => r.created_at && new Date(r.created_at) >= monthStart).length
  })() : 0

  return (
    <div className="app-shell bg-base text-ink-1">
      <AppNav activePage="income" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-1">Income</h1>
            <p className="text-sm text-ink-2 mt-1">
              {totalCount > 0 ? `${totalCount} records · Total ${formatRand(totalIncome)}` : 'No income records yet'}
            </p>
            {/* Free-tier monthly usage counter */}
            {!loading && !isStarter && (
              <p className={`text-xs mt-1 font-medium ${thisMonthCount >= FREE_INCOME_LIMIT ? 'text-red-400' : 'text-ink-3'}`}>
                {thisMonthCount}/{FREE_INCOME_LIMIT} income records this month
                {thisMonthCount >= FREE_INCOME_LIMIT && (
                  <a href="/pricing" className="ml-2 underline text-emerald-400">Upgrade for unlimited</a>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isStarter && (
              <button
                onClick={() => setShowCSV(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
              </button>
            )}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add income
            </button>
          </div>
        </div>

        {/* PAYE card — only shown for employee / mixed employment users */}
        {!loading && profile && profile.employment_type !== 'freelance' && taxReturn && (
          <PayeCard
            taxReturn={taxReturn}
            onSaved={(amount) => setTaxReturn((prev) => prev ? { ...prev, employees_tax_paid: amount } : prev)}
          />
        )}

        {/* Recurring income templates (retainers etc.) */}
        {!loading && <RecurringManager kind="income" isStarter={isStarter} />}

        {/* Records table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-edge p-16 text-center space-y-4">
            <Upload className="w-8 h-8 text-ink-3 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-ink-1">Log what you&apos;ve earned</p>
              <p className="text-xs text-ink-2 mt-1">Klippa works out what SARS owes you — and what&apos;s safe to spend today.</p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add manually
              </button>
              {isStarter && (
                <button onClick={() => setShowCSV(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-edge overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-edge bg-surface/60">
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-2">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-2">Amount</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-edge/60 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-ink-1 font-medium">{r.source_name}</p>
                      {r.description && <p className="text-xs text-ink-2 mt-0.5">{r.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-raised text-ink-2">
                        {INCOME_TYPE_LABELS[r.income_type as IncomeType]}
                      </span>
                      {needsHumanReview(r.income_type as IncomeType) && (
                        <p className="text-[11px] text-amber-500 mt-1">Klippa will show this separately in your filing preview.</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">{formatDate(r.received_date)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink-1 tabular-nums">{formatRand(r.amount)}</td>
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
                          <button
                            onClick={() => armDelete(r.id)}
                            disabled={deleting === r.id}
                            title="Delete"
                            className="text-ink-3 hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            {deleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface/40">
                  <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-ink-2">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-ink-1 tabular-nums">{formatRand(totalIncome)}</td>
                  <td />
                </tr>
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
        <AddIncomeModal
          taxReturnId={taxReturn?.id ?? null}
          onClose={() => setShowAdd(false)}
          onSaved={addRecord}
        />
      )}

      {editRecord && (
        <AddIncomeModal
          taxReturnId={taxReturn?.id ?? null}
          editRecord={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={patchRecord}
        />
      )}

      {showCSV && (
        <CsvImportModal
          taxReturnId={taxReturn?.id ?? null}
          existing={slimRows}
          onClose={() => setShowCSV(false)}
          onImported={(recs) => recs.forEach(addRecord)}
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

export default function IncomePageWrapper() {
  return <Suspense><IncomePage /></Suspense>
}
