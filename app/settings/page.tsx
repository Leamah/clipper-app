'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import { ShieldCheck, Loader2, Check, Save } from 'lucide-react'
import type { KlippaProfile, EmploymentType } from '@/lib/types'

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
    const { error: err } = await supabase
      .from('klippa_profiles')
      .update({
        employment_type:  profile.employment_type,
        works_from_home:  profile.works_from_home,
        home_office_pct:  profile.home_office_pct,
        has_vehicle:      profile.has_vehicle,
        has_ra:           profile.has_ra,
        full_name:        profile.full_name,
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
          <p className="text-sm text-zinc-500 mt-1">These details affect your tax calculations and deduction eligibility.</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Full name</label>
            <input
              type="text"
              value={profile.full_name ?? ''}
              onChange={(e) => update('full_name', e.target.value)}
              placeholder="Your name as on your ID"
              className="input w-full"
            />
          </div>

          {/* Employment type */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Employment type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(EMPLOYMENT_LABELS) as [EmploymentType, string][]).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => update('employment_type', k)}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                    profile.employment_type === k
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Tax year */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Filing tax year</label>
            <select
              value={profile.tax_year}
              onChange={(e) => update('tax_year', parseInt(e.target.value))}
              className="input w-full"
            >
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <option key={y} value={y}>Tax year {y}</option>
              ))}
            </select>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <ToggleRow
              label="I work from home"
              sub="Enables home office deduction calculation"
              value={profile.works_from_home}
              onChange={(v) => update('works_from_home', v)}
            />
            {profile.works_from_home && (
              <div className="pl-4 space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Home office % (area used for work)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={profile.home_office_pct}
                    onChange={(e) => update('home_office_pct', parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-zinc-200 w-12 text-right">{profile.home_office_pct}%</span>
                </div>
              </div>
            )}
            <ToggleRow
              label="I drive for work"
              sub="Enables vehicle travel deduction"
              value={profile.has_vehicle}
              onChange={(v) => update('has_vehicle', v)}
            />
            <ToggleRow
              label="I have a Retirement Annuity (RA)"
              sub="Enables Section 11F RA deduction"
              value={profile.has_ra}
              onChange={(v) => update('has_ra', v)}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 transition-all"
          >
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

function ToggleRow({ label, sub, value, onChange }: {
  label:    string
  sub:      string
  value:    boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-emerald-600' : 'bg-zinc-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

