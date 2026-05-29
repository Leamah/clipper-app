'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Check, Save, AlertCircle, ChevronRight, Info } from 'lucide-react'
import type { KlippaProfile, EmploymentType, WorkLocation } from '@/lib/types'
import { WORK_LOCATION_LABELS } from '@/lib/types'

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  freelance: 'Freelance / Consulting',
  employee:  'Employee (salary)',
  mixed:     'Both (salary + freelance)',
}

const MONTHS = [
  { v: '01', l: 'January' }, { v: '02', l: 'February' }, { v: '03', l: 'March' },
  { v: '04', l: 'April' },   { v: '05', l: 'May' },       { v: '06', l: 'June' },
  { v: '07', l: 'July' },    { v: '08', l: 'August' },    { v: '09', l: 'September' },
  { v: '10', l: 'October' }, { v: '11', l: 'November' }, { v: '12', l: 'December' },
]

// ── Number input that shows empty when value is 0 ─────────
function NumInput({ value, onChange, min = 0, step = 1, placeholder = '0' }: {
  value:     number
  onChange:  (v: number) => void
  min?:      number
  step?:     number
  placeholder?: string
}) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value))

  // Sync when parent resets
  useEffect(() => {
    setRaw(value === 0 ? '' : String(value))
  }, [value])

  return (
    <input
      type="number"
      className="input w-full"
      value={raw}
      min={min}
      step={step}
      placeholder={placeholder}
      onChange={(e) => {
        setRaw(e.target.value)
        const n = parseFloat(e.target.value)
        if (!isNaN(n)) onChange(n)
      }}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        if (raw === '' || isNaN(parseFloat(raw))) {
          setRaw('')
          onChange(0)
        }
      }}
    />
  )
}

// ── Date of birth: three selects ─────────────────────────
function DobPicker({ value, onChange }: {
  value:    string | null
  onChange: (v: string | null) => void
}) {
  const parts  = value ? value.split('-') : ['', '', '']
  const [yr,  setYr]  = useState(parts[0] ?? '')
  const [mo,  setMo]  = useState(parts[1] ?? '')
  const [day, setDay] = useState(parts[2] ?? '')

  const emit = useCallback((y: string, m: string, d: string) => {
    if (y && m && d) {
      onChange(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
    } else {
      onChange(null)
    }
  }, [onChange])

  const currentYear   = new Date().getFullYear()
  const years         = Array.from({ length: currentYear - 1929 }, (_, i) => String(currentYear - i))
  const daysInMonth   = yr && mo ? new Date(parseInt(yr), parseInt(mo), 0).getDate() : 31
  const days          = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))

  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={day} onChange={(e) => { setDay(e.target.value); emit(yr, mo, e.target.value) }} className="input">
        <option value="">Day</option>
        {days.map((d) => <option key={d} value={d}>{parseInt(d)}</option>)}
      </select>
      <select value={mo} onChange={(e) => { setMo(e.target.value); emit(yr, e.target.value, day) }} className="input">
        <option value="">Month</option>
        {MONTHS.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select value={yr} onChange={(e) => { setYr(e.target.value); emit(e.target.value, mo, day) }} className="input">
        <option value="">Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}

// ── Toggle row — full row is the tap target ───────────────
function ToggleRow({ label, sub, value, onChange, impact }: {
  label:    string
  sub:      string
  value:    boolean
  onChange: (v: boolean) => void
  impact?:  string
}) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between gap-4 py-3 text-left group">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 group-hover:text-white transition-colors">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{sub}</p>
        {impact && !value && (
          <p className="text-xs text-emerald-500/70 mt-1">{impact}</p>
        )}
      </div>
      {/* Bigger toggle: w-12 h-6 */}
      <div className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-0'}`} />
      </div>
    </button>
  )
}

// ── Section wrapper ────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-5">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
        {hint && <p className="text-xs text-zinc-600 mt-1">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-600 leading-relaxed">{hint}</p>}
    </div>
  )
}

// ── Profile completeness nudges ───────────────────────────
function ProfileNudges({ profile }: { profile: KlippaProfile }) {
  type Nudge = { type: 'warn' | 'tip'; text: string }
  const nudges: Nudge[] = []

  if (!profile.date_of_birth) {
    nudges.push({ type: 'tip', text: 'Add your date of birth — affects rebate tier if you are 65 or older' })
  }
  if (profile.has_ra && (profile.ra_contributions ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'RA is switched on but no amount entered — your Section 11F deduction is R0' })
  }
  if (profile.has_pension && (profile.pension_contributions ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Pension fund is switched on but no contribution amount entered' })
  }
  if (profile.has_vehicle && (profile.vehicle_value ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Vehicle travel is switched on but no purchase value entered — travel deduction will be R0' })
  }
  if (profile.has_vehicle && (profile.commute_km ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Vehicle enabled but commute distance is 0 — logbook auto-generation is off' })
  }
  if (!profile.has_ra && !profile.has_pension) {
    nudges.push({ type: 'tip', text: 'Do you pay into a Retirement Annuity or pension? This is usually the biggest single deduction for self-employed people' })
  }
  if (!profile.has_medical) {
    nudges.push({ type: 'tip', text: 'Medical aid? SARS gives you a direct tax credit (not just a deduction) — worth up to R4,368/yr for a single member' })
  }
  if (!profile.has_vehicle && profile.employment_type !== 'employee') {
    nudges.push({ type: 'tip', text: 'If you drive for work, enable vehicle travel — SARS allows a fixed-cost deduction based on your car value and km driven' })
  }
  if (profile.works_from_home && (profile.home_expenses_annual ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Works from home is on but annual home running costs are R0 — your home office deduction will be R0. Enter your annual bond interest/rent + rates + electricity + levies below.' })
  }

  if (nudges.length === 0) return null

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        <p className="text-xs font-semibold text-zinc-300">Things to check on your profile</p>
      </div>
      <div className="space-y-2">
        {nudges.map((n, i) => (
          <div key={i} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 ${
            n.type === 'warn'
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              : 'bg-zinc-800/60 text-zinc-400'
          }`}>
            {n.type === 'warn'
              ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
              : <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-500" />
            }
            {n.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────

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

    const works_from_home = profile.work_location !== 'office_only'

    const { error: err } = await supabase
      .from('klippa_profiles')
      .update({
        full_name:             profile.full_name,
        date_of_birth:         profile.date_of_birth || null,
        employment_type:       profile.employment_type,
        work_location:         profile.work_location,
        works_from_home,
        home_office_pct:       profile.home_office_pct,
        home_expenses_annual:  profile.home_expenses_annual ?? 0,
        // Commute & logbook
        home_suburb:           profile.home_suburb || null,
        work_suburb:           profile.work_suburb || null,
        commute_km:            profile.commute_km ?? 0,
        office_mon:            profile.office_mon,
        office_tue:            profile.office_tue,
        office_wed:            profile.office_wed,
        office_thu:            profile.office_thu,
        office_fri:            profile.office_fri,
        opening_odometer:      profile.opening_odometer ?? 0,
        closing_odometer:      profile.closing_odometer ?? 0,
        logbook_reminder:      profile.logbook_reminder ?? 'weekly',
        // Vehicle
        has_vehicle:           profile.has_vehicle,
        vehicle_make:          profile.vehicle_make || null,
        vehicle_model:         profile.vehicle_model || null,
        vehicle_year:          profile.vehicle_year || null,
        vehicle_value:         profile.vehicle_value ?? 0,
        // Retirement
        has_ra:                profile.has_ra,
        ra_contributions:      profile.ra_contributions ?? 0,
        has_pension:           profile.has_pension,
        pension_contributions: profile.pension_contributions ?? 0,
        // Medical
        has_medical:           profile.has_medical,
        medical_aid_members:   profile.medical_aid_members,
        // Savings
        has_tfsa:              profile.has_tfsa,
        has_interest_savings:  profile.has_interest_savings,
      })
      .eq('id', profile.id)

    if (err) setError(err.message)
    else setSaved(true)
    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
    </div>
  )

  if (!profile) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Tax profile</h1>
          <p className="text-sm text-zinc-500 mt-1">The more complete this is, the more accurate your tax calculation.</p>
        </div>

        {/* Smart nudges */}
        <ProfileNudges profile={profile} />

        {/* ── Personal details ── */}
        <Section title="Personal details">
          <Field label="Full name">
            <input type="text" value={profile.full_name ?? ''} onChange={(e) => update('full_name', e.target.value)}
              placeholder="Your name as on your ID" className="input w-full" />
          </Field>

          <Field label="Date of birth" hint="Used to apply the correct SARS rebate — only matters if you are 65 or older.">
            <DobPicker value={profile.date_of_birth} onChange={(v) => update('date_of_birth', v as KlippaProfile['date_of_birth'])} />
          </Field>
        </Section>

        {/* ── Work situation ── */}
        <Section title="Work situation" hint="Determines which deductions apply to you.">
          <Field label="Employment type">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.entries(EMPLOYMENT_LABELS) as [EmploymentType, string][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => update('employment_type', k)}
                  className={`py-3 rounded-xl text-xs font-semibold transition-all ${profile.employment_type === k ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {v}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Where do you primarily work?">
            <div className="space-y-2">
              {(Object.entries(WORK_LOCATION_LABELS) as [WorkLocation, string][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => update('work_location', k)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${profile.work_location === k ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${profile.work_location === k ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'}`} />
                  {v}
                </button>
              ))}
            </div>
          </Field>

          {profile.work_location !== 'office_only' && (
            <div className="pl-2 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Home office % <span className="text-zinc-600">(floor area used for work)</span></label>
                <div className="flex items-center gap-3">
                  <input type="range" min={5} max={50} step={5} value={profile.home_office_pct}
                    onChange={(e) => update('home_office_pct', parseFloat(e.target.value))} className="flex-1 accent-emerald-500" />
                  <span className="text-sm font-bold text-zinc-100 w-10 text-right tabular-nums">{profile.home_office_pct}%</span>
                </div>
                {profile.work_location === 'hybrid' && (
                  <p className="text-xs text-amber-400/80">Hybrid workers: SARS requires the room to be used exclusively for work.</p>
                )}
              </div>
              <Field label="Annual home running costs (R)" hint="Bond interest or rent + rates + electricity + levies for the full year. Klippa multiplies this by your home office % to calculate your deduction.">
                <NumInput value={profile.home_expenses_annual ?? 0} onChange={(v) => update('home_expenses_annual', v)} step={1000} placeholder="e.g. 120000" />
              </Field>
            </div>
          )}
        </Section>

        {/* ── Retirement savings ── */}
        <Section title="Retirement savings" hint="Section 11F — often the biggest single deduction for self-employed people.">
          <ToggleRow
            label="I contribute to a Retirement Annuity (RA)"
            sub="Up to 27.5% of income or R350,000 per year, whichever is lower"
            impact="Switch on to unlock — could save you R10,000+ in tax depending on income"
            value={profile.has_ra} onChange={(v) => update('has_ra', v)}
          />
          {profile.has_ra && (
            <div className="pl-2 space-y-1.5">
              <Field label="Annual RA contributions (R)" hint="Check your latest statement from your RA provider.">
                <NumInput value={profile.ra_contributions ?? 0} onChange={(v) => update('ra_contributions', v)} step={500} placeholder="e.g. 36000" />
              </Field>
            </div>
          )}

          <ToggleRow
            label="I contribute to an employer pension or provident fund"
            sub="Combined with RA under Section 11F"
            value={profile.has_pension} onChange={(v) => update('has_pension', v)}
          />
          {profile.has_pension && (
            <div className="pl-2">
              <Field label="Annual pension / provident fund contributions (R)">
                <NumInput value={profile.pension_contributions ?? 0} onChange={(v) => update('pension_contributions', v)} step={500} placeholder="e.g. 24000" />
              </Field>
            </div>
          )}
        </Section>

        {/* ── Medical aid ── */}
        <Section title="Medical aid" hint="Section 6A credits come directly off what you owe SARS — not just a deduction.">
          <ToggleRow
            label="I have medical aid"
            sub="R364/month credit for first 2 members, R246 each additional member"
            impact="Switch on — a single-member plan saves R4,368/yr off your actual tax bill"
            value={profile.has_medical} onChange={(v) => update('has_medical', v)}
          />
          {profile.has_medical && (
            <div className="pl-2">
              <Field label="Members on medical aid (including yourself)">
                <select value={profile.medical_aid_members ?? 1} onChange={(e) => update('medical_aid_members', parseInt(e.target.value))} className="input w-full">
                  {[1,2,3,4,5,6].map((n) => {
                    const credit = (n <= 2 ? n * 364 : 2 * 364 + (n - 2) * 246) * 12
                    return (
                      <option key={n} value={n}>
                        {n === 1 ? 'Just me' : `${n} members`} — R{credit.toLocaleString('en-ZA')}/yr credit
                      </option>
                    )
                  })}
                </select>
              </Field>
            </div>
          )}
        </Section>

        {/* ── Vehicle & travel ── */}
        <Section title="Vehicle & travel" hint="SARS allows a fixed-cost travel deduction based on your vehicle value and business km driven.">
          <ToggleRow
            label="I use my vehicle for work"
            sub="Enables the SARS fixed-cost travel deduction — requires a logbook"
            impact="Switch on if you drive to clients, sites, or a regular office location"
            value={profile.has_vehicle} onChange={(v) => update('has_vehicle', v)}
          />
          {profile.has_vehicle && (
            <div className="pl-2 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Make">
                  <input type="text" value={profile.vehicle_make ?? ''} onChange={(e) => update('vehicle_make', e.target.value)}
                    placeholder="Toyota" className="input w-full" />
                </Field>
                <Field label="Model">
                  <input type="text" value={profile.vehicle_model ?? ''} onChange={(e) => update('vehicle_model', e.target.value)}
                    placeholder="Corolla" className="input w-full" />
                </Field>
                <Field label="Year">
                  <NumInput value={profile.vehicle_year ?? 0} onChange={(v) => update('vehicle_year', v as KlippaProfile['vehicle_year'])} min={2000} step={1} placeholder={String(new Date().getFullYear())} />
                </Field>
              </div>
              <Field label="Purchase price (incl. VAT)" hint="Used to look up the SARS fixed-cost rate table. Check your registration papers.">
                <NumInput value={profile.vehicle_value ?? 0} onChange={(v) => update('vehicle_value', v)} step={5000} placeholder="e.g. 350000" />
              </Field>
            </div>
          )}
        </Section>

        {/* ── Commute & logbook ── */}
        <Section title="Logbook setup" hint="Set this up once. Klippa auto-fills your logbook each week — you just confirm it.">
          <Field label="Home suburb or area">
            <input type="text" value={profile.home_suburb ?? ''} onChange={(e) => update('home_suburb', e.target.value)}
              placeholder="e.g. Midrand" className="input w-full" />
          </Field>

          <Field label="Regular business destination (suburb or description)">
            <input type="text" value={profile.work_suburb ?? ''} onChange={(e) => update('work_suburb', e.target.value)}
              placeholder="e.g. Rosebank office / Client sites across JHB" className="input w-full" />
          </Field>

          <Field label="One-way distance (km)" hint="Look this up once on Google Maps. Klippa multiplies by 2 for each return trip.">
            <NumInput value={profile.commute_km ?? 0} onChange={(v) => update('commute_km', v)} step={0.5} placeholder="e.g. 18" />
          </Field>

          <Field label="Which days do you travel to this location?">
            <div className="grid grid-cols-5 gap-2">
              {([
                { key: 'office_mon', label: 'Mon' },
                { key: 'office_tue', label: 'Tue' },
                { key: 'office_wed', label: 'Wed' },
                { key: 'office_thu', label: 'Thu' },
                { key: 'office_fri', label: 'Fri' },
              ] as { key: keyof KlippaProfile; label: string }[]).map(({ key, label }) => (
                <button key={key} type="button"
                  onClick={() => update(key, !profile[key])}
                  className={`py-3 rounded-xl text-xs font-semibold transition-all ${profile[key] ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-1.5">Unticked days are treated as home / remote in your logbook.</p>
          </Field>

          <Field label="Opening odometer (km at the start of this tax year)" hint="SARS needs this for your logbook. Check your vehicle's odometer on 1 March.">
            <NumInput value={profile.opening_odometer ?? 0} onChange={(v) => update('opening_odometer', v)} step={10} placeholder="e.g. 48250" />
          </Field>

          <Field label="Closing odometer (km at 28 February — end of tax year)" hint="Required for SARS logbook. Total km driven this tax year = closing − opening odometer.">
            <NumInput value={profile.closing_odometer ?? 0} onChange={(v) => update('closing_odometer', v)} step={10} placeholder="e.g. 64500" />
          </Field>

          <Field label="Logbook review reminders">
            <div className="grid grid-cols-3 gap-2">
              {(['weekly', 'monthly', 'none'] as const).map((opt) => (
                <button key={opt} type="button"
                  onClick={() => update('logbook_reminder', opt)}
                  className={`py-3 rounded-xl text-xs font-semibold capitalize transition-all ${profile.logbook_reminder === opt ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {opt === 'none' ? 'Off' : opt}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* ── Savings & investments ── */}
        <Section title="Savings & investments">
          <ToggleRow
            label="Tax-Free Savings Account (TFSA)"
            sub="Returns are tax-free — annual limit R36,000, lifetime R500,000"
            value={profile.has_tfsa} onChange={(v) => update('has_tfsa', v)}
          />
          <ToggleRow
            label="Interest-bearing savings / fixed deposit"
            sub="Exemption: R23,800/yr under 65, or R34,500/yr if 65 or older"
            value={profile.has_interest_savings} onChange={(v) => update('has_interest_savings', v)}
          />
        </Section>

        {/* ── Filing year ── */}
        <Section title="Filing year">
          <Field label="Tax year">
            <select value={profile.tax_year} onChange={(e) => update('tax_year', parseInt(e.target.value))} className="input w-full">
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <option key={y} value={y}>Tax year {y} (Mar {y - 1} — Feb {y})</option>
              ))}
            </select>
          </Field>
        </Section>

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center gap-3 pb-8">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400">
              <Check className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
    </div>
  )
}
