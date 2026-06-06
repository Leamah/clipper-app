'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck, ArrowLeft, Loader2, AlertTriangle, Check, X, Plus,
  CalendarClock, Wallet, FileText, Trash2, Save, ListChecks, Hash, Mail,
  Link2, Copy, ExternalLink, Download, Send, RefreshCw, Inbox,
} from 'lucide-react'
import {
  FILING_STATUS_FLOW, FILING_STATUS_LABELS, ENTITY_TYPE_LABELS,
} from '@/lib/types'
import type {
  KlippaPracticeClient, FilingStatus, ChecklistItem, ClientReturnType,
  KlippaPracticeClientDocument, PracticeReadinessScore,
} from '@/lib/types'

const zar = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
const dayLabel = (s: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))

type LinkedReturn = {
  status: string; gross_income: number; total_deductions: number
  taxable_income: number; net_tax_payable: number
  sars_reference: string | null; submitted_at: string | null
} | null

export default function PracticeClientDetail() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [client,    setClient]    = useState<KlippaPracticeClient | null>(null)
  const [linked,    setLinked]    = useState<LinkedReturn>(null)
  const [documents, setDocuments] = useState<KlippaPracticeClientDocument[]>([])
  const [readiness, setReadiness] = useState<PracticeReadinessScore | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [busy,      setBusy]      = useState(false)

  // portal sharing state
  const [portalBusy, setPortalBusy] = useState(false)
  const [copied,     setCopied]     = useState(false)

  // editable local state
  const [deadline, setDeadline] = useState('')
  const [fee,      setFee]      = useState('')
  const [notes,    setNotes]    = useState('')
  const [newItem,  setNewItem]  = useState('')
  const [dirty,    setDirty]    = useState(false)

  const load = useCallback(async () => {
    const res  = await fetch(`/api/practice/clients/${id}`)
    const json = await res.json()
    if (json.error) { setError(json.error); setLoading(false); return }
    const c = json.client as KlippaPracticeClient
    setClient(c)
    setLinked(json.linkedReturn ?? null)
    setDocuments(json.documents ?? [])
    setReadiness(json.readiness ?? null)
    setDeadline(c.deadline ?? '')
    setFee(String(c.fee ?? 0))
    setNotes(c.notes ?? '')
    setDirty(false)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try {
      const res  = await fetch(`/api/practice/clients/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Update failed') }
    finally { setBusy(false) }
  }

  const saveDetails = () => patch({
    deadline: deadline || null,
    fee:      Number(fee) || 0,
    notes,
  })

  const setStatus = (s: FilingStatus) => { if (client && s !== client.filing_status) patch({ filing_status: s }) }

  const toggleItem = (itemId: string) => {
    if (!client) return
    const next = client.doc_checklist.map(it => it.id === itemId ? { ...it, received: !it.received } : it)
    patch({ doc_checklist: next })
  }
  const removeItem = (itemId: string) => {
    if (!client) return
    patch({ doc_checklist: client.doc_checklist.filter(it => it.id !== itemId) })
  }
  const addItem = () => {
    if (!client || !newItem.trim()) return
    const item: ChecklistItem = { id: crypto.randomUUID(), label: newItem.trim(), received: false }
    setNewItem('')
    patch({ doc_checklist: [...client.doc_checklist, item] })
  }

  // --- Document portal ---
  const portalUrl = (client?.portal_token && client?.portal_enabled && typeof window !== 'undefined')
    ? `${window.location.origin}/portal/${client.portal_token}`
    : null

  const callPortal = async (method: 'POST' | 'PATCH', body?: Record<string, unknown>) => {
    setPortalBusy(true); setError(null)
    try {
      const res  = await fetch(`/api/practice/clients/${id}/portal`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body:    body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Portal update failed') }
    finally { setPortalBusy(false) }
  }

  const generatePortal = (rotate = false) => callPortal('POST', rotate ? { rotate: true } : undefined)
  const disablePortal  = () => callPortal('PATCH', { enabled: false })
  const enablePortal   = () => callPortal('PATCH', { enabled: true })

  const copyLink = async () => {
    if (!portalUrl) return
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const emailLink = () => {
    if (!portalUrl || !client) return
    const subject = encodeURIComponent(`Your secure document portal: ${client.tax_year} ${client.return_type}`)
    const body    = encodeURIComponent(
      `Hi ${client.full_name.split(' ')[0]},\n\n` +
      `Please use the secure link below to upload the documents we need for your ${client.tax_year} ${client.return_type}:\n\n` +
      `${portalUrl}\n\n` +
      `The link is private to you. No login required.\n\nThank you.`
    )
    window.location.href = `mailto:${client.email ?? ''}?subject=${subject}&body=${body}`
  }

  const archive = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/practice/clients/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      router.push('/practice/dashboard')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); setBusy(false) }
  }

  if (loading) {
    return <div className="min-h-screen bg-base flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-3" /></div>
  }
  if (error && !client) {
    return (
      <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm text-ink-2">{error}</p>
        <Link href="/practice/dashboard" className="text-xs text-emerald-500 hover:underline">Back to clients</Link>
      </div>
    )
  }

  const c        = client!
  const stageIdx = FILING_STATUS_FLOW.indexOf(c.filing_status)
  const dl       = c.deadline ? Math.ceil((new Date(c.deadline).getTime() - Date.now()) / 86_400_000) : null
  const overdue  = dl != null && dl < 0 && c.filing_status !== 'filed' && c.filing_status !== 'assessed'
  const received = c.doc_checklist.filter(i => i.received).length
  const readinessTone = readiness?.label === 'Ready' ? 'text-emerald-500'
    : readiness?.label === 'Nearly ready' ? 'text-blue-500'
    : readiness?.label === 'At risk' ? 'text-amber-500'
    : 'text-red-400'
  const readinessBar = readiness?.label === 'Ready' ? 'bg-emerald-500'
    : readiness?.label === 'Nearly ready' ? 'bg-blue-500'
    : readiness?.label === 'At risk' ? 'bg-amber-500'
    : 'bg-red-500'

  return (
    <div className="min-h-screen bg-base text-ink-1">
      {/* Header */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href="/practice/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Clients
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 sm:space-y-6">
        {error && (
          <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
          </div>
        )}

        {/* Identity */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 flex flex-wrap items-start gap-4 sm:gap-5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center text-white text-lg sm:text-xl font-bold flex-shrink-0">
            {c.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink-1">{c.full_name}</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-edge text-ink-2">{ENTITY_TYPE_LABELS[c.entity_type]}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-ink-2">
              <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{c.return_type} · {c.tax_year}</span>
              {c.tax_number && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{c.tax_number}</span>}
              {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
            </div>
          </div>
          <button onClick={archive} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Archive
          </button>
        </div>

        {/* Compliance readiness workbench */}
        {readiness && (
          <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Compliance readiness</p>
                <p className="text-xs text-ink-2">Tax workflow score based on documents, deadline risk, client identity, return status, and review readiness.</p>
              </div>
              <div className="text-left sm:text-right">
                <p className={`text-3xl font-bold tabular-nums ${readinessTone}`}>{readiness.score}%</p>
                <p className={`text-xs font-semibold ${readinessTone}`}>{readiness.label}</p>
              </div>
            </div>

            <div className="h-2 rounded-full bg-raised overflow-hidden">
              <div className={`h-full rounded-full ${readinessBar}`} style={{ width: `${readiness.score}%` }} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                ['Documents', readiness.checks.documents, 35],
                ['Deadline', readiness.checks.deadline, 15],
                ['Identity', readiness.checks.identity, 10],
                ['Workflow', readiness.checks.workflow, 25],
                ['Review', readiness.checks.review, 15],
              ].map(([label, value, max]) => (
                <div key={label} className="rounded-xl border border-edge bg-raised/30 px-3 py-2.5">
                  <p className="text-[11px] text-ink-3">{label}</p>
                  <p className="text-sm font-semibold text-ink-1 tabular-nums">{value}/{max}</p>
                </div>
              ))}
            </div>

            {(readiness.blockers.length > 0 || readiness.next_actions.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <p className="text-xs font-semibold uppercase">Blockers</p>
                  </div>
                  {readiness.blockers.length === 0 ? (
                    <p className="text-xs text-ink-2">No hard blockers.</p>
                  ) : (
                    <div className="space-y-2">
                      {readiness.blockers.map(b => (
                        <div key={b.id} className="text-xs">
                          <p className="font-medium text-ink-1">{b.label}</p>
                          {b.detail && <p className="text-ink-3 mt-0.5">{b.detail}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-500">
                    <ListChecks className="w-4 h-4" />
                    <p className="text-xs font-semibold uppercase">Next actions</p>
                  </div>
                  <div className="space-y-2">
                    {readiness.next_actions.length === 0 ? (
                      <p className="text-xs text-ink-2">Ready for final practitioner review.</p>
                    ) : readiness.next_actions.map(a => (
                      <div key={a.id} className="flex items-start gap-2 text-xs text-ink-2">
                        <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${a.status === 'blocker' ? 'bg-red-400' : 'bg-amber-400'}`} />
                        <span>{a.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {readiness.warnings.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {readiness.warnings.map(w => (
                  <span key={w.id} className="rounded-full bg-edge px-2.5 py-1 text-[11px] text-ink-2">
                    {w.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filing pipeline stepper */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <p className="text-sm font-semibold">Filing pipeline</p>
          <div className="flex flex-wrap gap-2">
            {FILING_STATUS_FLOW.map((s, i) => {
              const done    = i < stageIdx
              const current = i === stageIdx
              return (
                <button key={s} onClick={() => setStatus(s)} disabled={busy}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-60 ${
                    current ? 'bg-amber-500 text-white'
                    : done  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-raised text-ink-2 hover:bg-edge'
                  }`}>
                  {done ? <Check className="w-3 h-3" /> : <span className="w-4 text-center tabular-nums">{i + 1}</span>}
                  {FILING_STATUS_LABELS[s]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Key facts + editable details */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-edge bg-surface p-5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-2"><CalendarClock className="w-3.5 h-3.5" /> Deadline</div>
            <p className={`text-lg font-bold ${overdue ? 'text-red-400' : dl != null && dl <= 14 ? 'text-amber-500' : 'text-ink-1'}`}>
              {c.deadline ? dayLabel(c.deadline) : '—'}
            </p>
            {dl != null && <p className="text-xs text-ink-3">{overdue ? `${Math.abs(dl)}d overdue` : dl === 0 ? 'Due today' : `${dl}d remaining`}</p>}
          </div>
          <div className="rounded-2xl border border-edge bg-surface p-5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-2"><Wallet className="w-3.5 h-3.5" /> Fee</div>
            <p className="text-lg font-bold text-ink-1">{zar(c.fee)}</p>
            <button onClick={() => patch({ fee_paid: !c.fee_paid })} disabled={busy || c.fee === 0}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${c.fee_paid ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'}`}>
              {c.fee_paid ? 'Paid ✓' : 'Mark paid'}
            </button>
          </div>
          <div className="rounded-2xl border border-edge bg-surface p-5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-2"><ListChecks className="w-3.5 h-3.5" /> Documents</div>
            <p className="text-lg font-bold text-ink-1">{received}/{c.doc_checklist.length || 0}</p>
            <p className="text-xs text-ink-3">received</p>
          </div>
        </div>

        {/* Document checklist */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold">Document checklist</p>
          </div>
          {c.doc_checklist.length > 0 && (
            <div className="space-y-2">
              {c.doc_checklist.map(it => (
                <div key={it.id} className="flex items-center gap-3 rounded-xl bg-raised/40 border border-edge px-3.5 py-2.5">
                  <button onClick={() => toggleItem(it.id)} disabled={busy}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                      it.received ? 'bg-emerald-500 border-emerald-500' : 'border-edge hover:border-ink-2'
                    }`}>
                    {it.received && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <span className={`text-sm flex-1 ${it.received ? 'text-ink-3 line-through' : 'text-ink-1'}`}>{it.label}</span>
                  <button onClick={() => removeItem(it.id)} disabled={busy} className="text-ink-3 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="e.g. IRP5, medical certificate, RA certificate…"
              className="input flex-1" />
            <button onClick={addItem} disabled={busy || !newItem.trim()}
              className="flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors flex-shrink-0">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Document portal */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold">Client document portal</p>
          </div>

          {portalUrl ? (
            <>
              <p className="text-xs text-ink-2">
                Share this private link so {c.full_name.split(' ')[0]} can upload documents straight onto their checklist. No login required.
              </p>
              <div className="flex items-center gap-2 rounded-xl bg-raised/40 border border-edge px-3.5 py-2.5">
                <code className="flex-1 text-xs text-ink-2 truncate">{portalUrl}</code>
                <button onClick={copyLink} disabled={portalBusy}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors flex-shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={emailLink} disabled={portalBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-ink-1 hover:bg-raised disabled:opacity-50 transition-colors">
                  <Send className="w-3.5 h-3.5" /> Email to client
                </button>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Preview
                </a>
                <button onClick={() => generatePortal(true)} disabled={portalBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-amber-500 disabled:opacity-50 transition-colors">
                  {portalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Rotate link
                </button>
                <button onClick={disablePortal} disabled={portalBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 transition-colors">
                  <X className="w-3.5 h-3.5" /> Disable
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-ink-2">
                Generate a secure, private upload link {c.portal_token ? '(currently disabled)' : ''} so your client can submit their own documents.
              </p>
              <button
                onClick={() => (c.portal_token ? enablePortal() : generatePortal(false))}
                disabled={portalBusy}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors">
                {portalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                {c.portal_token ? 'Re-enable portal' : 'Generate portal link'}
              </button>
            </>
          )}
        </div>

        {/* Uploaded documents */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold">Uploaded documents</p>
            {documents.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-edge text-ink-2">{documents.length}</span>
            )}
          </div>
          {documents.length === 0 ? (
            <p className="text-xs text-ink-3">Nothing uploaded yet. Documents your client submits through the portal will appear here.</p>
          ) : (
            <div className="space-y-2">
              {documents.map(d => {
                const item = d.checklist_item_id ? c.doc_checklist.find(i => i.id === d.checklist_item_id) : null
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl bg-raised/40 border border-edge px-3.5 py-2.5">
                    <FileText className="w-4 h-4 text-ink-3 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-1 truncate">{d.file_name}</p>
                      <p className="text-xs text-ink-3">
                        {dayLabel(d.created_at)}{item ? ` · ${item.label}` : ''}{d.uploaded_via === 'portal' ? ' · via portal' : ''}
                      </p>
                    </div>
                    {d.signed_url && (
                      <a href={d.signed_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-edge text-ink-2 hover:text-ink-1 hover:bg-raised transition-colors flex-shrink-0">
                        <Download className="w-3.5 h-3.5" /> Open
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Linked return snapshot */}
        {linked && (
          <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
            <p className="text-sm font-semibold">Linked Klippa return: {c.tax_year}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-ink-3">Gross income</p><p className="font-semibold tabular-nums">{zar(linked.gross_income)}</p></div>
              <div><p className="text-xs text-ink-3">Deductions</p><p className="font-semibold tabular-nums">{zar(linked.total_deductions)}</p></div>
              <div><p className="text-xs text-ink-3">Taxable</p><p className="font-semibold tabular-nums">{zar(linked.taxable_income)}</p></div>
              <div><p className="text-xs text-ink-3">{linked.net_tax_payable >= 0 ? 'Owed to SARS' : 'Refund'}</p>
                <p className={`font-semibold tabular-nums ${linked.net_tax_payable >= 0 ? 'text-red-400' : 'text-emerald-500'}`}>{zar(Math.abs(linked.net_tax_payable))}</p></div>
            </div>
          </div>
        )}

        {/* Editable details */}
        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
          <p className="text-sm font-semibold">Details</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">Filing deadline</label>
              <input type="date" value={deadline} onChange={e => { setDeadline(e.target.value); setDirty(true) }} className="input w-full" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">Fee (R)</label>
              <input type="number" value={fee} onChange={e => { setFee(e.target.value); setDirty(true) }} className="input w-full" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-2">Notes</label>
            <textarea value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }} rows={3}
              placeholder="Internal notes about this client's return…" className="input w-full resize-none" />
          </div>
          <button onClick={saveDetails} disabled={busy || !dirty}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save details
          </button>
        </div>
      </main>
    </div>
  )
}
