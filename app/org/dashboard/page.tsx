'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, Users, FileText, Clock,
  CheckCircle2, AlertCircle, Loader2,
  ArrowRight, Plus, Settings,
} from 'lucide-react'
import type { KlippaOrganisation } from '@/lib/types'

interface MemberRow {
  id:               string
  email:            string
  full_name:        string | null
  org_role:         string | null
  latest_timesheet: { status: string; month: string } | null
}

const TS_STATUS: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',                   color: 'bg-edge text-ink-2' },
  submitted: { label: 'Awaiting client sign-off', color: 'bg-amber-500/15 text-amber-300' },
  approved:  { label: 'Approved',                 color: 'bg-emerald-500/15 text-emerald-300' },
}

export default function OrgDashboardPage() {
  const router = useRouter()
  const [org,     setOrg]     = useState<KlippaOrganisation | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    // Load org from profile
    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('user_type, organisation_id, org_role')
      .eq('id', user.id)
      .single()

    if (!profile?.organisation_id) {
      // Not an org user — redirect appropriately
      router.replace('/dashboard')
      return
    }

    const { data: orgData } = await supabase
      .from('klippa_organisations')
      .select('*')
      .eq('id', profile.organisation_id)
      .single()

    setOrg(orgData as KlippaOrganisation | null)

    // Load members via API (needs service role for auth.users emails)
    try {
      const res = await fetch('/api/org/members')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setMembers(json.members ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    }

    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
      </div>
    )
  }

  const pendingApproval  = members.filter((m) => m.latest_timesheet?.status === 'submitted').length
  const approvedCount    = members.filter((m) => m.latest_timesheet?.status === 'approved').length

  return (
    <div className="min-h-screen bg-base text-ink-1">
      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm tracking-tight">Klippa</span>
            </Link>
            <span className="text-edge">·</span>
            <span className="text-sm font-medium text-ink-2">
              {org?.org_type === 'practice' ? 'Practice' : 'Company'}: {org?.name ?? '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/org/consultants" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Users className="w-3.5 h-3.5" /> Manage team
            </Link>
            <Link href="/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors">
              My profile
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Page title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{org?.name ?? 'Organisation'}</h1>
            <p className="text-sm text-ink-2 mt-0.5 capitalize">{org?.org_type ?? 'company'} workspace · {members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
          <Link
            href="/org/consultants"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Invite consultant
          </Link>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: <Users className="w-5 h-5 text-emerald-400" />,      label: 'Total consultants', value: members.length,     sub: 'active members' },
            { icon: <Clock className="w-5 h-5 text-amber-400" />,        label: 'Awaiting approval', value: pendingApproval,    sub: 'timesheets submitted' },
            { icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />, label: 'Approved this month', value: approvedCount,  sub: 'timesheets approved' },
          ].map(({ icon, label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-2">
              <div className="flex items-center gap-2">
                {icon}
                <span className="text-xs font-medium text-ink-2">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-ink-3">{sub}</p>
            </div>
          ))}
        </div>

        {/* Consultant table */}
        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60 flex items-center justify-between">
            <p className="text-sm font-semibold">Consultants</p>
            <Link href="/org/consultants" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {members.length === 0 ? (
            <div className="px-5 py-12 text-center space-y-3">
              <Users className="w-8 h-8 text-edge mx-auto" />
              <div>
                <p className="text-sm font-medium text-ink-2">No consultants yet</p>
                <p className="text-xs text-ink-3 mt-1">Invite your first consultant to get started.</p>
              </div>
              <Link href="/org/consultants" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Invite consultant
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge/50">
                  {['Consultant', 'Role', 'Latest timesheet', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-ink-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const ts     = m.latest_timesheet
                  const tsConf = ts ? (TS_STATUS[ts.status] ?? TS_STATUS.draft) : null
                  const monthLabel = ts
                    ? new Date(ts.month + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
                    : null
                  return (
                    <tr key={m.id} className="border-b border-edge/40 hover:bg-surface/60 transition-colors last:border-0">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-ink-1">{m.full_name ?? m.email}</p>
                        {m.full_name && <p className="text-xs text-ink-3">{m.email}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-ink-2 capitalize">{m.org_role ?? 'member'}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-2">{monthLabel ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        {tsConf ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tsConf.color}`}>
                            {tsConf.label}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">No timesheets</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {ts?.status === 'submitted' && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                            <Clock className="w-3 h-3" /> Needs review
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick links */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/timesheets" className="rounded-xl border border-edge bg-surface/30 hover:bg-surface/60 p-5 flex items-center gap-4 transition-colors group">
            <FileText className="w-8 h-8 text-ink-3 group-hover:text-emerald-400 transition-colors" />
            <div>
              <p className="text-sm font-semibold text-ink-1">My timesheets</p>
              <p className="text-xs text-ink-2 mt-0.5">View and manage your own timesheet records</p>
            </div>
            <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-400 ml-auto transition-colors" />
          </Link>
          <Link href="/dashboard" className="rounded-xl border border-edge bg-surface/30 hover:bg-surface/60 p-5 flex items-center gap-4 transition-colors group">
            <Settings className="w-8 h-8 text-ink-3 group-hover:text-emerald-400 transition-colors" />
            <div>
              <p className="text-sm font-semibold text-ink-1">My tax profile</p>
              <p className="text-xs text-ink-2 mt-0.5">Manage your personal tax return and expenses</p>
            </div>
            <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-emerald-400 ml-auto transition-colors" />
          </Link>
        </div>

      </main>
    </div>
  )
}
