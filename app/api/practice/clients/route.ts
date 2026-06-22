import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { getOrgEntitlement }  from '@/lib/billing'
import { PRACTICE_CLIENT_CAP } from '@/lib/ozow'
import { logPracticeEvent } from '@/lib/practice-server'

// Resolve caller → admin client + practice org. Practitioners only.
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

  return { user, admin, orgId: caller.organisation_id as string }
}

const VALID_ENTITY = ['individual', 'sole_prop', 'company', 'trust']
const VALID_RETURN = ['ITR12', 'IRP6', 'ITR14', 'IT12TR']

// GET /api/practice/clients — list active clients + aggregate stats
export async function GET() {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const { data: clients, error } = await admin
    .from('klippa_practice_clients')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  const { data: returns, error: returnsError } = await admin
    .from('klippa_practice_returns')
    .select('id, filing_status, deadline, fee, fee_paid')
    .eq('organisation_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (returnsError) return NextResponse.json({ error: returnsError.message }, { status: 500 })

  const list  = clients ?? []
  const returnList = returns ?? []
  const today = new Date()
  const in14  = new Date(today); in14.setDate(today.getDate() + 14)

  const stats = {
    total_clients:    list.length,
    total_returns: returnList.length,
    due_soon: returnList.filter(r =>
      r.deadline &&
      new Date(r.deadline) <= in14 &&
      r.filing_status !== 'filed' &&
      r.filing_status !== 'assessed').length,
    filed_count:  returnList.filter(r => r.filing_status === 'filed' || r.filing_status === 'assessed').length,
    in_progress:  returnList.filter(r => ['collecting', 'in_progress', 'review'].includes(r.filing_status)).length,
    blocked_returns: returnList.filter(r => r.filing_status === 'not_started').length,
    waiting_on_client: returnList.filter(r => r.filing_status === 'collecting').length,
    ready_for_review: returnList.filter(r => r.filing_status === 'in_progress').length,
    ready_to_file: returnList.filter(r => r.filing_status === 'review').length,
    outstanding_fees: returnList.reduce((s, r) => s + (r.fee_paid ? 0 : Number(r.fee ?? 0)), 0),
  }

  return NextResponse.json({ clients: list, stats })
}

// POST /api/practice/clients — add a client
export async function POST(request: Request) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { user, admin, orgId } = ctx

  const body = await request.json().catch(() => ({}))
  if (!body.full_name?.trim())
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 })

  // ── Soft payment gate ─────────────────────────────────────
  // Adding the first client is the practice's first value action — require an
  // active seat subscription. The practitioner can set up & browse unpaid.
  const ent = await getOrgEntitlement(admin, orgId)
  if (!ent.entitled) {
    return NextResponse.json(
      { error: 'Activate your practice to add clients.', gate: 'payment', checkoutUrl: '/org/billing?gate=1' },
      { status: 402 },
    )
  }

  // ── Fair-use client cap ───────────────────────────────────
  const { count: activeClients } = await admin
    .from('klippa_practice_clients')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
    .eq('status', 'active')

  if ((activeClients ?? 0) >= PRACTICE_CLIENT_CAP) {
    return NextResponse.json(
      { error: `You've reached the ${PRACTICE_CLIENT_CAP}-client fair-use limit. Contact us at info@leamah.co.za for enterprise pricing.`, gate: 'contact' },
      { status: 402 },
    )
  }

  const entity_type = VALID_ENTITY.includes(body.entity_type) ? body.entity_type : 'individual'
  const return_type = VALID_RETURN.includes(body.return_type) ? body.return_type : 'ITR12'

  const insert = {
    organisation_id: orgId,
    full_name:       body.full_name.trim(),
    email:           body.email?.trim() || null,
    entity_type,
    return_type,
    tax_number:      body.tax_number?.trim() || null,
    tax_year:        Number.isInteger(body.tax_year) ? body.tax_year : new Date().getFullYear(),
    deadline:        body.deadline || null,
    fee:             Number(body.fee) || 0,
    notes:           body.notes?.trim() || null,
  }

  const { data: client, error } = await admin
    .from('klippa_practice_clients')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: practiceReturn, error: returnError } = await admin
    .from('klippa_practice_returns')
    .insert({
      client_id:       client.id,
      organisation_id: orgId,
      tax_year:        insert.tax_year,
      return_type:     insert.return_type,
      filing_status:   'not_started',
      deadline:        insert.deadline,
      fee:             insert.fee,
      fee_paid:        false,
      notes:           insert.notes,
      doc_checklist:   [],
    })
    .select()
    .single()

  if (returnError) return NextResponse.json({ error: returnError.message }, { status: 500 })

  await logPracticeEvent(admin, {
    organisation_id: orgId,
    client_id: client.id,
    return_id: practiceReturn.id,
    actor_user_id: user.id,
    event_type: 'client_created',
    event_label: 'Client and return created',
    detail: `${client.full_name} · ${practiceReturn.tax_year} ${practiceReturn.return_type}`,
  })

  return NextResponse.json({ client, practiceReturn })
}
