import { NextResponse } from 'next/server'
import { logPracticeEvent, resolvePracticeContext } from '@/lib/practice-server'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const body = await request.json().catch(() => ({}))
  const signed = body.signed !== false

  const { data: practiceReturn } = await admin
    .from('klippa_practice_returns')
    .select('id, client_id, organisation_id, client_signoff_at')
    .eq('id', params.id)
    .single()

  if (!practiceReturn || practiceReturn.organisation_id !== orgId) {
    return NextResponse.json({ error: 'Return not found in your practice' }, { status: 404 })
  }

  const signoffAt = signed ? new Date().toISOString() : null
  const { data, error } = await admin
    .from('klippa_practice_returns')
    .update({ client_signoff_at: signoffAt, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPracticeEvent(admin, {
    organisation_id: orgId,
    client_id: practiceReturn.client_id,
    return_id: practiceReturn.id,
    actor_user_id: userId,
    event_type: 'client_signoff_changed',
    event_label: signed ? 'Client sign-off captured' : 'Client sign-off cleared',
  })

  return NextResponse.json({ practiceReturn: data })
}
