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
  if (!profile?.organisation_id) return NextResponse.json({ compliance: [] })

  const { data, error } = await admin
    .from('klippa_consultant_compliance')
    .select('*')
    .eq('organisation_id', profile.organisation_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ compliance: data ?? [] })
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
  if (!profile?.organisation_id || profile.org_role !== 'org-admin')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const { user_id, ...updates } = await request.json()
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const allowed = ['tax_profile_complete','banking_verified','id_verified','popia_consent','signed_agreement_at','notes']
  const safe    = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  // Handle signed_agreement_at toggle — if setting to true, use now(); if false, set null
  if ('signed_agreement_at' in safe && safe.signed_agreement_at === true) {
    safe.signed_agreement_at = new Date().toISOString()
  } else if ('signed_agreement_at' in safe && !safe.signed_agreement_at) {
    safe.signed_agreement_at = null
  }

  // Upsert compliance row
  const { data, error } = await admin
    .from('klippa_consultant_compliance')
    .upsert({
      organisation_id: profile.organisation_id,
      user_id,
      ...safe,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organisation_id,user_id' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ compliance: data })
}
