'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, Users, Settings, ArrowLeft,
  CalendarDays, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, Bell, Plus, Loader2,
  FileX, ChevronRight, Check, X,
  BriefcaseBusiness, CircleDollarSign,
} from 'lucide-react'
import type { KlippaOrganisation, OrgIntelligence, OrgConsultantRow } from '@/lib/types'

// ── helpers ──────────────────────────────────────────────────────

function formatDate(s: string) {
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

function formatMoney(n: number | null | undefined) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0))
}

function ComplianceDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`w-2 h-2 rounded-full ${i < score ? 'bg-emerald-500' : 'bg-edge'}`} />
      ))}
    </div>
  )
}

const TS_PILL: Record<string, string> = {
  draft:     'bg-edge text-ink-2',
  submitted: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  approved:  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
}

// ── Stat card ──────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'emerald', alert = false }: {
  icon:   React.ElementType
  label:  string
  value:  string | number
  sub?:   string
  color?: 'emerald' | 'amber' | 'red' | 'blue'
  alert?: boolean
}) {
  const colors = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    amber:   'text-amber-600   dark:text-amber-400   bg-amber-500/10',
    red:     'text-red-500     dark:text-red-400     bg-red-500/10',
    blue:    'text-blue-600    dark:text-blue-400    bg-blue-500/10',
  }
  return (
    <div className={`rounded-2xl border ${alert ? 'border-amber-500/40' : 'border-edge'} bg-surface p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-ink-1 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-ink-2 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Contract badge ─────────────────────────────────────────────

function ContractBadge({ contract }: { contract: OrgConsultantRow['contract'] }) {
  if (!contract) return <span className="text-xs text-ink-3">No contract</span>
  if (!contract.end_date) {
    return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Permanent</span>
  }
  const days = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86_400_000)
  if (days < 0)   return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-500">Expired</span>
  if (days <= 14) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-500">{days}d left</span>
  if (days <= 30) return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-600 dark:text-amber-300">{days}d left</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-edge text-ink-2">{formatDate(contract.end_date)}</span>
}

// ── Main page ──────────────────────────────────────────────────

export default function OrgDashboardPage() {
  const router  = useRouter()
  const [org,       setOrg]       = useState<KlippaOrganisation | null>(null)
  const [intel,     setIntel]     = useState<OrgIntelligence | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [sending,   setSending]   = useState(false)
  const [sentMsg,   setSentMsg]   = useState<string | null>(null)
  const [isOwner,   setIsOwner]   = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('user_type, organisation_id, org_role')
      .eq('id', user.id)
      .single()

    if (!profile?.organisation_id) { router.replace('/dashboard'); return }
    setIsOwner(profile.org_role === 'org-admin')

    const { data: orgData } = await supabase
      .from('klippa_organisations')
      .select('*')
      .eq('id', profile.organisation_id)
      .single()

    setOrg(orgData as KlippaOrganisation | null)

    const res  = await fetch('/api/org/intelligence')
    const json = await res.json()
    if (json.error) { setError(json.error); setLoading(false); return }
    setIntel(json as OrgIntelligence)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const sendReminders = async (ids?: string[]) => {
    setSending(true); setSentMsg(null)
    try {
      const res  = await fetch('/api/org/reminders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(ids ? { consultant_ids: ids } : {}),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setSentMsg(`${json.sent} reminder${json.sent !== 1 ? 's' : ''} sent`)
      setTimeout(() => setSentMsg(null), 4000)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSending(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
      </div>
    )
  }

  const period   = intel?.current_period
  const deadline = intel?.days_until_deadline
  const missing  = intel?.missing_timesheets ?? []
  const expiring = intel?.expiring_contracts ?? []

  const deadlineColor = deadline == null ? 'blue'
    : deadline <= 2 ? 'red'
    : deadline <= 5 ? 'amber'
    : 'emerald'

  return (
    <div className="min-h-screen bg-base text-ink-1">

      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight">Klippa</span>
            </Link>
            <span className="text-edge hidden sm:inline">·</span>
            <span className="text-sm font-medium text-ink-2 hidden sm:inline truncate max-w-[40vw]">{org?.name ?? 'Organisation'}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link href="/org/payroll" className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors">
              <CalendarDays className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Payroll</span>
            </Link>
            <Link href="/org/placements" className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-1 hover:bg-raised transition-colors">
              <BriefcaseBusiness className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Placements</span>
            </Link>
            <Link href="/org/consultants" className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Users className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Team</span>
            </Link>
            <Link href="/org/settings" className="p-2 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-raised border border-edge transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </Link>
            <Link href="/dashboard" className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">My profile</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* ── Stat cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard icon={BriefcaseBusiness} label="Placements" value={intel?.placement_summary?.active ?? 0}
            color="blue"
            sub={`${intel?.placement_summary?.ready_to_bill ?? 0} ready to bill`}
          />
          <StatCard icon={CircleDollarSign} label="Projected margin" value={formatMoney(intel?.placement_summary?.projected_margin ?? 0)}
            color={(intel?.placement_summary?.projected_margin ?? 0) < 0 ? 'red' : 'emerald'}
            alert={(intel?.placement_summary?.projected_margin ?? 0) < 0}
            sub={intel?.placement_summary?.margin_pct == null ? 'no billable hours yet' : `${intel.placement_summary.margin_pct}% margin`}
          />
          <StatCard icon={TrendingUp} label="Submission rate"   value={`${intel?.submission_rate ?? 0}%`}
            color={(intel?.submission_rate ?? 100) < 80 ? 'amber' : 'emerald'}
            sub={period ? `for ${period.name}` : 'all time'}
          />
          <StatCard icon={FileX}      label="Blocked"           value={intel?.placement_summary?.blocked ?? missing.length}
            color={(intel?.placement_summary?.blocked ?? missing.length) > 0 ? 'amber' : 'emerald'}
            alert={(intel?.placement_summary?.blocked ?? missing.length) > 0}
            sub={`${intel?.placement_summary?.client_approval_due ?? 0} need client sign-off`}
          />
          <StatCard icon={AlertTriangle} label="Contracts expiring" value={expiring.length}
            color={expiring.length > 0 ? 'amber' : 'emerald'}
            alert={expiring.length > 0}
            sub={expiring.length > 0 ? 'within 30 days' : 'none in 30 days'}
          />
          <StatCard icon={CalendarDays} label="Payroll deadline" value={
            deadline == null ? '—'
            : deadline === 0 ? 'Today'
            : deadline < 0  ? 'Overdue'
            : `${deadline}d`
          }
            color={deadlineColor}
            alert={deadline != null && deadline <= 2}
            sub={period ? period.name : 'No open period'}
          />
        </div>

        {intel?.placement_summary && intel.placement_summary.active > 0 && (
          <div className="rounded-2xl border border-edge bg-surface/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink-1">Placement billing control</p>
              <p className="text-xs text-ink-2 mt-0.5">
                {intel.placement_summary.ready_to_bill}/{intel.placement_summary.active} placements can be invoiced.
                {' '}{intel.placement_summary.ready_to_pay}/{intel.placement_summary.active} contractors are ready for payment.
              </p>
            </div>
            <Link href="/org/placements" className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              Review placements <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* ── Payroll period alert banner ─────────────────────── */}
        {period && missing.length > 0 && (
          <div className={`rounded-2xl border p-5 space-y-4 ${
            deadline != null && deadline <= 2
              ? 'border-red-500/40 bg-red-500/5'
              : 'border-amber-500/40 bg-amber-500/5'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Clock className={`w-4 h-4 flex-shrink-0 ${deadline != null && deadline <= 2 ? 'text-red-400' : 'text-amber-500'}`} />
                <div>
                  <p className="text-sm font-semibold text-ink-1">
                    {deadline != null && deadline <= 0
                      ? `Payroll deadline passed: ${period.name}`
                      : deadline === 0
                      ? `Payroll closes today: ${period.name}`
                      : `Payroll closes in ${deadline} day${deadline !== 1 ? 's' : ''}: ${period.name}`}
                  </p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {missing.length} consultant{missing.length !== 1 ? 's haven\'t' : ' hasn\'t'} submitted yet
                  </p>
                </div>
              </div>
              {isOwner && (
                <button
                  onClick={() => sendReminders(missing.map(m => m.id))}
                  disabled={sending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                  Nudge all
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {missing.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-edge text-xs">
                  <span className="text-ink-1 font-medium">{m.name}</span>
                  {isOwner && (
                    <button
                      onClick={() => sendReminders([m.id])}
                      disabled={sending}
                      className="text-ink-3 hover:text-amber-500 transition-colors"
                      title="Send reminder"
                    >
                      <Bell className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {sentMsg && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" /> {sentMsg}
              </div>
            )}
          </div>
        )}

        {/* No period set yet */}
        {!period && isOwner && (
          <div className="rounded-2xl border border-dashed border-edge p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-1">No open payroll period</p>
              <p className="text-xs text-ink-2 mt-0.5">Set a payroll period to track deadlines and submission rates.</p>
            </div>
            <Link href="/org/payroll" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Set period
            </Link>
          </div>
        )}

        {/* ── Expiring contracts alert ────────────────────────── */}
        {expiring.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-ink-1">
                {expiring.length} contract{expiring.length !== 1 ? 's' : ''} expiring within 30 days
              </p>
            </div>
            <div className="space-y-2">
              {expiring.map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-ink-1 font-medium">{c.name}</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    c.days_left <= 7 ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                  }`}>
                    {c.days_left === 0 ? 'Today' : `${c.days_left}d · ${formatDate(c.end_date)}`}
                  </span>
                </div>
              ))}
            </div>
            <Link href="/org/consultants" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
              Manage contracts <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* ── Consultants table ───────────────────────────────── */}
        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Consultants</p>
              <p className="text-xs text-ink-2 mt-0.5">{intel?.active_consultants ?? 0} active</p>
            </div>
            <Link href="/org/consultants" className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
              Manage <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {!intel?.consultants?.length ? (
            <div className="px-5 py-12 text-center space-y-3">
              <Users className="w-8 h-8 text-edge mx-auto" />
              <p className="text-sm text-ink-2">No consultants yet</p>
              <Link href="/org/consultants" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Invite consultant
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-edge/50 bg-surface/40">
                    {['Consultant', 'Contract', 'Compliance', 'Timesheet', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-ink-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {intel.consultants.map(c => {
                    const ts   = c.latest_timesheet
                    const pill = ts ? TS_PILL[ts.status] ?? 'bg-edge text-ink-2' : null
                    const month = ts ? new Date(ts.month + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : null

                    return (
                      <tr key={c.id} onClick={() => router.push(`/org/consultants/${c.id}`)} className="border-b border-edge/40 last:border-0 hover:bg-surface/60 transition-colors cursor-pointer">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-sm text-ink-1">{c.full_name ?? c.email}</p>
                          {c.full_name && <p className="text-xs text-ink-3">{c.email}</p>}
                        </td>
                        <td className="px-5 py-3.5"><ContractBadge contract={c.contract} /></td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <ComplianceDots score={c.compliance_score} />
                            <span className="text-xs text-ink-2">{c.compliance_score}/5</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {pill ? (
                            <div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pill}`}>{ts!.status}</span>
                              {month && <p className="text-xs text-ink-3 mt-0.5">{month}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-ink-3">No timesheets</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <ChevronRight className="w-3.5 h-3.5 text-ink-3" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
