'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import { Plus, Upload, Loader2, X, FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import type { KlippaDocument, DocumentType, KlippaTaxReturn } from '@/lib/types'

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  receipt:         'Receipt',
  irp5:            'IRP5 / IT3',
  bank_statement:  'Bank Statement',
  invoice:         'Invoice',
  medical:         'Medical Aid Certificate',
  ra_certificate:  'RA Certificate',
  timesheet:       'Timesheet',
  other:           'Other',
}

const DOC_TYPE_COLORS: Record<DocumentType, string> = {
  receipt:         'bg-blue-500/15 text-blue-300',
  irp5:            'bg-violet-500/15 text-violet-300',
  bank_statement:  'bg-amber-500/15 text-amber-300',
  invoice:         'bg-emerald-500/15 text-emerald-300',
  medical:         'bg-pink-500/15 text-pink-300',
  ra_certificate:  'bg-orange-500/15 text-orange-300',
  timesheet:       'bg-teal-500/15 text-teal-300',
  other:           'bg-edge text-ink-2',
}

function OcrStatusPill({ status }: { status: string }) {
  const config = {
    pending:    { icon: <Clock className="w-3 h-3" />,        color: 'bg-edge text-ink-2',          label: 'Pending' },
    processing: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'bg-blue-500/15 text-blue-300', label: 'Processing' },
    complete:   { icon: <CheckCircle2 className="w-3 h-3" />, color: 'bg-emerald-500/15 text-emerald-300', label: 'Complete' },
    failed:     { icon: <AlertCircle className="w-3 h-3" />,  color: 'bg-red-500/15 text-red-300',         label: 'Failed' },
  }[status] ?? { icon: <Clock className="w-3 h-3" />, color: 'bg-edge text-ink-2', label: status }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.icon} {config.label}
    </span>
  )
}

function UploadModal({ taxReturnId, onClose, onUploaded }: {
  taxReturnId: string | null
  onClose:     () => void
  onUploaded:  (doc: KlippaDocument) => void
}) {
  const [docType,    setDocType]    = useState<DocumentType>('receipt')
  const [taxYear,    setTaxYear]    = useState(new Date().getFullYear())
  const [file,       setFile]       = useState<File | null>(null)
  const [uploading,  setUploading]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Compute file hash for duplicate detection
      const arrayBuffer = await file.arrayBuffer()
      const hashBuffer  = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashHex     = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')

      // Check duplicate
      const { data: existing } = await supabase
        .from('klippa_documents')
        .select('id, original_filename')
        .eq('file_hash', hashHex)
        .eq('user_id', user.id)
        .single()

      if (existing) throw new Error(`You've already uploaded this document (${existing.original_filename})`)

      // Upload to Supabase Storage
      const ext = file.name.split('.').pop() ?? 'bin'
      const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('klippa_documents')
        .upload(storagePath, file, { contentType: file.type })

      if (uploadErr) throw uploadErr

      // Create document record
      const { data: doc, error: dbErr } = await supabase
        .from('klippa_documents')
        .insert({
          user_id:           user.id,
          tax_return_id:     taxReturnId ?? null,
          document_type:     docType,
          original_filename: file.name,
          storage_path:      storagePath,
          file_size_bytes:   file.size,
          file_hash:         hashHex,
          ocr_status:        'pending',
          tax_year:          taxYear,
          upload_method:     'upload',
        })
        .select()
        .single()

      if (dbErr) throw dbErr
      onUploaded(doc as KlippaDocument)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink-1">Upload document</h3>
          <button onClick={onClose} className="text-ink-2 hover:text-ink-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-2">Document type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
              className="input w-full"
            >
              {(Object.entries(DOC_TYPE_LABELS) as [DocumentType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-2">Tax year</label>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(parseInt(e.target.value))}
              className="input w-full"
            >
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-2">File</label>
            {file ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-1 truncate">{file.name}</p>
                  <p className="text-xs text-ink-2">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button onClick={() => setFile(null)} className="text-ink-2 hover:text-ink-1 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 py-8 rounded-xl border-2 border-dashed border-edge hover:border-emerald-500/50 text-ink-2 hover:text-ink-1 transition-colors"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm">Click to select PDF or image</span>
                <span className="text-xs text-ink-3">PDF, PNG, JPG, JPEG supported</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">Cancel</button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DocumentsPage() {
  const searchParams  = useSearchParams()
  const [docs,        setDocs]      = useState<KlippaDocument[]>([])
  const [taxReturn,   setTaxReturn] = useState<KlippaTaxReturn | null>(null)
  const [loading,     setLoading]   = useState(true)
  const [showUpload,  setShowUpload] = useState(searchParams.get('add') === '1')
  const [filterYear,  setFilterYear] = useState<number | null>(null)
  const [filterType,  setFilterType] = useState<DocumentType | 'all'>('all')

  const loadDocs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: ret } = await supabase.from('klippa_tax_returns').select('*').eq('user_id', user.id).order('tax_year', { ascending: false }).limit(1).single()
    setTaxReturn(ret as KlippaTaxReturn | null)

    const { data } = await supabase.from('klippa_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setDocs((data ?? []) as KlippaDocument[])
    setLoading(false)
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const filtered = docs.filter((d) => {
    if (filterYear && d.tax_year !== filterYear) return false
    if (filterType !== 'all' && d.document_type !== filterType) return false
    return true
  })

  const years = [...new Set(docs.map((d) => d.tax_year).filter(Boolean))] as number[]

  return (
    <div className="app-shell bg-base text-ink-1">
      <AppNav activePage="documents" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-1">Documents</h1>
            <p className="text-sm text-ink-2 mt-1">{docs.length} documents uploaded</p>
          </div>
          <button onClick={() => setShowUpload(true)} className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
            <Plus className="w-3.5 h-3.5" /> Upload
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as DocumentType | 'all')}
            className="px-3 py-1.5 rounded-lg text-xs bg-raised border border-edge text-ink-1 outline-none"
          >
            <option value="all">All types</option>
            {(Object.entries(DOC_TYPE_LABELS) as [DocumentType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {years.length > 0 && (
            <select
              value={filterYear ?? ''}
              onChange={(e) => setFilterYear(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-1.5 rounded-lg text-xs bg-raised border border-edge text-ink-1 outline-none"
            >
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-ink-3" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-edge p-16 text-center space-y-4">
            <Upload className="w-8 h-8 text-ink-3 mx-auto" />
            <div>
              <p className="text-sm font-medium text-ink-2">No documents yet</p>
              <p className="text-xs text-ink-3 mt-1">Upload IRP5 certificates, receipts, and bank statements.</p>
            </div>
            <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Upload document
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-edge bg-surface/40 p-4 space-y-3 hover:border-edge transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <FileText className="w-8 h-8 text-ink-3 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-1 truncate font-medium">{doc.original_filename ?? 'Untitled'}</p>
                    <p className="text-xs text-ink-3 mt-0.5">{doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(0)} KB` : ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DOC_TYPE_COLORS[doc.document_type as DocumentType] ?? 'bg-edge text-ink-2'}`}>
                    {DOC_TYPE_LABELS[doc.document_type as DocumentType] ?? doc.document_type}
                  </span>
                  {doc.tax_year && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-raised text-ink-2">{doc.tax_year}</span>
                  )}
                </div>

                <OcrStatusPill status={doc.ocr_status} />

                <p className="text-xs text-ink-3">
                  {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(doc.created_at))}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {showUpload && (
        <UploadModal
          taxReturnId={taxReturn?.id ?? null}
          onClose={() => setShowUpload(false)}
          onUploaded={(doc) => setDocs((prev) => [doc, ...prev])}
        />
      )}
    </div>
  )
}

export default function DocumentsPageWrapper() {
  return <Suspense><DocumentsPage /></Suspense>
}
