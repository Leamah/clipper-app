import { NextResponse } from 'next/server'
import { calculatePracticeReadiness } from '@/lib/practice-readiness'
import { derivePracticeQueue } from '@/lib/practice-workflow'
import { listPracticeTeam, logPracticeEvent, resolvePracticeContext } from '@/lib/practice-server'
import type { KlippaPracticeClient, KlippaPracticeClientDocument, KlippaPracticeReturn, PracticeDashboardRow } from '@/lib/types'

export async function GET(request: Request) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const url = new URL(request.url)
  const queue = url.searchParams.get('queue')
  const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''

  const [clientsRes, returnsRes, docsRes, team] = await Promise.all([
    admin.from('klippa_practice_clients').select('*').eq('organisation_id', orgId).eq('status', 'active'),
    admin.from('klippa_practice_returns').select('*').eq('organisation_id', orgId).order('deadline', { ascending: true, nullsFirst: false }),
    admin.from('klippa_practice_client_documents').select('*').eq('organisation_id', orgId),
    listPracticeTeam(admin, orgId),
  ])

  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 })
  if (returnsRes.error) return NextResponse.json({ error: returnsRes.error.message }, { status: 500 })
  if (docsRes.error) return NextResponse.json({ error: docsRes.error.message }, { status: 500 })

  const clients = (clientsRes.data ?? []) as KlippaPracticeClient[]
  const returns = (returnsRes.data ?? []) as KlippaPracticeReturn[]
  const documents = (docsRes.data ?? []) as KlippaPracticeClientDocument[]
  const clientMap = Object.fromEntries(clients.map(client => [client.id, client]))
  const teamMap = Object.fromEntries(team.map(member => [member.id, member]))
  const docsByReturn = documents.reduce<Record<string, KlippaPracticeClientDocument[]>>((acc, doc) => {
    if (!doc.return_id) return acc
    acc[doc.return_id] ??= []
    acc[doc.return_id].push(doc)
    return acc
  }, {})

  const rows = returns.map(practiceReturn => {
    const client = clientMap[practiceReturn.client_id]
    if (!client) return null
    const readiness = calculatePracticeReadiness(client, docsByReturn[practiceReturn.id] ?? [], null, practiceReturn)
    const row: PracticeDashboardRow = {
      client: {
        id: client.id,
        full_name: client.full_name,
        email: client.email,
        tax_number: client.tax_number,
        entity_type: client.entity_type,
        client_user_id: client.client_user_id,
      },
      return: practiceReturn,
      queue: derivePracticeQueue(client, practiceReturn, readiness),
      readiness,
      received_documents: practiceReturn.doc_checklist.filter(item => item.received).length,
      total_documents: practiceReturn.doc_checklist.length,
      assignees: {
        owner: teamMap[practiceReturn.owner_user_id ?? ''] ?? null,
        preparer: teamMap[practiceReturn.preparer_user_id ?? ''] ?? null,
        reviewer: teamMap[practiceReturn.reviewer_user_id ?? ''] ?? null,
      },
    }
    return row
  }).filter(Boolean) as PracticeDashboardRow[]

  const filtered = rows.filter(row => {
    const matchesQueue = !queue || queue === 'All' || row.queue === queue
    const matchesSearch = !search
      || row.client.full_name.toLowerCase().includes(search)
      || (row.client.email ?? '').toLowerCase().includes(search)
      || (row.client.tax_number ?? '').toLowerCase().includes(search)
    return matchesQueue && matchesSearch
  })

  return NextResponse.json({ rows: filtered })
}

export async function POST(request: Request) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId, userId } = ctx

  const body = await request.json().catch(() => ({}))
  if (!body.client_id) return NextResponse.json({ error: 'Client is required' }, { status: 400 })
  if (!Number.isInteger(body.tax_year)) return NextResponse.json({ error: 'Tax year is required' }, { status: 400 })
  if (!body.return_type) return NextResponse.json({ error: 'Return type is required' }, { status: 400 })

  const { data: client } = await admin
    .from('klippa_practice_clients')
    .select('id, organisation_id, full_name')
    .eq('id', body.client_id)
    .single()

  if (!client || client.organisation_id !== orgId) {
    return NextResponse.json({ error: 'Client not found in your practice' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('klippa_practice_returns')
    .insert({
      client_id: client.id,
      organisation_id: orgId,
      tax_year: body.tax_year,
      return_type: body.return_type,
      filing_status: 'not_started',
      deadline: body.deadline || null,
      fee: Number(body.fee) || 0,
      fee_paid: false,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      doc_checklist: [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPracticeEvent(admin, {
    organisation_id: orgId,
    client_id: client.id,
    return_id: data.id,
    actor_user_id: userId,
    event_type: 'return_created',
    event_label: 'Additional return created',
    detail: `${data.tax_year} ${data.return_type}`,
  })

  return NextResponse.json({ practiceReturn: data })
}
