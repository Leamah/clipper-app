import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET() {
  const cookieStore = cookies()

  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await anon
    .from('klippa_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  if (profile?.subscription_tier !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  // Fetch all klippa profiles
  const { data: profiles, error } = await adminClient
    .from('klippa_profiles')
    .select('id, employment_type, tax_year, subscription_tier, onboarding_complete, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch emails from auth.users via admin API
  const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  const emailMap = Object.fromEntries((authData?.users ?? []).map((u) => [u.id, u.email ?? 'unknown']))

  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap[p.id] ?? 'unknown',
  }))

  return NextResponse.json({ users })
}

export async function PATCH(request: Request) {
  const cookieStore = cookies()

  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await anon
    .from('klippa_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  if (profile?.subscription_tier !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  const { id, subscription_tier } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { data, error } = await adminClient
    .from('klippa_profiles')
    .update({ subscription_tier })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
