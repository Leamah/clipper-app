'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, Users, Plus, Loader2, ArrowLeft,
  Mail, Check, X, Trash2, AlertCircle, Clock,
  UserRound, ChevronDown, ChevronUp, Shield,
  FileText, CreditCard, IdCard, CheckCircle2,
  RefreshCw, ArrowRight,
} from 'lucide-react'
import type {
  KlippaOrganisation, KlippaOrgInvite,
  KlippaConsultantContract, KlippaConsultantCompliance,
  OrgConsultantRow,
} from '@/lib/types'

const STATUS_PILL: Record<string, string> = {
  pending:  'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  accepted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  declined: 'bg-red-500/15 text-red-400',
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  fixed_term: 'Fixed term', permanent: 'Permanent',
  freelance: 'Freelance', retainer: 'Retainer',
}
const RATE_TYPE_LABELS: Record<string, string> = {
  hourly: '/hr', daily: '/day', monthly: '/mo', project: ' flat',
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

function formatRand(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}

// ── Compliance checklist panel ───────────────────────────────

function CompliancePanel({ consultant, onUpdate }: {
  consultant: OrgConsultantRow
  onUpdate:   (userId: string, field: string, value: boolean, evidence?: string) => Promise<void>
}) {
  const c = consultant.compliance
  const evidence = (c?.evidence ?? {}) as Record<string, string>
  const items: { key: string; label: string; icon: React.ElementType; value: boolean }[] = [
    { key: 'tax_profile_complete', label: 'Tax profile complete', icon: FileText,    value: c?.tax_profile_complete ?? false },
    { key: 'id_verified',          label: 'ID verified',          icon: IdCard,      value: c?.id_verified          ?? false },
    { key: 'banking_verified',     label: 'Banking verified',     icon: CreditCard,  value: c?.banking_verified     ?? false },
    { key: 'popia_consent',        label: 'POPIA consent',        icon: Shield,      value: c?.popia_consent        ?? false },
    { key: 'signed_agreement_at',  label: 'Agreement signed',     icon: CheckCircle2, value: !!(c?.signed_agreement_at) },
  ]

  return (
    <div className="px-5 py-4 bg-raised/30 border-t border-edge/40 space-y-3">
      <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Compliance checklist</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {items.map(item => (
          <div
            key={item.key}
            className={`p-3 rounded-xl border text-xs transition-all ${
              item.value
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-edge bg-surface text-ink-2'
            }`}
          >
            <button
              onClick={() => onUpdate(consultant.id, item.key, !item.value, evidence[item.key])}
              className="w-full flex flex-col items-center gap-1.5 font-medium"
            >
              <item.icon className="w-4 h-4" />
              <span className="text-center leading-tight">{item.label}</span>
              {item.value ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current opacity-40" />}
            </button>
            <input
              type="text"
              defaultValue={evidence[item.key] ?? ''}
              onBlur={e => {
                const value = e.target.value.trim()
                if (value !== (evidence[item.key] ?? '')) onUpdate(consultant.id, item.key, item.value, value)
              }}
              placeholder="Proof ref"
              className="input mt-2 text-[11px] py-1.5"
            />
          </div>
        ))}
      </div>
      {c?.signed_agreement_at && (
        <p className="text-xs text-ink-3">Agreement signed {formatDate(c.signed_agreement_at)}</p>
      )}
      {c?.verified_at && (
        <p className="text-xs text-ink-3">Last verified {formatDate(c.verified_at)}</p>
      )}
    </div>
  )
}

// ── Contract form ───────────────────────────────────────────

function ContractForm({ userId, existing, onSaved, onCancel }: {
  userId:   string
  existing: KlippaConsultantContract | null
  onSaved:  (c: KlippaConsultantContract) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    contract_type: existing?.contract_type ?? 'fixed_term',
    start_date:    existing?.start_date    ?? '',
    end_date:      existing?.end_date      ?? '',
    rate:          existing?.rate?.toString() ?? '',
    rate_type:     existing?.rate_type     ?? 'monthly',
    notes:         existing?.notes         ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const payload = {
        ...form,
        rate:       form.rate       ? parseFloat(form.rate) : null,
        start_date: form.start_date || null,
        end_date:   form.end_date   || null,
        notes:      form.notes      || null,
      }
      const body = existing?.id
        ? { id: existing.id, ...payload }
        : { user_id: userId,  ...payload }

      const res  = await fetch('/api/org/contracts', {
        method:  existing?.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      onSaved(json.contract)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  const f = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-2">Type</label>
          <select value={form.contract_type} onChange={e => f('contract_type', e.target.value)} className="input">
            {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-2">Rate type</label>
          <select value={form.rate_type} onChange={e => f('rate_type', e.target.value)} className="input">
            {Object.entries(RATE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-2">Start date</label>
          <input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} className="input" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-2">End date (blank = open)</label>
          <input type="date" value={form.end_date} onChange={e => f('end_date', e.target.value)} className="input" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-2">Rate (R)</label>
          <input type="number" min="0" value={form.rate} onChange={e => f('rate', e.target.value)} placeholder="0" className="input" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-ink-2">Notes</label>
        <input type="text" value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Optional notes" className="input" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {saving ? 'Saving…' : 'Save contract'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────

export default function ConsultantsPage() {
  const router = useRouter()
  const [org,            setOrg]            = useState<KlippaOrganisation | null>(null)
  const [consultants,    setConsultants]    = useState<OrgConsultantRow[]>([])
  const [invites,        setInvites]        = useState<KlippaOrgInvite[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [inviteEmail,    setInviteEmail]    = useState('')
  const [sending,        setSending]        = useState(false)
  const [inviteMsg,      setInviteMsg]      = useState<string | null>(null)
  const [acceptUrl,      setAcceptUrl]      = useState<string | null>(null)
  const [deletingId,       setDeletingId]       = useState<string | null>(null)
  const [removingId,       setRemovingId]       = useState<string | null>(null)
  const [currentUserId,    setCurrentUserId]    = useState<string | null>(null)
  const [isOwner,          setIsOwner]          = useState(false)
  const [expandedId,       setExpandedId]       = useState<string | null>(null)
  const [contractFormId,   setContractFormId]   = useState<string | null>(null)
  const [inviteAccessUntil, setInviteAccessUntil] = useState('')       // optional seat end date
  const [reassignId,       setReassignId]       = useState<string | null>(null)  // member being reassigned
  const [reassignNotes,    setReassignNotes]    = useState('')
  const [reassignEmail,    setReassignEmail]    = useState('')
  const [reassigning,      setReassigning]      = useState(false)
  const [reassignDone,     setReassignDone]     = useState<string | null>(null)

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
    setIsOwner(profile.org_role === 'org-admin')

    const { data: orgData } = await supabase
      .from('klippa_organisations')
      .select('*')
      .eq('id', profile.organisation_id)
      .single()

    setOrg(orgData as KlippaOrganisation | null)

    const [intelRes, invRes] = await Promise.all([
      fetch('/api/org/intelligence'),
      fetch('/api/org/invite'),
    ])
    const [intelJson, invJson] = await Promise.all([intelRes.json(), invRes.json()])
    setConsultants(intelJson.consultants ?? [])
    setInvites(invJson.invites ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    load()
    // Re-fetch when the user navigates back to this tab / page (App Router
    // caches the previous render and won't re-run effects on soft back).
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const handleReassign = async (memberId: string, memberName: string) => {
    setReassigning(true)
    try {
      await fetch('/api/leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_type:     'seat_reassignment',
          notes:         reassignNotes.trim() || undefined,
          contact_email: reassignEmail.trim() || undefined,
          metadata:      { member_id: memberId, member_name: memberName, org_name: org?.name },
        }),
      })
      setReassignDone(memberId)
      setReassignId(null)
      setReassignNotes('')
      setReassignEmail('')
    } catch {
      setReassignDone(memberId)
      setReassignId(null)
    } finally {
      setReassigning(false)
    }
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    setSending(true); setError(null); setInviteMsg(null); setAcceptUrl(null)
    try {
      const res  = await fetch('/api/org/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:             inviteEmail.trim(),
          seat_access_until: inviteAccessUntil || undefined,
        }),
      })
      const json = await res.json()
      if (res.status === 402 && json.checkoutUrl) { router.push(json.checkoutUrl); return }
      if (json.error) throw new Error(json.error)
      setInvites(prev => [json.invite, ...prev])
      const invitedTo = inviteEmail.trim()
      setInviteEmail('')
      router.refresh()   // bust App Router cache so back-navigation shows fresh data
      if (json.emailSent) {
        setInviteMsg(`Invitation emailed to ${invitedTo}`)
        setAcceptUrl(null)               // email sent — no need for manual link
      } else {
        const reason = json.emailError ? ` (${json.emailError})` : ''
        setInviteMsg(`Invite created for ${invitedTo}. Email failed${reason}, share the link below.`)
        setAcceptUrl(json.acceptUrl ?? null)
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSending(false) }
  }

  const cancelInvite = async (id: string) => {
    setDeletingId(id)
    await fetch('/api/org/invite', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setInvites(prev => prev.filter(i => i.id !== id))
    setDeletingId(null)
  }

  const removeMember = async (memberId: string) => {
    if (!confirm('Remove this contractor from your placement workspace?')) return
    setRemovingId(memberId)
    const res  = await fetch('/api/org/members', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) })
    const json = await res.json()
    if (json.error) { setError(json.error); setRemovingId(null); return }
    setConsultants(prev => prev.filter(c => c.id !== memberId))
    setRemovingId(null)
    router.refresh()
  }

  const updateCompliance = async (userId: string, field: string, value: boolean, evidenceRef?: string) => {
    const current = consultants.find(c => c.id === userId)?.compliance?.evidence ?? {}
    const res  = await fetch('/api/org/compliance', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        [field]: value,
        evidence: evidenceRef !== undefined ? { ...current, [field]: evidenceRef } : current,
      }),
    })
    const json = await res.json()
    if (!json.error) {
      setConsultants(prev => prev.map(c => {
        if (c.id !== userId) return c
        const newComp = json.compliance as KlippaConsultantCompliance
        const score   = [newComp.tax_profile_complete, newComp.banking_verified, newComp.id_verified, newComp.popia_consent, !!newComp.signed_agreement_at].filter(Boolean).length
        return { ...c, compliance: newComp, compliance_score: score }
      }))
    }
  }

  const onContractSaved = (userId: string, contract: KlippaConsultantContract) => {
    setConsultants(prev => prev.map(c => c.id === userId ? { ...c, contract } : c))
    setContractFormId(null)
  }

  if (loading) {
    return <div className="min-h-screen bg-base flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-3" /></div>
  }

  const pendingInvites = invites.filter(i => i.status === 'pending')

  // Consultants with timesheets awaiting org review
  const pendingReviewConsultants = consultants.filter(c =>
    c.latest_timesheet?.status === 'submitted' && !c.latest_timesheet?.org_approved_at
  )
  const pendingCount   = pendingReviewConsultants.length
  const firstPendingId = pendingReviewConsultants[0]?.id ?? null

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <span className="text-edge">·</span>
          <span className="text-sm font-medium text-ink-2">{org?.name ?? 'Contracting house'}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div className="flex items-center gap-4">
          <Link href="/org/dashboard" className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500" />
            <h1 className="text-lg font-semibold">Contractors</h1>
          </div>
          {isOwner && pendingCount > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-300">
                {pendingCount} pending review
              </span>
              {firstPendingId && (
                <Link href={`/org/consultants/${firstPendingId}`} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                  Review first →
                </Link>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* ── Invite form ──────────────────────────────────────────── */}
        {isOwner && (
          <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold">Invite a contractor</p>
              <p className="text-xs text-ink-2 mt-0.5">They'll receive a link to join your placement workspace and submit linked timesheets.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
                <input type="email" value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                  placeholder="contractor@example.com"
                  className="input pl-9 py-2.5" />
              </div>
              <button onClick={sendInvite} disabled={sending || !inviteEmail.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Send invite
              </button>
            </div>
            {/* Optional: fixed contract end date for this seat */}
            <div className="flex items-center gap-3">
              <div className="space-y-1 flex-1">
                <label className="text-xs text-ink-3">Seat access until (optional, for fixed-term contracts)</label>
                <input type="date" value={inviteAccessUntil}
                  onChange={e => setInviteAccessUntil(e.target.value)}
                  className="input w-full sm:w-48 text-xs" />
              </div>
              {inviteAccessUntil && (
                <button onClick={() => setInviteAccessUntil('')} className="text-xs text-ink-3 hover:text-ink-2 mt-4">Clear</button>
              )}
            </div>

            {acceptUrl && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5" /> {inviteMsg}
                  </div>
                  <button onClick={() => { setAcceptUrl(null); setInviteMsg(null) }} className="text-ink-3 hover:text-ink-1 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-ink-2">Copy and share this link with the contractor:</p>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono break-all">{acceptUrl}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigator.clipboard.writeText(acceptUrl)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-edge hover:border-emerald-500/50 bg-raised hover:bg-emerald-500/10 text-ink-1 transition-colors">
                    Copy link
                  </button>
                  <p className="text-[10px] text-ink-3">Expires in 7 days.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Pending invites ──────────────────────────────────────── */}
        {pendingInvites.length > 0 && (
          <div className="rounded-2xl border border-edge overflow-hidden">
            <div className="px-5 py-4 border-b border-edge bg-surface/60">
              <p className="text-sm font-semibold">Pending invites
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-600 dark:text-amber-300">{pendingInvites.length}</span>
              </p>
            </div>
            <div className="divide-y divide-edge/50">
              {pendingInvites.map(inv => (
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
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>
                    </span>
                    {isOwner && (
                      <button onClick={() => cancelInvite(inv.id)} disabled={deletingId === inv.id}
                        className="text-ink-3 hover:text-red-400 transition-colors">
                        {deletingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Active contractors ───────────────────────────────────── */}
        <div className="rounded-2xl border border-edge overflow-hidden">
          <div className="px-5 py-4 border-b border-edge bg-surface/60">
            <p className="text-sm font-semibold">Active contractors
              <span className="ml-2 text-xs text-ink-2">({consultants.length})</span>
            </p>
          </div>

          {consultants.length === 0 ? (
            <div className="px-5 py-12 text-center space-y-2">
              <UserRound className="w-8 h-8 text-edge mx-auto" />
              <p className="text-sm text-ink-2">No active contractors yet</p>
              <p className="text-xs text-ink-3">Contractors will appear here after accepting their invite.</p>
            </div>
          ) : (
            <div className="divide-y divide-edge/40">
              {consultants.map(c => {
                const expanded        = expandedId === c.id
                const showContract    = contractFormId === c.id
                const isPendingReview = c.latest_timesheet?.status === 'submitted' && !c.latest_timesheet?.org_approved_at

                return (
                  <div key={c.id}>
                    {/* Main row */}
                    <div className="px-5 py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <Link href={`/org/consultants/${c.id}`} className="text-sm font-medium text-ink-1 hover:text-emerald-500 transition-colors">
                          {c.full_name ?? c.email}
                        </Link>
                        {c.full_name && <p className="text-xs text-ink-3">{c.email}</p>}
                      </div>

                      {/* Contract status */}
                      <div className="flex-shrink-0 hidden sm:block">
                        {c.contract ? (
                          <div className="text-right">
                            <p className="text-xs font-medium text-ink-1">
                              {CONTRACT_TYPE_LABELS[c.contract.contract_type]}
                              {c.contract.rate ? ` · ${formatRand(c.contract.rate)}${RATE_TYPE_LABELS[c.contract.rate_type]}` : ''}
                            </p>
                            <p className="text-xs text-ink-3 mt-0.5">
                              {c.contract.end_date ? `Ends ${formatDate(c.contract.end_date)}` : 'Open-ended'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-3">No contract</span>
                        )}
                      </div>

                      {/* Compliance dots */}
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full ${i < c.compliance_score ? 'bg-emerald-500' : 'bg-edge'}`} />
                          ))}
                        </div>
                        <span className="text-xs text-ink-3 hidden sm:inline">{c.compliance_score}/5</span>
                      </div>

                      {/* Latest TS */}
                      <div className="flex-shrink-0 hidden md:flex md:flex-col md:items-end gap-1 w-28">
                        {c.latest_timesheet ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            { draft: 'bg-edge text-ink-2', submitted: 'bg-amber-500/15 text-amber-600 dark:text-amber-300', approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }[c.latest_timesheet.status] ?? 'bg-edge text-ink-2'
                          }`}>
                            {c.latest_timesheet.status}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">No TS</span>
                        )}
                        {isOwner && isPendingReview && (
                          <Link
                            href={`/org/consultants/${c.id}`}
                            className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25 transition-colors"
                          >
                            Review →
                          </Link>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isOwner && (
                          <button onClick={() => setContractFormId(showContract ? null : c.id)}
                            className="text-xs text-ink-2 hover:text-ink-1 px-2 py-1 rounded border border-edge hover:border-ink-2 transition-colors flex-shrink-0">
                            {c.contract ? 'Edit contract' : '+ Contract'}
                          </button>
                        )}
                        <button onClick={() => setExpandedId(expanded ? null : c.id)}
                          className="p-1.5 text-ink-3 hover:text-ink-1 transition-colors">
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {isOwner && c.id !== currentUserId && (
                          <>
                            {reassignDone === c.id ? (
                              <span className="text-[10px] text-emerald-400 px-1.5">Logged ✓</span>
                            ) : (
                              <button
                                onClick={() => { setReassignId(reassignId === c.id ? null : c.id); setReassignNotes(''); setReassignEmail('') }}
                                title="Reassign this seat"
                                className="p-1.5 text-ink-3 hover:text-violet-400 transition-colors"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => removeMember(c.id)} disabled={removingId === c.id}
                              className="p-1.5 text-ink-3 hover:text-red-400 transition-colors">
                              {removingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Reassign seat panel */}
                    {isOwner && reassignId === c.id && (
                      <div className="px-5 pb-4 bg-violet-500/5 border-t border-violet-500/15 space-y-3 pt-3">
                        <p className="text-xs font-semibold text-violet-300">Reassign seat, handled by our team</p>
                        <p className="text-xs text-ink-3">
                          Seat reassignment is managed off-system. Leave us the details and we&apos;ll action it within 1 business day.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-ink-2">Your contact email</label>
                            <input type="email" value={reassignEmail}
                              onChange={e => setReassignEmail(e.target.value)}
                              placeholder="you@company.co.za" className="input text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-ink-2">Notes (new contractor name, reason, etc.)</label>
                            <input type="text" value={reassignNotes}
                              onChange={e => setReassignNotes(e.target.value)}
                              placeholder="Reassign to Jane Doe. John resigned." className="input text-xs" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setReassignId(null)}
                            className="flex-1 py-2 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
                            Cancel
                          </button>
                          <button
                            onClick={() => handleReassign(c.id, c.full_name ?? c.email ?? '')}
                            disabled={reassigning || !reassignEmail.trim()}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors">
                            {reassigning ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                            {reassigning ? 'Sending…' : 'Send request'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Contract form */}
                    {showContract && isOwner && (
                      <div className="px-5 py-4 bg-raised/30 border-t border-edge/40">
                        <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-3">
                          {c.contract ? 'Update contract' : 'Add contract'}
                        </p>
                        <ContractForm
                          userId={c.id}
                          existing={c.contract}
                          onSaved={contract => onContractSaved(c.id, contract)}
                          onCancel={() => setContractFormId(null)}
                        />
                      </div>
                    )}

                    {/* Compliance checklist */}
                    {expanded && isOwner && (
                      <CompliancePanel consultant={c} onUpdate={updateCompliance} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Past invites */}
        {invites.filter(i => i.status !== 'pending').length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-2 px-1">Past invites</p>
            <div className="rounded-xl border border-edge divide-y divide-edge/40 overflow-hidden">
              {invites.filter(i => i.status !== 'pending').map(inv => (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between">
                  <p className="text-xs text-ink-2">{inv.invited_email}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[inv.status] ?? ''}`}>{inv.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
