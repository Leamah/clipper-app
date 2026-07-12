'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Check, Save, AlertCircle, ChevronRight, Info, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
function ToggleRow({ label, sub, value, onChange, impact, disabled }: {
  label:     string
  sub:       string
  value:     boolean
  onChange:  (v: boolean) => void
  impact?:   string
  disabled?: boolean
}) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!value)}
      className={`w-full flex items-center justify-between gap-4 py-3 text-left group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-1 group-hover:text-ink-1 transition-colors">{label}</p>
        <p className="text-xs text-ink-2 mt-0.5 leading-snug">{sub}</p>
        {impact && !value && (
          <p className="text-xs text-emerald-500/70 mt-1">{impact}</p>
        )}
      </div>
      {/* Bigger toggle: w-12 h-6 */}
      <div className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-emerald-600' : 'bg-edge'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-0'}`} />
      </div>
    </button>
  )
}

// ── Section wrapper ────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-5">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-2">{title}</h2>
        {hint && <p className="text-xs text-ink-3 mt-1">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-ink-2">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-3 leading-relaxed">{hint}</p>}
    </div>
  )
}

// ── Profile completeness nudges ───────────────────────────
function ProfileNudges({ profile }: { profile: KlippaProfile }) {
  type Nudge = { type: 'warn' | 'tip'; text: string }
  const nudges: Nudge[] = []

  if (!profile.date_of_birth) {
    nudges.push({ type: 'tip', text: 'Add your date of birth (affects rebate tier if you are 65 or older)' })
  }
  if (profile.has_ra && (profile.ra_contributions ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'RA is switched on but no amount entered, so your Section 11F deduction is R0' })
  }
  if (profile.has_pension && (profile.pension_contributions ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Pension fund is switched on but no contribution amount entered' })
  }
  if (profile.has_vehicle && (profile.vehicle_value ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Vehicle travel is switched on but no purchase value entered, so your travel deduction will be R0' })
  }
  if (profile.has_vehicle && (profile.commute_km ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Vehicle enabled but commute distance is 0, so logbook auto-generation is off' })
  }
  if (!profile.has_ra && !profile.has_pension) {
    nudges.push({ type: 'tip', text: 'Do you pay into a Retirement Annuity or pension? This is usually the biggest single deduction for self-employed people' })
  }
  if (!profile.has_medical) {
    nudges.push({ type: 'tip', text: 'Medical aid? SARS gives you a direct tax credit (not just a deduction), worth up to R4,368/yr for a single member' })
  }
  if (!profile.has_vehicle && profile.employment_type !== 'employee') {
    nudges.push({ type: 'tip', text: 'If you drive for work, enable vehicle travel. SARS allows a fixed-cost deduction based on your car value and km driven.' })
  }
  if (profile.works_from_home && (profile.home_expenses_annual ?? 0) === 0) {
    nudges.push({ type: 'warn', text: 'Works from home is on but annual home running costs are R0, so your home office deduction will be R0. Enter your annual bond interest/rent + rates + electricity + levies below.' })
  }

  if (nudges.length === 0) return null

  return (
    <div className="rounded-2xl border border-edge bg-surface/30 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-ink-2 flex-shrink-0" />
        <p className="text-xs font-semibold text-ink-1">Things to check on your profile</p>
      </div>
      <div className="space-y-2">
        {nudges.map((n, i) => (
          <div key={i} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 ${
            n.type === 'warn'
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              : 'bg-raised/60 text-ink-2'
          }`}>
            {n.type === 'warn'
              ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
              : <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ink-2" />
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
  const router = useRouter()

  const [profile, setProfile] = useState<KlippaProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Delete account state
  const [showDeleteZone,  setShowDeleteZone]  = useState(false)
  const [deleteConfirm,   setDeleteConfirm]   = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteError,     setDeleteError]     = useState<string | null>(null)

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

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return
    setDeletingAccount(true)
    setDeleteError(null)
    try {
      const r = await fetch('/api/account/delete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirm: 'DELETE' }),
      })
      const d = await r.json()
      if (!r.ok) {
        setDeleteError(d.error ?? 'Failed to delete account')
        setDeletingAccount(false)
        return
      }
      // Sign out then redirect to home — auth session is now gone
      await supabase.auth.signOut()
      router.replace('/')
    } catch {
      setDeleteError('Could not reach server. Please try again.')
      setDeletingAccount(false)
    }
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
        tax_number:            profile.tax_number || null,
        id_number:             profile.id_number || null,
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
        has_vehicle:              profile.has_vehicle,
        vehicle_make:             profile.vehicle_make || null,
        vehicle_model:            profile.vehicle_model || null,
        vehicle_year:             profile.vehicle_year || null,
        vehicle_value:            profile.vehicle_value ?? 0,
        vehicle_registration:     profile.vehicle_registration || null,
        vehicle_purchase_date:    profile.vehicle_purchase_date || null,
        // Feature flags
        feature_timesheets:       profile.feature_timesheets ?? false,
        feature_logbook:          profile.feature_logbook ?? true,
        feature_provisional:      profile.feature_provisional ?? false,
        invest_enabled:           profile.invest_enabled ?? false,
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
      <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
    </div>
  )

  if (!profile) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-ink-1">Tax profile</h1>
          <p className="text-sm text-ink-2 mt-1">The more complete this is, the more accurate your tax calculation.</p>
        </div>

        {/* Smart nudges */}
        <ProfileNudges profile={profile} />

        {/* ── Personal details ── */}
        <Section title="Personal details">
          <Field label="Full name">
            <input type="text" value={profile.full_name ?? ''} onChange={(e) => update('full_name', e.target.value)}
              placeholder="Your name as on your ID" className="input w-full" />
          </Field>

          <Field label="Date of birth" hint="Used to apply the correct SARS rebate (only matters if you are 65 or older).">
            <DobPicker value={profile.date_of_birth} onChange={(v) => update('date_of_birth', v as KlippaProfile['date_of_birth'])} />
          </Field>

          <Field label="SARS tax number" hint="On your IRP5, eFiling profile, or any SARS letter.">
            <input type="text" inputMode="numeric" value={profile.tax_number ?? ''} onChange={(e) => update('tax_number', e.target.value)}
              placeholder="e.g. 0123456789" className="input w-full" />
          </Field>

          <Field label="ID number" hint="Your 13-digit South African ID number — needed for your ITR12.">
            <input type="text" inputMode="numeric" value={profile.id_number ?? ''} onChange={(e) => update('id_number', e.target.value)}
              placeholder="e.g. 9001015009087" className="input w-full" />
          </Field>
        </Section>

        {/* ── Work situation ── */}
        <Section title="Work situation" hint="Determines which deductions apply to you.">
          <Field label="Employment type">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.entries(EMPLOYMENT_LABELS) as [EmploymentType, string][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => update('employment_type', k)}
                  className={`py-3 rounded-xl text-xs font-semibold transition-all ${profile.employment_type === k ? 'bg-emerald-600 text-white' : 'bg-raised text-ink-2 hover:bg-edge'}`}>
                  {v}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Where do you primarily work?">
            <div className="space-y-2">
              {(Object.entries(WORK_LOCATION_LABELS) as [WorkLocation, string][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => update('work_location', k)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${profile.work_location === k ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-edge text-ink-2 hover:border-edge hover:text-ink-1'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${profile.work_location === k ? 'border-emerald-500 bg-emerald-500' : 'border-edge'}`} />
                  {v}
                </button>
              ))}
            </div>
          </Field>

          {profile.work_location !== 'office_only' && (
            <div className="pl-2 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-2">Home office % <span className="text-ink-3">(floor area used for work)</span></label>
                <div className="flex items-center gap-3">
                  <input type="range" min={5} max={50} step={5} value={profile.home_office_pct}
                    onChange={(e) => update('home_office_pct', parseFloat(e.target.value))} className="flex-1 accent-emerald-500" />
                  <span className="text-sm font-bold text-ink-1 w-10 text-right tabular-nums">{profile.home_office_pct}%</span>
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
        <Section title="Retirement savings" hint="Section 11F: often the biggest single deduction for self-employed people.">
          <ToggleRow
            label="I pay into my own retirement plan"
            sub="Examples: Allan Gray RA, Sygnia RA, 10X RA, Old Mutual RA"
            impact="Switch on to unlock. Could save you R10,000+ in tax depending on income."
            value={profile.has_ra} onChange={(v) => update('has_ra', v)}
          />
          {profile.has_ra && (
            <div className="pl-2 space-y-1.5">
              <Field label="Total paid this tax year (R)" hint="Check your latest certificate or statement from the retirement provider.">
                <NumInput value={profile.ra_contributions ?? 0} onChange={(v) => update('ra_contributions', v)} step={500} placeholder="e.g. 36000" />
              </Field>
            </div>
          )}

          <ToggleRow
            label="My employer takes retirement money off my payslip"
            sub="Examples: pension fund, provident fund, company retirement fund"
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
        <Section title="Medical aid" hint="Section 6A credits come directly off what you owe SARS, not just a deduction.">
          <ToggleRow
            label="I have medical aid"
            sub="R364/month credit for first 2 members, R246 each additional member"
            impact="Switch on. A single-member plan saves R4,368/yr off your actual tax bill."
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
                        {n === 1 ? 'Just me' : `${n} members`}, R{credit.toLocaleString('en-ZA')}/yr credit
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
            sub="Enables the SARS fixed-cost travel deduction (requires a logbook)"
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
              <div className="grid grid-cols-2 gap-2">
                <Field label="Registration number" hint="e.g. GP 123-456, printed on your logbook PDF.">
                  <input
                    type="text"
                    value={profile.vehicle_registration ?? ''}
                    onChange={(e) => update('vehicle_registration', e.target.value || null)}
                    placeholder="e.g. GP 123-456"
                    className="input w-full"
                  />
                </Field>
                <Field label="Purchase date" hint="From your registration certificate.">
                  <input
                    type="date"
                    value={profile.vehicle_purchase_date ?? ''}
                    onChange={(e) => update('vehicle_purchase_date', e.target.value || null)}
                    className="input w-full"
                  />
                </Field>
              </div>
            </div>
          )}
        </Section>

        {/* ── Commute & logbook ── */}
        <Section title="Logbook setup" hint="Set this up once. Klippa auto-fills your logbook each week and you just confirm it.">
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
                  className={`py-3 rounded-xl text-xs font-semibold transition-all ${profile[key] ? 'bg-emerald-600 text-white' : 'bg-raised text-ink-2 hover:bg-edge'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-3 mt-1.5">Unticked days are treated as home / remote in your logbook.</p>
          </Field>

          <Field label="Opening odometer (km at the start of this tax year)" hint="SARS needs this for your logbook. Check your vehicle's odometer on 1 March.">
            <NumInput value={profile.opening_odometer ?? 0} onChange={(v) => update('opening_odometer', v)} step={10} placeholder="e.g. 48250" />
          </Field>

          <Field label="Closing odometer (km at 28 February, end of tax year)" hint="Required for SARS logbook. Total km driven this tax year = closing minus opening odometer.">
            <NumInput value={profile.closing_odometer ?? 0} onChange={(v) => update('closing_odometer', v)} step={10} placeholder="e.g. 64500" />
          </Field>

          <Field label="Logbook review reminders">
            <div className="grid grid-cols-3 gap-2">
              {(['weekly', 'monthly', 'none'] as const).map((opt) => (
                <button key={opt} type="button"
                  onClick={() => update('logbook_reminder', opt)}
                  className={`py-3 rounded-xl text-xs font-semibold capitalize transition-all ${profile.logbook_reminder === opt ? 'bg-emerald-600 text-white' : 'bg-raised text-ink-2 hover:bg-edge'}`}>
                  {opt === 'none' ? 'Off' : opt}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* ── Savings & investments ── */}
        <Section title="Savings & investments">
          <ToggleRow
            label="I have a tax-free savings account"
            sub="Examples: EasyEquities TFSA, bank TFSA, Satrix TFSA. Growth is usually tax-free."
            value={profile.has_tfsa} onChange={(v) => update('has_tfsa', v)}
          />
          <ToggleRow
            label="A bank or savings account pays me interest"
            sub="Examples: savings account, fixed deposit, money market, notice account"
            value={profile.has_interest_savings} onChange={(v) => update('has_interest_savings', v)}
          />
        </Section>

        {/* ── Features ── */}
        <Section title="Features" hint="Enable the modules that apply to your work. Unused features stay out of your navigation.">
          <ToggleRow
            label="Timesheets"
            sub="Track billable hours per client and export professional timecards to PDF"
            impact="Useful if you bill clients by the hour: consultants, contractors, developers"
            value={profile.feature_timesheets ?? false}
            onChange={(v) => update('feature_timesheets', v)}
          />
          <ToggleRow
            label="Mileage Logbook"
            sub="Maintain a SARS-compliant vehicle logbook with auto-generated weekly entries"
            value={profile.feature_logbook ?? true}
            onChange={(v) => update('feature_logbook', v)}
          />
          <ToggleRow
            label="Provisional Tax (IRP6)"
            sub="Track your bi-annual IRP6 payment deadlines and amounts"
            impact="Recommended if you are freelance or self-employed and earn more than R30,000/year after deductions"
            value={profile.feature_provisional ?? false}
            onChange={(v) => update('feature_provisional', v)}
          />
        </Section>

        {/* ── Invest & Portfolio ── */}
        {profile.user_type === 'freelancer' && (
          <Section title="Invest &amp; Portfolio" hint="FINscope Invest helps you put your Safe-to-Spend to work on the JSE with AI-powered company analysis.">
            <ToggleRow
              label="FINscope Invest"
              sub="Unlock JSE company screener, philosophy-driven picks, portfolio tracker, and SENS alerts"
              impact={!profile.feature_invest_basic ? 'Upgrade your plan to unlock FINscope Invest' : undefined}
              value={profile.invest_enabled ?? false}
              onChange={(v) => update('invest_enabled', v)}
              disabled={!profile.feature_invest_basic}
            />
            {profile.invest_enabled && !profile.feature_invest_full && (
              <p className="text-xs text-ink-3 mt-1 pl-1">
                You have Basic Invest (screener + Buffett). <a href="/subscription" className="text-emerald-500 hover:underline">Upgrade to Starter</a> for full access — all 13 modules, SENS alerts, and portfolio builder.
              </p>
            )}
          </Section>
        )}

        {/* ── Filing year ── */}
        <Section title="Filing year">
          <Field label="Tax year">
            <select value={profile.tax_year} onChange={(e) => update('tax_year', parseInt(e.target.value))} className="input w-full">
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <option key={y} value={y}>Tax year {y} (Mar {y - 1} to Feb {y})</option>
              ))}
            </select>
          </Field>
        </Section>

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center gap-3 pb-4">
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

        {/* ── Danger zone ── */}
        <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-6 space-y-4 pb-8">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-red-400">Danger zone</h2>
            <p className="text-xs text-ink-3 mt-1">These actions are permanent and cannot be undone.</p>
          </div>

          {/* Manage subscription link */}
          <div className="flex items-center justify-between py-3 border-b border-red-900/20">
            <div>
              <p className="text-sm text-ink-1">Manage subscription</p>
              <p className="text-xs text-ink-3 mt-0.5">Upgrade, downgrade or cancel your plan.</p>
            </div>
            <a
              href="/subscription"
              className="px-3 py-1.5 rounded-lg border border-edge text-xs text-ink-2 hover:text-ink-1 hover:border-zinc-500 transition-colors"
            >
              Go to billing →
            </a>
          </div>

          {/* Delete account */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-1">Delete account</p>
                <p className="text-xs text-ink-3 mt-0.5">
                  Permanently deletes all your data: expenses, income, timesheets, documents and your profile.
                </p>
              </div>
              <button
                onClick={() => { setShowDeleteZone(v => !v); setDeleteConfirm(''); setDeleteError(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-800/50 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>

            {showDeleteZone && (
              <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4 space-y-3">
                <p className="text-xs text-red-300/90 leading-relaxed">
                  This will <strong>immediately and permanently</strong> delete your account, all uploaded documents,
                  all financial records and your login. There is no recovery.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs text-ink-2">
                    Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 transition-colors"
                    autoComplete="off"
                  />
                </div>
                {deleteError && (
                  <p className="text-xs text-red-400">{deleteError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDeleteZone(false); setDeleteConfirm('') }}
                    className="flex-1 py-2 rounded-xl text-xs font-medium border border-edge text-ink-2 hover:text-ink-1 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirm !== 'DELETE' || deletingAccount}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 transition-colors"
                  >
                    {deletingAccount
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…</>
                      : <><Trash2 className="w-3.5 h-3.5" /> Delete my account</>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

    </div>
  )
}
