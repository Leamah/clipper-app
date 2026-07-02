'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, ArrowRight, Loader2, Check,
  Car, Home, Building2, Shuffle,
  UserRound, Users, BookOpen, Minus, Plus,
} from 'lucide-react'
import type { EmploymentType, WorkLocation, UserType } from '@/lib/types'
import { SEAT_PRICE_ANNUAL } from '@/lib/ozow'
import { readAttributionCookie } from '@/lib/attribution'
import { fireSignupConversion } from '@/lib/gtag'

const CURRENT_YEAR = new Date().getFullYear()

const TAX_YEAR_OPTIONS = [
  { value: CURRENT_YEAR,     label: `${CURRENT_YEAR}`,     sub: `1 Mar ${CURRENT_YEAR - 1} – 28 Feb ${CURRENT_YEAR}` },
  { value: CURRENT_YEAR - 1, label: `${CURRENT_YEAR - 1}`, sub: `1 Mar ${CURRENT_YEAR - 2} – 28 Feb ${CURRENT_YEAR - 1}` },
]

type FinancialProduct = 'ra' | 'pension' | 'medical' | 'tfsa' | 'interest_savings'

// ── Phase A: user-type selection ──────────────────────────────────────
// ── Phase B: freelancer flow (existing steps 0-5) ─────────────────────
// ── Phase C: B2B flow (one step: org name) ───────────────────────────
type Phase = 'pick' | 'freelancer' | 'b2b'

interface OnboardingState {
  // B2B
  user_type:  UserType
  org_name:   string
  org_type:   'company' | 'practice'
  seat_count: number
  // Freelancer
  employment_type:    EmploymentType
  work_location:      WorkLocation
  has_vehicle:        boolean | null
  financial_products: Set<FinancialProduct>
  medical_aid_members: number
  tax_year:           number
  invest_enabled:     boolean
}

export default function OnboardingPage() {
  const router   = useRouter()
  const [phase,  setPhase]  = useState<Phase>('pick')
  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const [state, setState] = useState<OnboardingState>({
    user_type:           'freelancer',
    org_name:            '',
    org_type:            'company',
    seat_count:          1,
    employment_type:     'freelance',
    work_location:       'home_only',
    has_vehicle:         null,
    financial_products:  new Set(),
    medical_aid_members: 1,
    tax_year:            CURRENT_YEAR,
    invest_enabled:      false,
  })

  const hasMedical  = state.financial_products.has('medical')
  const totalSteps  = hasMedical ? 7 : 6

  const toggleProduct = (p: FinancialProduct) => {
    setState((s) => {
      const next = new Set(s.financial_products)
      next.has(p) ? next.delete(p) : next.add(p)
      return { ...s, financial_products: next }
    })
  }

  function next() { setStep((s) => s + 1) }
  function back() {
    if (step === 0) { setPhase('pick'); setStep(0) }
    else setStep((s) => Math.max(0, s - 1))
  }

  // ── Save: freelancer complete ─────────────────────────────────────
  async function handleFreelancerComplete() {
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const fp = state.financial_products
      const works_from_home = state.work_location !== 'office_only'

      // Auto-enable the optional modules from the answers we already have,
      // so the user doesn't have to hunt for a separate opt-in in Settings:
      //  • Logbook/Mileage  → only if they drive for work
      //  • Timesheets       → independent consultants who invoice (freelance / mixed)
      //  • Provisional tax  → non-PAYE earners (freelance / mixed) file IRP6
      const drivesForWork  = state.has_vehicle ?? false
      const invoicesClients = state.employment_type === 'freelance' || state.employment_type === 'mixed'
      const attribution = readAttributionCookie()

      const { error: profileErr } = await supabase
        .from('klippa_profiles')
        .upsert({
          id:                   user.id,
          user_type:            'freelancer',
          employment_type:      state.employment_type,
          work_location:        state.work_location,
          works_from_home,
          has_vehicle:          state.has_vehicle ?? false,
          feature_logbook:      drivesForWork,
          feature_timesheets:   invoicesClients,
          feature_provisional:  invoicesClients,
          has_ra:               fp.has('ra'),
          has_pension:          fp.has('pension'),
          has_medical:          fp.has('medical'),
          medical_aid_members:  fp.has('medical') ? state.medical_aid_members : 0,
          has_tfsa:             fp.has('tfsa'),
          has_interest_savings: fp.has('interest_savings'),
          tax_year:             state.tax_year,
          invest_enabled:       state.invest_enabled,
          onboarding_complete:  true,
          utm_source:           attribution?.utm_source   ?? null,
          utm_medium:           attribution?.utm_medium   ?? null,
          utm_campaign:         attribution?.utm_campaign ?? null,
          gclid:                attribution?.gclid        ?? null,
          landing_page:         attribution?.landing_page ?? null,
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
      fireSignupConversion()
      router.replace('/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  // ── Save: B2B complete ────────────────────────────────────────────
  async function handleB2BComplete() {
    if (!state.org_name.trim()) { setError(state.user_type === 'practitioner' ? 'Please enter your practice name' : 'Please enter your contracting house name'); return }
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Upsert profile as company_owner / practitioner
      const attribution = readAttributionCookie()
      const { error: profileErr } = await supabase
        .from('klippa_profiles')
        .upsert({
          id:                  user.id,
          user_type:           state.user_type,
          onboarding_complete: true,
          employment_type:     'freelance',  // default, can update in settings
          work_location:       'office_only',
          works_from_home:     false,
          tax_year:            CURRENT_YEAR,
          utm_source:          attribution?.utm_source   ?? null,
          utm_medium:          attribution?.utm_medium   ?? null,
          utm_campaign:        attribution?.utm_campaign ?? null,
          gclid:               attribution?.gclid        ?? null,
          landing_page:        attribution?.landing_page ?? null,
        }, { onConflict: 'id' })

      if (profileErr) throw profileErr

      // Create organisation via API route (needs service role to write + update profile FK)
      const res = await fetch('/api/org/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       state.org_name.trim(),
          org_type:   state.org_type,
          seat_count: state.seat_count,
        }),
      })
      const text = await res.text().catch(() => '')
      let json: { error?: string } = {}
      try { json = JSON.parse(text) } catch { /* non-JSON — leave json empty */ }
      if (json.error) throw new Error(json.error)
      if (!res.ok) throw new Error('Failed to create organisation')

      fireSignupConversion()
      router.replace(state.user_type === 'practitioner' ? '/practice/dashboard' : '/org/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const progressPct = phase === 'b2b' ? 100 : ((step + 1) / totalSteps) * 100

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-base text-ink-1 flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-lg space-y-8">

        {/* ── Phase: pick user type ────────────────────────────────── */}
        {phase === 'pick' && (
          <div className="space-y-8">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight">Klippa</span>
            </div>

            <div className="rounded-2xl border border-edge bg-surface/60 backdrop-blur p-8 shadow-xl space-y-8">
              <div>
                <h2 className="text-xl font-bold">How will you use Klippa?</h2>
                <p className="text-sm text-ink-2 mt-1">Choose the option that best describes you. Your experience is tailored accordingly.</p>
              </div>

              <div className="space-y-3">
                {([
                  {
                    type:  'freelancer' as UserType,
                    icon:  <UserRound className="w-6 h-6 text-emerald-400" />,
                    label: 'Freelancer / Contractor',
                    sub:   'Track my income, expenses, and file my own tax return',
                    badge: null,
                  },
                  {
                    type:  'company_owner' as UserType,
                    icon:  <Users className="w-6 h-6 text-violet-400" />,
                    label: 'Contracting house',
                    sub:   'I place contractors at client companies and manage their billing, pay, and compliance',
                    badge: 'B2B',
                  },
                  {
                    type:  'practitioner' as UserType,
                    icon:  <BookOpen className="w-6 h-6 text-amber-400" />,
                    label: 'Tax Practitioner / Accountant',
                    sub:   "Manage multiple clients' returns from one workspace",
                    badge: 'B2B',
                  },
                ]).map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => {
                      setState((s) => ({ ...s, user_type: opt.type, org_type: opt.type === 'practitioner' ? 'practice' : 'company' }))
                      setStep(0)
                      setPhase(opt.type === 'freelancer' ? 'freelancer' : 'b2b')
                    }}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-edge hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
                  >
                    <div className="flex-shrink-0">{opt.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-ink-1">{opt.label}</p>
                        {opt.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/15 text-violet-300">{opt.badge}</span>
                        )}
                      </div>
                      <p className="text-xs text-ink-2 mt-0.5">{opt.sub}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: B2B (org name step) ───────────────────────────── */}
        {phase === 'b2b' && (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-sm tracking-tight">Klippa</span>
                </div>
                <button
                  onClick={() => {
                    if (step === 0) { setPhase('pick') } else { setStep(0) }
                    setError(null)
                  }}
                  className="text-xs text-ink-2 hover:text-ink-1 transition-colors"
                >
                  ← Back
                </button>
              </div>
              <div className="h-1 rounded-full bg-raised overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: step === 0 ? '50%' : '100%' }} />
              </div>
            </div>

            {/* Step 0 — workspace name */}
            {step === 0 && (
              <div className="rounded-2xl border border-edge bg-surface/60 backdrop-blur p-8 shadow-xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold">
                    {state.user_type === 'practitioner' ? 'Set up your practice' : 'Set up your contracting workspace'}
                  </h2>
                  <p className="text-sm text-ink-2 mt-1">
                    {state.user_type === 'practitioner'
                      ? 'Create your practice workspace. You can invite clients once you\'re in.'
                      : 'Create your placement workspace. You can add clients, create placements, and invite contractors once you\'re in.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink-2">
                    {state.user_type === 'practitioner' ? 'Practice / firm name' : 'Contracting house name'}
                  </label>
                  <input
                    type="text"
                    value={state.org_name}
                    onChange={(e) => setState((s) => ({ ...s, org_name: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && state.org_name.trim()) { setError(null); next() } }}
                    placeholder={state.user_type === 'practitioner' ? 'e.g. Smith & Associates' : 'e.g. Lesedi Contracting'}
                    className="input"
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  onClick={() => { if (!state.org_name.trim()) { setError('Please enter a name'); return } setError(null); next() }}
                  disabled={!state.org_name.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all shadow-lg shadow-emerald-900/30"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 1 — how many seats */}
            {step === 1 && (
              <div className="rounded-2xl border border-edge bg-surface/60 backdrop-blur p-8 shadow-xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold">How many seats do you need?</h2>
                  <p className="text-sm text-ink-2 mt-1">
                    One seat per {state.user_type === 'practitioner' ? 'team member' : 'contractor'} you invite to your workspace.
                    You can change this later. You&apos;ll only pay when you {state.user_type === 'practitioner' ? 'add your first client' : 'invite your first contractor'}.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-6 py-2">
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, seat_count: Math.max(1, s.seat_count - 1) }))}
                    disabled={state.seat_count <= 1}
                    className="w-11 h-11 rounded-xl border border-edge flex items-center justify-center text-ink-1 hover:border-emerald-500/50 disabled:opacity-40 transition-all"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="text-center min-w-[80px]">
                    <p className="text-4xl font-bold tabular-nums">{state.seat_count}</p>
                    <p className="text-xs text-ink-2 mt-0.5">{state.seat_count === 1 ? 'seat' : 'seats'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, seat_count: Math.min(500, s.seat_count + 1) }))}
                    className="w-11 h-11 rounded-xl border border-edge flex items-center justify-center text-ink-1 hover:border-emerald-500/50 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="rounded-xl border border-emerald-600/30 bg-emerald-950/20 px-4 py-3 flex items-center justify-between">
                  <div className="text-xs">
                    <p className="font-semibold text-emerald-300">R {SEAT_PRICE_ANNUAL.toLocaleString('en-ZA')} / seat / year</p>
                    <p className="text-ink-2 mt-0.5">Billed once a year via instant EFT</p>
                  </div>
                  <p className="text-lg font-bold text-ink-1">
                    R {(state.seat_count * SEAT_PRICE_ANNUAL).toLocaleString('en-ZA')}<span className="text-xs font-normal text-ink-2">/yr</span>
                  </p>
                </div>

                {state.user_type === 'practitioner' && (
                  <p className="text-xs text-ink-3">Includes managing up to 50 active clients. Need more? Contact us for enterprise pricing.</p>
                )}

                {error && (
                  <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  onClick={handleB2BComplete}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all shadow-lg shadow-emerald-900/30"
                >
                  {saving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating workspace…</>
                    : <>Create workspace <ArrowRight className="w-4 h-4" /></>
                  }
                </button>
                <p className="text-xs text-ink-3 text-center">No charge today. Set up your workspace first.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Phase: freelancer (existing flow) ───────────────────── */}
        {phase === 'freelancer' && (
          <div className="space-y-8">
            {/* Logo + progress */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-sm tracking-tight">Klippa</span>
                </div>
                <button onClick={back} className="text-xs text-ink-2 hover:text-ink-1 transition-colors">
                  ← Back
                </button>
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
                    <h2 className="text-xl font-bold">What do you do for work?</h2>
                    <p className="text-sm text-ink-2 mt-1">This determines which deductions apply to you.</p>
                  </div>
                  <div className="space-y-3">
                    {([
                      { value: 'freelance' as EmploymentType, label: 'Freelance / Consulting',   sub: 'I work for myself and invoice clients' },
                      { value: 'employee'  as EmploymentType, label: 'Employee',                  sub: 'I receive a salary and employer tax certificate (IRP5)' },
                      { value: 'mixed'     as EmploymentType, label: 'Both (salary + freelance)', sub: 'I have a salary and also freelance income' },
                    ]).map((opt) => (
                      <button key={opt.value}
                        onClick={() => { setState((s) => ({ ...s, employment_type: opt.value })); next() }}
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

              {/* Step 1: Work location */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold">Where do you work from?</h2>
                    <p className="text-sm text-ink-2 mt-1">This affects your home office deduction eligibility.</p>
                  </div>
                  <div className="space-y-3">
                    {([
                      {
                        value: 'home_only' as WorkLocation,
                        icon: <Home className="w-5 h-5 text-emerald-400" />,
                        label: 'Fully Remote',
                        sub: 'I work exclusively from home, eligible for full home office deduction',
                      },
                      {
                        value: 'hybrid' as WorkLocation,
                        icon: <Shuffle className="w-5 h-5 text-amber-400" />,
                        label: 'Hybrid',
                        sub: 'Some days home, some days office. Partial home office deduction may apply.',
                      },
                      {
                        value: 'office_only' as WorkLocation,
                        icon: <Building2 className="w-5 h-5 text-ink-2" />,
                        label: 'Office / On-site',
                        sub: 'I work at a fixed employer or client premises, no home office deduction',
                      },
                    ]).map((opt) => (
                      <button key={opt.value}
                        onClick={() => { setState((s) => ({ ...s, work_location: opt.value })); next() }}
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
                    <h2 className="text-xl font-bold">Do you drive for work?</h2>
                    <p className="text-sm text-ink-2 mt-1 leading-relaxed">Client visits, site trips, and business travel qualify. You&apos;ll keep a logbook of business kilometres to claim this deduction.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { v: true,  icon: <Car className="w-6 h-6 text-emerald-400" />, label: 'Yes, I drive for work' },
                      { v: false, icon: <span className="text-2xl">🚌</span>,         label: "No, I don't drive for work" },
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

              {/* Step 3: Financial products */}
              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold">What money products do you have?</h2>
                    <p className="text-sm text-ink-2 mt-1">Select anything that sounds familiar. Klippa handles the SARS wording later.</p>
                  </div>
                  <div className="space-y-2.5">
                    {([
                      { key: 'ra'               as FinancialProduct, label: 'I pay into my own retirement plan', sub: 'Examples: Allan Gray RA, Sygnia RA, 10X RA, Old Mutual RA.', badge: 'Can reduce tax' },
                      { key: 'pension'          as FinancialProduct, label: 'My employer takes retirement money off my payslip', sub: 'Examples: pension fund, provident fund, company retirement fund.', badge: 'Can reduce tax' },
                      { key: 'medical'          as FinancialProduct, label: 'I pay for medical aid', sub: 'Examples: Discovery, Bonitas, Momentum, Medihelp, Bestmed.', badge: 'Tax credit' },
                      { key: 'tfsa'             as FinancialProduct, label: 'I have a tax-free savings account', sub: 'Examples: EasyEquities TFSA, bank TFSA, Satrix TFSA.', badge: 'Tax-free' },
                      { key: 'interest_savings' as FinancialProduct, label: 'A bank or savings account pays me interest', sub: 'Examples: savings account, fixed deposit, money market, notice account.', badge: 'May be partly tax-free' },
                    ]).map(({ key, label, sub, badge }) => {
                      const selected = state.financial_products.has(key)
                      return (
                        <button key={key} type="button" onClick={() => toggleProduct(key)}
                          className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all ${selected ? 'border-emerald-500/50 bg-emerald-500/8' : 'border-edge hover:border-edge'}`}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${selected ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`}>
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

              {/* Step 4b: Medical aid members (only if medical selected) */}
              {step === 4 && hasMedical && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold">How many people are on your medical aid?</h2>
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

              {/* Step: FINscope Invest opt-in */}
              {((step === 4 && !hasMedical) || step === 5) && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold">Also want to grow money on the JSE?</h2>
                    <p className="text-sm text-ink-2 mt-1 leading-relaxed">
                      FINscope Invest helps you put your Safe-to-Spend to work on the Johannesburg Stock Exchange — with plain-English explanations of every company. You can join now or later from Settings.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => { setState((s) => ({ ...s, invest_enabled: true })); next() }}
                      className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl">📈</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-ink-1">Yes, set me up</p>
                        <p className="text-xs text-ink-2 mt-0.5">Unlock the JSE screener, company analysis, and investment tools</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-500" />
                    </button>
                    <button
                      onClick={() => { setState((s) => ({ ...s, invest_enabled: false })); next() }}
                      className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-edge hover:border-edge/80 hover:bg-raised/30 transition-all group"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-ink-1">Skip for now</p>
                        <p className="text-xs text-ink-2 mt-0.5">You can always enable this later from Settings</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-ink-2" />
                    </button>
                  </div>
                </div>
              )}

              {/* Last step: Tax year */}
              {((step === 5 && !hasMedical) || step === 6) && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold">Which tax year are we filing?</h2>
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

                  {error && (
                    <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
                  )}

                  <button onClick={handleFreelancerComplete} disabled={saving}
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
        )}

      </div>
    </div>
  )
}
