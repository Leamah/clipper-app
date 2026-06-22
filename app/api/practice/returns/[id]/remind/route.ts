import { NextResponse } from 'next/server'
import { sendBrevoEmail } from '@/lib/brevo'
import { buildPracticeReminderEmail } from '@/lib/practice-templates'
import { logPracticeEvent, resolvePracticeContext } from '@/lib/practice-server'
import { getSiteUrl } from '@/lib/security'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const { data: practiceReturn } = await admin
    .from('klippa_practice_returns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!practiceReturn || practiceReturn.organisation_id !== orgId) {
    return NextResponse.json({ error: 'Return not found in your practice' }, { status: 404 })
  }

  const [{ data: client }, { data: org }] = await Promise.all([
    admin.from('klippa_practice_clients').select('id, full_name, email, portal_token, portal_enabled').eq('id', practiceReturn.client_id).single(),
    admin.from('klippa_organisations').select('name').eq('id', orgId).single(),
  ])

  if (!client?.email || !client.portal_enabled || !client.portal_token) {
    return NextResponse.json({ error: 'Client email or portal is not ready' }, { status: 400 })
  }

  const portalUrl = `${getSiteUrl().replace(/\/$/, '')}/portal/${client.portal_token}`
  const html = buildPracticeReminderEmail({
    clientName: client.full_name,
    orgName: org?.name ?? 'Klippa',
    portalUrl,
    returnLabel: `${practiceReturn.tax_year} ${practiceReturn.return_type}`,
    checklist: practiceReturn.doc_checklist ?? [],
  })

  await sendBrevoEmail({
    to: client.email,
    subject: `Documents needed for ${practiceReturn.tax_year} ${practiceReturn.return_type}`,
    html,
    senderName: org?.name ?? 'Klippa',
  })

  const now = new Date().toISOString()
  await admin.from('klippa_practice_returns').update({ last_chased_at: now, updated_at: now }).eq('id', practiceReturn.id)
  await admin.from('klippa_practice_reminder_events').insert({
    organisation_id: orgId,
    client_id: practiceReturn.client_id,
    return_id: practiceReturn.id,
    channel: 'email',
    recipient_email: client.email,
    template_name: 'manual_return_reminder',
    sent_by: userId,
  })
  await logPracticeEvent(admin, {
    organisation_id: orgId,
    client_id: practiceReturn.client_id,
    return_id: practiceReturn.id,
    actor_user_id: userId,
    event_type: 'reminder_sent',
    event_label: 'Reminder sent',
    detail: client.email,
  })

  return NextResponse.json({ success: true })
}
