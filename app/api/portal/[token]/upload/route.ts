import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/security'
import { logPracticeEvent } from '@/lib/practice-server'
import { sendBrevoEmail } from '@/lib/brevo'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const token = params.token
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: client } = await admin
    .from('klippa_practice_clients')
    .select('id, organisation_id, full_name, doc_checklist, portal_enabled, status')
    .eq('portal_token', token)
    .maybeSingle()

  if (!client || client.status !== 'active' || !client.portal_enabled) {
    return NextResponse.json({ error: 'This portal link is no longer active.' }, { status: 404 })
  }

  const { data: practiceReturn } = await admin
    .from('klippa_practice_returns')
    .select('id, doc_checklist')
    .eq('client_id', client.id)
    .order('tax_year', { ascending: false })
    .limit(1)
    .maybeSingle()

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })

  const file = form.get('file')
  const checklistItemId = (form.get('checklist_item_id') as string | null) || null

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is larger than 15 MB' }, { status: 413 })

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIMES.includes(mime)) {
    return NextResponse.json({ error: 'Only images and PDF files are allowed' }, { status: 415 })
  }

  const checklist = Array.isArray(practiceReturn?.doc_checklist)
    ? practiceReturn.doc_checklist
    : Array.isArray(client.doc_checklist) ? client.doc_checklist : []

  if (checklistItemId && !checklist.some((it: { id: string }) => it.id === checklistItemId)) {
    return NextResponse.json({ error: 'Invalid checklist item' }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  const storageKey = `practice/${client.organisation_id}/${client.id}/${Date.now()}_${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from('klippa_documents')
    .upload(storageKey, buffer, { contentType: mime, upsert: false })

  if (uploadErr) return NextResponse.json({ error: 'Upload failed - please try again' }, { status: 500 })

  const { data: doc, error: insertErr } = await admin
    .from('klippa_practice_client_documents')
    .insert({
      client_id: client.id,
      organisation_id: client.organisation_id,
      return_id: practiceReturn?.id ?? null,
      checklist_item_id: checklistItemId,
      file_name: safeName,
      storage_path: storageKey,
      mime_type: mime,
      size_bytes: file.size,
      uploaded_via: 'portal',
    })
    .select('id, file_name, checklist_item_id, created_at')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  let nextChecklist = checklist
  if (checklistItemId) {
    nextChecklist = checklist.map((it: { id: string; received: boolean }) =>
      it.id === checklistItemId ? { ...it, received: true } : it)
  }

  const now = new Date().toISOString()
  if (practiceReturn?.id) {
    await admin
      .from('klippa_practice_returns')
      .update({ doc_checklist: nextChecklist, updated_at: now, last_chased_at: null })
      .eq('id', practiceReturn.id)
    await logPracticeEvent(admin, {
      organisation_id: client.organisation_id,
      client_id: client.id,
      return_id: practiceReturn.id,
      actor_user_id: null,
      event_type: 'portal_upload',
      event_label: 'Client uploaded a document',
      detail: safeName,
    })
  }
  await admin
    .from('klippa_practice_clients')
    .update({ last_activity_at: now, updated_at: now })
    .eq('id', client.id)

  ;(async () => {
    const { data: org } = await admin
      .from('klippa_organisations')
      .select('name, owner_id, brand_color')
      .eq('id', client.organisation_id)
      .single()
    if (!org?.owner_id) return

    const { data: ownerRes } = await admin.auth.admin.getUserById(org.owner_id)
    const ownerEmail = ownerRes?.user?.email
    if (!ownerEmail) return

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'
    const reviewPath = practiceReturn?.id ? `practice/returns/${practiceReturn.id}` : `practice/clients/${client.id}`
    const brand = org.brand_color ?? '#10b981'
    const safeClientName = escapeHtml(client.full_name)
    const safeOrgName = escapeHtml(org.name ?? 'Klippa')
    const safeFileName = escapeHtml(safeName)

    await sendBrevoEmail({
      to: ownerEmail,
      subject: `${client.full_name} uploaded a document`,
      html: `<!DOCTYPE html><html><body style="margin:0;background:#0f0f0f;font-family:-apple-system,Segoe UI,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 16px;"><tr><td align="center">
          <table width="100%" style="max-width:520px;background:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;">
            <tr><td style="background:${brand};padding:20px 32px;color:#fff;font-size:16px;font-weight:700;">${safeOrgName}</td></tr>
            <tr><td style="padding:32px;">
              <p style="margin:0 0 12px;color:#f5f5f5;font-size:18px;font-weight:700;">New client upload</p>
              <p style="margin:0 0 8px;color:#a0a0a0;font-size:14px;line-height:1.7;">
                <strong style="color:#f5f5f5;">${safeClientName}</strong> uploaded
                <strong style="color:#f5f5f5;">${safeFileName}</strong> via their document portal.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${brand};border-radius:10px;">
                <a href="${siteUrl}/${reviewPath}" style="display:inline-block;padding:13px 26px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Review in Klippa</a>
              </td></tr></table>
            </td></tr>
          </table>
        </td></tr></table>
      </body></html>`,
    })
  })().catch(e => console.error('[portal upload] notify error:', e))

  return NextResponse.json({ document: doc, checklist: nextChecklist })
}
