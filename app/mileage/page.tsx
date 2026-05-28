'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import {
  ShieldCheck, Car, Plus, Trash2, Loader2, X, Check,
  Download, FileText, AlertCircle, ChevronRight, ChevronDown,
  Calendar, CheckCircle2, Clock, MapPin
} from 'lucide-react'
import type { KlippaMileageTrip, KlippaProfile, KlippaLogbookReview } from '@/lib/types'
import { calcTravelDeduction } from '@/lib/tax-engine'
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

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, returnRes, tripsRes, reviewsRes] = await Promise.all([
      supabase.from('klippa_profiles').select('*').eq('id', user.id).single(),
      supabase.from('klippa_tax_returns').select('id, tax_year').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single(),
      supabase.from('klippa_mileage_trips').select('*').eq('user_id', user.id).order('trip_date', { ascending: false }),
      supabase.from('klippa_logbook_reviews').select('*').eq('user_id', user.id),
    ])

    setProfile(profileRes.data as KlippaProfile | null)
    setTaxReturnId(returnRes.data?.id ?? null)
    setTrips((tripsRes.data ?? []) as KlippaMileageTrip[])
    setReviews((reviewsRes.data ?? []) as KlippaLogbookReview[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <span className="text-zinc-700 text-sm">/</span>
          <span className="text-sm text-zinc-400">Logbook</span>
          <div className="ml-auto flex items-center gap-2">
            {isConfigured && (
              <button onClick={exportLogbook} disabled={trips.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40 transition-all">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}
            {isConfigured && (
              <button onClick={() => setShowAddTrip(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add trip
              </button>
            )}
            <UserNav />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Not configured ──────────────────────────────── */}
        {!isConfigured && (
          <div className="rounded-2xl border border-amber-600/30 bg-amber-950/20 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto">
              <Car className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-amber-200">Set up your commute once</p>
              <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
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
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 flex flex-wrap gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                {profile?.home_suburb ?? 'Home'} → {profile?.work_suburb ?? 'Office'}
              </span>
              <span className="flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-zinc-500" />
                {(profile?.commute_km ?? 0) * 2} km return
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
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
                  <span className="text-xs text-zinc-500">Confirm which days you drove for business</span>
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
                <span className="text-xs text-zinc-500">All weeks confirmed through last week</span>
              </div>
            )}

            {/* ── Confirmed trips table ────────────────────────── */}
            {trips.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Confirmed logbook</p>
                  <p className="text-xs text-zinc-600">{trips.length} trips · {totalAllKm.toFixed(0)} km total</p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500">
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
                          <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                            <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                              {format(parseISO(t.trip_date), 'd MMM yyyy')}
                            </td>
                            <td className="px-4 py-3">
                              {t.start_location || t.end_location ? (
                                <span className="text-zinc-400">{t.start_location ?? '?'} → {t.end_location ?? '?'}</span>
                              ) : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-zinc-400 max-w-[200px] truncate">{t.purpose}</td>
                            <td className="px-4 py-3 text-right font-medium text-zinc-200 tabular-nums">{t.distance_km}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                t.trip_type === 'business' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
                              }`}>
                                {t.trip_type}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => deleteTrip(t.id)} className="p-1 text-zinc-600 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-zinc-800/30">
                          <td colSpan={3} className="px-4 py-3 text-xs text-zinc-500 font-medium">Total business km</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-zinc-200 tabular-nums">{totalBusinessKm.toFixed(0)}</td>
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
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 flex items-start gap-3">
              <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-500 space-y-1">
                <p className="font-medium text-zinc-400">SARS logbook requirements</p>
                <p>Your logbook must record: date, start and end point, distance, and business purpose for every trip.
                  Keep the logbook for 5 years after submission. Click <strong className="text-zinc-300">Export CSV</strong> to
                  download a SARS-compatible version. You will also need your opening and closing odometer readings for the tax year.</p>
              </div>
            </div>
          </>
        )}
      </main>

      {showAddTrip && profile && (
        <AddTripModal
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {/* Header — click to expand */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/30 transition-colors text-left">
        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${open ? 'border-emerald-500' : 'border-zinc-600'}`}>
          {open && <div className="w-full h-full rounded-full bg-emerald-500/50" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-200">
            {fmtDate(week.start)} — {fmtDate(week.end)}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {selectedCount > 0
              ? `${selectedCount} trips auto-detected · ${totalKm} km (return)`
              : 'No office days scheduled this week'}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          <p className="text-xs text-zinc-500">
            Klippa auto-detected these trips based on your schedule. Uncheck days you didn&apos;t drive.
            Change the purpose if a day was a client visit rather than a regular commute.
          </p>

          <div className="space-y-2">
            {days.map((d, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                d.selected ? 'border-emerald-600/40 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/30 opacity-60'
              }`}>
                {/* Day toggle */}
                <button onClick={() => toggleDay(i)}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    d.selected ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'
                  }`}>
                  {d.selected && <Check className="w-3 h-3 text-white" />}
                </button>

                {/* Day label */}
                <p className="text-xs font-medium text-zinc-300 w-20 flex-shrink-0">{fmtShort(d.date)}</p>

                {/* Route */}
                {d.selected ? (
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-zinc-400">{d.from} → {d.to} · <span className="text-zinc-300">{d.km * 2} km return</span></p>
                    <input
                      type="text"
                      value={d.purpose}
                      onChange={(e) => updatePurpose(i, e.target.value)}
                      className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-500/60"
                      placeholder="Purpose (e.g. Business commute)"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 flex-1">Stayed home / not a scheduled day</p>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-800">
            <span>{selectedCount} trips · {totalKm} km (return)</span>
            <div className="flex gap-2">
              <button
                onClick={() => onConfirm(days.map((d) => ({ ...d, selected: false })))}
                disabled={confirming}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors disabled:opacity-50">
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${accent ? 'text-emerald-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}

// ── Add trip modal (for ad-hoc client visits) ─────────────

function AddTripModal({ taxReturnId, profile, onClose, onSaved }: {
  taxReturnId: string | null
  profile:     KlippaProfile
  onClose:     () => void
  onSaved:     (trip: KlippaMileageTrip) => void
}) {
  const [form, setForm] = useState({
    trip_date:      format(new Date(), 'yyyy-MM-dd'),
    start_location: profile.home_suburb ?? '',
    end_location:   '',
    distance_km:    '',
    purpose:        '',
    trip_type:      'business' as 'business' | 'private',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const km = parseFloat(form.distance_km)
    if (isNaN(km) || km <= 0) { setError('Enter a valid distance'); return }
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: err } = await supabase
        .from('klippa_mileage_trips')
        .insert({
          user_id:        user.id,
          tax_return_id:  taxReturnId,
          trip_date:      form.trip_date,
          start_location: form.start_location || null,
          end_location:   form.end_location   || null,
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
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Car className="w-4 h-4 text-emerald-400" /> Add business trip
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-zinc-500">For client visits, deliveries, or any trip not in your regular schedule.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['business', 'private'] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setForm((f) => ({ ...f, trip_type: t }))}
                className={`py-2 rounded-lg text-xs font-semibold transition-all ${form.trip_type === t ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                {t === 'business' ? '💼 Business' : '🏠 Private'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Date</label>
              <input type="date" value={form.trip_date} onChange={(e) => setForm((f) => ({ ...f, trip_date: e.target.value }))} className="input" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Distance (km)</label>
              <input type="number" min="0.1" step="0.1" value={form.distance_km} onChange={(e) => setForm((f) => ({ ...f, distance_km: e.target.value }))} placeholder="0.0" className="input" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">From</label>
              <input type="text" value={form.start_location} onChange={(e) => setForm((f) => ({ ...f, start_location: e.target.value }))} placeholder="Starting point" className="input" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">To</label>
              <input type="text" value={form.end_location} onChange={(e) => setForm((f) => ({ ...f, end_location: e.target.value }))} placeholder="Destination" className="input" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Business purpose <span className="text-zinc-600">(required by SARS)</span></label>
            <input type="text" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Client meeting, site visit, courier run" className="input" required />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700">Cancel</button>
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
