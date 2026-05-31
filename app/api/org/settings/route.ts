import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { ORG_PLANS }          from '@/lib/types'
import type { OrgPlan }       from '@/lib/types'

export async function GET() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 404 })

  const { data: org, error } = await admin
    .from('klippa_organisations')
    .select('*')
    .eq('id', profile.organisation_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Plan usage: managers (org-admins), consultant seats (members) + pending invites
  const orgId = profile.organisation_id
  const [{ count: managerCount }, { count: memberCount }, { count: pendingCount }] = await Promise.all([
    admin.from('klippa_profiles').select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId).eq('org_role', 'org-admin'),
    admin.from('klippa_profiles').select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId).eq('org_role', 'member'),
    admin.from('klippa_org_invites').select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId).eq('status', 'pending'),
  ])

  const planKey = (org.subscription_tier as OrgPlan) ?? 'tier1'
  const plan    = ORG_PLANS[planKey] ?? ORG_PLANS.tier1

  const usage = {
    plan:           planKey,
    label:          plan.label,
    managers_used:  managerCount ?? 0,
    managers_limit: plan.managers,
    seats_used:     (memberCount ?? 0) + (pendingCount ?? 0),
    seats_limit:    plan.seats,
  }

  return NextResponse.json({ org, role: profile.org_role, usage })
}

export async function PATCH(request: Request) {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!profile?.organisation_id || profile.org_role !== 'org-admin') {
    return NextResponse.json({ error: 'Only org admins can update settings' }, { status: 403 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (typeof body.name        === 'string' && body.name.trim())  updates.name        = body.name.trim()
  if (typeof body.brand_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.brand_color.trim()))
    updates.brand_color = body.brand_color.trim().toLowerCase()
  if (typeof body.logo_url    === 'string')                       updates.logo_url    = body.logo_url || null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: org, error } = await admin
    .from('klippa_organisations')
    .update(updates)
    .eq('id', profile.organisation_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ org })
}
