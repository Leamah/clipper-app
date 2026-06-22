import { NextResponse } from 'next/server'
import { calculatePracticeReadiness } from '@/lib/practice-readiness'
import { resolvePracticeContext, listPracticeTeam } from '@/lib/practice-server'
import { derivePracticeQueue } from '@/lib/practice-workflow'
import type {
  KlippaPracticeClient,
  KlippaPracticeClientDocument,
  KlippaPracticeReturn,
  PracticeDashboardRow,
  PracticeStats,
} from '@/lib/types'

export async function GET() {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const [clientsRes, returnsRes, docsRes, team] = await Promise.all([
    admin
      .from('klippa_practice_clients')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
    admin
      .from('klippa_practice_returns')
      .select('*')
      .eq('organisation_id', orgId)
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    admin
      .from('klippa_practice_client_documents')
      .select('*')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false }),
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

  const rows = returns
    .map(practiceReturn => {
      const client = clientMap[practiceReturn.client_id]
      if (!client) return null

      const returnDocs = docsByReturn[practiceReturn.id] ?? []
      const readiness = calculatePracticeReadiness(client, returnDocs, null, practiceReturn)
      const queue = derivePracticeQueue(client, practiceReturn, readiness)
      const totalDocuments = Array.isArray(practiceReturn.doc_checklist) ? practiceReturn.doc_checklist.length : 0
      const receivedDocuments = Array.isArray(practiceReturn.doc_checklist)
        ? practiceReturn.doc_checklist.filter(item => item.received).length
        : 0

      return {
        client: {
          id: client.id,
          full_name: client.full_name,
          email: client.email,
          tax_number: client.tax_number,
          entity_type: client.entity_type,
          client_user_id: client.client_user_id,
        },
        return: practiceReturn,
        queue,
        readiness,
        received_documents: receivedDocuments,
        total_documents: totalDocuments,
        assignees: {
          owner: teamMap[practiceReturn.owner_user_id ?? ''] ?? null,
          preparer: teamMap[practiceReturn.preparer_user_id ?? ''] ?? null,
          reviewer: teamMap[practiceReturn.reviewer_user_id ?? ''] ?? null,
        },
      }
    })
    .filter(Boolean) as PracticeDashboardRow[]

  const now = new Date()
  const in14 = new Date(now)
  in14.setDate(now.getDate() + 14)

  const stats: PracticeStats = {
    total_clients: clients.length,
    total_returns: rows.length,
    due_soon: rows.filter(row =>
      row.return.deadline &&
      new Date(row.return.deadline) <= in14 &&
      !['filed', 'assessed'].includes(row.return.filing_status)).length,
    filed_count: rows.filter(row => ['filed', 'assessed'].includes(row.return.filing_status)).length,
    in_progress: rows.filter(row => ['collecting', 'in_progress', 'review'].includes(row.return.filing_status)).length,
    blocked_returns: rows.filter(row => row.readiness.label === 'Blocked').length,
    waiting_on_client: rows.filter(row => row.queue === 'Waiting on client').length,
    ready_for_review: rows.filter(row => row.queue === 'Ready for review').length,
    ready_to_file: rows.filter(row => row.queue === 'Ready to file').length,
    outstanding_fees: rows.reduce((sum, row) => sum + (row.return.fee_paid ? 0 : Number(row.return.fee ?? 0)), 0),
  }

  return NextResponse.json({ stats, rows, team })
}
