/**
 * POST /api/leads
 *
 * Creates an off-system lead record and notifies the Klippa team via Brevo.
 * Used for: custom org pricing inquiries, seat reassignment requests.
 * These are handled manually — no automated fulfillment.
 */
import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendBrevoEmail }     from '@/lib/brevo'

const VALID_TYPES = ['custom_org_pricing', 'seat_reassignment', 'other'] as const
type LeadType = typeof VALID_TYPES[number]

export async function POST(req: NextRequest) {
  const cookieStore = cookies()

  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    lead_type:       LeadType
    notes?:          string
    contact_email?:  string
    metadata?:       Record<string, unknown>
  }

  const { lead_type, notes, contact_email, metadata } = body

  if (!VALID_TYPES.includes(lead_type)) {
    return NextResponse.json({ error: 'Invalid lead_type' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Look up the user's profile for org context
  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role, full_name')
    .eq('id', user.id)
    .single()

  const { data: authUser } = await admin.auth.admin.getUserById(user.id)
  const userEmail = authUser?.user?.email ?? contact_email ?? 'unknown'

  // Write the lead record
  const { data: lead, error } = await admin
    .from('klippa_leads')
    .insert({
      lead_type,
      organisation_id: profile?.organisation_id ?? null,
      submitted_by:    user.id,
      contact_email:   contact_email ?? userEmail,
      notes:           notes         ?? null,
      metadata:        metadata      ?? null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the Klippa team
  if ((process.env.BREVO_API_KEY ?? '').trim()) {
    const typeLabel: Record<LeadType, string> = {
      custom_org_pricing: 'Custom org pricing inquiry',
      seat_reassignment:  'Seat reassignment request',
      other:              'General lead',
    }

    let orgName = ''
    if (profile?.organisation_id) {
      const { data: org } = await admin
        .from('klippa_organisations')
        .select('name')
        .eq('id', profile.organisation_id)
        .single()
      orgName = org?.name ?? ''
    }

    const metaHtml = metadata
      ? Object.entries(metadata).map(([k, v]) => `<tr><td style="padding:4px 8px;color:#a0a0a0;">${k}</td><td style="padding:4px 8px;color:#f5f5f5;">${v}</td></tr>`).join('')
      : ''

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,sans-serif;">
<table width="100%" style="background:#0f0f0f;padding:32px 16px;"><tr><td align="center">
<table width="100%" style="max-width:520px;background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;">
  <tr><td style="background:#10b981;padding:20px 28px;">
    <p style="margin:0;color:#fff;font-size:16px;font-weight:700;">New lead: ${typeLabel[lead_type]}</p>
  </td></tr>
  <tr><td style="padding:28px;">
    <table style="border-collapse:collapse;width:100%;">
      <tr><td style="padding:4px 8px;color:#a0a0a0;">From</td><td style="padding:4px 8px;color:#f5f5f5;">${profile?.full_name ?? ''} &lt;${userEmail}&gt;</td></tr>
      ${orgName ? `<tr><td style="padding:4px 8px;color:#a0a0a0;">Organisation</td><td style="padding:4px 8px;color:#f5f5f5;">${orgName}</td></tr>` : ''}
      ${notes ? `<tr><td style="padding:4px 8px;color:#a0a0a0;">Notes</td><td style="padding:4px 8px;color:#f5f5f5;">${notes}</td></tr>` : ''}
      ${metaHtml}
      <tr><td style="padding:4px 8px;color:#a0a0a0;">Lead ID</td><td style="padding:4px 8px;color:#666;font-size:11px;font-family:monospace;">${lead.id}</td></tr>
    </table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`

    try {
      await sendBrevoEmail({
        to:       'info@leamah.co.za',
        subject:  `[Klippa lead] ${typeLabel[lead_type]} — ${orgName || userEmail}`,
        html,
        replyTo:  contact_email ?? userEmail,
      })
    } catch (err) {
      // Email failure is non-fatal — the lead is already recorded in the DB
      console.error('[leads] Brevo notify failed:', err)
    }
  }

  return NextResponse.json({ success: true, lead_id: lead.id })
}
