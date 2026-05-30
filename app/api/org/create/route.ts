import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function POST(request: Request) {
  const cookieStore = cookies()

  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, org_type = 'company' } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Generate a URL-friendly slug from org name
  const slug = name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

  // Create the organisation
  const { data: org, error: orgErr } = await admin
    .from('klippa_organisations')
    .insert({
      name:     name.trim(),
      slug:     slug || null,
      org_type,
      owner_id: user.id,
    })
    .select()
    .single()

  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 })

  // Link the profile to the org as owner
  const { error: profileErr } = await admin
    .from('klippa_profiles')
    .update({
      user_type:       org_type === 'practice' ? 'practitioner' : 'company_owner',
      organisation_id: org.id,
      org_role:        'owner',
    })
    .eq('id', user.id)

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  return NextResponse.json({ organisation: org })
}
