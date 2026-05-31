import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

async function resolvePracticeContext() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: caller } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role, user_type')
    .eq('id', user.id)
    .single()

  if (!caller?.organisation_id || caller.user_type !== 'practitioner')
    return { error: 'Practice workspace only', status: 403 as const }
  if (caller.org_role !== 'org-admin')
    return { error: 'Only practice admins can manage clients', status: 403 as const }

  return { admin, orgId: caller.organisation_id as string }
}

const VALID_STATUS = ['not_started', 'collecting', 'in_progress', 'review', 'filed', 'assessed']
const VALID_ENTITY = ['individual', 'sole_prop', 'company', 'trust']
const VALID_RETURN = ['ITR12', 'IRP6', 'ITR14', 'IT12TR']

// PATCH /api/practice/clients/[id] — update a client (status, fee, details…)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  // Confirm client belongs to caller's practice
  const { data: existing } = await admin
    .from('klippa_practice_clients')
    .select('id, organisation_id')
    .eq('id', params.id)
    .single()

  if (!existing || existing.organisation_id !== orgId)
    return NextResponse.json({ error: 'Client not found in your practice' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  if (typeof body.full_name  === 'string' && body.full_name.trim()) updates.full_name = body.full_name.trim()
  if (typeof body.email      === 'string') updates.email      = body.email.trim() || null
  if (typeof body.tax_number === 'string') updates.tax_number = body.tax_number.trim() || null
  if (typeof body.notes      === 'string') updates.notes      = body.notes.trim() || null
  if (VALID_ENTITY.includes(body.entity_type))   updates.entity_type   = body.entity_type
  if (VALID_RETURN.includes(body.return_type))   updates.return_type   = body.return_type
  if (VALID_STATUS.includes(body.filing_status)) updates.filing_status = body.filing_status
  if (body.deadline === null || typeof body.deadline === 'string') updates.deadline = body.deadline || null
  if (Number.isInteger(body.tax_year))   updates.tax_year = body.tax_year
  if (body.fee !== undefined)            updates.fee      = Number(body.fee) || 0
  if (typeof body.fee_paid === 'boolean') updates.fee_paid = body.fee_paid
  if (body.status === 'active' || body.status === 'archived') updates.status = body.status

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  updates.updated_at = new Date().toISOString()

  const { data: client, error } = await admin
    .from('klippa_practice_clients')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client })
}

// DELETE /api/practice/clients/[id] — archive (soft delete)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const { data: existing } = await admin
    .from('klippa_practice_clients')
    .select('id, organisation_id')
    .eq('id', params.id)
    .single()

  if (!existing || existing.organisation_id !== orgId)
    return NextResponse.json({ error: 'Client not found in your practice' }, { status: 404 })

  const { error } = await admin
    .from('klippa_practice_clients')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
