'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  Car, Plus, Trash2, Loader2, X, Check,
  Download, FileText, AlertCircle, ChevronRight, ChevronDown,
  Calendar, CheckCircle2, Clock, MapPin
} from 'lucide-react'
import type { KlippaMileageTrip, KlippaProfile, KlippaLogbookReview, OrgBranding } from '@/lib/types'
import { calcTravelDeduction } from '@/lib/tax-engine'
import { awardXp } from '@/lib/gamification'
import {
  format, addDays, startOfWeek, endOfWeek, addWeeks,
  isAfter, isBefore, getISOWeek, getISOWeekYear, parseISO,
} from 'date-fns'

// ── Date helpers ─────────────────────────────────────────

function getWeekKey(date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function getTaxYearStart(taxYear: number): Date {
  return new Date(taxYear - 1, 2, 1) // March 1 of previous calendar year
}

function fmtDate(d: Date): string {
  return format(d, 'd MMM yyyy')
}
function fmtShort(d: Date): string {
  return format(d, 'EEE d MMM')
}

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}

// ── Types ────────────────────────────────────────────────

interface DayReview {
  date:     Date
  dayNum:   number   // 1=Mon..5=Fri
  selected: boolean  // user wants to count this trip
  purpose:  string
  from:     string
  to:       string
  km:       number
}

interface WeekInfo {
  key:   string
  start: Date
  end:   Date
  days:  DayReview[]
}

type OfficeKey = 'office_mon' | 'office_tue' | 'office_wed' | 'office_thu' | 'office_fri'
const OFFICE_KEYS: OfficeKey[] = ['office_mon', 'office_tue', 'office_wed', 'office_thu', 'office_fri']

function buildWeekDays(weekStart: Date, profile: KlippaProfile): DayReview[] {
  return OFFICE_KEYS.map((key, i) => ({
    date:     addDays(weekStart, i),
    dayNum:   i + 1,
    selected: profile[key] as boolean,
    purpose:  'Business commute',
    from:     profile.home_suburb ?? 'Home',
    to:       profile.work_suburb ?? 'Office',
    km:       profile.commute_km ?? 0,
  }))
}

function getPendingWeeks(
  taxYear: number,
  reviewedSet: Set<string>,
  profile: KlippaProfile,
): WeekInfo[] {
  const taxStart = getTaxYearStart(taxYear)
  const today    = new Date()
  // Go back one full week so current week is always in review, not pending
  const cutoff   = startOfWeek(today, { weekStartsOn: 1 })

  const pending: WeekInfo[] = []
  let ws = startOfWeek(taxStart, { weekStartsOn: 1 })

  while (isBefore(ws, cutoff)) {
    const key = getWeekKey(ws)
    if (!reviewedSet.has(key)) {
      pending.push({
        key,
        start: ws,
        end:   endOfWeek(ws, { weekStartsOn: 1 }),
        days:  buildWeekDays(ws, profile),
      })
    }
    ws = addWeeks(ws, 1)
  }

  return pending.reverse() // most recent first
}

// ── Main page ────────────────────────────────────────────

export default function MileagePage() {
  const [profile,      setProfile]      = useState<KlippaProfile | null>(null)
  const [trips,        setTrips]        = useState<KlippaMileageTrip[]>([])
  const [reviews,      setReviews]      = useState<KlippaLogbookReview[]>([])
  const [taxReturnId,  setTaxReturnId]  = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [openWeekKey,  setOpenWeekKey]  = useState<string | null>(null)
  const [showAddTrip,  setShowAddTrip]  = useState(false)
  const [confirming,   setConfirming]   = useState(false)
  const [orgBranding,  setOrgBranding]  = useState<OrgBranding | null>(null)
  // null = loading; false = the deferred onboarding question is still open
  const [vehicleAnswered, setVehicleAnswered] = useState<boolean | null>(null)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, returnRes, tripsRes, reviewsRes, vehicleEvRes] = await Promise.all([
      supabase.from('klippa_profiles').select('*').eq('id', user.id).single(),
      supabase.from('klippa_tax_returns').select('id, tax_year').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single(),
      supabase.from('klippa_mileage_trips').select('*').eq('user_id', user.id).order('trip_date', { ascending: false }),
      supabase.from('klippa_logbook_reviews').select('*').eq('user_id', user.id),
      supabase.from('klippa_xp_events').select('event_key').eq('user_id', user.id).eq('event_key', 'answered_vehicle').maybeSingle(),
    ])

    const prof = profileRes.data as KlippaProfile | null
    // Answered if the quest event exists, or the (pre-quest) profile already
    // says they drive — only genuinely-unasked users see the interstitial.
    setVehicleAnswered(!!vehicleEvRes.data || !!prof?.has_vehicle)
    setProfile(prof)
    setTaxReturnId(returnRes.data?.id ?? null)
    setTrips((tripsRes.data ?? []) as KlippaMileageTrip[])
    setReviews((reviewsRes.data ?? []) as KlippaLogbookReview[])
    setLoading(false)

    // Fetch org branding if user belongs to an org
    if ((prof as (KlippaProfile & { organisation_id?: string }) | null)?.organisation_id) {
      const res  = await fetch('/api/org/settings')
      const json = await res.json()
      if (json.org) {
        setOrgBranding({
          orgName:    json.org.name,
          brandColor: json.org.brand_color ?? '#10b981',
          logoUrl:    json.org.logo_url    ?? null,
        })
      }
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Deferred onboarding question, asked here at the moment it matters
  async function answerVehicle(drives: boolean) {
    if (!profile) return
    await supabase.from('klippa_profiles')
      .update({ has_vehicle: drives, feature_logbook: drives })
      .eq('id', profile.id)
    awardXp(profile.id, 'answered_vehicle')
    setProfile((p) => p ? { ...p, has_vehicle: drives, feature_logbook: drives } : p)
    setVehicleAnswered(true)
  }

  const isConfigured = !!(
    profile?.commute_km &&
    profile.commute_km > 0 &&
    (profile.office_mon || profile.office_tue || profile.office_wed || profile.office_thu || profile.office_fri)
  )

  const taxYear      = profile?.tax_year ?? new Date().getFullYear()
  const reviewedSet  = new Set(reviews.map((r) => r.review_week))
  const pendingWeeks = isConfigured && profile
    ? getPendingWeeks(taxYear, reviewedSet, profile)
    : []

  // Stats
  const businessTrips     = trips.filter((t) => t.trip_type === 'business')
  const totalBusinessKm   = businessTrips.reduce((s, t) => s + t.distance_km, 0)
  const totalAllKm        = trips.reduce((s, t) => s + t.distance_km, 0)
  const vehicleValue      = profile?.vehicle_value ?? 0
  const travelDeduction   = calcTravelDeduction(totalBusinessKm, Math.max(totalAllKm, totalBusinessKm), vehicleValue)

  // ── Confirm a week ─────────────────────────────────────
  const confirmWeek = async (week: WeekInfo, days: DayReview[]) => {
    if (!profile) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setConfirming(true)

    const selected = days.filter((d) => d.selected && d.km > 0)
    const totalKm  = selected.reduce((s, d) => s + d.km * 2, 0) // return trip

    // Insert confirmed trips
    if (selected.length > 0) {
      const rows = selected.map((d) => ({
        user_id:          user.id,
        tax_return_id:    taxReturnId,
        trip_date:        format(d.date, 'yyyy-MM-dd'),
        start_location:   d.from,
        end_location:     d.to,
        distance_km:      d.km * 2, // return trip
        purpose:          d.purpose,
        trip_type:        'business',
        review_week:      week.key,
      }))
      await supabase.from('klippa_mileage_trips').insert(rows)
    }

    // Mark week as reviewed
    await supabase.from('klippa_logbook_reviews').upsert({
      user_id:          user.id,
      review_week:      week.key,
      trips_confirmed:  selected.length,
      km_confirmed:     totalKm,
      reviewed_at:      new Date().toISOString(),
    }, { onConflict: 'user_id,review_week' })

    setConfirming(false)
    setOpenWeekKey(null)
    loadData()
  }

  // ── Delete trip ──────────────────────────────────────────
  const deleteTrip = async (id: string) => {
    await supabase.from('klippa_mileage_trips').delete().eq('id', id)
    setTrips((t) => t.filter((x) => x.id !== id))
  }

  // ── CSV export ────────────────────────────────────────────
  const exportLogbook = () => {
    const header = 'Date,From,To,Return trip km,Purpose,Type'
    const rows   = trips.map((t) => [
      t.trip_date,
      `"${t.start_location ?? ''}"`,
      `"${t.end_location ?? ''}"`,
      t.distance_km,
      `"${t.purpose}"`,
      t.trip_type,
    ].join(','))
    const csv  = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `klippa_logbook_${taxYear}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
      </div>
    )
  }

  const featureFlags = {
    timesheets:  profile?.feature_timesheets  ?? false,
    logbook:     profile?.feature_logbook     ?? true,
    provisional: profile?.feature_provisional ?? false,
  }

  async function handleExportSARSPDF() {
    if (!profile) return
    const { exportLogbookPDF } = await import('@/lib/pdf-export')
    await exportLogbookPDF(profile, trips, taxYear, orgBranding ?? undefined)
  }

  return (
    <div className="app-shell bg-base text-ink-1">
      <AppNav activePage="mileage" featureFlags={featureFlags} logbookPending={pendingWeeks.length} />

      {/* Action bar below nav */}
      {isConfigured && (
        <div className="border-b border-edge/40 bg-base/60">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-2">
            <span className="text-xs text-ink-2 mr-auto">Mileage Logbook, Tax Year {taxYear}</span>
            <button onClick={exportLogbook} disabled={trips.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:border-edge hover:text-ink-1 disabled:opacity-40 transition-all">
              <Download className="w-3 h-3" /> CSV
            </button>
            <button onClick={handleExportSARSPDF} disabled={trips.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:border-edge hover:text-ink-1 disabled:opacity-40 transition-all">
              <FileText className="w-3 h-3" /> SARS Logbook PDF
            </button>
            <button onClick={() => setShowAddTrip(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add trip
            </button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Vehicle question (deferred from onboarding) ─── */}
        {vehicleAnswered === false && !profile?.has_vehicle && (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto">
              <Car className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-ink-1">Do you drive for work?</p>
              <p className="text-sm text-ink-2 mt-1 max-w-md mx-auto">
                Client visits and site trips are one of the biggest freelancer deductions.
                Klippa keeps the SARS logbook for you.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => answerVehicle(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all">
                Yes, I drive for work
              </button>
              <button onClick={() => answerVehicle(false)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-edge text-ink-2 hover:text-ink-1 text-sm font-medium transition-all">
                No, I don&apos;t
              </button>
            </div>
          </div>
        )}

        {/* ── Answered no: nothing to do here ─────────────── */}
        {vehicleAnswered === true && !profile?.has_vehicle && (
          <div className="rounded-2xl border border-edge bg-surface/30 p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-ink-1">No logbook needed</p>
            <p className="text-sm text-ink-2">You told us you don&apos;t drive for work, so there&apos;s nothing to track here. Changed jobs or started driving? Flip it on in Settings.</p>
          </div>
        )}

        {/* ── Not configured ──────────────────────────────── */}
        {vehicleAnswered !== false && profile?.has_vehicle && !isConfigured && (
          <div className="rounded-2xl border border-amber-600/30 bg-amber-950/20 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto">
              <Car className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-amber-200">Set up your commute once</p>
              <p className="text-sm text-ink-2 mt-1 max-w-md mx-auto">
                Tell Klippa where you live, where you work, and which days you commute.
                We&apos;ll auto-build your SARS logbook and send you weekly or monthly
                reminders to confirm it.
              </p>
            </div>
            <Link href="/settings"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all">
              Set up in Settings <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* ── Stats (only when configured) ────────────────── */}
        {isConfigured && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Business km" value={`${totalBusinessKm.toFixed(0)} km`} />
              <StatCard label="Trips confirmed" value={String(businessTrips.length)} />
              <StatCard label="Est. deduction" value={formatRand(travelDeduction)} accent />
              <StatCard label={`Weeks reviewed`} value={`${reviews.length}`} />
            </div>

            {/* Commute summary */}
            <div className="rounded-xl border border-edge bg-surface/30 p-4 flex flex-wrap gap-4 text-xs text-ink-2">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-ink-2" />
                {profile?.home_suburb ?? 'Home'} → {profile?.work_suburb ?? 'Office'}
              </span>
              <span className="flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-ink-2" />
                {(profile?.commute_km ?? 0) * 2} km return
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-ink-2" />
                {[
                  profile?.office_mon && 'Mon',
                  profile?.office_tue && 'Tue',
                  profile?.office_wed && 'Wed',
                  profile?.office_thu && 'Thu',
                  profile?.office_fri && 'Fri',
                ].filter(Boolean).join(', ')}
              </span>
              <Link href="/settings" className="text-emerald-400 hover:text-emerald-300 transition-colors ml-auto">Edit setup</Link>
            </div>

            {/* ── Pending review ──────────────────────────────── */}
            {pendingWeeks.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <p className="text-sm font-semibold text-amber-200">
                    {pendingWeeks.length} {pendingWeeks.length === 1 ? 'week needs' : 'weeks need'} your review
                  </p>
                  <span className="text-xs text-ink-2">Confirm which days you drove for business</span>
                </div>

                {pendingWeeks.map((week) => (
                  <WeekReviewCard
                    key={week.key}
                    week={week}
                    open={openWeekKey === week.key}
                    confirming={confirming}
                    onToggle={() => setOpenWeekKey((k) => k === week.key ? null : week.key)}
                    onConfirm={(days) => confirmWeek(week, days)}
                  />
                ))}
              </div>
            )}

            {pendingWeeks.length === 0 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-200 font-medium">Logbook is up to date</p>
                <span className="text-xs text-ink-2">All weeks confirmed through last week</span>
              </div>
            )}

            {/* ── Confirmed trips table ────────────────────────── */}
            {trips.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink-2">Confirmed logbook</p>
                  <p className="text-xs text-ink-3">{trips.length} trips · {totalAllKm.toFixed(0)} km total</p>
                </div>
                <div className="rounded-2xl border border-edge bg-surface/40 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead>
                        <tr className="border-b border-edge text-ink-2">
                          <th className="text-left px-4 py-3 font-medium">Date</th>
                          <th className="text-left px-4 py-3 font-medium">Route</th>
                          <th className="text-left px-4 py-3 font-medium">Purpose</th>
                          <th className="text-right px-4 py-3 font-medium">km</th>
                          <th className="text-center px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {trips.map((t) => (
                          <tr key={t.id} className="border-b border-edge/50 hover:bg-raised/20 transition-colors">
                            <td className="px-4 py-3 text-ink-1 whitespace-nowrap">
                              {format(parseISO(t.trip_date), 'd MMM yyyy')}
                            </td>
                            <td className="px-4 py-3">
                              {t.start_location || t.end_location ? (
                                <span className="text-ink-2">{t.start_location ?? '?'} → {t.end_location ?? '?'}</span>
                              ) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className="px-4 py-3 text-ink-2 max-w-[200px] truncate">{t.purpose}</td>
                            <td className="px-4 py-3 text-right font-medium text-ink-1 tabular-nums">{t.distance_km}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                t.trip_type === 'business' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-edge text-ink-2'
                              }`}>
                                {t.trip_type}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => deleteTrip(t.id)} className="p-1 text-ink-3 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-raised/30">
                          <td colSpan={3} className="px-4 py-3 text-xs text-ink-2 font-medium">Total business km</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-ink-1 tabular-nums">{totalBusinessKm.toFixed(0)}</td>
                          <td colSpan={2} className="px-4 py-3 text-xs text-emerald-400 font-semibold text-right pr-8">
                            Est. {formatRand(travelDeduction)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SARS logbook note */}
            <div className="rounded-xl border border-edge bg-surface/30 p-4 flex items-start gap-3">
              <FileText className="w-4 h-4 text-ink-2 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-ink-2 space-y-1">
                <p className="font-medium text-ink-2">SARS logbook requirements</p>
                <p>Your logbook must record: date, start and end point, distance, and business purpose for every trip.
                  Keep the logbook for 5 years after submission. Click <strong className="text-ink-1">Export CSV</strong> to
                  download a SARS-compatible version. You will also need your opening and closing odometer readings for the tax year.</p>
              </div>
            </div>
          </>
        )}
      </main>

      {showAddTrip && profile && (
        <AddTripModal
          lastOdometerEnd={trips.find(t => t.odometer_end != null)?.odometer_end ?? profile.opening_odometer ?? undefined}
          taxReturnId={taxReturnId}
          profile={profile}
          onClose={() => setShowAddTrip(false)}
          onSaved={(trip) => { setTrips((t) => [trip, ...t]); setShowAddTrip(false) }}
        />
      )}
    </div>
  )
}

// ── Week review card ──────────────────────────────────────

function WeekReviewCard({
  week, open, confirming, onToggle, onConfirm,
}: {
  week:       WeekInfo
  open:       boolean
  confirming: boolean
  onToggle:   () => void
  onConfirm:  (days: DayReview[]) => void
}) {
  const [days, setDays] = useState<DayReview[]>(week.days)

  const selectedCount = days.filter((d) => d.selected).length
  const totalKm       = days.filter((d) => d.selected).reduce((s, d) => s + d.km * 2, 0)

  const toggleDay = (i: number) => {
    setDays((prev) => prev.map((d, idx) => idx === i ? { ...d, selected: !d.selected } : d))
  }
  const updatePurpose = (i: number, purpose: string) => {
    setDays((prev) => prev.map((d, idx) => idx === i ? { ...d, purpose } : d))
  }

  return (
    <div className="rounded-2xl border border-edge bg-surface/40 overflow-hidden">
      {/* Header — click to expand */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-raised/30 transition-colors text-left">
        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${open ? 'border-emerald-500' : 'border-edge'}`}>
          {open && <div className="w-full h-full rounded-full bg-emerald-500/50" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-ink-1">
            {fmtDate(week.start)} to {fmtDate(week.end)}
          </p>
          <p className="text-xs text-ink-2 mt-0.5">
            {selectedCount > 0
              ? `${selectedCount} trips auto-detected · ${totalKm} km (return)`
              : 'No office days scheduled this week'}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-edge px-4 py-4 space-y-4">
          <p className="text-xs text-ink-2">
            Klippa auto-detected these trips based on your schedule. Uncheck days you didn&apos;t drive.
            Change the purpose if a day was a client visit rather than a regular commute.
          </p>

          <div className="space-y-2">
            {days.map((d, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                d.selected ? 'border-emerald-600/40 bg-emerald-950/20' : 'border-edge bg-surface/30 opacity-60'
              }`}>
                {/* Day toggle */}
                <button onClick={() => toggleDay(i)}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    d.selected ? 'border-emerald-500 bg-emerald-500' : 'border-edge'
                  }`}>
                  {d.selected && <Check className="w-3 h-3 text-white" />}
                </button>

                {/* Day label */}
                <p className="text-xs font-medium text-ink-1 w-20 flex-shrink-0">{fmtShort(d.date)}</p>

                {/* Route */}
                {d.selected ? (
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-ink-2">{d.from} → {d.to} · <span className="text-ink-1">{d.km * 2} km return</span></p>
                    <input
                      type="text"
                      value={d.purpose}
                      onChange={(e) => updatePurpose(i, e.target.value)}
                      className="w-full bg-raised/60 border border-edge rounded-lg px-2.5 py-1.5 text-xs text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60"
                      placeholder="Purpose (e.g. Business commute)"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-ink-3 flex-1">Stayed home / not a scheduled day</p>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between text-xs text-ink-2 pt-1 border-t border-edge">
            <span>{selectedCount} trips · {totalKm} km (return)</span>
            <div className="flex gap-2">
              <button
                onClick={() => onConfirm(days.map((d) => ({ ...d, selected: false })))}
                disabled={confirming}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors disabled:opacity-50">
                No trips this week
              </button>
              <button
                onClick={() => onConfirm(days)}
                disabled={confirming}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50">
                {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Confirm week
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-edge bg-surface/40 p-4">
      <p className="text-xs text-ink-2 mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${accent ? 'text-emerald-400' : 'text-ink-1'}`}>{value}</p>
    </div>
  )
}

// ── Add trip modal (for ad-hoc client visits) ─────────────

function AddTripModal({ taxReturnId, profile, onClose, onSaved, lastOdometerEnd }: {
  taxReturnId:      string | null
  profile:          KlippaProfile
  onClose:          () => void
  onSaved:          (trip: KlippaMileageTrip) => void
  lastOdometerEnd?: number
}) {
  const [form, setForm] = useState({
    trip_date:       format(new Date(), 'yyyy-MM-dd'),
    start_location:  profile.home_suburb ?? '',
    end_location:    '',
    odometer_start:  lastOdometerEnd != null ? String(lastOdometerEnd) : '',
    odometer_end:    '',
    distance_km:     '',
    purpose:         '',
    trip_type:       'business' as 'business' | 'private',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Auto-calculate distance when odometer fields are both filled
  const odoStart = parseInt(form.odometer_start)
  const odoEnd   = parseInt(form.odometer_end)
  const odoKm    = !isNaN(odoStart) && !isNaN(odoEnd) && odoEnd > odoStart
    ? String(odoEnd - odoStart)
    : null

  function handleOdoChange(field: 'odometer_start' | 'odometer_end', val: string) {
    setForm(f => {
      const updated = { ...f, [field]: val }
      const s = parseInt(field === 'odometer_start' ? val : f.odometer_start)
      const e = parseInt(field === 'odometer_end'   ? val : f.odometer_end)
      if (!isNaN(s) && !isNaN(e) && e > s) {
        updated.distance_km = String(e - s)
      }
      return updated
    })
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const km = parseFloat(form.distance_km)
    if (isNaN(km) || km <= 0) { setError('Enter a valid distance'); return }
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const oStart = form.odometer_start ? parseInt(form.odometer_start) : null
      const oEnd   = form.odometer_end   ? parseInt(form.odometer_end)   : null

      const { data, error: err } = await supabase
        .from('klippa_mileage_trips')
        .insert({
          user_id:        user.id,
          tax_return_id:  taxReturnId,
          trip_date:      form.trip_date,
          start_location: form.start_location || null,
          end_location:   form.end_location   || null,
          odometer_start: oStart,
          odometer_end:   oEnd,
          distance_km:    km,
          purpose:        form.purpose,
          trip_type:      form.trip_type,
          review_week:    getWeekKey(new Date(form.trip_date)),
        })
        .select()
        .single()

      if (err) throw err
      onSaved(data as KlippaMileageTrip)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink-1 flex items-center gap-2">
            <Car className="w-4 h-4 text-emerald-400" /> Add trip
          </h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['business', 'private'] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setForm((f) => ({ ...f, trip_type: t }))}
                className={`py-2 rounded-lg text-xs font-semibold transition-all ${form.trip_type === t ? 'bg-emerald-600 text-white' : 'bg-raised text-ink-2 hover:bg-edge'}`}>
                {t === 'business' ? '💼 Business' : '🏠 Private'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">Date</label>
              <input type="date" value={form.trip_date} onChange={(e) => setForm((f) => ({ ...f, trip_date: e.target.value }))} className="input" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">
                Distance (km)
                {odoKm && <span className="text-ink-3 font-normal"> (auto from odometer)</span>}
              </label>
              <input
                type="number" min="0.1" step="0.1"
                value={form.distance_km}
                onChange={(e) => setForm((f) => ({ ...f, distance_km: e.target.value }))}
                placeholder="0.0" className="input" required
              />
            </div>
          </div>

          {/* Odometer fields — SARS compliance */}
          <div className="rounded-lg bg-raised/50 border border-edge/50 px-3 py-3 space-y-2">
            <p className="text-[10px] text-ink-2 uppercase tracking-wide">Odometer readings (SARS-compliant)</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-ink-2">Opening KM</label>
                <input
                  type="number" min="0" step="1"
                  value={form.odometer_start}
                  onChange={(e) => handleOdoChange('odometer_start', e.target.value)}
                  placeholder={lastOdometerEnd != null ? String(lastOdometerEnd) : 'e.g. 48250'}
                  className="input w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ink-2">Closing KM</label>
                <input
                  type="number" min="0" step="1"
                  value={form.odometer_end}
                  onChange={(e) => handleOdoChange('odometer_end', e.target.value)}
                  placeholder="e.g. 48368"
                  className="input w-full"
                />
              </div>
            </div>
            {lastOdometerEnd != null && !form.odometer_start && (
              <p className="text-[10px] text-emerald-500/70">Opening KM pre-filled from last trip</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">From (suburb)</label>
              <input type="text" value={form.start_location} onChange={(e) => setForm((f) => ({ ...f, start_location: e.target.value }))} placeholder="e.g. Midrand" className="input" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">To (suburb)</label>
              <input type="text" value={form.end_location} onChange={(e) => setForm((f) => ({ ...f, end_location: e.target.value }))} placeholder="e.g. Rosebank" className="input" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-2">Reason for travel <span className="text-ink-3">(required by SARS)</span></label>
            <input type="text" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Client meeting, site visit, courier run" className="input" required />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
