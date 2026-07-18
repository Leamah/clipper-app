import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { extractDocument } from '@/lib/mathpix'
import { isStarterOrAbove, FREE_SCAN_LIMIT } from '@/lib/tier'
import type { OcrExtractedReceipt } from '@/lib/types'

function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options?: object }[]) =>
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)),
      },
    }
  )
}

// POST /api/documents/ocr
// Accepts multipart/form-data with:
//   file       — image or PDF file
//   tax_year   — optional int
//   tax_return_id — optional uuid
//
// Returns OcrExtractedReceipt + document_id
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // OCR capture is Starter+ — but free users get a taste: the first
  // FREE_SCAN_LIMIT scans are on the house (lifetime counter on
  // klippa_user_progress, migration 025). If the counter column doesn't
  // exist yet the read errors and we fail closed to the old Starter gate.
  const { data: tierProfile } = await supabase
    .from('klippa_profiles')
    .select('subscription_tier, organisation_id')
    .eq('id', user.id)
    .single()
  const starter = isStarterOrAbove(tierProfile)
  let freeTaste = false
  if (!starter) {
    const { data: prog, error: progErr } = await supabase
      .from('klippa_user_progress')
      .select('free_scans_used')
      .eq('user_id', user.id)
      .maybeSingle()
    const used = progErr ? FREE_SCAN_LIMIT : (prog?.free_scans_used ?? 0)
    freeTaste = used < FREE_SCAN_LIMIT
    if (!freeTaste) {
      return NextResponse.json({ error: 'premium_required' }, { status: 402 })
    }
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file         = formData.get('file') as File | null
  const taxYear      = formData.get('tax_year') ? parseInt(formData.get('tax_year') as string) : null
  const taxReturnId  = formData.get('tax_return_id') as string | null
  // 'receipt' (default) or 'irp5' — IRP5 scans extract SARS source codes
  // (4102 PAYE etc.) so the income page can autofill employees' tax.
  const docType      = formData.get('doc_type') === 'irp5' ? 'irp5' as const : 'receipt' as const

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  // ── Validate before reading the whole file into memory ────
  const MAX_BYTES     = 15 * 1024 * 1024  // 15 MB
  const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']
  const mimeType = file.type || 'application/octet-stream'
  if (file.size === 0)
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'File is larger than 15 MB' }, { status: 413 })
  if (!ALLOWED_MIMES.includes(mimeType))
    return NextResponse.json({ error: 'Only images and PDF files are allowed' }, { status: 415 })

  const buffer   = Buffer.from(await file.arrayBuffer())
  const base64   = buffer.toString('base64')

  // ── Store in Supabase Storage ─────────────────────────────
  // Sanitise the filename — never interpolate raw user input into a storage key.
  const safeName   = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload'
  const storageKey = `${user.id}/${taxYear ?? 'general'}/${Date.now()}_${safeName}`
  const { error: uploadErr } = await supabase.storage
    .from('klippa_documents')
    .upload(storageKey, buffer, { contentType: mimeType, upsert: false })

  // Non-fatal: if bucket doesn't exist yet, continue with OCR anyway
  const storagePath = uploadErr ? null : storageKey

  // ── Create document record (pending OCR) ─────────────────
  const fileHash = await sha256hex(base64)
  const { data: docRecord, error: docErr } = await supabase
    .from('klippa_documents')
    .insert({
      user_id:           user.id,
      tax_return_id:     taxReturnId ?? null,
      document_type:     docType,
      original_filename: file.name,
      storage_path:      storagePath,
      file_size_bytes:   buffer.length,
      file_hash:         fileHash,
      ocr_status:        'processing',
      tax_year:          taxYear,
      upload_method:     'scan',
    })
    .select('id')
    .single()

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })
  const documentId = docRecord.id

  // ── Call Mathpix OCR ──────────────────────────────────────
  let extracted: OcrExtractedReceipt = {
    merchant_name: null,
    amount:        null,
    expense_date:  null,
    description:   null,
    vat_amount:    null,
    confidence:    0,
  }

  let irp5Fields: Record<string, string | number | null> | null = null
  let freeScansRemaining: number | null = null

  try {
    const result = await extractDocument(base64, mimeType, { document_type: docType })
    const f      = result.extracted_fields

    if (docType === 'irp5') {
      irp5Fields = f
    } else {
      extracted = {
        merchant_name: (f['merchant_name'] as string | null) ?? null,
        amount:        typeof f['amount'] === 'number' ? f['amount'] : null,
        expense_date:  normaliseDate(f['date'] as string | null),
        description:   null,
        vat_amount:    typeof f['vat_amount'] === 'number' ? f['vat_amount'] : null,
        confidence:    result.confidence,
      }
    }

    // Update document record with OCR results
    await supabase
      .from('klippa_documents')
      .update({
        ocr_status:     'complete',
        ocr_confidence: result.confidence,
        extracted_data: result.extracted_fields,
      })
      .eq('id', documentId)

    // Burn one free-taste scan only after OCR actually ran
    if (freeTaste) {
      const { data: newCount } = await supabase.rpc('klippa_increment_free_scans', { uid: user.id })
      if (typeof newCount === 'number') freeScansRemaining = Math.max(0, FREE_SCAN_LIMIT - newCount)
    }

  } catch (ocrErr) {
    await supabase
      .from('klippa_documents')
      .update({ ocr_status: 'failed' })
      .eq('id', documentId)

    // Still return the document_id even if OCR failed — caller can manually fill
    return NextResponse.json({
      document_id:  documentId,
      extracted:    extracted,
      ocr_failed:   true,
      error_detail: ocrErr instanceof Error ? ocrErr.message : 'OCR failed',
    })
  }

  return NextResponse.json({
    document_id:          documentId,
    extracted,
    irp5_fields:          irp5Fields,
    free_scans_remaining: freeScansRemaining,
  })
}

// ── Helpers ───────────────────────────────────────────────

function normaliseDate(raw: string | null): string | null {
  if (!raw) return null
  // Handle DD/MM/YYYY, DD-MM-YYYY → YYYY-MM-DD
  const parts = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (parts) {
    const [, d, m, y] = parts
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return null
}

async function sha256hex(data: string): Promise<string> {
  // Node crypto — available in Next.js API routes
  const { createHash } = await import('crypto')
  return createHash('sha256').update(data).digest('hex')
}
