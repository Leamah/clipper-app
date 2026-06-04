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

  const { token } = await request.json()
  if (!token?.trim()) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Look up the invite
  const { data: invite, error: invErr } = await admin
    .from('klippa_org_invites')
    .select('id, organisation_id, invited_email, role, expires_at, status, seat_access_until')
    .eq('token', token.trim())
    .eq('status', 'pending')
    .single()

  if (invErr || !invite) {
    return NextResponse.json({ error: 'Invite not found or already used' }, { status: 404 })
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
  }

  // Verify the logged-in user's email matches the invited email
  const { data: authUser } = await admin.auth.admin.getUserById(user.id)
  const userEmail = authUser?.user?.email?.toLowerCase() ?? ''

  if (userEmail !== invite.invited_email.toLowerCase()) {
    return NextResponse.json(
      { error: `This invite was sent to ${invite.invited_email}. Please log in with that email.` },
      { status: 403 },
    )
  }

  // Inspect the user's current org membership
  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  // Already a member of THIS org — idempotent success
  if (profile?.organisation_id === invite.organisation_id) {
    await admin
      .from('klippa_org_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id)
    const { data: sameOrg } = await admin
      .from('klippa_organisations').select('name').eq('id', invite.organisation_id).single()
    return NextResponse.json({ success: true, orgName: sameOrg?.name ?? 'your organisation' })
  }

  // Owns a different org — block (an owner can't also be a consultant elsewhere
  // on the same account; they'd lose access to their own org's data).
  if (profile?.organisation_id && profile.org_role === 'org-admin') {
    return NextResponse.json(
      { error: 'You own an organisation on this account. Use a different email to join another organisation as a consultant.' },
      { status: 409 },
    )
  }

  // A consultant moving from one agency to another — switching is allowed.
  // Their organisation_id is simply re-pointed; the old org no longer sees them.

  // Accept: link user to org + mark invite accepted.
  // Use UPSERT (not UPDATE) so brand-new users who have no profile row yet
  // (never visited onboarding) still get a valid profile created here.
  // onboarding_complete = true so they skip the type-selection onboarding flow.
  const [updateInvite, updateProfile] = await Promise.all([
    admin
      .from('klippa_org_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id),
    admin
      .from('klippa_profiles')
      .upsert({
        id:                  user.id,
        organisation_id:     invite.organisation_id,
        org_role:            invite.role ?? 'member',
        user_type:           'freelancer',   // consultant keeps freelancer tax features
        onboarding_complete: true,           // bypass the type-selection onboarding step
        // Carry the custom seat end date from the invite (null = covered by org subscription_ends_at)
        seat_access_until:   invite.seat_access_until ?? null,
      }, { onConflict: 'id' }),
  ])

  if (updateInvite.error) {
    return NextResponse.json({ error: updateInvite.error.message }, { status: 500 })
  }
  if (updateProfile.error) {
    return NextResponse.json({ error: updateProfile.error.message }, { status: 500 })
  }

  // Fetch org name for the success message + client auto-create
  const { data: org } = await admin
    .from('klippa_organisations')
    .select('name')
    .eq('id', invite.organisation_id)
    .single()

  // Auto-create a klippa_clients record for the org so the consultant's
  // timesheets page has a client ready to use immediately.
  // Use upsert with a do-nothing conflict so repeat accepts are idempotent.
  if (org?.name) {
    const { data: existing } = await admin
      .from('klippa_clients')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', org.name)
      .single()

    if (!existing) {
      await admin.from('klippa_clients').insert({
        user_id:  user.id,
        name:     org.name,
        is_active: true,
      })
    }
  }

  return NextResponse.json({ success: true, orgName: org?.name ?? 'your organisation' })
}
