'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, ArrowRight, Loader2,
  UserRound, Users, BookOpen, Minus, Plus,
} from 'lucide-react'
import type { EmploymentType, WorkLocation, UserType } from '@/lib/types'
import { SEAT_PRICE_ANNUAL } from '@/lib/ozow'
import { currentRunningTaxYear } from '@/lib/tax-engine'
import { readAttributionCookie } from '@/lib/attribution'
import { ensureProgressRow, awardXp } from '@/lib/gamification'

const CURRENT_YEAR = new Date().getFullYear()

// ── Phase A: user-type selection ──────────────────────────────────────
// ── Phase B: freelancer flow (one question: employment type) ─────────
// ── Phase C: B2B flow (org name + seats) ─────────────────────────────
type Phase = 'pick' | 'freelancer' | 'b2b'

interface OnboardingState {
  // B2B
  user_type:  UserType
  org_name:   string
  org_type:   'company' | 'practice'
  seat_count: number
  // Freelancer
  employment_type: EmploymentType
}

const DEFAULT_STATE: OnboardingState = {
  user_type:       'freelancer',
  org_name:        '',
  org_type:        'company',
  seat_count:      1,
  employment_type: 'freelance',
}

// Everything the old 6-7-step wizard asked is now defaulted here and
// re-asked contextually later (dashboard quests, Mileage interstitial,
// Settings). The one answer we keep — employment type — picks the best
// guess for where they work; wrong guesses are harmless to the tax
// estimate (home-office deduction needs pct + expenses, both 0) and are
// corrected by the work-location quest.
const WORK_LOCATION_DEFAULT: Record<EmploymentType, WorkLocation> = {
  freelance: 'home_only',
  mixed:     'hybrid',
  employee:  'office_only',
}

// Resume where they left off instead of forcing a full restart if a user
// closes the tab mid-wizard — a multi-step form with no save-as-you-go is
// a common reason people never come back to finish it.
const STORAGE_KEY = 'klippa_onboarding_progress'

function loadSavedProgress(): { phase: Phase; step: number; state: OnboardingState } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const phase: Phase = parsed.phase === 'freelancer' || parsed.phase === 'b2b' ? parsed.phase : 'pick'
    const step = typeof parsed.step === 'number' ? parsed.step : 0
    return {
      phase,
      // The freelancer flow is now a single screen — progress saved mid-way
      // through the old multi-step wizard resumes at its one question.
      step: phase === 'freelancer' ? 0 : step,
      state: {
        user_type:       parsed.state?.user_type === 'company_owner' || parsed.state?.user_type === 'practitioner' ? parsed.state.user_type : 'freelancer',
        org_name:        typeof parsed.state?.org_name === 'string' ? parsed.state.org_name : '',
        org_type:        parsed.state?.org_type === 'practice' ? 'practice' : 'company',
        seat_count:      typeof parsed.state?.seat_count === 'number' ? parsed.state.seat_count : 1,
        employment_type: ['freelance', 'employee', 'mixed'].includes(parsed.state?.employment_type) ? parsed.state.employment_type : 'freelance',
      },
    }
  } catch {
    return null
  }
}

export default function OnboardingPage() {
  const router   = useRouter()
  const [phase,  setPhase]  = useState<Phase>(() => loadSavedProgress()?.phase ?? 'pick')
  const [step,   setStep]   = useState(() => loadSavedProgress()?.step ?? 0)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  // Which employment option was tapped — shows the spinner on that card
  const [savingType, setSavingType] = useState<EmploymentType | null>(null)

  const [state, setState] = useState<OnboardingState>(() => loadSavedProgress()?.state ?? DEFAULT_STATE)

  // Save progress after every change so a refresh or a later visit resumes
  // here instead of back at the "how will you use Klippa?" screen.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ phase, step, state }))
  }, [phase, step, state])

  function next() { setStep((s) => s + 1) }

  // ── Save: freelancer complete — fires on the employment-type tap ───
  async function handleFreelancerComplete(empType: EmploymentType) {
    if (saving) return
    setSaving(true); setSavingType(empType); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const work_location   = WORK_LOCATION_DEFAULT[empType]
      const works_from_home = work_location !== 'office_only'
      // Independent consultants who invoice (freelance / mixed) get
      // timesheets + provisional tax; the vehicle/logbook question is
      // deferred to a dashboard quest, so Mileage starts hidden.
      const invoicesClients = empType === 'freelance' || empType === 'mixed'
      const tax_year        = currentRunningTaxYear()
      const attribution     = readAttributionCookie()

      const { error: profileErr } = await supabase
        .from('klippa_profiles')
        .upsert({
          id:                   user.id,
          user_type:            'freelancer',
          employment_type:      empType,
          work_location,
          works_from_home,
          has_vehicle:          false,
          feature_logbook:      false,
          feature_timesheets:   invoicesClients,
          feature_provisional:  invoicesClients,
          has_ra:               false,
          has_pension:          false,
          has_medical:          false,
          medical_aid_members:  0,
          has_tfsa:             false,
          has_interest_savings: false,
          tax_year,
          invest_enabled:       false,
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
          tax_year,
          return_type: 'ITR12',
          status:      'draft',
        }, { onConflict: 'user_id,tax_year,return_type' })

      if (returnErr) throw returnErr

      // Gamification: seed the progress row and award the first XP.
      // Best-effort — a failure here must never block getting them in.
      await ensureProgressRow(user.id)
      await awardXp(user.id, 'onboarding_complete')

      if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
      router.replace('/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
      setSavingType(null)
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

      if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
      router.replace(state.user_type === 'practitioner' ? '/practice/dashboard' : '/org/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const trackYear = currentRunningTaxYear()

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

            {/* Why we're asking — sets expectations before the questions start */}
            <p className="text-sm text-ink-2 leading-relaxed">
              Welcome to Klippa. We&apos;ll work out what SARS owes you — or what you owe them — based on your income and expenses. First, two quick taps to set up your profile.
            </p>

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

        {/* ── Phase: freelancer — one question, then straight in ───── */}
        {phase === 'freelancer' && (
          <div className="space-y-8">
            {/* Logo + back */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-sm tracking-tight">Klippa</span>
                </div>
                <button
                  onClick={() => { if (!saving) { setPhase('pick'); setError(null) } }}
                  className="text-xs text-ink-2 hover:text-ink-1 transition-colors"
                >
                  ← Back
                </button>
              </div>
              <p className="text-xs text-ink-2">One quick question</p>
            </div>

            <div className="rounded-2xl border border-edge bg-surface/60 backdrop-blur p-8 shadow-xl space-y-6">
              <div>
                <h2 className="text-xl font-bold">What do you do for work?</h2>
                <p className="text-sm text-ink-2 mt-1">This decides which SARS deductions we chase for you. That&apos;s it — everything else we ask only when it matters.</p>
              </div>
              <div className="space-y-3">
                {([
                  { value: 'freelance' as EmploymentType, label: 'Freelance / Consulting',   sub: 'I work for myself and invoice clients' },
                  { value: 'employee'  as EmploymentType, label: 'Employee',                  sub: 'I receive a salary and employer tax certificate (IRP5)' },
                  { value: 'mixed'     as EmploymentType, label: 'Both (salary + freelance)', sub: 'I have a salary and also freelance income' },
                ]).map((opt) => (
                  <button key={opt.value}
                    onClick={() => { setState((s) => ({ ...s, employment_type: opt.value })); handleFreelancerComplete(opt.value) }}
                    disabled={saving}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-edge hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:opacity-60 transition-all group">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink-1">{opt.label}</p>
                      <p className="text-xs text-ink-2 mt-0.5">{opt.sub}</p>
                    </div>
                    {savingType === opt.value
                      ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500 ml-auto" />
                      : <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-500 ml-auto" />
                    }
                  </button>
                ))}
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
              )}

              <p className="text-xs text-ink-3">
                We&apos;ll track tax year {trackYear} (1 Mar {trackYear - 1} – 28 Feb {trackYear}). Filing for last year? Switch anytime in Settings.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
