import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { SEAT_PRICE_ANNUAL, PRACTICE_CLIENT_CAP } from '@/lib/ozow'
import { getOrgEntitlement }  from '@/lib/billing'

// GET /api/org/billing — seat/subscription status for the caller's org.
// Org admins only (the payer). Used by the /org/billing checkout page.
export async function GET() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!profile?.organisation_id || profile.org_role !== 'org-admin') {
    return NextResponse.json({ error: 'Only org admins can manage billing' }, { status: 403 })
  }

  const orgId = profile.organisation_id

  const [{ data: org }, ent, { count: memberCount }] = await Promise.all([
    admin.from('klippa_organisations')
      .select('name, org_type, seat_count, subscription_status, subscription_ends_at')
      .eq('id', orgId).single(),
    getOrgEntitlement(admin, orgId),
    admin.from('klippa_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('org_role', 'member'),
  ])

  return NextResponse.json({
    name:                 org?.name ?? '',
    org_type:             org?.org_type ?? 'company',
    seat_count:           org?.seat_count ?? 1,
    seats_used:           memberCount ?? 0,
    subscription_status:  org?.subscription_status ?? 'free',
    subscription_ends_at: org?.subscription_ends_at ?? null,
    entitled:             ent.entitled,
    seat_price:           SEAT_PRICE_ANNUAL,
    client_cap:           PRACTICE_CLIENT_CAP,
  })
}
