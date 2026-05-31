import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET() {
  const cookieStore = cookies()

  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Get caller's org
  const { data: callerProfile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
  }

  const orgId = callerProfile.organisation_id

  // Get all org member profiles
  const { data: memberProfiles, error: membersErr } = await admin
    .from('klippa_profiles')
    .select('id, full_name, org_role, feature_timesheets, subscription_tier, created_at')
    .eq('organisation_id', orgId)
    .neq('org_role', 'org-admin')
    .order('created_at', { ascending: true })

  if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 })

  // Fetch member emails from auth.users
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = Object.fromEntries((authData?.users ?? []).map((u) => [u.id, u.email ?? 'unknown']))

  // Fetch latest timesheet status for each member
  const memberIds = (memberProfiles ?? []).map((p) => p.id)
  let timesheetMap: Record<string, { status: string; month: string } | null> = {}

  if (memberIds.length > 0) {
    const { data: timesheets } = await admin
      .from('klippa_timesheets')
      .select('user_id, status, month')
      .in('user_id', memberIds)
      .order('month', { ascending: false })

    // Keep only the most recent timesheet per user
    for (const ts of timesheets ?? []) {
      if (!timesheetMap[ts.user_id]) {
        timesheetMap[ts.user_id] = { status: ts.status, month: ts.month }
      }
    }
  }

  const members = (memberProfiles ?? []).map((p) => ({
    ...p,
    email:             emailMap[p.id] ?? 'unknown',
    latest_timesheet:  timesheetMap[p.id] ?? null,
  }))

  return NextResponse.json({ members })
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

  const { memberId } = await request.json()
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Caller must be an org admin
  const { data: callerProfile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.organisation_id || callerProfile.org_role !== 'org-admin') {
    return NextResponse.json({ error: 'Only org admins can remove members' }, { status: 403 })
  }

  // Prevent owner removing themselves
  if (memberId === user.id) {
    return NextResponse.json({ error: 'Owners cannot remove themselves' }, { status: 400 })
  }

  // Confirm target belongs to same org
  const { data: targetProfile } = await admin
    .from('klippa_profiles')
    .select('organisation_id')
    .eq('id', memberId)
    .single()

  if (targetProfile?.organisation_id !== callerProfile.organisation_id) {
    return NextResponse.json({ error: 'Member not in your organisation' }, { status: 403 })
  }

  const { error } = await admin
    .from('klippa_profiles')
    .update({ organisation_id: null, org_role: null })
    .eq('id', memberId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
