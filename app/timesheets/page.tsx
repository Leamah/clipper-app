'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import {
  Plus, ChevronLeft, ChevronRight, Download, CheckCircle2,
  Clock, Briefcase, Pencil, X, Check, AlertCircle, Users,
  PenLine, Lock, Save, Loader2, Zap, RotateCcw,
} from 'lucide-react'
import {
  format, startOfMonth, getDaysInMonth, getDay, getYear, getMonth,
  addMonths, subMonths, parseISO,
} from 'date-fns'
import type {
  KlippaProfile, KlippaClient, KlippaTimesheet, KlippaTimesheetEntry, OrgBranding,
} from '@/lib/types'
import { getSAHolidayName } from '@/lib/sa-holidays'
import { isFreeUser } from '@/lib/tier'
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
      <div className="w-full max-w-md bg-surface border border-edge rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-base">New client</h2>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-2 mb-1">Client company *</label>
            <input
              className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-ink-2 mb-1">Your role / position</label>
            <input
              className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Senior Developer"
              value={position}
              onChange={e => setPosition(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-2 mb-1">Contact person</label>
            <input
              className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
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
            className="flex-1 px-4 py-2 rounded-lg border border-edge text-sm text-ink-2 hover:text-ink-1 transition-colors"
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

// ── Status badge ──────────────────────────────────────────

function StatusBadge({ status }: { status: KlippaTimesheet['status'] }) {
  const map = {
    draft:     { label: 'Draft',                    cls: 'text-ink-2 bg-raised' },
    submitted: { label: 'Awaiting client sign-off', cls: 'text-amber-300 bg-amber-500/15' },
    approved:  { label: 'Approved',                 cls: 'text-emerald-300 bg-emerald-500/15' },
  }
  const { label, cls } = map[status] ?? map.draft
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

// ── Day Card ──────────────────────────────────────────────

function DayCard({
  dateStr,
  entry,
  locked,
  onSave,
  onDelete,
}: {
  dateStr:  string
  entry:    KlippaTimesheetEntry | null
  locked:   boolean
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
    if (locked) return
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
      <div className="rounded-xl border border-emerald-500/50 bg-surface p-2.5 min-h-[72px] shadow-lg shadow-emerald-900/20">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-ink-2 font-medium">{dayLabel} {dayNum}</span>
          <button onClick={() => setEditing(false)} className="text-ink-3 hover:text-ink-2">
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
            className="w-16 bg-raised border border-edge rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:border-emerald-500"
            placeholder="hrs"
          />
          <span className="text-xs text-ink-2">hrs</span>
        </div>
        <input
          type="text"
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-raised border border-edge rounded-md px-2 py-1 text-xs focus:outline-none focus:border-emerald-500"
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
              className="px-2 py-1 rounded-md bg-raised hover:bg-red-900/40 text-ink-2 hover:text-red-400 text-xs transition-colors"
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
        disabled={locked}
        className="w-full text-left rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-500/50 p-2.5 min-h-[72px] transition-colors group disabled:cursor-default disabled:hover:border-emerald-500/30"
      >
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-ink-2 font-medium">{dayLabel} {dayNum}</span>
          {locked
            ? <Lock className="w-2.5 h-2.5 text-ink-3" />
            : <Pencil className="w-2.5 h-2.5 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          }
        </div>
        <div className="text-xl font-bold text-emerald-300">{entry!.hours}</div>
        <div className="text-[10px] text-ink-2">hrs</div>
        {entry!.comment && (
          <div className="text-[10px] text-ink-3 mt-0.5 truncate">{entry!.comment}</div>
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
        <div className="text-[10px] text-ink-2 font-medium">{dayLabel}</div>
        <div className="text-lg font-semibold text-ink-1">{dayNum}</div>
        <div className="text-[9px] text-amber-400/80 mt-0.5 leading-tight">{holiday}</div>
      </button>
    )
  }

  // ── Empty working day ─────────────────────────────────
  return (
    <button
      onClick={openEdit}
      className="w-full text-left rounded-xl border border-edge/60 border-dashed hover:border-edge hover:bg-surface/50 p-2.5 min-h-[72px] transition-colors group"
    >
      <div className="text-[10px] text-ink-3 font-medium">{dayLabel}</div>
      <div className="text-lg font-semibold text-ink-2">{dayNum}</div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
        <Plus className="w-3 h-3 text-ink-3" />
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────

// ── Signature drawing pad ─────────────────────────────────

function SignaturePad({
  saving,
  savedSignature,
  onSave,
  onClose,
}: {
  saving:          boolean
  savedSignature:  string | null
  onSave:          (dataUrl: string, saveToProfile: boolean) => void
  onClose:         () => void
}) {
  // 'use-saved' mode only available when a saved sig exists
  const [mode,       setMode]       = useState<'use-saved' | 'draw'>(savedSignature ? 'use-saved' : 'draw')
  const [remember,   setRemember]   = useState(!savedSignature)  // default checked when no saved sig
  const [isEmpty,    setIsEmpty]    = useState(true)
  const [hasDrawn,   setHasDrawn]   = useState(false)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, rect: DOMRect) {
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')!
    const rect   = canvas.getBoundingClientRect()
    const pos    = getPos(e, rect)
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    drawing.current = true
    ctx.beginPath()
    ctx.moveTo(pos.x * scaleX, pos.y * scaleY)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')!
    const rect   = canvas.getBoundingClientRect()
    const pos    = getPos(e, rect)
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    ctx.lineTo(pos.x * scaleX, pos.y * scaleY)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.stroke()
    setIsEmpty(false)
    setHasDrawn(true)
  }

  function stopDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawing.current = false
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    setHasDrawn(false)
  }

  function handleConfirmDrawn() {
    const canvas = canvasRef.current
    if (!canvas || isEmpty) return
    onSave(canvas.toDataURL('image/png'), remember)
  }

  function handleUseSaved() {
    if (!savedSignature) return
    // Using saved sig never re-saves (it's already saved)
    onSave(savedSignature, false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-ink-1">Sign timesheet</h3>
            <p className="text-xs text-ink-3 mt-0.5">
              {mode === 'use-saved' ? 'Use your saved signature or draw a new one' : 'Draw your signature below'}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode toggle tabs (only when a saved sig exists) */}
        {savedSignature && (
          <div className="flex gap-1 p-1 bg-raised rounded-xl">
            <button
              onClick={() => setMode('use-saved')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'use-saved' ? 'bg-surface text-ink-1 shadow-sm' : 'text-ink-2 hover:text-ink-1'
              }`}
            >
              Saved signature
            </button>
            <button
              onClick={() => setMode('draw')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'draw' ? 'bg-surface text-ink-1 shadow-sm' : 'text-ink-2 hover:text-ink-1'
              }`}
            >
              Draw new
            </button>
          </div>
        )}

        {/* ── Use saved signature ── */}
        {mode === 'use-saved' && savedSignature && (
          <div className="rounded-xl border border-edge bg-zinc-950 p-4 flex items-center justify-center min-h-[100px]">
            <img
              src={savedSignature}
              alt="Saved signature"
              className="max-h-20 object-contain"
              style={{ filter: 'invert(0) brightness(1)' }}
            />
          </div>
        )}

        {/* ── Draw new canvas ── */}
        {mode === 'draw' && (
          <>
            <div className="rounded-xl overflow-hidden border border-edge bg-zinc-950">
              <canvas
                ref={canvasRef}
                width={640}
                height={200}
                className="w-full cursor-crosshair touch-none select-none"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            {!hasDrawn && (
              <p className="text-xs text-center text-ink-3">← Draw your signature in the box above →</p>
            )}
            {/* Remember checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs text-ink-2">Save this signature for future timesheets</span>
            </label>
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          {mode === 'draw' && (
            <button
              onClick={clearCanvas}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors"
          >
            Cancel
          </button>
          {mode === 'use-saved' ? (
            <button
              onClick={handleUseSaved}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing…</>
                : <><CheckCircle2 className="w-3.5 h-3.5" /> Use this & sign</>
              }
            </button>
          ) : (
            <button
              onClick={handleConfirmDrawn}
              disabled={isEmpty || saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing…</>
                : <><PenLine className="w-3.5 h-3.5" /> Confirm & sign</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TimesheetsPage() {
  const router = useRouter()

  const [profile,     setProfile]     = useState<KlippaProfile | null>(null)
  const [clients,     setClients]     = useState<KlippaClient[]>([])
  const [activeClient,setActiveClient]= useState<KlippaClient | null>(null)
  const [timesheet,   setTimesheet]   = useState<KlippaTimesheet | null>(null)
  const [entries,     setEntries]     = useState<KlippaTimesheetEntry[]>([])
  const [currentMonth,setCurrentMonth]= useState(() => startOfMonth(new Date()))
  const [showNewClient,   setShowNewClient]    = useState(false)
  const [smartFillHrs,    setSmartFillHrs]     = useState('8')
  const [loading,         setLoading]          = useState(true)
  const [signingConsultant, setSigningConsultant] = useState(false)
  const [showSignPad,     setShowSignPad]      = useState(false)
  const [signingClient,   setSigningClient]    = useState(false)
  const [savingPdf,       setSavingPdf]        = useState(false)
  const [saveMsg,         setSaveMsg]          = useState<string | null>(null)
  const [orgBranding,     setOrgBranding]      = useState<OrgBranding | null>(null)
  const [showExport,      setShowExport]       = useState(false)
  const [exportFrom,      setExportFrom]       = useState('')
  const [exportTo,        setExportTo]         = useState('')
  const [exporting,       setExporting]        = useState(false)
  const [exportErr,       setExportErr]        = useState<string | null>(null)
  const [dupDates,        setDupDates]         = useState<string[]>([])

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

      if (prof) {
        setProfile(prof as KlippaProfile)
        // Fetch org branding if user belongs to an org
        if ((prof as KlippaProfile & { organisation_id?: string }).organisation_id) {
          const res = await fetch('/api/org/settings')
          const json = await res.json()
          if (json.org) {
            setOrgBranding({
              orgName:    json.org.name,
              brandColor: json.org.brand_color ?? '#10b981',
              logoUrl:    json.org.logo_url    ?? null,
            })
          }
        }
      }

      const { data: cls } = await supabase
        .from('klippa_clients')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      let clientList = (cls ?? []) as KlippaClient[]

      // Org members need a client record for their org to submit timesheets.
      // Auto-create one if they belong to an org but have no clients yet.
      if (clientList.length === 0 && (prof as KlippaProfile & { organisation_id?: string }).organisation_id) {
        const orgRes  = await fetch('/api/org/settings')
        const orgJson = await orgRes.json()
        const orgName = orgJson.org?.name as string | undefined
        if (orgName) {
          const { data: created } = await supabase
            .from('klippa_clients')
            .insert({ user_id: user.id, name: orgName, is_active: true })
            .select()
            .single()
          if (created) clientList = [created as KlippaClient]
        }
      }

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
          user_id:         profile.id,
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

  // ── Detect days logged on another timesheet (double-billing guard) ─
  useEffect(() => {
    async function checkDupes() {
      if (!timesheet || !profile || entries.length === 0) { setDupDates([]); return }
      const dates = entries.map(e => e.entry_date)
      const { data } = await supabase
        .from('klippa_timesheet_entries')
        .select('entry_date, timesheet_id')
        .eq('user_id', profile.id)
        .in('entry_date', dates)
      const dupes = Array.from(new Set(
        (data ?? [])
          .filter(r => r.timesheet_id !== timesheet.id)
          .map(r => r.entry_date as string)
      )).sort()
      setDupDates(dupes)
    }
    checkDupes()
  }, [timesheet, profile, entries])

  // ── Export merged range to PDF ────────────────────────
  async function generateExport() {
    if (!activeClient || !profile) return
    setExporting(true)
    setExportErr(null)
    try {
      const lo = (exportFrom <= exportTo ? exportFrom : exportTo) + '-01'
      const hi = (exportFrom <= exportTo ? exportTo : exportFrom) + '-01'
      const { data: sheets } = await supabase
        .from('klippa_timesheets')
        .select('*')
        .eq('client_id', activeClient.id)
        .gte('month', lo)
        .lte('month', hi)
        .order('month')
      const list = (sheets ?? []) as KlippaTimesheet[]
      if (list.length === 0) { setExportErr('No timesheets in that range'); return }

      const ids = list.map(s => s.id)
      const { data: ents } = await supabase
        .from('klippa_timesheet_entries')
        .select('*')
        .in('timesheet_id', ids)
        .order('entry_date')
      const allEntries = (ents ?? []) as KlippaTimesheetEntry[]
      const months = list.map(s => ({
        monthISO: s.month,
        entries:  allEntries.filter(e => e.timesheet_id === s.id),
      }))

      const latest = list[list.length - 1]
      const { exportMergedTimesheetPDF } = await import('@/lib/pdf-export')
      await exportMergedTimesheetPDF(
        {
          consultant_name:       latest.consultant_name ?? profile.full_name,
          position:              latest.position ?? activeClient.position,
          client_name:           activeClient.name,
          client_contact:        activeClient.contact,
          hourly_rate:           latest.hourly_rate,
          consultant_signed_at:  latest.consultant_signed_at,
          consultant_signature:  (latest as any).consultant_signature ?? null,
          client_signed_at:      latest.client_signed_at,
        },
        months,
        { branding: orgBranding ?? undefined },
      )
      setShowExport(false)
    } catch {
      setExportErr('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

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
          user_id:      profile!.id,
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

  // ── Signoff functions ─────────────────────────────────
  async function signConsultant(signatureDataUrl: string, saveToProfile = false) {
    if (!timesheet) return
    setSigningConsultant(true)
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('klippa_timesheets')
      .update({
        consultant_signed_at: now,
        consultant_signature:  signatureDataUrl,
        client_name:           activeClient?.name ?? null,
        client_contact:        activeClient?.contact ?? null,
        status:                'submitted',
        updated_at:            now,
      })
      .eq('id', timesheet.id)
      .select()
      .single()
    if (data) setTimesheet(data as KlippaTimesheet)

    // Persist signature to profile for reuse on future timesheets
    if (saveToProfile && profile) {
      await supabase
        .from('klippa_profiles')
        .update({ saved_signature: signatureDataUrl })
        .eq('id', profile.id)
      setProfile(prev => prev ? { ...prev, saved_signature: signatureDataUrl } : prev)
    }

    setSigningConsultant(false)
    setShowSignPad(false)
  }

  async function unsignConsultant() {
    if (!timesheet) return
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('klippa_timesheets')
      .update({ consultant_signed_at: null, client_signed_at: null, status: 'draft', updated_at: now })
      .eq('id', timesheet.id)
      .select()
      .single()
    if (data) setTimesheet(data as KlippaTimesheet)
  }

  async function signClient() {
    if (!timesheet) return
    setSigningClient(true)
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('klippa_timesheets')
      .update({ client_signed_at: now, status: 'approved', updated_at: now })
      .eq('id', timesheet.id)
      .select()
      .single()
    if (data) setTimesheet(data as KlippaTimesheet)
    setSigningClient(false)
  }

  // ── Save PDF to Documents ─────────────────────────────
  async function handleSavePDF() {
    if (!timesheet || !profile) return
    setSavingPdf(true)
    setSaveMsg(null)
    try {
      const { exportTimesheetPDF } = await import('@/lib/pdf-export')
      const monthStr   = format(currentMonth, 'yyyy-MM')
      const clientName = activeClient?.name ?? 'Client'
      const filename   = `Timesheet_${clientName}_${monthStr}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_')

      // Generate PDF as a Blob (no auto-download)
      const blob = await exportTimesheetPDF(
        { ...timesheet, client_name: activeClient?.name ?? null, client_contact: activeClient?.contact ?? null },
        entries,
        { blob: true, branding: orgBranding ?? undefined },
      ) as Blob

      // Upload to storage
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const storagePath = `${user.id}/timesheets/${timesheet.id}-${monthStr}.pdf`
      const { error: upErr } = await supabase.storage
        .from('klippa_documents')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })

      if (upErr) throw upErr

      await supabase.from('klippa_documents').insert({
        user_id:           user.id,
        document_type:     'timesheet',
        original_filename: filename,
        storage_path:      storagePath,
        file_size_bytes:   blob.size,
        ocr_status:        'complete',
        upload_method:     'timesheet_export',
      })

      setSaveMsg('Saved to Documents ✓')
    } catch {
      setSaveMsg('Save failed. Try again.')
    } finally {
      setSavingPdf(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  // ── Handle new client ─────────────────────────────────
  function handleNewClient(c: KlippaClient) {
    setClients(prev => [c, ...prev])
    setActiveClient(c)
    setShowNewClient(false)
  }

  // ── Tier helpers ──────────────────────────────────────
  const isFree = isFreeUser(profile ?? { subscription_tier: 'free', organisation_id: null })

  // ── Totals ────────────────────────────────────────────
  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0)
  const billable   = timesheet?.hourly_rate ? totalHours * timesheet.hourly_rate : null

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
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Feature not enabled ───────────────────────────────
  if (!profile?.feature_timesheets) {
    return (
      <div className="app-shell bg-base text-ink-1">
        <AppNav activePage="timesheets" featureFlags={featureFlags} />
        <div className="max-w-lg mx-auto px-6 py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
            <Clock className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Timesheets not enabled</h2>
          <p className="text-sm text-ink-2 mb-6">
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
      <div className="app-shell bg-base text-ink-1">
        <AppNav activePage="timesheets" featureFlags={featureFlags} />
        <div className="max-w-lg mx-auto px-6 py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No clients yet</h2>
          <p className="text-sm text-ink-2 mb-6">
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
    <div className="app-shell bg-base text-ink-1 pb-32">
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
                    : 'bg-raised text-ink-2 hover:text-ink-1'
                }`}
              >
                {c.name}
              </button>
            ))}
            {isFree && clients.length >= 1 ? (
              <a
                href="/pricing"
                className="px-2.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-1 hover:bg-amber-500/20 transition-colors"
                title="Free plan includes 1 client. Upgrade for unlimited clients."
              >
                <Zap className="w-3 h-3" /> Upgrade for more clients
              </a>
            ) : (
              <button
                onClick={() => setShowNewClient(true)}
                className="px-2.5 py-1.5 rounded-full bg-raised text-ink-2 hover:text-ink-1 text-xs transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> New client
              </button>
            )}
          </div>

          {/* Month navigator */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="w-8 h-8 rounded-lg bg-raised hover:bg-edge flex items-center justify-center text-ink-2 hover:text-ink-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-medium min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="w-8 h-8 rounded-lg bg-raised hover:bg-edge flex items-center justify-center text-ink-2 hover:text-ink-1 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timesheet meta */}
        {timesheet && (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-ink-2">
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {timesheet.position || activeClient?.position || '—'}
            </span>
            {timesheet.hourly_rate && (
              <span>{fmtRand(timesheet.hourly_rate)}/hr</span>
            )}
            <StatusBadge status={timesheet.status} />
          </div>
        )}

        {/* Smart fill bar */}
        <div className="mb-5 flex items-center gap-3 bg-surface border border-edge rounded-xl px-4 py-3">
            <span className="text-sm text-ink-2 flex-1">Fill all working days with</span>
            <input
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={smartFillHrs}
              onChange={e => setSmartFillHrs(e.target.value)}
              className="w-16 bg-raised border border-edge rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-emerald-500"
            />
            <span className="text-sm text-ink-2">hours</span>
            <button
              onClick={handleSmartFill}
              className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
            >
              Apply
            </button>
          </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-950/40 border border-emerald-500/30 inline-block" />
            Hours logged
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-950/30 border border-amber-500/20 inline-block" />
            Public holiday
          </span>
        </div>

        {/* Double-billing warning */}
        {dupDates.length > 0 && (
          <div className="mb-4 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Heads up: </span>
              {dupDates.length === 1 ? 'this day is' : 'these days are'} also logged on another timesheet:{' '}
              {dupDates.map(d => format(new Date(d + 'T00:00:00'), 'd MMM')).join(', ')}.
              {' '}Check you&apos;re not double-billing.
            </span>
          </div>
        )}

        {/* Calendar header — only meaningful in the 7-col week view */}
        <div className="hidden sm:grid grid-cols-7 gap-1.5 mb-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-[10px] text-ink-3 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid — 2-col list on mobile, 7-col week on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5">
          {/* Week-alignment offset cells (desktop only) */}
          {Array.from({ length: gridOffset }).map((_, i) => (
            <div key={`offset-${i}`} className="hidden sm:block" />
          ))}

          {/* Day cards */}
          {Array.from({ length: days }, (_, i) => i + 1).map(dayNum => {
            const ds = isoDate(year, month0, dayNum)
            return (
              <DayCard
                key={ds}
                dateStr={ds}
                entry={entryMap.get(ds) ?? null}
                locked={!!timesheet?.consultant_signed_at}
                onSave={saveEntry}
                onDelete={deleteEntry}
              />
            )
          })}
        </div>

        {/* Sign-off card */}
        {timesheet && (
          <div className="mt-8 rounded-2xl border border-edge bg-surface/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink-1 flex items-center gap-2">
                <PenLine className="w-4 h-4 text-ink-2" />
                Sign-off
              </h3>
              <StatusBadge status={timesheet.status} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Consultant */}
              <div className="rounded-xl border border-edge bg-base/50 p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink-2 font-semibold mb-3">Consultant</div>
                <div className="text-sm text-ink-1 font-medium truncate">
                  {timesheet.consultant_name || profile?.full_name || '—'}
                </div>
                <div className="text-xs text-ink-2 mb-4">
                  {timesheet.position || activeClient?.position || '—'}
                </div>
                {timesheet.consultant_signed_at ? (
                  <div className="space-y-2">
                    {timesheet.consultant_signature && (
                      <img
                        src={timesheet.consultant_signature}
                        alt="Consultant signature"
                        className="h-12 object-contain"
                        style={{ filter: 'invert(1) brightness(2)' }}
                      />
                    )}
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Signed {format(new Date(timesheet.consultant_signed_at), 'd MMM yyyy HH:mm')}
                    </div>
                    <button
                      onClick={unsignConsultant}
                      className="text-xs text-ink-3 hover:text-ink-2 underline underline-offset-2 transition-colors"
                    >
                      Undo signature
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSignPad(true)}
                    disabled={signingConsultant}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    {signingConsultant ? 'Signing…' : 'Sign digitally'}
                  </button>
                )}
              </div>

              {/* Client */}
              <div className="rounded-xl border border-edge bg-base/50 p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink-2 font-semibold mb-3">Client</div>
                <div className="text-sm text-ink-1 font-medium truncate">
                  {activeClient?.contact || '—'}
                </div>
                <div className="text-xs text-ink-2 mb-4">{activeClient?.name || '—'}</div>
                {timesheet.client_signed_at ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Confirmed {format(new Date(timesheet.client_signed_at), 'd MMM yyyy')}
                  </div>
                ) : timesheet.consultant_signed_at ? (
                  <div className="space-y-2">
                    <p className="text-xs text-ink-2 leading-relaxed">
                      Export the PDF for physical or DocuSign signature, then mark confirmed here.
                    </p>
                    <button
                      onClick={signClient}
                      disabled={signingClient}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-edge hover:border-emerald-600 text-ink-1 hover:text-emerald-300 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {signingClient ? 'Marking…' : 'Mark client signed'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-ink-3">Sign the consultant section first.</p>
                )}
              </div>
            </div>

            {timesheet.consultant_signed_at && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <Lock className="w-3 h-3 shrink-0" />
                Entries locked after signing.
                <button onClick={unsignConsultant} className="underline underline-offset-2 hover:text-amber-200 transition-colors">
                  Undo to edit.
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer — offset by sidebar width on desktop so it never covers nav items */}
      <div className="fixed bottom-0 left-0 md:left-[var(--nav-w)] right-0 z-30 border-t border-edge/60 bg-base/90 backdrop-blur-sm transition-[left] duration-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* Totals */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-ink-2 uppercase tracking-wide">Total hours</div>
              <div className="text-lg font-bold text-emerald-300">{totalHours}</div>
            </div>
            {billable !== null && (
              <div>
                <div className="text-[10px] text-ink-2 uppercase tracking-wide">Billable</div>
                <div className="text-lg font-bold text-ink-1">{fmtRand(billable)}</div>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {saveMsg && (
              <span className="text-xs text-emerald-400 mr-1">{saveMsg}</span>
            )}
            <button
              onClick={() => {
                const m = format(currentMonth, 'yyyy-MM')
                setExportFrom(m); setExportTo(m); setExportErr(null); setShowExport(true)
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-edge hover:border-raised text-ink-2 hover:text-ink-1 text-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>
            <button
              onClick={handleSavePDF}
              disabled={savingPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-edge hover:border-emerald-600 text-ink-2 hover:text-emerald-300 text-sm transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {savingPdf ? 'Saving…' : 'Save to Docs'}
            </button>
          </div>
        </div>
      </div>

      {/* Signature drawing pad */}
      {showSignPad && (
        <SignaturePad
          saving={signingConsultant}
          savedSignature={profile?.saved_signature ?? null}
          onSave={(dataUrl, saveToProfile) => signConsultant(dataUrl, saveToProfile)}
          onClose={() => setShowSignPad(false)}
        />
      )}

      {/* New client panel */}
      {showNewClient && (
        <NewClientPanel userId={profile!.id} onSave={handleNewClient} onClose={() => setShowNewClient(false)} />
      )}

      {/* Export range modal */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-edge rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                Export timesheet
              </h2>
              <button onClick={() => setShowExport(false)} className="text-ink-2 hover:text-ink-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-ink-2 mb-5">
              Export <span className="text-ink-1 font-medium">{activeClient?.name}</span>. Pick a single month, or a
              range to merge consecutive months into one PDF.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-2 mb-1">From</label>
                <input
                  type="month"
                  value={exportFrom}
                  onChange={e => setExportFrom(e.target.value)}
                  className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-2 mb-1">To</label>
                <input
                  type="month"
                  value={exportTo}
                  onChange={e => setExportTo(e.target.value)}
                  className="w-full bg-raised border border-edge rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {exportErr && <p className="text-xs text-red-400 mt-3">{exportErr}</p>}

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowExport(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-edge text-sm text-ink-2 hover:text-ink-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={generateExport}
                disabled={exporting || !exportFrom || !exportTo}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {exporting ? 'Generating…' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
