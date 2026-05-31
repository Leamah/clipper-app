'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck, ArrowLeft, Loader2, AlertTriangle, Check, X,
  Mail, CalendarDays, Wallet, Clock, FileText, BadgeCheck,
  TrendingUp, FileSignature, Lock,
} from 'lucide-react'

// ── types ────────────────────────────────────────────────────────
type Consultant = {
  id: string; full_name: string | null; email: string
  user_type: string | null; org_role: string | null; created_at: string
}
type Stats = {
  total_earnings: number; total_hours: number; timesheet_count: number
  submitted_count: number; approved_count: number; pending_review: number
  compliance_score: number
}
type Contract = {
  id: string; contract_type: string | null; start_date: string | null
  end_date: string | null; rate: number | null; rate_type: string | null
  status: string | null; notes: string | null
}
type Compliance = {
  tax_profile_complete: boolean; banking_verified: boolean; id_verified: boolean
  popia_consent: boolean; signed_agreement_at: string | null; notes: string | null
} | null
type HistoryRow = {
  id: string; month: string; status: string; position: string | null
  hourly_rate: number; hours: number; earnings: number
  consultant_signed_at: string | null; client_signed_at: string | null
  org_approved_at: string | null; org_rejected_at: string | null
  org_review_note: string | null; locked_at: string | null
}
type Trend = { month: string; earnings: number; hours: number; status: string }
type Payload = {
  consultant: Consultant; stats: Stats; contracts: Contract[]
  compliance: Compliance; history: HistoryRow[]; trend: Trend[]
}

// ── helpers ──────────────────────────────────────────────────────
const zar = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
const monthLabel = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
const dayLabel   = (s: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))

const STATUS_PILL: Record<string, string> = {
  draft:     'bg-edge text-ink-2',
  submitted: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  approved:  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
}

function StatCard({ icon: Icon, label, value, sub, color = 'emerald' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string
  color?: 'emerald' | 'amber' | 'blue' | 'violet'
}) {
  const c = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    amber:   'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    blue:    'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    violet:  'text-violet-600 dark:text-violet-400 bg-violet-500/10',
  }[color]
  return (
    <div className="rounded-2xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c}`}><Icon className="w-4 h-4" /></div>
      </div>
      <div>
        <p className="text-2xl font-bold text-ink-1 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-ink-2 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// Simple earnings trend bar chart (no chart lib)
function TrendChart({ trend }: { trend: Trend[] }) {
  if (trend.length === 0) return null
  const max = Math.max(...trend.map(t => t.earnings), 1)
  return (
    <div className="flex items-end gap-2 h-32">
      {trend.map(t => {
        const h = Math.max(4, Math.round((t.earnings / max) * 100))
        return (
          <div key={t.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="w-full flex flex-col justify-end h-24">
              <div
                className={`w-full rounded-t-md transition-all ${t.status === 'approved' ? 'bg-emerald-500' : t.status === 'submitted' ? 'bg-amber-500' : 'bg-edge'}`}
                style={{ height: `${h}%` }}
                title={`${monthLabel(t.month)}: ${zar(t.earnings)}`}
              />
            </div>
            <span className="text-[10px] text-ink-3 truncate w-full text-center">{monthLabel(t.month).split(' ')[0]}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ConsultantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [data,    setData]    = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [busyId,  setBusyId]  = useState<string | null>(null)

  const load = useCallback(async () => {
    const res  = await fetch(`/api/org/consultants/${id}`)
    const json = await res.json()
    if (json.error) { setError(json.error); setLoading(false); return }
    setData(json as Payload)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const review = async (timesheetId: string, action: 'approve' | 'reject') => {
    setBusyId(timesheetId); setError(null)
    try {
      const res  = await fetch(`/api/org/consultants/${id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ timesheet_id: timesheetId, action }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusyId(null) }
  }

  if (loading) {
    return <div className="min-h-screen bg-base flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-3" /></div>
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm text-ink-2">{error}</p>
        <button onClick={() => router.push('/org/dashboard')} className="text-xs text-emerald-500 hover:underline">Back to dashboard</button>
      </div>
    )
  }

  const c          = data!.consultant
  const stats      = data!.stats
  const history    = data!.history
  const contracts  = data!.contracts
  const compliance = data!.compliance
  const pending    = history.filter(h => h.status === 'submitted' && !h.org_approved_at && !h.org_rejected_at)

  const complianceItems = [
    { label: 'Tax profile',     ok: !!compliance?.tax_profile_complete },
    { label: 'Banking verified', ok: !!compliance?.banking_verified },
    { label: 'ID verified',     ok: !!compliance?.id_verified },
    { label: 'POPIA consent',   ok: !!compliance?.popia_consent },
    { label: 'Signed agreement', ok: !!compliance?.signed_agreement_at },
  ]

  return (
    <div className="min-h-screen bg-base text-ink-1">
      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href="/org/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* Identity */}
        <div className="rounded-2xl border border-edge bg-surface p-6 flex flex-wrap items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {(c.full_name ?? c.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink-1">{c.full_name ?? c.email}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-ink-2">
              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>
              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Joined {dayLabel(c.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Wallet}     label="Total earned"   value={zar(stats.total_earnings)} color="emerald" sub={`${stats.timesheet_count} timesheet${stats.timesheet_count !== 1 ? 's' : ''}`} />
          <StatCard icon={Clock}      label="Total hours"    value={stats.total_hours.toFixed(0)} color="blue" sub="logged all-time" />
          <StatCard icon={FileText}   label="Pending review" value={stats.pending_review} color={stats.pending_review > 0 ? 'amber' : 'emerald'} sub={stats.pending_review > 0 ? 'awaiting approval' : 'all reviewed'} />
          <StatCard icon={BadgeCheck} label="Compliance"     value={`${stats.compliance_score}/5`} color={stats.compliance_score >= 4 ? 'emerald' : 'amber'} sub="checks complete" />
        </div>

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-semibold text-ink-1">{pending.length} timesheet{pending.length !== 1 ? 's' : ''} awaiting your approval</p>
            </div>
            <div className="space-y-2">
              {pending.map(h => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface border border-edge px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-1">{monthLabel(h.month)}</p>
                    <p className="text-xs text-ink-2">{h.hours.toFixed(1)}h · {zar(h.earnings)}{h.client_signed_at ? ' · client signed ✓' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => review(h.id, 'reject')} disabled={busyId === h.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 transition-colors">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button onClick={() => review(h.id, 'approve')} disabled={busyId === h.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                      {busyId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Earnings trend + Compliance side by side */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-edge bg-surface p-6 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <p className="text-sm font-semibold">Earnings trend</p>
            </div>
            {data!.trend.length > 0
              ? <TrendChart trend={data!.trend} />
              : <p className="text-xs text-ink-3 py-8 text-center">No timesheet history yet</p>}
          </div>

          <div className="rounded-2xl border border-edge bg-surface p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-emerald-500" />
              <p className="text-sm font-semibold">Compliance</p>
            </div>
            <div className="space-y-2.5">
              {complianceItems.map(item => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <span className="text-ink-2">{item.label}</span>
                  {item.ok
                    ? <Check className="w-4 h-4 text-emerald-500" />
                    : <X className="w-4 h-4 text-ink-3" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contracts */}
        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60">
            <p className="text-sm font-semibold">Contract history</p>
          </div>
          {contracts.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-ink-3">No contracts on record</p>
          ) : (
            <div className="divide-y divide-edge/40">
              {contracts.map(ct => (
                <div key={ct.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink-1 capitalize">{ct.contract_type ?? 'Contract'}</p>
                    <p className="text-xs text-ink-2 mt-0.5">
                      {ct.start_date ? dayLabel(ct.start_date) : '—'} → {ct.end_date ? dayLabel(ct.end_date) : 'Permanent'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {ct.rate != null && (
                      <span className="text-xs text-ink-2">{zar(Number(ct.rate))}{ct.rate_type ? `/${ct.rate_type}` : ''}</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ct.status === 'active' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-edge text-ink-2'}`}>
                      {ct.status ?? 'unknown'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Full timesheet history */}
        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60">
            <p className="text-sm font-semibold">Timesheet history</p>
            <p className="text-xs text-ink-2 mt-0.5">{history.length} record{history.length !== 1 ? 's' : ''}</p>
          </div>
          {history.length === 0 ? (
            <p className="px-5 py-12 text-center text-xs text-ink-3">No timesheets submitted yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge/50 bg-surface/40">
                    {['Month', 'Hours', 'Rate', 'Earnings', 'Status', 'Sign-off', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-ink-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-edge/40 last:border-0 hover:bg-surface/60 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-ink-1">{monthLabel(h.month)}</td>
                      <td className="px-5 py-3.5 text-ink-2 tabular-nums">{h.hours.toFixed(1)}</td>
                      <td className="px-5 py-3.5 text-ink-2 tabular-nums">{zar(h.hourly_rate)}</td>
                      <td className="px-5 py-3.5 font-medium text-ink-1 tabular-nums">{zar(h.earnings)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[h.status] ?? 'bg-edge text-ink-2'}`}>{h.status}</span>
                        {h.org_rejected_at && <p className="text-[10px] text-red-400 mt-0.5">returned for fixes</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {h.client_signed_at && <span title="Client signed"><FileSignature className="w-3.5 h-3.5 text-emerald-500" /></span>}
                          {h.locked_at && <span title="Locked"><Lock className="w-3.5 h-3.5 text-ink-3" /></span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {h.status === 'submitted' && !h.org_approved_at && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => review(h.id, 'reject')} disabled={busyId === h.id}
                              className="px-2 py-1 rounded-md text-xs border border-edge text-ink-2 hover:text-red-400 disabled:opacity-50 transition-colors">Reject</button>
                            <button onClick={() => review(h.id, 'approve')} disabled={busyId === h.id}
                              className="px-2 py-1 rounded-md text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                              {busyId === h.id ? '…' : 'Approve'}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
