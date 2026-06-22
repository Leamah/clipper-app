import { NextResponse } from 'next/server'
import { buildPracticeReminderEmail } from '@/lib/practice-templates'
import { logPracticeEvent, resolvePracticeContext } from '@/lib/practice-server'
import { sendBrevoEmail } from '@/lib/brevo'
import { getSiteUrl } from '@/lib/security'

export async function POST(request: Request) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : []
  if (ids.length === 0) return NextResponse.json({ error: 'Select at least one return' }, { status: 400 })

  const { data: returns, error } = await admin
    .from('klippa_practice_returns')
    .select('*')
    .in('id', ids)
    .eq('organisation_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!returns?.length) return NextResponse.json({ error: 'No matching returns found' }, { status: 404 })

  const clientIds = Array.from(new Set(returns.map(row => row.client_id)))
  const { data: clients } = await admin
    .from('klippa_practice_clients')
    .select('id, full_name, email, portal_token, portal_enabled, organisation_id')
    .in('id', clientIds)

  const { data: org } = await admin.from('klippa_organisations').select('name').eq('id', orgId).single()
  const clientMap = Object.fromEntries((clients ?? []).map(client => [client.id, client]))

  const action = String(body.action ?? '')
  if (action === 'assign_owner') {
    const ownerUserId = typeof body.owner_user_id === 'string' ? body.owner_user_id : null
    const { error: updateError } = await admin
      .from('klippa_practice_returns')
      .update({ owner_user_id: ownerUserId, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('organisation_id', orgId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await Promise.all(returns.map(row => logPracticeEvent(admin, {
      organisation_id: orgId,
      client_id: row.client_id,
      return_id: row.id,
      actor_user_id: userId,
      event_type: 'bulk_assign_owner',
      event_label: 'Owner assigned in bulk',
    })))
    return NextResponse.json({ updated: returns.length })
  }

  if (action === 'update_status') {
    const filingStatus = typeof body.filing_status === 'string' ? body.filing_status : null
    if (!filingStatus) return NextResponse.json({ error: 'Status is required' }, { status: 400 })
    const { error: updateError } = await admin
      .from('klippa_practice_returns')
      .update({ filing_status: filingStatus, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('organisation_id', orgId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await Promise.all(returns.map(row => logPracticeEvent(admin, {
      organisation_id: orgId,
      client_id: row.client_id,
      return_id: row.id,
      actor_user_id: userId,
      event_type: 'bulk_status_change',
      event_label: `Status moved to ${filingStatus} in bulk`,
    })))
    return NextResponse.json({ updated: returns.length })
  }

  if (action === 'send_reminder') {
    let sent = 0
    for (const practiceReturn of returns) {
      const client = clientMap[practiceReturn.client_id]
      if (!client?.email || !client.portal_enabled || !client.portal_token) continue
      const portalUrl = `${getSiteUrl().replace(/\/$/, '')}/portal/${client.portal_token}`
      const html = buildPracticeReminderEmail({
        clientName: client.full_name,
        orgName: org?.name ?? 'Klippa',
        portalUrl,
        returnLabel: `${practiceReturn.tax_year} ${practiceReturn.return_type}`,
        checklist: practiceReturn.doc_checklist ?? [],
      })
      try {
        await sendBrevoEmail({
          to: client.email,
          subject: `Documents needed for ${practiceReturn.tax_year} ${practiceReturn.return_type}`,
          html,
          senderName: org?.name ?? 'Klippa',
        })
        await admin.from('klippa_practice_returns').update({ last_chased_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', practiceReturn.id)
        await admin.from('klippa_practice_reminder_events').insert({
          organisation_id: orgId,
          client_id: practiceReturn.client_id,
          return_id: practiceReturn.id,
          channel: 'email',
          recipient_email: client.email,
          template_name: 'bulk_reminder',
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
        sent += 1
      } catch (e) {
        console.error('[practice bulk reminder]', e)
      }
    }
    return NextResponse.json({ sent })
  }

  return NextResponse.json({ error: 'Unsupported bulk action' }, { status: 400 })
}
