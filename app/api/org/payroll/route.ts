import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrgId(admin: any, userId: string) {
  const { data } = await admin.from('klippa_profiles')
    .select('organisation_id, org_role').eq('id', userId).single()
  return data
}

export async function GET() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin   = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const profile = await getOrgId(admin, user.id)
  if (!profile?.organisation_id) return NextResponse.json({ periods: [] })

  const { data, error } = await admin
    .from('klippa_payroll_periods')
    .select('*')
    .eq('organisation_id', profile.organisation_id)
    .order('deadline', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ periods: data ?? [] })
}

export async function POST(request: Request) {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin   = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const profile = await getOrgId(admin, user.id)
  if (!profile?.organisation_id || profile.org_role !== 'owner')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const { name, period_start, period_end, deadline } = await request.json()
  if (!name || !period_start || !period_end || !deadline)
    return NextResponse.json({ error: 'name, period_start, period_end, deadline required' }, { status: 400 })

  const { data, error } = await admin
    .from('klippa_payroll_periods')
    .insert({ organisation_id: profile.organisation_id, name, period_start, period_end, deadline })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ period: data })
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

  const admin   = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const profile = await getOrgId(admin, user.id)
  if (!profile?.organisation_id || profile.org_role !== 'owner')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['name','period_start','period_end','deadline','status']
  const safe    = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  const { data, error } = await admin
    .from('klippa_payroll_periods')
    .update(safe)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ period: data })
}

export async function DELETE(request: Request) {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin   = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const profile = await getOrgId(admin, user.id)
  if (!profile?.organisation_id || profile.org_role !== 'owner')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const { id } = await request.json()
  const { error } = await admin
    .from('klippa_payroll_periods')
    .delete()
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
