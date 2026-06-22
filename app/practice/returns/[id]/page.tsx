'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle, ArrowLeft, Check, Copy, FileText, Hash, Loader2,
  Mail, Plus, Save, Send, ShieldCheck,
} from 'lucide-react'
import type {
  ChecklistItem,
  ClientReturnType,
  FilingStatus,
  KlippaPracticeActivityEvent,
  KlippaPracticeChecklistTemplate,
  KlippaPracticeClient,
  KlippaPracticeClientDocument,
  KlippaPracticeReturn,
  PracticeReadinessScore,
  PracticeTeamMember,
} from '@/lib/types'

const STATUS_OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'collecting', label: 'Collecting docs' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'Review' },
  { value: 'filed', label: 'Filed' },
  { value: 'assessed', label: 'Assessed' },
]

const RETURN_TYPE_OPTIONS: ClientReturnType[] = ['ITR12', 'IRP6', 'ITR14', 'IT12TR']
const dayLabel = (s: string | null) => s ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s)) : 'Not set'
const dateInputValue = (s: string | null) => s ? new Date(s).toISOString().slice(0, 10) : ''
const zar = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)

type ReturnPayload = {
  client: KlippaPracticeClient
  practiceReturn: KlippaPracticeReturn
  linkedReturn: Record<string, unknown> | null
  documents: KlippaPracticeClientDocument[]
  readiness: PracticeReadinessScore
  activity: KlippaPracticeActivityEvent[]
  siblingReturns: Array<Pick<KlippaPracticeReturn, 'id' | 'tax_year' | 'return_type' | 'filing_status'>>
  team: PracticeTeamMember[]
}

export default function PracticeReturnDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [data, setData] = useState<ReturnPayload | null>(null)
  const [templates, setTemplates] = useState<KlippaPracticeChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [noteBusy, setNoteBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [newItem, setNewItem] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newReturnYear, setNewReturnYear] = useState(String(new Date().getFullYear() + 1))
  const [newReturnType, setNewReturnType] = useState<ClientReturnType>('ITR12')

  const load = useCallback(async () => {
    const [res, templateRes] = await Promise.all([
      fetch(`/api/practice/returns/${id}`),
      fetch('/api/practice/templates'),
    ])
    const json = await res.json()
    const templateJson = await templateRes.json()
    if (json.error) { setError(json.error); setLoading(false); return }
    setData(json)
    setTemplates(templateJson.templates ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/practice/returns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const addNote = async () => {
    if (!note.trim()) return
    setNoteBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/practice/returns/${id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setNote('')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save note')
    } finally {
      setNoteBusy(false)
    }
  }

  const runAction = async (path: string, body?: Record<string, unknown>) => {
    setActionBusy(true)
    setError(null)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await load()
      return json
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
      return null
    } finally {
      setActionBusy(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-base"><Loader2 className="h-5 w-5 animate-spin text-ink-3" /></div>
  }

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-base text-sm text-ink-2">Return unavailable.</div>
  }

  const { client, practiceReturn, documents, readiness, activity, siblingReturns, team } = data
  const checklist = Array.isArray(practiceReturn.doc_checklist) ? practiceReturn.doc_checklist : []
  const portalUrl = client.portal_token && client.portal_enabled && typeof window !== 'undefined'
    ? `${window.location.origin}/portal/${client.portal_token}`
    : null

  const matchingTemplates = useMemo(() => templates.filter(template =>
    template.return_type === practiceReturn.return_type
    && (!template.entity_type || template.entity_type === client.entity_type),
  ), [client.entity_type, practiceReturn.return_type, templates])

  const updateChecklist = (next: ChecklistItem[]) => patch({ doc_checklist: next })
  const toggleItem = (itemId: string) => updateChecklist(checklist.map(item => item.id === itemId ? { ...item, received: !item.received } : item))
  const removeItem = (itemId: string) => updateChecklist(checklist.filter(item => item.id !== itemId))
  const addItem = () => {
    if (!newItem.trim()) return
    updateChecklist([...checklist, { id: crypto.randomUUID(), label: newItem.trim(), received: false }])
    setNewItem('')
  }

  const saveCurrentAsTemplate = async () => {
    if (!newTemplateName.trim()) { setError('Template name is required'); return }
    setActionBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/practice/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          return_type: practiceReturn.return_type,
          entity_type: client.entity_type,
          description: `Saved from ${client.full_name} ${practiceReturn.tax_year}`,
          checklist,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setNewTemplateName('')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save template')
    } finally {
      setActionBusy(false)
    }
  }

  const createAnotherReturn = async () => {
    const json = await runAction('/api/practice/returns', {
      client_id: client.id,
      tax_year: Number(newReturnYear),
      return_type: newReturnType,
      fee: practiceReturn.fee,
    })
    if (json?.practiceReturn?.id) router.push(`/practice/returns/${json.practiceReturn.id}`)
  }

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="sticky top-0 z-20 border-b border-edge/60 bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-700">
              <ShieldCheck className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Klippa</span>
          </Link>
          <Link href="/practice/dashboard" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Returns
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-900/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">{client.full_name}</h1>
                <span className="rounded-full bg-edge px-2.5 py-1 text-[11px] text-ink-2">{practiceReturn.return_type} · {practiceReturn.tax_year}</span>
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-500">{readiness.score}% {readiness.label}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
                {client.tax_number && <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{client.tax_number}</span>}
                {client.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.email}</span>}
                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />Deadline {dayLabel(practiceReturn.deadline)}</span>
                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />Last chased {dayLabel(practiceReturn.last_chased_at)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {portalUrl && (
                <>
                  <button onClick={() => navigator.clipboard.writeText(portalUrl)} className="rounded-lg border border-edge px-3 py-2 text-xs text-ink-2 hover:text-ink-1">
                    <Copy className="mr-1 inline h-3.5 w-3.5" />
                    Copy portal link
                  </button>
                  <button onClick={() => window.location.href = `mailto:${client.email ?? ''}?subject=${encodeURIComponent(`Your document portal: ${practiceReturn.tax_year} ${practiceReturn.return_type}`)}&body=${encodeURIComponent(portalUrl)}`} className="rounded-lg border border-edge px-3 py-2 text-xs text-ink-2 hover:text-ink-1">
                    <Send className="mr-1 inline h-3.5 w-3.5" />
                    Email link
                  </button>
                </>
              )}
              <button onClick={() => runAction(`/api/practice/returns/${id}/remind`)} disabled={actionBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                {actionBusy ? 'Working...' : 'Send reminder'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Return controls</p>
                  <p className="mt-0.5 text-xs text-ink-2">Assignments, deadlines, fee state, and sign-off.</p>
                </div>
                <button disabled={saving} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                  <Save className="mr-1 inline h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Live updates'}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-ink-2">Status</span>
                  <select value={practiceReturn.filing_status} onChange={e => patch({ filing_status: e.target.value })} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                    {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-ink-2">Deadline</span>
                  <input type="date" defaultValue={dateInputValue(practiceReturn.deadline)} onBlur={e => patch({ deadline: e.target.value || null })} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-ink-2">Owner</span>
                  <select value={practiceReturn.owner_user_id ?? ''} onChange={e => patch({ owner_user_id: e.target.value || null })} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                    <option value="">Unassigned</option>
                    {team.map(member => <option key={member.id} value={member.id}>{member.full_name ?? member.email}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-ink-2">Preparer</span>
                  <select value={practiceReturn.preparer_user_id ?? ''} onChange={e => patch({ preparer_user_id: e.target.value || null })} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                    <option value="">Unassigned</option>
                    {team.map(member => <option key={member.id} value={member.id}>{member.full_name ?? member.email}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-ink-2">Reviewer</span>
                  <select value={practiceReturn.reviewer_user_id ?? ''} onChange={e => patch({ reviewer_user_id: e.target.value || null })} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                    <option value="">Unassigned</option>
                    {team.map(member => <option key={member.id} value={member.id}>{member.full_name ?? member.email}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-ink-2">Fee</span>
                  <input defaultValue={String(practiceReturn.fee ?? 0)} onBlur={e => patch({ fee: Number(e.target.value) || 0 })} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs text-ink-2">SARS reference</span>
                  <input defaultValue={practiceReturn.sars_reference ?? ''} onBlur={e => patch({ sars_reference: e.target.value || null })} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => patch({ fee_paid: !practiceReturn.fee_paid })} className={`rounded-lg px-3 py-2 text-xs font-medium ${practiceReturn.fee_paid ? 'bg-emerald-500/15 text-emerald-500' : 'bg-edge text-ink-2'}`}>
                  {practiceReturn.fee_paid ? 'Fee paid' : `${zar(practiceReturn.fee)} unpaid`}
                </button>
                <button onClick={() => runAction(`/api/practice/returns/${id}/signoff`, { signed: !practiceReturn.client_signoff_at })} className={`rounded-lg px-3 py-2 text-xs font-medium ${practiceReturn.client_signoff_at ? 'bg-blue-500/15 text-blue-500' : 'bg-edge text-ink-2'}`}>
                  {practiceReturn.client_signoff_at ? `Client sign-off ${dayLabel(practiceReturn.client_signoff_at)}` : 'Capture client sign-off'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Checklist and evidence</p>
                  <p className="mt-0.5 text-xs text-ink-2">{checklist.filter(item => item.received).length}/{checklist.length} requested items received.</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {checklist.length === 0 && <p className="text-sm text-ink-2">No checklist yet. Add the required evidence for this return.</p>}
                {checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-edge bg-base px-3 py-2.5">
                    <button onClick={() => toggleItem(item.id)} className={`flex h-7 w-7 items-center justify-center rounded-full ${item.received ? 'bg-emerald-500 text-white' : 'bg-edge text-ink-2'}`}>
                      <Check className="h-4 w-4" />
                    </button>
                    <span className="flex-1 text-sm">{item.label}</span>
                    <button onClick={() => removeItem(item.id)} className="text-xs text-ink-2 hover:text-red-400">Remove</button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add checklist item" className="flex-1 rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
                <button onClick={addItem} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white">Add</button>
              </div>

              <div className="mt-5 border-t border-edge pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">Documents</p>
                <div className="space-y-2">
                  {documents.length === 0 && <p className="text-sm text-ink-2">No uploaded files yet.</p>}
                  {documents.map(doc => (
                    <a key={doc.id} href={doc.signed_url ?? '#'} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-edge bg-base px-3 py-2.5 text-sm hover:bg-raised">
                      <span>{doc.file_name}</span>
                      <span className="text-xs text-ink-2">{dayLabel(doc.created_at)}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6">
              <p className="text-sm font-semibold">Readiness</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised">
                <div className={`h-full rounded-full ${readiness.label === 'Ready' ? 'bg-emerald-500' : readiness.label === 'Nearly ready' ? 'bg-blue-500' : readiness.label === 'At risk' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${readiness.score}%` }} />
              </div>
              <p className="mt-3 text-sm font-medium">{readiness.score}% · {readiness.label}</p>
              <div className="mt-4 space-y-3">
                {readiness.blockers.map(blocker => (
                  <div key={blocker.id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold text-red-400">{blocker.label}</p>
                    {blocker.detail && <p className="mt-1 text-xs text-ink-2">{blocker.detail}</p>}
                  </div>
                ))}
                {readiness.next_actions.map(action => (
                  <div key={action.id} className="rounded-xl border border-edge bg-base p-3">
                    <p className="text-xs font-medium text-ink-1">{action.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold">Checklist templates</p>
                <p className="mt-0.5 text-xs text-ink-2">Apply a reusable pack or save this checklist as a template.</p>
              </div>
              <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                <option value="">Choose template</option>
                {matchingTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <button onClick={() => selectedTemplateId && runAction(`/api/practice/returns/${id}/apply-template`, { template_id: selectedTemplateId })} disabled={!selectedTemplateId || actionBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                Apply template
              </button>
              <div className="border-t border-edge pt-4 space-y-2">
                <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="Save current checklist as template" className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
                <button onClick={saveCurrentAsTemplate} disabled={actionBusy || checklist.length === 0} className="rounded-lg border border-edge px-3 py-2 text-xs text-ink-2 disabled:opacity-60">
                  Save as reusable template
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold">Client history</p>
                <p className="mt-0.5 text-xs text-ink-2">Manage multiple years for the same client from one place.</p>
              </div>
              <div className="space-y-2">
                {siblingReturns.map(item => (
                  <button key={item.id} onClick={() => router.push(`/practice/returns/${item.id}`)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${item.id === practiceReturn.id ? 'border-amber-500/40 bg-amber-500/5' : 'border-edge bg-base'}`}>
                    <span>{item.return_type} · {item.tax_year}</span>
                    <span className="text-xs text-ink-2">{item.filing_status}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-edge pt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input value={newReturnYear} onChange={e => setNewReturnYear(e.target.value)} className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
                <select value={newReturnType} onChange={e => setNewReturnType(e.target.value as ClientReturnType)} className="rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none">
                  {RETURN_TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <button onClick={createAnotherReturn} disabled={actionBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                  <Plus className="mr-1 inline h-3.5 w-3.5" />
                  New return
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-edge bg-surface p-5 sm:p-6">
              <p className="text-sm font-semibold">Activity timeline</p>
              <div className="mt-4 space-y-3">
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Add an internal note for handoff or review context" className="w-full rounded-xl border border-edge bg-base px-3 py-2.5 text-sm outline-none" />
                <button onClick={addNote} disabled={noteBusy} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                  {noteBusy ? 'Saving...' : 'Add note'}
                </button>
                <div className="space-y-3 pt-2">
                  {activity.length === 0 && <p className="text-sm text-ink-2">No activity yet.</p>}
                  {activity.map(event => (
                    <div key={event.id} className="rounded-xl border border-edge bg-base p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink-1">{event.event_label}</p>
                        <span className="text-xs text-ink-2">{dayLabel(event.created_at)}</span>
                      </div>
                      {event.detail && <p className="mt-1 text-xs text-ink-2">{event.detail}</p>}
                      {event.actor_name && <p className="mt-1 text-[11px] text-ink-3">{event.actor_name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
