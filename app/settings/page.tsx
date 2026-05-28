'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import { ShieldCheck, Loader2, Check, Save } from 'lucide-react'
import type { KlippaProfile, EmploymentType, WorkLocation } from '@/lib/types'
import { WORK_LOCATION_LABELS } from '@/lib/types'

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  freelance: 'Freelance / Consulting',
  employee:  'Employee (salary)',
  mixed:     'Both (salary + freelance)',
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<KlippaProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('klippa_profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          setProfile(data as KlippaProfile | null)
          setLoading(false)
        })
    })
  }, [])

  const update = <K extends keyof KlippaProfile>(key: K, value: KlippaProfile[K]) => {
    setProfile((p) => p ? { ...p, [key]: value } : p)
    setSaved(false)
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    setError(null)

    // Keep works_from_home in sync with work_location
    const works_from_home = profile.work_location !== 'office_only'

    const { error: err } = await supabase
      .from('klippa_profiles')
      .update({
        full_name:            profile.full_name,
        home_suburb:          profile.home_suburb || null,
        work_suburb:          profile.work_suburb || null,
        commute_km:           profile.commute_km ?? 0,
        office_mon:           profile.office_mon,
        office_tue:           profile.office_tue,
        office_wed:           profile.office_wed,
        office_thu:           profile.office_thu,
        office_fri:           profile.office_fri,
        opening_odometer:     profile.opening_odometer ?? 0,
        vehicle_make:         profile.vehicle_make || null,
        vehicle_model:        profile.vehicle_model || null,
        vehicle_year:         profile.vehicle_year || null,
        logbook_reminder:     profile.logbook_reminder ?? 'weekly',
        employment_type:      profile.employment_type,
        work_location:        profile.work_location,
        works_from_home,
        home_office_pct:      profile.home_office_pct,
        has_vehicle:          profile.has_vehicle,
        vehicle_value:        profile.vehicle_value,
        has_ra:               profile.has_ra,
        ra_contributions:     profile.ra_contributions ?? 0,
        has_pension:          profile.has_pension,
        pension_contributions: profile.pension_contributions,
        has_medical:          profile.has_medical,
        medical_aid_members:  profile.medical_aid_members,
        has_tfsa:             profile.has_tfsa,
        has_interest_savings: profile.has_interest_savings,
        date_of_birth:        profile.date_of_birth || null,
      })
      .eq('id', profile.id)

    if (err) setError(err.message)
    else setSaved(true)
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
    </div>
  )

  if (!profile) return null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <div className="ml-auto"><UserNav /></div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <h1 className="text-xl font-bold text-white">Tax profile settings</h1>
          <p className="text-sm text-zinc-500 mt-1">These details drive your tax calculations and deduction eligibility.</p>
        </div>

        {/* ── Identity ── */}
        <Section title="Identity">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Full name</label>
            <input type="text" value={profile.full_name ?? ''} onChange={(e) => update('full_name', e.target.value)}
              placeholder="Your name as on your ID" className="input w-full" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Date of birth <span className="text-zinc-600">(affects rebate tier + interest exemption)</span></label>
            <input type="date" value={profile.date_of_birth ?? ''} onChange={(e) => update('date_of_birth', e.target.value)}
              className="input w-full" />
          </div>
        </Section>

        {/* ── Work situation ── */}
        <Section title="Work situation">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Employment type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(EMPLOYMENT_LABELS) as [EmploymentType, string][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => update('employment_type', k)}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${profile.employment_type === k ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Where do you work?</label>
            <div className="space-y-2">
              {(Object.entries(WORK_LOCATION_LABELS) as [WorkLocation, string][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => update('work_location', k)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition-all ${profile.work_location === k ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${profile.work_location === k ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'}`}>
                    {profile.work_location === k && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {profile.work_location !== 'office_only' && (
            <div className="pl-4 space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Home office % (area used for work)</label>
              <div className="flex items-center gap-2">
                <input type="range" min={5} max={50} step={5} value={profile.home_office_pct}
                  onChange={(e) => update('home_office_pct', parseFloat(e.target.value))} className="flex-1" />
                <span className="text-sm font-medium text-zinc-200 w-12 text-right">{profile.home_office_pct}%</span>
              </div>
              {profile.work_location === 'hybrid' && (
                <p className="text-xs text-amber-400/80">Hybrid workers: SARS requires the room to be used exclusively for work. The % should reflect the room&apos;s area as a fraction of your home.</p>
              )}
            </div>
          )}
        </Section>

        {/* ── Filing year ── */}
        <Section title="Filing year">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Tax year</label>
            <select value={profile.tax_year} onChange={(e) => update('tax_year', parseInt(e.target.value))} className="input w-full">
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <option key={y} value={y}>Tax year {y}</option>
              ))}
            </select>
          </div>
        </Section>

        {/* ── Commute & logbook ── */}
        <Section title="Commute & logbook">
          <p className="text-xs text-zinc-500 -mt-2">
            Set this up once. Klippa will auto-build your logbook each week and ask you to confirm it.
          </p>

          {/* Home & work locations */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Home suburb / area</label>
              <input type="text" value={profile.home_suburb ?? ''} onChange={(e) => update('home_suburb', e.target.value)}
                placeholder="e.g. Sandton" className="input w-full" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Regular business location</label>
              <input type="text" value={profile.work_suburb ?? ''} onChange={(e) => update('work_suburb', e.target.value)}
                placeholder="e.g. Rosebank / Client offices" className="input w-full" />
            </div>
          </div>

          {/* Commute distance */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">One-way distance (km)</label>
            <input type="number" min={0} step={0.5} value={profile.commute_km ?? 0}
              onChange={(e) => update('commute_km', parseFloat(e.target.value) || 0)}
              placeholder="e.g. 18" className="input w-full" />
            <p className="text-xs text-zinc-600">Look this up once on Google Maps. Klippa uses it for every auto-generated trip.</p>
          </div>

          {/* Office days */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Days per week at your regular business location</label>
            <div className="flex gap-2">
              {([
                { key: 'office_mon', label: 'Mon' },
                { key: 'office_tue', label: 'Tue' },
                { key: 'office_wed', label: 'Wed' },
                { key: 'office_thu', label: 'Thu' },
                { key: 'office_fri', label: 'Fri' },
              ] as { key: keyof KlippaProfile; label: string }[]).map(({ key, label }) => (
                <button key={key} type="button"
                  onClick={() => update(key, !profile[key])}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${profile[key] ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600">Days not selected are treated as home/remote days in your logbook.</p>
          </div>

          {/* Opening odometer */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Opening odometer at start of tax year (km)</label>
            <input type="number" min={0} step={1} value={profile.opening_odometer ?? 0}
              onChange={(e) => update('opening_odometer', parseInt(e.target.value) || 0)}
              placeholder="e.g. 48250" className="input w-full" />
            <p className="text-xs text-zinc-600">SARS requires the odometer reading at the start and end of the tax year.</p>
          </div>

          {/* Logbook reminder */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Logbook review reminders</label>
            <div className="flex gap-2">
              {(['weekly', 'monthly', 'none'] as const).map((opt) => (
                <button key={opt} type="button"
                  onClick={() => update('logbook_reminder', opt)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${profile.logbook_reminder === opt ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Vehicle ── */}
        <Section title="Vehicle & travel">
          <ToggleRow label="I drive for work" sub="Enables travel deduction based on SARS fixed-cost table"
            value={profile.has_vehicle} onChange={(v) => update('has_vehicle', v)} />
          {profile.has_vehicle && (
            <div className="pl-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Make</label>
                  <input type="text" value={profile.vehicle_make ?? ''} onChange={(e) => update('vehicle_make', e.target.value)}
                    placeholder="e.g. Toyota" className="input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Model</label>
                  <input type="text" value={profile.vehicle_model ?? ''} onChange={(e) => update('vehicle_model', e.target.value)}
                    placeholder="e.g. Corolla" className="input w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Year</label>
                  <input type="number" min={2000} max={2030} value={profile.vehicle_year ?? new Date().getFullYear()}
                    onChange={(e) => update('vehicle_year', parseInt(e.target.value) || null as unknown as number)}
                    placeholder="2022" className="input w-full" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Purchase value (incl. VAT)</label>
                <input type="number" min={0} step={1000} value={profile.vehicle_value ?? 0}
                  onChange={(e) => update('vehicle_value', parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 350000" className="input w-full" />
                <p className="text-xs text-zinc-600">Used to look up the SARS fixed-cost table for your travel deduction rate.</p>
              </div>
            </div>
          )}
        </Section>

        {/* ── Retirement savings ── */}
        <Section title="Retirement savings (Section 11F)">
          <ToggleRow label="I have a Retirement Annuity (RA)" sub="Contributions deductible up to 27.5% of income or R350,000"
            value={profile.has_ra} onChange={(v) => update('has_ra', v)} />
          {profile.has_ra && (
            <div className="pl-4 space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Annual RA contributions (R)</label>
              <input type="number" min={0} step={100} value={profile.ra_contributions ?? 0}
                onChange={(e) => update('ra_contributions', parseFloat(e.target.value) || 0)}
                placeholder="0.00" className="input w-full" />
              <p className="text-xs text-zinc-600">Your deduction is capped at the lesser of this amount, 27.5% of income, or R350,000.</p>
            </div>
          )}
          <ToggleRow label="I contribute to a Pension Fund" sub="Combined with RA under Section 11F deduction"
            value={profile.has_pension} onChange={(v) => update('has_pension', v)} />
          {profile.has_pension && (
            <div className="pl-4 space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Annual pension fund contributions (R)</label>
              <input type="number" min={0} step={100} value={profile.pension_contributions ?? 0}
                onChange={(e) => update('pension_contributions', parseFloat(e.target.value) || 0)}
                placeholder="0.00" className="input w-full" />
            </div>
          )}
        </Section>

        {/* ── Medical aid ── */}
        <Section title="Medical aid (Section 6A credits)">
          <ToggleRow label="I have medical aid" sub="Monthly tax credits reduce what you owe SARS directly"
            value={profile.has_medical} onChange={(v) => update('has_medical', v)} />
          {profile.has_medical && (
            <div className="pl-4 space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Members on medical aid (including yourself)</label>
              <select value={profile.medical_aid_members} onChange={(e) => update('medical_aid_members', parseInt(e.target.value))} className="input w-full">
                {[1,2,3,4,5,6].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Just me' : `${n} members`} — credit R{(n <= 2 ? n * 364 : 2 * 364 + (n - 2) * 246) * 12}/yr
                  </option>
                ))}
              </select>
            </div>
          )}
        </Section>

        {/* ── Savings & investments ── */}
        <Section title="Savings & investments">
          <ToggleRow label="Tax-Free Savings Account (TFSA)" sub="Returns are tax-free — annual limit R36,000, lifetime R500,000"
            value={profile.has_tfsa} onChange={(v) => update('has_tfsa', v)} />
          <ToggleRow label="Interest-bearing savings account" sub={`Interest exemption: R23,800/yr (under 65) or R34,500/yr (65+)`}
            value={profile.has_interest_savings} onChange={(v) => update('has_interest_savings', v)} />
        </Section>

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
      {children}
    </div>
  )
}

function ToggleRow({ label, sub, value, onChange }: {
  label:    string
  sub:      string
  value:    boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
      </div>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}
