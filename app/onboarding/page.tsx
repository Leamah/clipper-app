'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, ArrowRight, Loader2, Check } from 'lucide-react'
import type { EmploymentType } from '@/lib/types'

// ── Step definitions ──────────────────────────────────────

interface OnboardingState {
  employment_type:     EmploymentType
  works_from_home:     boolean | null
  has_vehicle:         boolean | null
  has_ra:              boolean | null
  tax_year:            number
}

const CURRENT_YEAR = new Date().getFullYear()
// Tax year 2025 = 1 March 2024 – 28 Feb 2025
const TAX_YEAR_OPTIONS = [
  { value: CURRENT_YEAR,     label: `${CURRENT_YEAR} (1 Mar ${CURRENT_YEAR - 1} – 28 Feb ${CURRENT_YEAR})` },
  { value: CURRENT_YEAR - 1, label: `${CURRENT_YEAR - 1} (1 Mar ${CURRENT_YEAR - 2} – 28 Feb ${CURRENT_YEAR - 1})` },
]

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string; sub: string }[] = [
  { value: 'freelance', label: 'Freelance / Consulting',   sub: 'I work for myself and invoice clients' },
  { value: 'employee',  label: 'Employee',                  sub: 'I receive a salary and IRP5 certificate' },
  { value: 'mixed',     label: 'Both',                      sub: 'I have a salary and also freelance income' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step,    setStep]    = useState(0)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const [state, setState] = useState<OnboardingState>({
    employment_type:  'freelance',
    works_from_home:  null,
    has_vehicle:      null,
    has_ra:           null,
    tax_year:         CURRENT_YEAR,
  })

  const totalSteps = 5

  async function handleComplete() {
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Upsert profile
      const { error: profileErr } = await supabase
        .from('klippa_profiles')
        .upsert({
          id:                  user.id,
          employment_type:     state.employment_type,
          works_from_home:     state.works_from_home ?? false,
          has_vehicle:         state.has_vehicle ?? false,
          has_ra:              state.has_ra ?? false,
          tax_year:            state.tax_year,
          onboarding_complete: true,
        }, { onConflict: 'id' })

      if (profileErr) throw profileErr

      // Create tax return for this year
      const { error: returnErr } = await supabase
        .from('klippa_tax_returns')
        .upsert({
          user_id:      user.id,
          tax_year:     state.tax_year,
          return_type:  'ITR12',
          status:       'draft',
        }, { onConflict: 'user_id,tax_year,return_type' })

      if (returnErr) throw returnErr

      router.replace('/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  function next() {
    if (step < totalSteps - 1) setStep((s) => s + 1)
    else handleComplete()
  }

  const progressPct = ((step + 1) / totalSteps) * 100

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-lg space-y-8">
        {/* Logo + progress */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Setting up your tax profile</span>
              <span>{step + 1} of {totalSteps}</span>
            </div>
            <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-8 shadow-xl space-y-8">

          {/* Step 0: Employment type */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">What do you do for work?</h2>
                <p className="text-sm text-zinc-500">This determines which deductions apply to you.</p>
              </div>
              <div className="space-y-3">
                {EMPLOYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setState((s) => ({ ...s, employment_type: opt.value })); next() }}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      state.employment_type === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-700 group-hover:border-emerald-500/50'
                    }`}>
                      {state.employment_type === opt.value && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{opt.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{opt.sub}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-700 group-hover:text-emerald-500 ml-auto transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Home office */}
          {step === 1 && (
            <YesNoStep
              question="Do you work from home?"
              context="If you have a dedicated workspace at home, you may be able to claim a portion of your rent, rates, and electricity as a deduction."
              value={state.works_from_home}
              onChange={(v) => setState((s) => ({ ...s, works_from_home: v }))}
              onNext={next}
            />
          )}

          {/* Step 2: Vehicle */}
          {step === 2 && (
            <YesNoStep
              question="Do you drive for work?"
              context="Client visits, site trips, and other business travel qualify. You'll need to log business kilometres to claim this deduction."
              value={state.has_vehicle}
              onChange={(v) => setState((s) => ({ ...s, has_vehicle: v }))}
              onNext={next}
            />
          )}

          {/* Step 3: RA */}
          {step === 3 && (
            <YesNoStep
              question="Do you have a Retirement Annuity (RA)?"
              context="RA contributions are deductible under Section 11F — up to 27.5% of your taxable income or R350,000, whichever is lower."
              value={state.has_ra}
              onChange={(v) => setState((s) => ({ ...s, has_ra: v }))}
              onNext={next}
            />
          )}

          {/* Step 4: Tax year */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">Which tax year are we filing?</h2>
                <p className="text-sm text-zinc-500">South African tax years run from 1 March to the last day of February.</p>
              </div>
              <div className="space-y-3">
                {TAX_YEAR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setState((s) => ({ ...s, tax_year: opt.value }))}
                    className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all ${
                      state.tax_year === opt.value
                        ? 'border-emerald-500/60 bg-emerald-500/10'
                        : 'border-zinc-800 hover:border-emerald-500/40 hover:bg-emerald-500/5'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      state.tax_year === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-700'
                    }`}>
                      {state.tax_year === opt.value && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">Tax year {opt.value}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{opt.label}</p>
                    </div>
                  </button>
                ))}
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleComplete}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all shadow-lg shadow-emerald-900/30"
              >
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

// ── Reusable Yes/No step ──────────────────────────────────

function YesNoStep({
  question,
  context,
  value,
  onChange,
  onNext,
}: {
  question: string
  context:  string
  value:    boolean | null
  onChange: (v: boolean) => void
  onNext:   () => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white">{question}</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">{context}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([true, false] as const).map((opt) => (
          <button
            key={String(opt)}
            onClick={() => { onChange(opt); onNext() }}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border transition-all ${
              value === opt
                ? 'border-emerald-500/60 bg-emerald-500/10'
                : 'border-zinc-800 hover:border-emerald-500/40 hover:bg-emerald-500/5'
            }`}
          >
            <span className="text-2xl">{opt ? '✓' : '✗'}</span>
            <span className="text-sm font-semibold text-zinc-100">{opt ? 'Yes' : 'No'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
