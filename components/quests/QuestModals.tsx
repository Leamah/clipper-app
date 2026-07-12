'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { awardXp } from '@/lib/gamification'
import type { KlippaProfile, WorkLocation } from '@/lib/types'
import { X, Check, Car, Home, Building2, Shuffle, ArrowRight, Loader2 } from 'lucide-react'

export type QuestModalKind = 'vehicle' | 'work_location' | 'products'

type FinancialProduct = 'ra' | 'pension' | 'medical' | 'tfsa' | 'interest_savings'

/**
 * The deferred onboarding questions, one modal each — asked from the
 * dashboard QuestBoard at the moment they matter instead of up front.
 * Each writes the same profile fields the old wizard did, awards its XP
 * event, and hands the field changes back so the dashboard can patch
 * state without a reload.
 */
export default function QuestModal({
  kind, userId, onClose, onAnswered,
}: {
  kind:       QuestModalKind
  userId:     string
  onClose:    () => void
  onAnswered: (profilePatch: Partial<KlippaProfile>) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Products state
  const [products, setProducts] = useState<Set<FinancialProduct>>(new Set())
  const [medicalMembers, setMedicalMembers] = useState(1)
  const [productStep, setProductStep] = useState<'pick' | 'medical'>('pick')

  async function save(patch: Partial<KlippaProfile>, eventKey: 'answered_vehicle' | 'answered_work_location' | 'answered_products') {
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('klippa_profiles').update(patch).eq('id', userId)
    if (err) { setError(err.message); setSaving(false); return }
    await awardXp(userId, eventKey)
    onAnswered(patch)
  }

  const toggleProduct = (p: FinancialProduct) => {
    setProducts((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  function submitProducts() {
    if (products.has('medical') && productStep === 'pick') { setProductStep('medical'); return }
    save({
      has_ra:               products.has('ra'),
      has_pension:          products.has('pension'),
      has_medical:          products.has('medical'),
      medical_aid_members:  products.has('medical') ? medicalMembers : 0,
      has_tfsa:             products.has('tfsa'),
      has_interest_savings: products.has('interest_savings'),
    }, 'answered_products')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl border border-edge bg-surface p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-3 hover:text-ink-1 transition-colors">
          <X className="w-4 h-4" />
        </button>

        {/* ── Vehicle ─────────────────────────────────────────────── */}
        {kind === 'vehicle' && (
          <>
            <div>
              <h2 className="text-lg font-bold pr-6">Do you drive for work?</h2>
              <p className="text-sm text-ink-2 mt-1 leading-relaxed">
                Client visits and site trips are one of the biggest freelancer deductions. You&apos;ll keep a simple logbook of business kilometres to claim it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={saving}
                onClick={() => save({ has_vehicle: true, feature_logbook: true }, 'answered_vehicle')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border border-edge hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:opacity-60 transition-all"
              >
                <Car className="w-6 h-6 text-emerald-400" />
                <span className="text-xs font-semibold text-ink-1 text-center leading-tight">Yes, I drive for work</span>
              </button>
              <button
                disabled={saving}
                onClick={() => save({ has_vehicle: false, feature_logbook: false }, 'answered_vehicle')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border border-edge hover:border-emerald-500/40 disabled:opacity-60 transition-all"
              >
                <span className="text-2xl">🚌</span>
                <span className="text-xs font-semibold text-ink-1 text-center leading-tight">No, I don&apos;t drive for work</span>
              </button>
            </div>
          </>
        )}

        {/* ── Work location ───────────────────────────────────────── */}
        {kind === 'work_location' && (
          <>
            <div>
              <h2 className="text-lg font-bold pr-6">Where do you work from?</h2>
              <p className="text-sm text-ink-2 mt-1">Working from home can unlock a home office deduction.</p>
            </div>
            <div className="space-y-3">
              {([
                { value: 'home_only'   as WorkLocation, icon: <Home      className="w-5 h-5 text-emerald-400" />, label: 'Fully Remote',     sub: 'I work exclusively from home — full home office deduction territory' },
                { value: 'hybrid'      as WorkLocation, icon: <Shuffle   className="w-5 h-5 text-amber-400" />,   label: 'Hybrid',           sub: 'Some days home, some days office — a partial claim may apply' },
                { value: 'office_only' as WorkLocation, icon: <Building2 className="w-5 h-5 text-ink-2" />,       label: 'Office / On-site', sub: 'Fixed employer or client premises — no home office deduction' },
              ]).map((opt) => (
                <button key={opt.value}
                  disabled={saving}
                  onClick={() => save({ work_location: opt.value, works_from_home: opt.value !== 'office_only' }, 'answered_work_location')}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-edge hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:opacity-60 transition-all group"
                >
                  <div className="flex-shrink-0">{opt.icon}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink-1">{opt.label}</p>
                    <p className="text-xs text-ink-2 mt-0.5">{opt.sub}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-500" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Financial products ──────────────────────────────────── */}
        {kind === 'products' && productStep === 'pick' && (
          <>
            <div>
              <h2 className="text-lg font-bold pr-6">What money products do you have?</h2>
              <p className="text-sm text-ink-2 mt-1">Select anything that sounds familiar — each one can shrink your tax bill. Klippa handles the SARS wording.</p>
            </div>
            <div className="space-y-2.5">
              {([
                { key: 'ra'               as FinancialProduct, label: 'I pay into my own retirement plan', sub: 'Allan Gray RA, Sygnia RA, 10X RA, Old Mutual RA…', badge: 'Can reduce tax' },
                { key: 'pension'          as FinancialProduct, label: 'My employer takes retirement money off my payslip', sub: 'Pension fund, provident fund, company retirement fund.', badge: 'Can reduce tax' },
                { key: 'medical'          as FinancialProduct, label: 'I pay for medical aid', sub: 'Discovery, Bonitas, Momentum, Medihelp, Bestmed…', badge: 'Tax credit' },
                { key: 'tfsa'             as FinancialProduct, label: 'I have a tax-free savings account', sub: 'EasyEquities TFSA, bank TFSA, Satrix TFSA.', badge: 'Tax-free' },
                { key: 'interest_savings' as FinancialProduct, label: 'A bank or savings account pays me interest', sub: 'Savings account, fixed deposit, money market.', badge: 'May be partly tax-free' },
              ]).map(({ key, label, sub, badge }) => {
                const selected = products.has(key)
                return (
                  <button key={key} type="button" onClick={() => toggleProduct(key)}
                    className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border transition-all ${selected ? 'border-emerald-500/50 bg-emerald-500/8' : 'border-edge hover:border-edge'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${selected ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-ink-1">{label}</p>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">{badge}</span>
                      </div>
                      <p className="text-xs text-ink-2 mt-0.5 leading-relaxed">{sub}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}
            <button onClick={submitProducts} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-all">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <>{products.size > 0 ? 'Continue' : 'None of these'} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </>
        )}

        {kind === 'products' && productStep === 'medical' && (
          <>
            <div>
              <h2 className="text-lg font-bold pr-6">How many people are on your medical aid?</h2>
              <p className="text-sm text-ink-2 mt-1">Include yourself and all registered dependants.</p>
            </div>
            <div className="space-y-2.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n}
                  disabled={saving}
                  onClick={() => { setMedicalMembers(n) }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all ${medicalMembers === n ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-edge hover:border-edge'}`}>
                  <div>
                    <p className="text-sm font-medium text-ink-1 text-left">
                      {n === 1 ? 'Just me (main member)' : `${n} members`}
                      {n === 2 ? ' (you + 1 dependant)' : n > 2 ? ` (you + ${n - 1} dependants)` : ''}
                    </p>
                    <p className="text-xs text-ink-2 mt-0.5 text-left">
                      Credit: R{(n <= 2 ? n * 364 : 2 * 364 + (n - 2) * 246) * 12} /year
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${medicalMembers === n ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
                    {medicalMembers === n && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}
            <button onClick={submitProducts} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-all">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <>Done <Check className="w-4 h-4" /></>}
            </button>
          </>
        )}

        {kind !== 'products' && error && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </div>
  )
}
