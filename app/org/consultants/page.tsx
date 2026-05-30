'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, Users, Plus, Loader2, ArrowLeft,
  Mail, Check, X, Trash2, AlertCircle, Clock,
  UserRound,
} from 'lucide-react'
import type { KlippaOrganisation, KlippaOrgInvite } from '@/lib/types'

interface MemberRow {
  id:               string
  email:            string
  full_name:        string | null
  org_role:         string | null
  latest_timesheet: { status: string; month: string } | null
}

const STATUS_PILL: Record<string, string> = {
  pending:  'bg-amber-500/15 text-amber-300',
  accepted: 'bg-emerald-500/15 text-emerald-300',
  declined: 'bg-red-500/15 text-red-300',
}

export default function ConsultantsPage() {
  const router   = useRouter()
  const [org,          setOrg]          = useState<KlippaOrganisation | null>(null)
  const [members,      setMembers]      = useState<MemberRow[]>([])
  const [invites,      setInvites]      = useState<KlippaOrgInvite[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [inviteEmail,  setInviteEmail]  = useState('')
  const [sending,      setSending]      = useState(false)
  const [inviteMsg,    setInviteMsg]    = useState<string | null>(null)
  const [acceptUrl,    setAcceptUrl]    = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)
  const [removingId,   setRemovingId]   = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    setCurrentUserId(user.id)

    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('organisation_id, org_role')
      .eq('id', user.id)
      .single()

    if (!profile?.organisation_id) { router.replace('/dashboard'); return }

    const { data: orgData } = await supabase
      .from('klippa_organisations')
      .select('*')
      .eq('id', profile.organisation_id)
      .single()

    setOrg(orgData as KlippaOrganisation | null)

    const [membRes, invRes] = await Promise.all([
      fetch('/api/org/members'),
      fetch('/api/org/invite'),
    ])
    const [membJson, invJson] = await Promise.all([membRes.json(), invRes.json()])
    setMembers(membJson.members ?? [])
    setInvites(invJson.invites ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    setSending(true); setError(null); setInviteMsg(null); setAcceptUrl(null)
    try {
      const res  = await fetch('/api/org/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: inviteEmail.trim() }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setInvites((prev) => [json.invite, ...prev])
      setInviteEmail('')
      setInviteMsg(`Invite created for ${inviteEmail.trim()}`)
      setAcceptUrl(json.acceptUrl ?? null)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSending(false) }
  }

  const cancelInvite = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch('/api/org/invite', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
      setInvites((prev) => prev.filter((i) => i.id !== id))
    } finally { setDeletingId(null) }
  }

  const removeMember = async (memberId: string) => {
    if (!confirm('Remove this consultant from your organisation? They will lose access to the team workspace.')) return
    setRemovingId(memberId)
    try {
      const res  = await fetch('/api/org/members', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memberId }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch { setError('Failed to remove member') }
    finally { setRemovingId(null) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
      </div>
    )
  }

  const pendingInvites = invites.filter((i) => i.status === 'pending')

  return (
    <div className="min-h-screen bg-base text-ink-1">
      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <span className="text-edge">·</span>
          <span className="text-sm font-medium text-ink-2">{org?.name ?? 'Organisation'}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Back + title */}
        <div className="flex items-center gap-4">
          <Link href="/org/dashboard" className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-semibold">Consultants</h1>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* ── Invite form ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold text-ink-1">Invite a consultant</p>
            <p className="text-xs text-ink-2 mt-0.5">They'll receive a magic link to join your workspace on Klippa.</p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
                placeholder="consultant@example.com"
                className="input pl-9 py-2.5"
              />
            </div>
            <button
              onClick={sendInvite}
              disabled={sending || !inviteEmail.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Send invite
            </button>
          </div>

          {acceptUrl && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> {inviteMsg}
                </div>
                <button
                  onClick={() => { setAcceptUrl(null); setInviteMsg(null) }}
                  className="text-ink-3 hover:text-ink-1 transition-colors"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-ink-2">Copy this link and share it with the consultant (WhatsApp, email, etc.):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] text-emerald-300 font-mono break-all">{acceptUrl}</code>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  onClick={() => { navigator.clipboard.writeText(acceptUrl) }}
                  className="flex items-center gap-1.5 text-xs font-medium text-ink-1 hover:text-white px-3 py-1.5 rounded-lg border border-edge hover:border-emerald-500/50 bg-raised hover:bg-emerald-500/10 transition-colors"
                >
                  Copy link
                </button>
                <p className="text-[10px] text-ink-3">Expires in 7 days.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Pending invites ─────────────────────────────────────────── */}
        {pendingInvites.length > 0 && (
          <div className="rounded-2xl border border-edge overflow-hidden">
            <div className="px-5 py-4 border-b border-edge bg-surface/60">
              <p className="text-sm font-semibold">Pending invites
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-300">{pendingInvites.length}</span>
              </p>
            </div>
            <div className="divide-y divide-edge/50">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-ink-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-ink-1">{inv.invited_email}</p>
                      <p className="text-xs text-ink-3 mt-0.5">
                        Sent {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(new Date(inv.created_at))} ·
                        Expires {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(new Date(inv.expires_at))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[inv.status]}`}>
                      {inv.status === 'pending' ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span> : inv.status}
                    </span>
                    <button
                      onClick={() => cancelInvite(inv.id)}
                      disabled={deletingId === inv.id}
                      className="text-ink-3 hover:text-red-400 transition-colors"
                      title="Cancel invite"
                    >
                      {deletingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Active members ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60">
            <p className="text-sm font-semibold">Active members
              <span className="ml-2 text-xs text-ink-2">({members.length})</span>
            </p>
          </div>

          {members.length === 0 ? (
            <div className="px-5 py-12 text-center space-y-2">
              <UserRound className="w-8 h-8 text-edge mx-auto" />
              <p className="text-sm text-ink-2">No active members yet</p>
              <p className="text-xs text-ink-3">Consultants will appear here after accepting their invite.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge/50">
                  {['Name / Email', 'Role', 'Latest timesheet', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-ink-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const ts    = m.latest_timesheet
                  const month = ts ? new Date(ts.month + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : null
                  const pill  = ts
                    ? { draft: 'bg-edge text-ink-2', submitted: 'bg-amber-500/15 text-amber-300', approved: 'bg-emerald-500/15 text-emerald-300' }[ts.status] ?? 'bg-edge text-ink-2'
                    : null
                  return (
                    <tr key={m.id} className="border-b border-edge/40 last:border-0 hover:bg-surface/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium">{m.full_name ?? m.email}</p>
                        {m.full_name && <p className="text-xs text-ink-3">{m.email}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-ink-2 capitalize">{m.org_role ?? 'member'}</td>
                      <td className="px-5 py-3.5 text-xs text-ink-2">{month ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        {pill ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pill}`}>
                            {ts!.status}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">No timesheets</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {m.id !== currentUserId && (
                          <button
                            onClick={() => removeMember(m.id)}
                            disabled={removingId === m.id}
                            className="text-ink-3 hover:text-red-400 transition-colors disabled:opacity-40"
                            title="Remove from org"
                          >
                            {removingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Past invites (non-pending) */}
        {invites.filter((i) => i.status !== 'pending').length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-2 px-1">Past invites</p>
            <div className="rounded-xl border border-edge divide-y divide-edge/40 overflow-hidden">
              {invites.filter((i) => i.status !== 'pending').map((inv) => (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between">
                  <p className="text-xs text-ink-2">{inv.invited_email}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[inv.status] ?? ''}`}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
