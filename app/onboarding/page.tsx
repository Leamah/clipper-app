'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, ArrowRight, Loader2, Check, Car, Home, Building2, Shuffle } from 'lucide-react'
import type { EmploymentType, WorkLocation } from '@/lib/types'

const CURRENT_YEAR = new Date().getFullYear()

const TAX_YEAR_OPTIONS = [
  { value: CURRENT_YEAR,     label: `${CURRENT_YEAR}`, sub: `1 Mar ${CURRENT_YEAR - 1} – 28 Feb ${CURRENT_YEAR}` },
  { value: CURRENT_YEAR - 1, label: `${CURRENT_YEAR - 1}`, sub: `1 Mar ${CURRENT_YEAR - 2} – 28 Feb ${CURRENT_YEAR - 1}` },
]

type FinancialProduct = 'ra' | 'pension' | 'medical' | 'tfsa' | 'interest_savings'

interface OnboardingState {
  employment_type:      EmploymentType
  work_location:        WorkLocation
  has_vehicle:          boolean | null
  financial_products:   Set<FinancialProduct>
  medical_aid_members:  number
  tax_year:             number
}

export default function OnboardingPage() {
  const router  = useRouter()
  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const [state, setState] = useState<OnboardingState>({
    employment_type:      'freelance',
    work_location:        'home_only',
    has_vehicle:          null,
    financial_products:   new Set(),
    medical_aid_members:  1,
    tax_year:             CURRENT_YEAR,
  })

  // Extra step if medical aid is selected — ask member count
  const hasMedical  = state.financial_products.has('medical')
  const totalSteps  = hasMedical ? 6 : 5

  const toggleProduct = (p: FinancialProduct) => {
    setState((s) => {
      const next = new Set(s.financial_products)
      next.has(p) ? next.delete(p) : next.add(p)
      return { ...s, financial_products: next }
    })
  }

  function next() { setStep((s) => s + 1) }
  function back() { setStep((s) => Math.max(0, s - 1)) }

  async function handleComplete() {
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const fp = state.financial_products
      const works_from_home = state.work_location !== 'office_only'

      const { error: profileErr } = await supabase
        .from('klippa_profiles')
        .upsert({
          id:                  user.id,
          employment_type:     state.employment_type,
          work_location:       state.work_location,
          works_from_home,
          has_vehicle:         state.has_vehicle ?? false,
          has_ra:              fp.has('ra'),
          has_pension:         fp.has('pension'),
          has_medical:         fp.has('medical'),
          medical_aid_members: fp.has('medical') ? state.medical_aid_members : 0,
          has_tfsa:            fp.has('tfsa'),
          has_interest_savings: fp.has('interest_savings'),
          tax_year:            state.tax_year,
          onboarding_complete: true,
        }, { onConflict: 'id' })

      if (profileErr) throw profileErr

      const { error: returnErr } = await supabase
        .from('klippa_tax_returns')
        .upsert({
          user_id:     user.id,
          tax_year:    state.tax_year,
          return_type: 'ITR12',
          status:      'draft',
        }, { onConflict: 'user_id,tax_year,return_type' })

      if (returnErr) throw returnErr

      router.replace('/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const progressPct = ((step + 1) / totalSteps) * 100

  return (
    <div className="min-h-screen bg-base text-ink-1 flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-lg space-y-8">
        {/* Logo + progress */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight">Klippa</span>
            </div>
            {step > 0 && (
              <button onClick={back} className="text-xs text-ink-2 hover:text-ink-1 transition-colors">
                ← Back
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-ink-2">
              <span>Setting up your tax profile</span>
              <span>{step + 1} of {totalSteps}</span>
            </div>
            <div className="h-1 rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-edge bg-surface/60 backdrop-blur p-8 shadow-xl space-y-8">

          {/* Step 0: Employment type */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">What do you do for work?</h2>
                <p className="text-sm text-ink-2 mt-1">This determines which deductions apply to you.</p>
              </div>
              <div className="space-y-3">
                {([
                  { value: 'freelance' as EmploymentType, label: 'Freelance / Consulting',   sub: 'I work for myself and invoice clients' },
                  { value: 'employee'  as EmploymentType, label: 'Employee',                  sub: 'I receive a salary and IRP5 certificate' },
                  { value: 'mixed'     as EmploymentType, label: 'Both (salary + freelance)', sub: 'I have a salary and also freelance income' },
                ]).map((opt) => (
                  <button key={opt.value} onClick={() => { setState((s) => ({ ...s, employment_type: opt.value })); next() }}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-edge hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${state.employment_type === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
                      {state.employment_type === opt.value && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink-1">{opt.label}</p>
                      <p className="text-xs text-ink-2 mt-0.5">{opt.sub}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-500 ml-auto" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Work location (supports hybrid) */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Where do you work from?</h2>
                <p className="text-sm text-ink-2 mt-1">This affects your home office deduction eligibility.</p>
              </div>
              <div className="space-y-3">
                {([
                  {
                    value: 'home_only' as WorkLocation,
                    icon: <Home className="w-5 h-5 text-emerald-400" />,
                    label: 'Fully Remote',
                    sub: 'I work exclusively from home — eligible for full home office deduction',
                  },
                  {
                    value: 'hybrid' as WorkLocation,
                    icon: <Shuffle className="w-5 h-5 text-amber-400" />,
                    label: 'Hybrid',
                    sub: 'Some days home, some days office — partial home office deduction may apply',
                  },
                  {
                    value: 'office_only' as WorkLocation,
                    icon: <Building2 className="w-5 h-5 text-ink-2" />,
                    label: 'Office / On-site',
                    sub: 'I work at a fixed employer or client premises — no home office deduction',
                  },
                ]).map((opt) => (
                  <button key={opt.value}
                    onClick={() => { setState((s) => ({ ...s, work_location: opt.value, works_from_home: opt.value !== 'office_only' })); next() }}
                    className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all group ${state.work_location === opt.value ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-edge hover:border-emerald-500/40 hover:bg-emerald-500/5'}`}>
                    <div className="flex-shrink-0">{opt.icon}</div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink-1">{opt.label}</p>
                      <p className="text-xs text-ink-2 mt-0.5">{opt.sub}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-500" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Vehicle */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Do you drive for work?</h2>
                <p className="text-sm text-ink-2 mt-1 leading-relaxed">Client visits, site trips, and business travel qualify. You&apos;ll keep a logbook of business kilometres to claim this deduction.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { v: true,  icon: <Car className="w-6 h-6 text-emerald-400" />, label: 'Yes, I drive for work' },
                  { v: false, icon: <span className="text-2xl">🚌</span>,         label: 'No, I don\'t drive for work' },
                ]).map(({ v, icon, label }) => (
                  <button key={String(v)}
                    onClick={() => { setState((s) => ({ ...s, has_vehicle: v })); next() }}
                    className={`flex flex-col items-center gap-3 p-5 rounded-xl border transition-all ${state.has_vehicle === v ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-edge hover:border-emerald-500/40'}`}>
                    {icon}
                    <span className="text-xs font-semibold text-ink-1 text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Financial products (multi-select) */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Which financial products do you have?</h2>
                <p className="text-sm text-ink-2 mt-1">Select all that apply — each one unlocks relevant deductions or exemptions.</p>
              </div>
              <div className="space-y-2.5">
                {([
                  {
                    key: 'ra' as FinancialProduct,
                    label: 'Retirement Annuity (RA)',
                    sub: 'Deductible up to 27.5% of income or R350,000 (Section 11F)',
                    badge: 'Deduction',
                  },
                  {
                    key: 'pension' as FinancialProduct,
                    label: 'Pension Fund',
                    sub: 'Combined with RA under Section 11F — employer + employee contributions',
                    badge: 'Deduction',
                  },
                  {
                    key: 'medical' as FinancialProduct,
                    label: 'Medical Aid',
                    sub: 'Monthly tax credit: R364 per member (first 2), R246 each additional',
                    badge: 'Tax Credit',
                  },
                  {
                    key: 'tfsa' as FinancialProduct,
                    label: 'Tax-Free Savings Account (TFSA)',
                    sub: 'Returns are tax-free (not a deduction but no tax on growth/interest)',
                    badge: 'Tax-free',
                  },
                  {
                    key: 'interest_savings' as FinancialProduct,
                    label: 'Interest-Bearing Savings Account',
                    sub: 'First R23,800/year (under 65) or R34,500 (65+) of interest is exempt',
                    badge: 'Exemption',
                  },
                ]).map(({ key, label, sub, badge }) => {
                  const selected = state.financial_products.has(key)
                  return (
                    <button key={key} type="button" onClick={() => toggleProduct(key)}
                      className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all ${selected ? 'border-emerald-500/50 bg-emerald-500/8' : 'border-edge hover:border-edge'}`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${selected ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'}`}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-ink-1">{label}</p>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">{badge}</span>
                        </div>
                        <p className="text-xs text-ink-2 mt-0.5 leading-relaxed">{sub}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
              <button onClick={next}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 3b: Medical aid members (only if medical selected) */}
          {step === 4 && hasMedical && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">How many people are on your medical aid?</h2>
                <p className="text-sm text-ink-2 mt-1">Include yourself and all registered dependants.</p>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n}
                    onClick={() => { setState((s) => ({ ...s, medical_aid_members: n })); next() }}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${state.medical_aid_members === n ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-edge hover:border-edge'}`}>
                    <div>
                      <p className="text-sm font-medium text-ink-1">
                        {n === 1 ? 'Just me (main member)' : `${n} members`}
                        {n === 2 ? ' (you + 1 dependant)' : n > 2 ? ` (you + ${n - 1} dependants)` : ''}
                      </p>
                      <p className="text-xs text-ink-2 mt-0.5">
                        Credit: R{(n <= 2 ? n * 364 : 2 * 364 + (n - 2) * 246) * 12} /year
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${state.medical_aid_members === n ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
                      {state.medical_aid_members === n && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Last step: Tax year */}
          {((step === 4 && !hasMedical) || step === 5) && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Which tax year are we filing?</h2>
                <p className="text-sm text-ink-2 mt-1">South African tax years run 1 March to the last day of February.</p>
              </div>
              <div className="space-y-3">
                {TAX_YEAR_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setState((s) => ({ ...s, tax_year: opt.value }))}
                    className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all ${state.tax_year === opt.value ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-edge hover:border-edge'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${state.tax_year === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
                      {state.tax_year === opt.value && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink-1">Tax year {opt.label}</p>
                      <p className="text-xs text-ink-2 mt-0.5">{opt.sub}</p>
                    </div>
                  </button>
                ))}
              </div>

              {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

              <button onClick={handleComplete} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all shadow-lg shadow-emerald-900/30">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your profile…</>
                  : <>Let&apos;s go <ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
