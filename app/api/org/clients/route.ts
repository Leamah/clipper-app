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

export async function GET() {
  const ctx = await getContext()
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { data, error } = await ctx.admin
    .from('klippa_org_clients')
    .select('*')
    .eq('organisation_id', ctx.orgId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ clients: data ?? [] })
}

export async function POST(request: Request) {
  const ctx = await getContext(true)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const body = await request.json()
  const { name, contact_person, contact_email, default_site, notes } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })

  const { data, error } = await ctx.admin
    .from('klippa_org_clients')
    .insert({
      organisation_id: ctx.orgId,
      name: name.trim(),
      contact_person: contact_person?.trim() || null,
      contact_email: contact_email?.trim() || null,
      default_site: default_site?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data })
}

export async function PATCH(request: Request) {
  const ctx = await getContext(true)
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['name', 'contact_person', 'contact_email', 'default_site', 'status', 'notes']
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  const { data, error } = await ctx.admin
    .from('klippa_org_clients')
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', ctx.orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data })
}
