'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2, Check, Upload, FileText, ShieldCheck, AlertCircle, CheckCircle2,
} from 'lucide-react'

interface ChecklistItem { id: string; label: string; received: boolean }
interface PortalDoc { id: string; file_name: string; checklist_item_id: string | null; created_at: string }
interface PortalData {
  client: {
    full_name:     string
    return_type:   string
    tax_year:      number
    filing_status: string
    checklist:     ChecklistItem[]
  }
  org: { name: string; logo_url: string | null; brand_color: string }
  documents:    PortalDoc[]
  filing_steps: string[]
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  collecting:  'Collecting docs',
  in_progress: 'In progress',
  review:      'Client review',
  filed:       'Filed',
  assessed:    'Assessed',
}

export default function ClientPortalPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [data,      setData]      = useState<PortalData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)  // checklist item id or 'general'
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  const fileRef   = useRef<HTMLInputElement>(null)
  const targetRef = useRef<string | null>(null)  // which checklist item the picker is for

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/portal/${token}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load your portal')
      setData(json as PortalData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const pickFor = (itemId: string | null) => {
    targetRef.current = itemId
    setUploadErr(null)
    fileRef.current?.click()
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const itemId = targetRef.current
    setUploading(itemId ?? 'general')
    setUploadErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (itemId) fd.append('checklist_item_id', itemId)
      const res  = await fetch(`/api/portal/${token}/upload`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      setData(prev => prev ? {
        ...prev,
        documents:  [json.document, ...prev.documents],
        client: { ...prev.client, checklist: json.checklist ?? prev.client.checklist },
      } : prev)
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(null)
      if (fileRef.current) fileRef.current.value = ''
      targetRef.current = null
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-900">Link unavailable</h1>
          <p className="text-sm text-zinc-500">{error ?? 'This portal link is no longer active. Please contact your accountant for a new link.'}</p>
        </div>
      </div>
    )
  }

  const { client, org } = data
  const accent   = org.brand_color || '#10b981'
  const checklist = client.checklist ?? []
  const received  = checklist.filter(i => i.received).length
  const total     = checklist.length
  const allDone   = total > 0 && received === total

  // Documents not tied to a checklist item
  const extraDocs = data.documents.filter(d => !d.checklist_item_id)
  const docsByItem = (itemId: string) => data.documents.filter(d => d.checklist_item_id === itemId)

  const currentStepIdx = data.filing_steps.indexOf(client.filing_status)

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />

      {/* Branded header */}
      <header className="px-5 py-5 text-white" style={{ backgroundColor: accent }}>
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {org.logo_url
            ? <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-lg object-cover bg-white/20" />
            : (
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-lg font-bold">
                {org.name.charAt(0).toUpperCase()}
              </div>
            )}
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{org.name}</p>
            <p className="text-xs text-white/80">Secure document portal</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-6 space-y-6">
        {/* Greeting */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Hi {client.full_name.split(' ')[0]} 👋</h1>
          <p className="text-sm text-zinc-500">
            Upload the documents below so {org.name} can prepare your {client.return_type} for {client.tax_year}.
          </p>
        </div>

        {/* Filing status tracker (read-only) */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Your return status</p>
          <div className="flex items-center gap-1.5">
            {data.filing_steps.map((step, i) => {
              const done = i <= currentStepIdx
              return (
                <div key={step} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: done ? accent : '#e4e4e7' }} />
                  <span className={`text-[9px] sm:text-[10px] text-center leading-tight ${i === currentStepIdx ? 'font-semibold text-zinc-700' : 'text-zinc-400'}`}>
                    {STATUS_LABELS[step] ?? step}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Progress */}
        {total > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{received} of {total} documents in</p>
              <p className="text-xs text-zinc-500">{allDone ? 'All done — thank you!' : 'Tap an item below to upload'}</p>
            </div>
            <div className="relative w-11 h-11 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e4e4e7" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${total ? (received / total) * 100 : 0} 100`} />
              </svg>
              {allDone && <CheckCircle2 className="absolute inset-0 m-auto w-5 h-5" style={{ color: accent }} />}
            </div>
          </div>
        )}

        {uploadErr && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{uploadErr}</p>
        )}

        {/* Checklist */}
        {total > 0 ? (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Requested documents</p>
            {checklist.map(item => {
              const docs   = docsByItem(item.id)
              const busy   = uploading === item.id
              return (
                <div key={item.id} className="rounded-xl border border-zinc-200 bg-white p-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${item.received ? 'text-white' : 'bg-zinc-100 text-zinc-400'}`}
                      style={item.received ? { backgroundColor: accent } : undefined}>
                      {item.received ? <Check className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <p className="flex-1 text-sm font-medium leading-snug">{item.label}</p>
                    <button
                      onClick={() => pickFor(item.id)}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-opacity flex-shrink-0"
                      style={{ backgroundColor: accent }}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {item.received ? 'Add another' : 'Upload'}
                    </button>
                  </div>
                  {docs.length > 0 && (
                    <div className="mt-2.5 pl-10 space-y-1">
                      {docs.map(d => (
                        <p key={d.id} className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <Check className="w-3 h-3" style={{ color: accent }} /> {d.file_name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 text-center py-4">
            Your accountant hasn&apos;t added a document checklist yet. You can still upload anything relevant below.
          </p>
        )}

        {/* Anything else */}
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-center space-y-3">
          <p className="text-sm font-medium">Something else to send?</p>
          <button
            onClick={() => pickFor(null)}
            disabled={uploading === 'general'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-zinc-300 hover:bg-zinc-50 disabled:opacity-60 transition-colors"
          >
            {uploading === 'general' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload a document
          </button>
          {extraDocs.length > 0 && (
            <div className="space-y-1 pt-1">
              {extraDocs.map(d => (
                <p key={d.id} className="text-xs text-zinc-500 flex items-center justify-center gap-1.5">
                  <Check className="w-3 h-3" style={{ color: accent }} /> {d.file_name}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 pt-2 pb-8">
          <ShieldCheck className="w-3.5 h-3.5" />
          Secured by Klippa · Only {org.name} can see what you upload
        </div>
      </main>
    </div>
  )
}
