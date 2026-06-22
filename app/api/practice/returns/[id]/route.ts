import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculatePracticeReadiness } from '@/lib/practice-readiness'
import { listPracticeTeam, logPracticeEvent, resolvePracticeContext } from '@/lib/practice-server'
import type { ChecklistItem, KlippaPracticeClient, KlippaPracticeClientDocument, KlippaPracticeReturn } from '@/lib/types'

type LinkedReturn = {
  status?: string | null
  gross_income?: number | null
  total_deductions?: number | null
  taxable_income?: number | null
  net_tax_payable?: number | null
  sars_reference?: string | null
  submitted_at?: string | null
} | null

const VALID_STATUS = ['not_started', 'collecting', 'in_progress', 'review', 'filed', 'assessed']

function sanitizeChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((it: unknown): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map(it => ({
      id: String(it.id ?? crypto.randomUUID()),
      label: String(it.label ?? '').slice(0, 120),
      received: !!it.received,
    }))
    .filter(it => it.label.trim().length > 0)
}

async function loadReturnBundle(admin: SupabaseClient, orgId: string, id: string) {
  const { data: practiceReturn } = await admin
    .from('klippa_practice_returns')
    .select('*')
    .eq('id', id)
    .single()

  if (!practiceReturn || practiceReturn.organisation_id !== orgId) return null

  const { data: client } = await admin
    .from('klippa_practice_clients')
    .select('*')
    .eq('id', practiceReturn.client_id)
    .single()

  if (!client || client.organisation_id !== orgId) return null

  return { practiceReturn: practiceReturn as KlippaPracticeReturn, client: client as KlippaPracticeClient }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const bundle = await loadReturnBundle(admin, orgId, params.id)
  if (!bundle) return NextResponse.json({ error: 'Return not found in your practice' }, { status: 404 })
  const { client, practiceReturn } = bundle

  let linkedReturn: LinkedReturn = null
  if (client.client_user_id) {
    const { data: ret } = await admin
      .from('klippa_tax_returns')
      .select('status, gross_income, total_deductions, taxable_income, net_tax_payable, sars_reference, submitted_at')
      .eq('user_id', client.client_user_id)
      .eq('tax_year', practiceReturn.tax_year)
      .maybeSingle()
    linkedReturn = ret ?? null
  }

  const docsPromise = admin
    .from('klippa_practice_client_documents')
    .select('*')
    .eq('return_id', practiceReturn.id)
    .order('created_at', { ascending: false })

  const [docsRes, eventsRes, siblingRes, team] = await Promise.all([
    docsPromise,
    admin
      .from('klippa_practice_activity_events')
      .select('*')
      .eq('return_id', practiceReturn.id)
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('klippa_practice_returns')
      .select('id, tax_year, return_type, filing_status')
      .eq('client_id', client.id)
      .order('tax_year', { ascending: false }),
    listPracticeTeam(admin, orgId),
  ])

  if (docsRes.error) return NextResponse.json({ error: docsRes.error.message }, { status: 500 })
  if (eventsRes.error) return NextResponse.json({ error: eventsRes.error.message }, { status: 500 })
  if (siblingRes.error) return NextResponse.json({ error: siblingRes.error.message }, { status: 500 })

  const events = (eventsRes.data ?? []).map(event => ({
    ...event,
    actor_name: team.find(member => member.id === event.actor_user_id)?.full_name ?? null,
  }))
  const docRows = (docsRes.data?.length
    ? docsRes.data
    : (await admin
      .from('klippa_practice_client_documents')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })).data) ?? []

  const documents = await Promise.all((docRows as KlippaPracticeClientDocument[]).map(async doc => {
    const { data: signed } = await admin.storage.from('klippa_documents').createSignedUrl(doc.storage_path, 60 * 30)
    return { ...doc, signed_url: signed?.signedUrl }
  }))
  const readiness = calculatePracticeReadiness(client, documents, linkedReturn, practiceReturn)

  return NextResponse.json({
    client,
    practiceReturn,
    linkedReturn,
    documents,
    readiness,
    activity: events,
    siblingReturns: siblingRes.data ?? [],
    team,
  })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const bundle = await loadReturnBundle(admin, orgId, params.id)
  if (!bundle) return NextResponse.json({ error: 'Return not found in your practice' }, { status: 404 })
  const { client, practiceReturn } = bundle

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  const events: Array<{ event_type: string; event_label: string; detail?: string | null; metadata?: Record<string, unknown> | null }> = []

  if (VALID_STATUS.includes(body.filing_status) && body.filing_status !== practiceReturn.filing_status) {
    updates.filing_status = body.filing_status
    if (body.filing_status === 'filed' && !practiceReturn.filed_at) updates.filed_at = new Date().toISOString()
    if (body.filing_status === 'assessed' && !practiceReturn.assessed_at) updates.assessed_at = new Date().toISOString()
    events.push({
      event_type: 'status_changed',
      event_label: `Status moved to ${body.filing_status}`,
      metadata: { from: practiceReturn.filing_status, to: body.filing_status },
    })
  }
  if (body.deadline === null || typeof body.deadline === 'string') updates.deadline = body.deadline || null
  if (body.review_due_at === null || typeof body.review_due_at === 'string') updates.review_due_at = body.review_due_at || null
  if (typeof body.fee_paid === 'boolean' && body.fee_paid !== practiceReturn.fee_paid) {
    updates.fee_paid = body.fee_paid
    events.push({ event_type: 'fee_state_changed', event_label: body.fee_paid ? 'Fee marked paid' : 'Fee marked unpaid' })
  }
  if (body.fee !== undefined && Number(body.fee) !== Number(practiceReturn.fee ?? 0)) {
    updates.fee = Number(body.fee) || 0
    events.push({ event_type: 'fee_updated', event_label: 'Fee updated', detail: `Set to R${Number(body.fee || 0).toFixed(0)}` })
  }
  if (typeof body.notes === 'string' && body.notes.trim() !== (practiceReturn.notes ?? '')) updates.notes = body.notes.trim() || null
  if (typeof body.sars_reference === 'string' && body.sars_reference.trim() !== (practiceReturn.sars_reference ?? '')) {
    updates.sars_reference = body.sars_reference.trim() || null
    events.push({ event_type: 'sars_reference_updated', event_label: 'SARS reference updated' })
  }
  if (typeof body.owner_user_id === 'string' || body.owner_user_id === null) updates.owner_user_id = body.owner_user_id || null
  if (typeof body.preparer_user_id === 'string' || body.preparer_user_id === null) updates.preparer_user_id = body.preparer_user_id || null
  if (typeof body.reviewer_user_id === 'string' || body.reviewer_user_id === null) updates.reviewer_user_id = body.reviewer_user_id || null
  if ('doc_checklist' in body) {
    updates.doc_checklist = sanitizeChecklist(body.doc_checklist)
    events.push({ event_type: 'checklist_updated', event_label: 'Checklist updated' })
  }
  if (typeof body.client_signoff_at === 'string' || body.client_signoff_at === null) {
    updates.client_signoff_at = body.client_signoff_at || null
    events.push({
      event_type: 'client_signoff_changed',
      event_label: body.client_signoff_at ? 'Client sign-off captured' : 'Client sign-off cleared',
    })
  }
  if (Array.isArray(body.blocked_reason_codes)) {
    updates.blocked_reason_codes = body.blocked_reason_codes.map((code: unknown) => String(code)).slice(0, 12)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data: updated, error } = await admin
    .from('klippa_practice_returns')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await Promise.all(events.map(event => logPracticeEvent(admin, {
    organisation_id: orgId,
    client_id: client.id,
    return_id: params.id,
    actor_user_id: userId,
    ...event,
  })))

  return NextResponse.json({ practiceReturn: updated })
}
