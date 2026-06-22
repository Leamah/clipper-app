import { NextResponse } from 'next/server'
import { logPracticeEvent, resolvePracticeContext } from '@/lib/practice-server'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const body = await request.json().catch(() => ({}))
  const templateId = String(body.template_id ?? '')
  if (!templateId) return NextResponse.json({ error: 'Template is required' }, { status: 400 })

  const [{ data: practiceReturn }, { data: template }] = await Promise.all([
    admin.from('klippa_practice_returns').select('id, client_id, organisation_id').eq('id', params.id).single(),
    admin.from('klippa_practice_checklist_templates').select('*').eq('id', templateId).single(),
  ])

  if (!practiceReturn || practiceReturn.organisation_id !== orgId) {
    return NextResponse.json({ error: 'Return not found in your practice' }, { status: 404 })
  }
  if (!template || (template.organisation_id && template.organisation_id !== orgId)) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const checklist = Array.isArray(template.checklist)
    ? template.checklist.map((item: Record<string, unknown>) => ({
        id: String(item.id ?? crypto.randomUUID()),
        label: String(item.label ?? '').slice(0, 120),
        received: false,
      }))
    : []

  const { data, error } = await admin
    .from('klippa_practice_returns')
    .update({ doc_checklist: checklist, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPracticeEvent(admin, {
    organisation_id: orgId,
    client_id: practiceReturn.client_id,
    return_id: practiceReturn.id,
    actor_user_id: userId,
    event_type: 'template_applied',
    event_label: 'Checklist template applied',
    detail: template.name,
    metadata: { template_id: template.id },
  })

  return NextResponse.json({ practiceReturn: data })
}
