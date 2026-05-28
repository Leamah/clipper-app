'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import UserNav from '@/components/UserNav'
import {
  ShieldCheck, Car, Plus, Trash2, Loader2, X, Check,
  Download, FileText, AlertCircle
} from 'lucide-react'
import type { KlippaMileageTrip, KlippaProfile } from '@/lib/types'
import { calcTravelDeduction, vehicleFixedCostRow } from '@/lib/tax-engine'

function formatRand(n: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}
function fmt(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

// ── Page ──────────────────────────────────────────────────

export default function MileagePage() {
  const [trips,       setTrips]       = useState<KlippaMileageTrip[]>([])
  const [profile,     setProfile]     = useState<KlippaProfile | null>(null)
  const [taxReturnId, setTaxReturnId] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, returnRes, tripsRes] = await Promise.all([
      supabase.from('klippa_profiles').select('*').eq('id', user.id).single(),
      supabase.from('klippa_tax_returns').select('id, tax_year').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single(),
      supabase.from('klippa_mileage_trips').select('*').eq('user_id', user.id).order('trip_date', { ascending: false }),
    ])

    setProfile(profileRes.data as KlippaProfile | null)
    setTaxReturnId(returnRes.data?.id ?? null)
    setTrips((tripsRes.data ?? []) as KlippaMileageTrip[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Derived stats ─────────────────────────────────────────
  const businessTrips  = trips.filter((t) => t.trip_type === 'business')
  const totalBusinessKm = businessTrips.reduce((s, t) => s + t.distance_km, 0)
  const totalAllKm      = trips.reduce((s, t) => s + t.distance_km, 0)
  const vehicleValue    = profile?.vehicle_value ?? 0
  const travelDeduction = calcTravelDeduction(totalBusinessKm, Math.max(totalAllKm, totalBusinessKm), vehicleValue)
  const row             = vehicleFixedCostRow(vehicleValue)

  // ── Delete trip ──────────────────────────────────────────
  const deleteTrip = async (id: string) => {
    await supabase.from('klippa_mileage_trips').delete().eq('id', id)
    setTrips((t) => t.filter((x) => x.id !== id))
  }

  // ── CSV export (SARS-compatible logbook) ─────────────────
  const exportLogbook = () => {
    const header = 'Date,From,To,Distance (km),Purpose,Type,Deductible Amount'
    const rows   = trips.map((t) => [
      t.trip_date,
      `"${t.start_location ?? ''}"`,
      `"${t.end_location ?? ''}"`,
      t.distance_km,
      `"${t.purpose}"`,
      t.trip_type,
      t.deductible_amount ?? '',
    ].join(','))
    const csv  = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `klippa_logbook_${new Date().getFullYear()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
    </div>
  )

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
            <button onClick={exportLogbook} disabled={trips.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40 transition-all">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Log Trip
            </button>
            <UserNav />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Business km" value={`${totalBusinessKm.toFixed(0)} km`} />
          <StatCard label="Total km logged" value={`${totalAllKm.toFixed(0)} km`} />
          <StatCard label="Estimated deduction" value={formatRand(travelDeduction)} accent />
          <StatCard label="Trips logged" value={String(trips.length)} />
        </div>

        {/* Vehicle / rate info */}
        {profile?.has_vehicle && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-wrap gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5"><Car className="w-3.5 h-3.5 text-zinc-500" />
              Vehicle value: <span className="text-zinc-200 font-medium">{formatRand(vehicleValue)}</span>
            </span>
            <span>Fixed cost: <span className="text-zinc-200 font-medium">{formatRand(row.fixedCost)}/yr</span></span>
            <span>Fuel rate: <span className="text-zinc-200 font-medium">{row.fuelRate}c/km</span></span>
            <span>Maintenance: <span className="text-zinc-200 font-medium">{row.mainRate}c/km</span></span>
            <span className="text-zinc-600">Business % = {totalAllKm > 0 ? ((totalBusinessKm / totalAllKm) * 100).toFixed(1) : 0}%</span>
          </div>
        )}

        {!profile?.has_vehicle && (
          <div className="rounded-xl border border-amber-800/40 bg-amber-900/10 p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              Your profile doesn&apos;t have vehicle travel enabled. Go to{' '}
              <Link href="/settings" className="underline hover:text-amber-200">Settings</Link>{' '}
              to enable the travel deduction and set your vehicle value.
            </p>
          </div>
        )}

        {/* Trips table */}
        {trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <Car className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm font-medium">No trips logged yet</p>
            <p className="text-zinc-600 text-xs mt-1 mb-4">Every business kilometre counts toward your travel deduction</p>
            <button onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Log your first trip
            </button>
          </div>
        ) : (
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
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">{fmt(t.trip_date)}</td>
                      <td className="px-4 py-3">
                        {t.start_location || t.end_location ? (
                          <span className="text-zinc-400">
                            {t.start_location ?? '?'} → {t.end_location ?? '?'}
                          </span>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 max-w-[200px] truncate">{t.purpose}</td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-200 tabular-nums">{t.distance_km}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          t.trip_type === 'business'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-zinc-700 text-zinc-400'
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
                    <td colSpan={3} className="px-4 py-3 text-xs text-zinc-500 font-medium">Total</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-200 tabular-nums">{totalAllKm.toFixed(0)}</td>
                    <td colSpan={2} className="px-4 py-3 text-xs text-emerald-400 font-semibold text-right pr-8">
                      Est. deduction: {formatRand(travelDeduction)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* SARS logbook note */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 flex items-start gap-3">
          <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-500 space-y-1">
            <p className="font-medium text-zinc-400">SARS logbook requirements</p>
            <p>Your logbook must record: date, start/end point, distance, and business purpose for every trip.
              Keep this record for 5 years after submission. Click <strong className="text-zinc-300">Export CSV</strong> to
              download a SARS-compatible logbook.</p>
          </div>
        </div>
      </main>

      {showModal && (
        <LogTripModal
          taxReturnId={taxReturnId}
          onClose={() => setShowModal(false)}
          onSaved={(trip) => {
            setTrips((t) => [trip, ...t])
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${accent ? 'text-emerald-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}

// ── Log trip modal ────────────────────────────────────────

function LogTripModal({ taxReturnId, onClose, onSaved }: {
  taxReturnId: string | null
  onClose:     () => void
  onSaved:     (trip: KlippaMileageTrip) => void
}) {
  const [form, setForm] = useState({
    trip_date:      new Date().toISOString().slice(0, 10),
    start_location: '',
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
            <Car className="w-4 h-4 text-emerald-400" /> Log trip
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Trip type toggle */}
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
              <input type="text" value={form.start_location} onChange={(e) => setForm((f) => ({ ...f, start_location: e.target.value }))} placeholder="e.g. Home / Sandton" className="input" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">To</label>
              <input type="text" value={form.end_location} onChange={(e) => setForm((f) => ({ ...f, end_location: e.target.value }))} placeholder="e.g. Client office" className="input" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Business purpose <span className="text-zinc-600">(required by SARS)</span></label>
            <input type="text" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Client meeting, site inspection, courier run" className="input" required />
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
