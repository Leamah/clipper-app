import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getProfile(admin: any, userId: string) {
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
  const profile = await getProfile(admin, user.id)
  if (!profile?.organisation_id) return NextResponse.json({ contracts: [] })

  const { data, error } = await admin
    .from('klippa_consultant_contracts')
    .select('*')
    .eq('organisation_id', profile.organisation_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contracts: data ?? [] })
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
  const profile = await getProfile(admin, user.id)
  if (!profile?.organisation_id || profile.org_role !== 'owner')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const body = await request.json()
  const { user_id, contract_type = 'fixed_term', start_date, end_date, rate, rate_type = 'monthly', notes } = body

  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  // Expire any existing active contract for this consultant
  await admin.from('klippa_consultant_contracts')
    .update({ status: 'expired' })
    .eq('organisation_id', profile.organisation_id)
    .eq('user_id', user_id)
    .eq('status', 'active')

  const { data, error } = await admin
    .from('klippa_consultant_contracts')
    .insert({
      organisation_id: profile.organisation_id,
      user_id, contract_type, start_date, end_date,
      rate: rate ?? null, rate_type, notes: notes ?? null,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contract: data })
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
  const profile = await getProfile(admin, user.id)
  if (!profile?.organisation_id || profile.org_role !== 'owner')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['contract_type','start_date','end_date','rate','rate_type','status','notes']
  const safe    = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  const { data, error } = await admin
    .from('klippa_consultant_contracts')
    .update(safe)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contract: data })
}
