import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

const BUCKET = 'klippa-org-assets'
const MAX_BYTES = 2 * 1024 * 1024  // 2 MB

export async function POST(request: Request) {
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

  if (!profile?.organisation_id || profile.org_role !== 'owner')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  if (!ALLOWED.includes(file.type))
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP or SVG allowed' }, { status: 400 })

  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'Max file size is 2 MB' }, { status: 400 })

  const ext      = file.type === 'image/svg+xml' ? 'svg'
    : file.type === 'image/webp' ? 'webp'
    : file.type === 'image/png'  ? 'png' : 'jpg'
  const path     = `orgs/${profile.organisation_id}/logo.${ext}`
  const buffer   = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)

  // Bust cache with a timestamp query param
  const logo_url = `${publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await admin
    .from('klippa_organisations')
    .update({ logo_url })
    .eq('id', profile.organisation_id)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ logo_url })
}

export async function DELETE() {
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

  if (!profile?.organisation_id || profile.org_role !== 'owner')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  // Remove any logo files for this org
  const { data: files } = await admin.storage
    .from(BUCKET)
    .list(`orgs/${profile.organisation_id}`)

  if (files?.length) {
    const paths = files.map(f => `orgs/${profile.organisation_id}/${f.name}`)
    await admin.storage.from(BUCKET).remove(paths)
  }

  await admin
    .from('klippa_organisations')
    .update({ logo_url: null })
    .eq('id', profile.organisation_id)

  return NextResponse.json({ success: true })
}
