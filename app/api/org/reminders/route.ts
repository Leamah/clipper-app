import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { sendBrevoEmail }     from '@/lib/brevo'

// POST /api/org/reminders — send reminder emails to missing consultants
// Body: { consultant_ids?: string[] }  — omit to send to ALL missing
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

  const { data: callerProfile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.organisation_id || callerProfile.org_role !== 'org-admin')
    return NextResponse.json({ error: 'Owners only' }, { status: 403 })

  const orgId = callerProfile.organisation_id
  const body  = await request.json().catch(() => ({}))
  const filterIds: string[] | undefined = body.consultant_ids

  // Get current open period (optional — send a general nudge if none exists)
  const { data: periods } = await admin
    .from('klippa_payroll_periods')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('status', 'open')
    .order('deadline', { ascending: true })
    .limit(1)

  const period = periods?.[0] ?? null

  // Get org name + branding
  const { data: orgRow } = await admin.from('klippa_organisations').select('name, brand_color').eq('id', orgId).single()
  const orgName    = orgRow?.name        ?? 'your organisation'
  const brandColor = orgRow?.brand_color ?? '#10b981'

  // Get consultants (non-owners)
  const { data: members } = await admin
    .from('klippa_profiles')
    .select('id, full_name')
    .eq('organisation_id', orgId)
    .neq('org_role', 'org-admin')

  const targets = filterIds
    ? (members ?? []).filter(m => filterIds.includes(m.id))
    : members ?? []

  if (targets.length === 0) return NextResponse.json({ sent: 0 })

  // Get their emails
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = Object.fromEntries((authData?.users ?? []).map(u => [u.id, u.email ?? '']))

  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'
  const deadline = period ? new Date(period.deadline).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const daysLeft = period ? Math.ceil((new Date(period.deadline).getTime() - Date.now()) / 86_400_000) : null

  let sent = 0; let failed = 0
  for (const m of targets) {
    const email = emailMap[m.id]
    if (!email) continue
    const name = m.full_name ?? email

    const subject = period
      ? `⏰ Timesheet due ${daysLeft != null && daysLeft > 0 ? `in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'today'} — ${period.name}`
      : `⏰ Timesheet reminder from ${orgName}`

    const periodLine = period
      ? `Your timesheet for <strong style="color:#f5f5f5;">${period.name}</strong> hasn&rsquo;t been submitted yet.
         ${orgName} requires it by <strong style="color:#f59e0b;">${deadline}</strong>
         ${daysLeft != null && daysLeft > 0 ? `— that&rsquo;s ${daysLeft} day${daysLeft !== 1 ? 's' : ''} from now` : '— <strong style="color:#ef4444;">due today</strong>'}.`
      : `Your organisation <strong style="color:#f5f5f5;">${orgName}</strong> is reminding you to keep your timesheets up to date.`

    try {
      await sendBrevoEmail({
        to: email,
        subject,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;">
        <tr><td style="background:${brandColor};padding:24px 32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;text-align:center;vertical-align:middle;">
              <span style="color:#fff;font-size:16px;font-weight:700;">${orgName.charAt(0).toUpperCase()}</span>
            </td>
            <td style="padding-left:10px;color:#fff;font-size:17px;font-weight:700;">${orgName}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;color:#f5f5f5;font-size:20px;font-weight:700;">Hi ${name},</p>
          <p style="margin:16px 0;color:#a0a0a0;font-size:14px;line-height:1.7;">${periodLine}</p>
          <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td style="background:${brandColor};border-radius:10px;">
              <a href="${siteUrl}/timesheets" style="display:inline-block;padding:13px 26px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Submit timesheet →</a>
            </td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;">
          <p style="margin:0;color:#555;font-size:11px;">Sent on behalf of ${orgName} via Klippa.${period ? ` Period: ${period.period_start} – ${period.period_end}.` : ''}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      })
      sent++
    } catch (e) {
      failed++
      console.error(`[reminders] Failed to send to ${email}:`, e)
    }
  }

  return NextResponse.json({ sent, failed })
}
