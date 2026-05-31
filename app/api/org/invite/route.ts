import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { ORG_PLANS }          from '@/lib/types'
import type { OrgPlan }       from '@/lib/types'

export async function POST(request: Request) {
  const cookieStore = cookies()

  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, role = 'member' } = await request.json()
  if (!email?.trim()) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // Verify caller is an org admin
  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!profile?.organisation_id || profile.org_role !== 'org-admin') {
    return NextResponse.json({ error: 'Only org admins can send invites' }, { status: 403 })
  }

  const orgId = profile.organisation_id

  // Check for existing pending invite to this email
  const { data: existing } = await admin
    .from('klippa_org_invites')
    .select('id, status')
    .eq('organisation_id', orgId)
    .eq('invited_email', email.trim().toLowerCase())
    .eq('status', 'pending')
    .single()

  if (existing) {
    return NextResponse.json({ error: 'An invite is already pending for this email' }, { status: 409 })
  }

  // ── Seat-cap enforcement ──────────────────────────────────
  // Consultants (org_role='member') + pending invites must stay within the
  // org's plan seat limit. Managers (org-admins) are counted separately.
  const { data: planRow } = await admin
    .from('klippa_organisations')
    .select('subscription_tier')
    .eq('id', orgId)
    .single()

  const plan  = (planRow?.subscription_tier as OrgPlan) ?? 'tier1'
  const limit = (ORG_PLANS[plan] ?? ORG_PLANS.tier1).seats

  if (Number.isFinite(limit)) {
    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
      admin.from('klippa_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('org_role', 'member'),
      admin.from('klippa_org_invites')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('status', 'pending'),
    ])

    const used = (memberCount ?? 0) + (pendingCount ?? 0)
    if (used >= limit) {
      return NextResponse.json(
        { error: `Your ${ORG_PLANS[plan].label} plan is limited to ${limit} consultant seats (currently ${used} used). Upgrade to add more.` },
        { status: 402 },
      )
    }
  }

  // Create the invite with a unique token + 7-day expiry
  const token      = crypto.randomUUID()
  const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invite, error: inviteErr } = await admin
    .from('klippa_org_invites')
    .insert({
      organisation_id: orgId,
      invited_email:   email.trim().toLowerCase(),
      invited_by:      user.id,
      role,
      token,
      expires_at:      expiresAt,
    })
    .select()
    .single()

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

  // Fetch org name + brand color for the acceptance URL
  const { data: orgRow } = await admin
    .from('klippa_organisations')
    .select('name, brand_color, logo_url')
    .eq('id', orgId)
    .single()

  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'
  const acceptUrl  = `${siteUrl}/invite/${token}`
  const orgName    = orgRow?.name        ?? 'an organisation'
  const brandColor = orgRow?.brand_color ?? '#10b981'

  // Send invite email via Brevo
  const brevoKey = process.env.BREVO_API_KEY
  let emailSent = false
  let emailError: string | null = null

  if (brevoKey) {
    const { data: callerAuth } = await admin.auth.admin.getUserById(user.id)
    const inviterName = callerAuth?.user?.email ?? 'Your colleague'
    try {
      await sendBrevoEmail({
        apiKey:  brevoKey,
        to:      email.trim().toLowerCase(),
        subject: `You've been invited to join ${orgName} on Klippa`,
        html:    buildInviteEmail({ orgName, inviterName, acceptUrl, brandColor }),
      })
      emailSent = true
    } catch (err) {
      emailError = err instanceof Error ? err.message : 'Email send failed'
      console.error('[org/invite] Brevo error:', err)
    }
  } else {
    emailError = 'BREVO_API_KEY not configured'
    console.info(`[org/invite] BREVO_API_KEY not set — invite link: ${acceptUrl}`)
  }

  return NextResponse.json({ invite, acceptUrl, orgName, emailSent, emailError })
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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!profile?.organisation_id) return NextResponse.json({ invites: [] })

  const { data: invites, error } = await admin
    .from('klippa_org_invites')
    .select('*')
    .eq('organisation_id', profile.organisation_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invites: invites ?? [] })
}

// ── Brevo transactional email ─────────────────────────────

async function sendBrevoEmail({ apiKey, to, subject, html }: {
  apiKey:  string
  to:      string
  subject: string
  html:    string
}) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'accept':       'application/json',
      'api-key':      apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: 'Klippa', email: 'noreply@mail.klippa.co.za' },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
}

// ── Email template ────────────────────────────────────────

function buildInviteEmail({ orgName, inviterName, acceptUrl, brandColor = '#10b981' }: {
  orgName:     string
  inviterName: string
  acceptUrl:   string
  brandColor?: string
}) {
  const initial = orgName.charAt(0).toUpperCase()
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:${brandColor};padding:28px 32px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;text-align:center;vertical-align:middle;">
                <span style="color:#fff;font-size:18px;font-weight:700;">${initial}</span>
              </td>
              <td style="padding-left:12px;color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">${orgName}</td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;color:#f5f5f5;font-size:22px;font-weight:700;line-height:1.3;">You&rsquo;re invited to join<br><span style="color:${brandColor};">${orgName}</span></p>
          <p style="margin:16px 0 0;color:#a0a0a0;font-size:14px;line-height:1.6;">${inviterName} has invited you to their workspace on Klippa — South Africa&rsquo;s freelancer tax platform. Accept the invite to track timesheets, manage expenses, and stay SARS-compliant together.</p>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
            <tr><td style="background:${brandColor};border-radius:10px;">
              <a href="${acceptUrl}" style="display:inline-block;padding:14px 28px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:-0.2px;">Accept invitation →</a>
            </td></tr>
          </table>
          <p style="margin:0;color:#666;font-size:12px;line-height:1.6;">Or copy this link into your browser:<br><span style="color:${brandColor};word-break:break-all;">${acceptUrl}</span></p>
          <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;">
          <p style="margin:0;color:#555;font-size:11px;">This invite expires in 7 days · Sent by ${orgName} via Klippa</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
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

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { error } = await admin
    .from('klippa_org_invites')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
