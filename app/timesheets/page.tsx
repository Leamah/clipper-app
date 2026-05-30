'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  Plus, ChevronLeft, ChevronRight, Download, CheckCircle2,
  Clock, Briefcase, Pencil, X, Check, AlertCircle, Users,
} from 'lucide-react'
import {
  format, startOfMonth, getDaysInMonth, getDay, getYear, getMonth,
  addMonths, subMonths, parseISO,
} from 'date-fns'
import type {
  KlippaProfile, KlippaClient, KlippaTimesheet, KlippaTimesheetEntry,
} from '@/lib/types'
import { getSAHolidayName } from '@/lib/sa-holidays'
import { useRouter } from 'next/navigation'

// ── Helpers ───────────────────────────────────────────────

function fmtRand(n: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency', currency: 'ZAR', minimumFractionDigits: 2,
  }).format(n)
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── New Client Panel ──────────────────────────────────────

function NewClientPanel({
  userId,
  onSave,
  onClose,
}: {
  userId:  string
  onSave:  (c: KlippaClient) => void
  onClose: () => void
}) {
  const [name,     setName]     = useState('')
  const [contact,  setContact]  = useState('')
  const [position, setPosition] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  async function handleSave() {
    if (!name.trim()) { setErr('Client name is required'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('klippa_clients')
      .insert({
        user_id:  userId,
        name:     name.trim(),
        contact:  contact.trim() || null,
        position: position.trim() || null,
      })
      .select()
      .single()

    if (error || !data) {
      setErr(error?.message ?? 'Failed to save')
      setSaving(false)
      return
    }
    onSave(data as KlippaClient)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-base">New client</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Client company *</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Your role / position</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Senior Developer"
              value={position}
              onChange={e => setPosition(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Contact person</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Jane Smith"
              value={contact}
              onChange={e => setContact(e.target.value)}
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add client'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Day Card ──────────────────────────────────────────────

function DayCard({
  dateStr,
  entry,
  onSave,
  onDelete,
}: {
  dateStr:  string
  entry:    KlippaTimesheetEntry | null
  onSave:   (dateStr: string, hours: number, comment: string) => Promise<void>
  onDelete: (dateStr: string) => Promise<void>
}) {
  const [editing,  setEditing]  = useState(false)
  const [hours,    setHours]    = useState(entry ? String(entry.hours) : '')
  const [comment,  setComment]  = useState(entry?.comment ?? '')
  const [saving,   setSaving]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const d        = new Date(dateStr + 'T00:00:00')
  const dayNum   = d.getDate()
  const dayLabel = DAY_LABELS[getDay(d)]
  const holiday  = getSAHolidayName(dateStr)
  const hasEntry = !!entry

  useEffect(() => {
    setHours(entry ? String(entry.hours) : '')
    setComment(entry?.comment ?? '')
    setEditing(false)
  }, [entry])

  function openEdit() {
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleSave() {
    const h = parseFloat(hours)
    if (isNaN(h) || h <= 0) { setEditing(false); return }
    setSaving(true)
    await onSave(dateStr, h, comment)
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    setSaving(true)
    await onDelete(dateStr)
    setHours('')
    setComment('')
    setSaving(false)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') setEditing(false)
  }

  // ── Editing state ─────────────────────────────────────
  if (editing) {
    return (
      <div className="rounded-xl border border-emerald-500/50 bg-zinc-900 p-2.5 min-h-[72px] shadow-lg shadow-emerald-900/20">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-zinc-400 font-medium">{dayLabel} {dayNum}</span>
          <button onClick={() => setEditing(false)} className="text-zinc-600 hover:text-zinc-400">
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <input
            ref={inputRef}
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            value={hours}
            onChange={e => setHours(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-16 bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:border-emerald-500"
            placeholder="hrs"
          />
          <span className="text-xs text-zinc-500">hrs</span>
        </div>
        <input
          type="text"
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-emerald-500"
          placeholder="Note (optional)"
        />
        <div className="flex gap-1.5 mt-1.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Check className="w-3 h-3 mx-auto" />
          </button>
          {hasEntry && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-red-900/40 text-zinc-400 hover:text-red-400 text-xs transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Has entry ─────────────────────────────────────────
  if (hasEntry) {
    return (
      <button
        onClick={openEdit}
        className="w-full text-left rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-500/50 p-2.5 min-h-[72px] transition-colors group"
      >
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-zinc-500 font-medium">{dayLabel}</span>
          <Pencil className="w-2.5 h-2.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="text-xl font-bold text-emerald-300">{entry!.hours}</div>
        <div className="text-[10px] text-zinc-500">hrs</div>
        {entry!.comment && (
          <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{entry!.comment}</div>
        )}
      </button>
    )
  }

  // ── Holiday (no entry) ────────────────────────────────
  if (holiday) {
    return (
      <button
        onClick={openEdit}
        className="w-full text-left rounded-xl border border-amber-500/20 bg-amber-950/10 hover:border-amber-500/40 p-2.5 min-h-[72px] transition-colors"
      >
        <div className="text-[10px] text-zinc-500 font-medium">{dayLabel}</div>
        <div className="text-lg font-semibold text-zinc-300">{dayNum}</div>
        <div className="text-[9px] text-amber-400/80 mt-0.5 leading-tight">{holiday}</div>
      </button>
    )
  }

  // ── Empty working day ─────────────────────────────────
  return (
    <button
      onClick={openEdit}
      className="w-full text-left rounded-xl border border-zinc-800/60 border-dashed hover:border-zinc-600 hover:bg-zinc-900/50 p-2.5 min-h-[72px] transition-colors group"
    >
      <div className="text-[10px] text-zinc-600 font-medium">{dayLabel}</div>
      <div className="text-lg font-semibold text-zinc-500">{dayNum}</div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
        <Plus className="w-3 h-3 text-zinc-600" />
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────

export default function TimesheetsPage() {
  const router = useRouter()

  const [profile,     setProfile]     = useState<KlippaProfile | null>(null)
  const [clients,     setClients]     = useState<KlippaClient[]>([])
  const [activeClient,setActiveClient]= useState<KlippaClient | null>(null)
  const [timesheet,   setTimesheet]   = useState<KlippaTimesheet | null>(null)
  const [entries,     setEntries]     = useState<KlippaTimesheetEntry[]>([])
  const [currentMonth,setCurrentMonth]= useState(() => startOfMonth(new Date()))
  const [showNewClient,setShowNewClient] = useState(false)
  const [smartFillHrs, setSmartFillHrs]  = useState('8')
  const [loading,     setLoading]     = useState(true)

  // ── Load profile & clients ────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: prof } = await supabase
        .from('klippa_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (prof) setProfile(prof as KlippaProfile)

      const { data: cls } = await supabase
        .from('klippa_clients')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      const clientList = (cls ?? []) as KlippaClient[]
      setClients(clientList)
      if (clientList.length > 0) setActiveClient(clientList[0])
      setLoading(false)
    }
    init()
  }, [router])

  // ── Load / create timesheet for active client + month ─
  const loadTimesheet = useCallback(async () => {
    if (!activeClient || !profile) return

    const monthStr = format(currentMonth, 'yyyy-MM-dd')

    const { data: existing } = await supabase
      .from('klippa_timesheets')
      .select('*')
      .eq('client_id',   activeClient.id)
      .eq('month',       monthStr)
      .single()

    if (existing) {
      setTimesheet(existing as KlippaTimesheet)
      const { data: ents } = await supabase
        .from('klippa_timesheet_entries')
        .select('*')
        .eq('timesheet_id', existing.id)
        .order('entry_date')
      setEntries((ents ?? []) as KlippaTimesheetEntry[])
    } else {
      // Auto-create timesheet with profile snapshot
      const { data: created, error } = await supabase
        .from('klippa_timesheets')
        .insert({
          client_id:       activeClient.id,
          month:           monthStr,
          consultant_name: profile.full_name,
          position:        activeClient.position,
          hourly_rate:     activeClient.hourly_rate,
          status:          'draft',
        })
        .select()
        .single()

      if (!error && created) {
        setTimesheet(created as KlippaTimesheet)
      }
      setEntries([])
    }
  }, [activeClient, currentMonth, profile])

  useEffect(() => {
    loadTimesheet()
  }, [loadTimesheet])

  // ── Entry map for fast lookup ─────────────────────────
  const entryMap = new Map<string, KlippaTimesheetEntry>()
  for (const e of entries) entryMap.set(e.entry_date, e)

  // ── Save/delete entry ─────────────────────────────────
  async function saveEntry(dateStr: string, hours: number, comment: string) {
    if (!timesheet) return
    const existing = entryMap.get(dateStr)

    if (existing) {
      const { data } = await supabase
        .from('klippa_timesheet_entries')
        .update({ hours, comment: comment || null, })
        .eq('id', existing.id)
        .select()
        .single()
      if (data) {
        setEntries(prev => prev.map(e => e.id === existing.id ? data as KlippaTimesheetEntry : e))
      }
    } else {
      const { data } = await supabase
        .from('klippa_timesheet_entries')
        .insert({
          timesheet_id: timesheet.id,
          entry_date:   dateStr,
          hours,
          comment: comment || null,
        })
        .select()
        .single()
      if (data) setEntries(prev => [...prev, data as KlippaTimesheetEntry])
    }
  }

  async function deleteEntry(dateStr: string) {
    const existing = entryMap.get(dateStr)
    if (!existing) return
    await supabase.from('klippa_timesheet_entries').delete().eq('id', existing.id)
    setEntries(prev => prev.filter(e => e.id !== existing.id))
  }

  // ── Smart fill ────────────────────────────────────────
  async function handleSmartFill() {
    const h = parseFloat(smartFillHrs)
    if (isNaN(h) || h <= 0 || !timesheet) return

    const year   = getYear(currentMonth)
    const month0 = getMonth(currentMonth)
    const days   = getDaysInMonth(currentMonth)

    for (let d = 1; d <= days; d++) {
      const ds  = isoDate(year, month0, d)
      const dow = getDay(new Date(ds + 'T00:00:00'))
      if (dow === 0 || dow === 6) continue         // skip weekends
      if (getSAHolidayName(ds))   continue         // skip public holidays
      if (entryMap.has(ds))       continue         // don't overwrite existing

      await saveEntry(ds, h, '')
    }
    // Reload
    const { data: ents } = await supabase
      .from('klippa_timesheet_entries')
      .select('*')
      .eq('timesheet_id', timesheet.id)
      .order('entry_date')
    setEntries((ents ?? []) as KlippaTimesheetEntry[])
  }

  // ── Mark submitted ────────────────────────────────────
  async function markSubmitted() {
    if (!timesheet) return
    const { data } = await supabase
      .from('klippa_timesheets')
      .update({ status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', timesheet.id)
      .select()
      .single()
    if (data) setTimesheet(data as KlippaTimesheet)
  }

  // ── Export PDF ────────────────────────────────────────
  async function handleExportPDF() {
    if (!timesheet) return
    const { exportTimesheetPDF } = await import('@/lib/pdf-export')
    exportTimesheetPDF(
      {
        ...timesheet,
        client_name:    activeClient?.name,
        client_contact: activeClient?.contact ?? undefined,
      },
      entries,
    )
  }

  // ── Handle new client ─────────────────────────────────
  function handleNewClient(c: KlippaClient) {
    setClients(prev => [c, ...prev])
    setActiveClient(c)
    setShowNewClient(false)
  }

  // ── Totals ────────────────────────────────────────────
  const totalHours   = entries.reduce((s, e) => s + Number(e.hours), 0)
  const billable     = timesheet?.hourly_rate ? totalHours * timesheet.hourly_rate : null
  const hasNoEntries = entries.length === 0

  // ── Calendar grid days ────────────────────────────────
  const year   = getYear(currentMonth)
  const month0 = getMonth(currentMonth)
  const days   = getDaysInMonth(currentMonth)

  // First day of month as day-of-week offset for grid (Mon-start grid)
  const firstDow = getDay(new Date(year, month0, 1)) // 0=Sun
  const gridOffset = firstDow === 0 ? 6 : firstDow - 1  // convert to Mon=0 … Sun=6

  const featureFlags = {
    timesheets:  profile?.feature_timesheets  ?? false,
    logbook:     profile?.feature_logbook     ?? true,
    provisional: profile?.feature_provisional ?? false,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Feature not enabled ───────────────────────────────
  if (!profile?.feature_timesheets) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppNav activePage="timesheets" featureFlags={featureFlags} />
        <div className="max-w-lg mx-auto px-6 py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
            <Clock className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Timesheets not enabled</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Enable Timesheets in Settings to track billable hours per client and export professional timecards.
          </p>
          <a
            href="/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            Go to Settings
          </a>
        </div>
      </div>
    )
  }

  // ── No clients ────────────────────────────────────────
  if (clients.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <AppNav activePage="timesheets" featureFlags={featureFlags} />
        <div className="max-w-lg mx-auto px-6 py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No clients yet</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Add your first client to start tracking billable hours.
          </p>
          <button
            onClick={() => setShowNewClient(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add client
          </button>
        </div>
        {showNewClient && (
          <NewClientPanel userId={profile!.id} onSave={handleNewClient} onClose={() => setShowNewClient(false)} />
        )}
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-32">
      <AppNav activePage="timesheets" featureFlags={featureFlags} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Client tabs + month nav */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Client pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {clients.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveClient(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeClient?.id === c.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {c.name}
              </button>
            ))}
            <button
              onClick={() => setShowNewClient(true)}
              className="px-2.5 py-1.5 rounded-full bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-xs transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> New client
            </button>
          </div>

          {/* Month navigator */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-medium min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timesheet meta */}
        {timesheet && (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {timesheet.position || activeClient?.position || '—'}
            </span>
            {timesheet.hourly_rate && (
              <span>{fmtRand(timesheet.hourly_rate)}/hr</span>
            )}
            {timesheet.status === 'submitted' && (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Submitted
              </span>
            )}
          </div>
        )}

        {/* Smart fill bar — only when no entries yet */}
        {hasNoEntries && (
          <div className="mb-5 flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-sm text-zinc-400 flex-1">Fill all working days with</span>
            <input
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={smartFillHrs}
              onChange={e => setSmartFillHrs(e.target.value)}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-emerald-500"
            />
            <span className="text-sm text-zinc-400">hours</span>
            <button
              onClick={handleSmartFill}
              className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
            >
              Apply
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-[11px] text-zinc-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-950/40 border border-emerald-500/30 inline-block" />
            Hours logged
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-950/30 border border-amber-500/20 inline-block" />
            Public holiday
          </span>
        </div>

        {/* Calendar header */}
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-[10px] text-zinc-600 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* Offset cells */}
          {Array.from({ length: gridOffset }).map((_, i) => (
            <div key={`offset-${i}`} />
          ))}

          {/* Day cards */}
          {Array.from({ length: days }, (_, i) => i + 1).map(dayNum => {
            const ds = isoDate(year, month0, dayNum)
            return (
              <DayCard
                key={ds}
                dateStr={ds}
                entry={entryMap.get(ds) ?? null}
                onSave={saveEntry}
                onDelete={deleteEntry}
              />
            )
          })}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* Totals */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Total hours</div>
              <div className="text-lg font-bold text-emerald-300">{totalHours}</div>
            </div>
            {billable !== null && (
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Billable</div>
                <div className="text-lg font-bold text-white">{fmtRand(billable)}</div>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>

            {timesheet?.status !== 'submitted' ? (
              <button
                onClick={markSubmitted}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark submitted
              </button>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-950/40 text-emerald-400 text-sm">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Submitted
              </span>
            )}
          </div>
        </div>
      </div>

      {/* New client panel */}
      {showNewClient && (
        <NewClientPanel userId={profile!.id} onSave={handleNewClient} onClose={() => setShowNewClient(false)} />
      )}
    </div>
  )
}
