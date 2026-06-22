import { NextResponse } from 'next/server'
import { logPracticeEvent, resolvePracticeContext } from '@/lib/practice-server'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const { data: practiceReturn } = await admin
    .from('klippa_practice_returns')
    .select('id, client_id, organisation_id')
    .eq('id', params.id)
    .single()

  if (!practiceReturn || practiceReturn.organisation_id !== orgId) {
    return NextResponse.json({ error: 'Return not found in your practice' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) return NextResponse.json({ error: 'Note is required' }, { status: 400 })

  await logPracticeEvent(admin, {
    organisation_id: orgId,
    client_id: practiceReturn.client_id,
    return_id: practiceReturn.id,
    actor_user_id: userId,
    event_type: 'internal_note',
    event_label: 'Internal note added',
    detail: note.slice(0, 2000),
  })

  return NextResponse.json({ success: true })
}
