import { NextResponse } from 'next/server'
import { resolvePracticeContext } from '@/lib/practice-server'

export async function GET() {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const { data, error } = await admin
    .from('klippa_practice_checklist_templates')
    .select('*')
    .or(`organisation_id.is.null,organisation_id.eq.${orgId}`)
    .order('organisation_id', { ascending: false })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: Request) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const body = await request.json().catch(() => ({}))
  if (!body.name?.trim()) return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
  if (!body.return_type) return NextResponse.json({ error: 'Return type is required' }, { status: 400 })

  const checklist = Array.isArray(body.checklist)
    ? body.checklist
        .filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item: Record<string, unknown>) => ({
          id: String(item.id ?? crypto.randomUUID()),
          label: String(item.label ?? '').slice(0, 120),
          received: false,
        }))
        .filter((item: { label: string }) => item.label.trim().length > 0)
    : []

  const { data, error } = await admin
    .from('klippa_practice_checklist_templates')
    .insert({
      organisation_id: orgId,
      name: body.name.trim(),
      return_type: body.return_type,
      entity_type: typeof body.entity_type === 'string' ? body.entity_type : null,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      checklist,
      reminder_cadence_days: Number(body.reminder_cadence_days) || null,
      created_by: userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}
