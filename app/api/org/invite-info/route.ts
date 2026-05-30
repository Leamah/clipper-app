import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

// Public endpoint — no auth required. Returns invite metadata by token.
// Only exposes org name + invited email (not sensitive).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token?.trim()) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch invite + org name in one query
  const { data: invite, error } = await admin
    .from('klippa_org_invites')
    .select('status, expires_at, invited_email, organisation_id')
    .eq('token', token.trim())
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: invite.status === 'accepted' ? 'This invite has already been accepted.' : 'This invite is no longer valid.' },
      { status: 410 },
    )
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired.' }, { status: 410 })
  }

  const { data: org } = await admin
    .from('klippa_organisations')
    .select('name')
    .eq('id', invite.organisation_id)
    .single()

  return NextResponse.json({
    orgName:      org?.name ?? 'Unknown Organisation',
    invitedEmail: invite.invited_email,
  })
}
