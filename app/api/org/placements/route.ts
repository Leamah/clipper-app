import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getContext(requireAdmin = false): Promise<any> {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!profile?.organisation_id) return { error: 'No organisation', status: 404 }
  if (requireAdmin && profile.org_role !== 'org-admin') return { error: 'Owners only', status: 403 }
  return { admin, orgId: profile.organisation_id }
}

async function verifyPlacementInputs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orgId: string,
  clientId: string,
  userId: string,
) {
  const [clientRes, userRes] = await Promise.all([
    admin.from('klippa_org_clients')
      .select('id')
      .eq('id', clientId)
      .eq('organisation_id', orgId)
      .maybeSingle(),
    admin.from('klippa_profiles')
      .select('id, organisation_id, org_role')
      .eq('id', userId)
      .maybeSingle(),
  ])

  if (!clientRes.data) return 'Client not found in this workspace'
  if (!userRes.data || userRes.data.organisation_id !== orgId || userRes.data.org_role === 'org-admin')
    return 'Consultant not found in this workspace'
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncContractorClient(admin: any, orgId: string, placement: any) {
  const { data: client } = await admin
    .from('klippa_org_clients')
    .select('name, contact_person, default_site')
    .eq('id', placement.client_id)
    .eq('organisation_id', orgId)
    .maybeSingle()

  if (!client) return

  const payload = {
    user_id: placement.user_id,
    name: client.name,
    contact: placement.client_manager_name ?? client.contact_person ?? null,
    hourly_rate: placement.pay_rate ?? null,
    position: placement.role_title ?? null,
    is_active: placement.status === 'active',
    organisation_id: orgId,
    org_placement_id: placement.id,
  }

  const { data: existing } = await admin
    .from('klippa_clients')
    .select('id')
    .eq('user_id', placement.user_id)
    .eq('org_placement_id', placement.id)
    .maybeSingle()

  if (existing?.id) {
    await admin.from('klippa_clients').update(payload).eq('id', existing.id)
  } else {
    await admin.from('klippa_clients').insert(payload)
  }
}

export async function GET() {
  const ctx = await getContext()
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { data, error } = await ctx.admin
    .from('klippa_org_placements')
    .select('*')
    .eq('organisation_id', ctx.orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ placements: data ?? [] })
}

export async function POST(request: Request) {
  const ctx = await getContext(true)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const body = await request.json()
  const {
    client_id, user_id, role_title, site, client_manager_name, client_manager_email,
    start_date, end_date, bill_rate, pay_rate, rate_type = 'hourly',
    compliance_requirements = [], notes,
  } = body

  if (!client_id || !user_id || !role_title?.trim())
    return NextResponse.json({ error: 'Client, consultant and role are required' }, { status: 400 })

  const validationError = await verifyPlacementInputs(ctx.admin, ctx.orgId, client_id, user_id)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const { data, error } = await ctx.admin
    .from('klippa_org_placements')
    .insert({
      organisation_id: ctx.orgId,
      client_id,
      user_id,
      role_title: role_title.trim(),
      site: site?.trim() || null,
      client_manager_name: client_manager_name?.trim() || null,
      client_manager_email: client_manager_email?.trim() || null,
      start_date: start_date || null,
      end_date: end_date || null,
      bill_rate: bill_rate === '' || bill_rate == null ? null : Number(bill_rate),
      pay_rate: pay_rate === '' || pay_rate == null ? null : Number(pay_rate),
      rate_type,
      compliance_requirements: Array.isArray(compliance_requirements) ? compliance_requirements : [],
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncContractorClient(ctx.admin, ctx.orgId, data)
  return NextResponse.json({ placement: data })
}

export async function PATCH(request: Request) {
  const ctx = await getContext(true)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (updates.client_id || updates.user_id) {
    const existing = await ctx.admin
      .from('klippa_org_placements')
      .select('client_id, user_id')
      .eq('id', id)
      .eq('organisation_id', ctx.orgId)
      .maybeSingle()
    const validationError = await verifyPlacementInputs(
      ctx.admin,
      ctx.orgId,
      updates.client_id ?? existing.data?.client_id,
      updates.user_id ?? existing.data?.user_id,
    )
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const allowed = [
    'client_id', 'user_id', 'role_title', 'site', 'client_manager_name',
    'client_manager_email', 'start_date', 'end_date', 'bill_rate', 'pay_rate',
    'rate_type', 'status', 'compliance_requirements', 'notes',
  ]
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
  for (const field of ['start_date', 'end_date']) {
    if (field in safe && !safe[field]) safe[field] = null
  }
  for (const field of ['bill_rate', 'pay_rate']) {
    if (field in safe) safe[field] = safe[field] === '' || safe[field] == null ? null : Number(safe[field])
  }

  const { data, error } = await ctx.admin
    .from('klippa_org_placements')
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', ctx.orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncContractorClient(ctx.admin, ctx.orgId, data)
  return NextResponse.json({ placement: data })
}
