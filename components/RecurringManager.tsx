'use client'

import { useState, useEffect, useCallback } from 'react'
import { Repeat, Plus, Trash2, Loader2, Check, X, Zap, Pause, Play } from 'lucide-react'
import type { KlippaRecurringTemplate, IncomeType, ExpenseCategory } from '@/lib/types'
import { INCOME_TYPE_LABELS, EXPENSE_CATEGORY_LABELS } from '@/lib/types'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(n)
}

/**
 * Recurring templates manager — embedded on the Income and Expenses pages.
 * Starter+ feature; free users see an upgrade nudge.
 */
export default function RecurringManager({ kind, isStarter }: {
  kind:      'income' | 'expense'
  isStarter: boolean
}) {
  const [templates, setTemplates] = useState<KlippaRecurringTemplate[]>([])
  const [loading,   setLoading]   = useState(true)
  const [open,      setOpen]      = useState(false)
  const [adding,    setAdding]    = useState(false)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  const [form, setForm] = useState({
    source_name: '', amount: '', day_of_month: '1',
    income_type: 'freelance' as IncomeType,
    category: 'software_subscriptions' as ExpenseCategory,
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res  = await fetch('/api/recurring')
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setTemplates((data.templates ?? []).filter((t: KlippaRecurringTemplate) => t.kind === kind))
    setLoading(false)
  }, [kind])

  useEffect(() => { if (isStarter) load(); else setLoading(false) }, [load, isStarter])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          source_name:  form.source_name,
          amount:       parseFloat(form.amount),
          day_of_month: parseInt(form.day_of_month),
          income_type:  kind === 'income' ? form.income_type : undefined,
          category:     kind === 'expense' ? form.category : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error === 'starter_required' ? 'Recurring is a Starter feature' : data.error ?? 'Failed')
      setTemplates((prev) => [data.template, ...prev])
      setAdding(false)
      setForm((f) => ({ ...f, source_name: '', amount: '' }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (tpl: KlippaRecurringTemplate) => {
    setBusy(tpl.id)
    setTemplates((prev) => prev.map((t) => t.id === tpl.id ? { ...t, active: !t.active } : t))
    const res = await fetch(`/api/recurring/${tpl.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !tpl.active }),
    })
    if (!res.ok) setTemplates((prev) => prev.map((t) => t.id === tpl.id ? { ...t, active: tpl.active } : t))
    setBusy(null)
  }

  const handleDelete = async (tpl: KlippaRecurringTemplate) => {
    setBusy(tpl.id)
    const prev = templates
    setTemplates((p) => p.filter((t) => t.id !== tpl.id))
    const res = await fetch(`/api/recurring/${tpl.id}`, { method: 'DELETE' })
    if (!res.ok) setTemplates(prev)
    setBusy(null)
  }

  const label = kind === 'income' ? 'income' : 'expenses'

  return (
    <div className="rounded-2xl border border-edge bg-surface/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-5 py-4 text-left"
      >
        <Repeat className="w-4 h-4 text-ink-2 flex-shrink-0" />
        <span className="text-xs font-semibold text-ink-1 uppercase tracking-wider flex-1">
          Recurring {label}
        </span>
        {!loading && isStarter && templates.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold tabular-nums">
            {templates.filter((t) => t.active).length} active
          </span>
        )}
        <span className="text-ink-3 text-xs">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {!isStarter ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-amber-300">Automate your monthly {label}</p>
              </div>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Set up retainers, subscriptions and rent once — Klippa posts them automatically every month. Available on Starter.
              </p>
              <a href="/pricing" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors">
                <Zap className="w-3 h-3" /> Upgrade now
              </a>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-ink-3" /></div>
          ) : (
            <>
              <p className="text-xs text-ink-3">
                {kind === 'income'
                  ? 'Monthly retainers or fixed payments — posted to your income automatically each month.'
                  : 'Subscriptions, rent, insurance — posted to your expenses automatically each month (pre-confirmed, no AI review needed).'}
              </p>

              {templates.map((t) => (
                <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${t.active ? 'bg-raised/50 border-edge/60' : 'bg-raised/20 border-transparent opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-1 font-medium truncate">{t.source_name ?? 'Untitled'}</p>
                    <p className="text-[11px] text-ink-3">
                      {kind === 'income'
                        ? INCOME_TYPE_LABELS[(t.income_type ?? 'freelance') as IncomeType]
                        : EXPENSE_CATEGORY_LABELS[(t.category ?? 'other') as ExpenseCategory]}
                      {' · '}day {t.day_of_month}{t.active ? ` · next ${t.next_run}` : ' · paused'}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-ink-1 tabular-nums flex-shrink-0">{formatRand(t.amount)}</span>
                  {busy === t.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-3 flex-shrink-0" />
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleActive(t)} className="p-1.5 text-ink-3 hover:text-ink-1 transition-colors" title={t.active ? 'Pause' : 'Resume'}>
                        {t.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => handleDelete(t)} className="p-1.5 text-ink-3 hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {adding ? (
                <form onSubmit={handleAdd} className="rounded-xl border border-edge bg-raised/40 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={form.source_name} onChange={(e) => setForm((f) => ({ ...f, source_name: e.target.value }))} placeholder={kind === 'income' ? 'Client / retainer name' : 'Merchant / subscription'} required className="input" />
                    <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount (R)" required className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {kind === 'income' ? (
                      <select value={form.income_type} onChange={(e) => setForm((f) => ({ ...f, income_type: e.target.value as IncomeType }))} className="input">
                        {(Object.entries(INCOME_TYPE_LABELS) as [IncomeType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : (
                      <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))} className="input">
                        {(Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    )}
                    <select value={form.day_of_month} onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.value }))} className="input" title="Day of month posted">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Day {d} of each month</option>)}
                    </select>
                  </div>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                    </button>
                    <button type="button" onClick={() => { setAdding(false); setError(null) }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                  <Plus className="w-3 h-3" /> Add recurring {kind === 'income' ? 'income' : 'expense'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
