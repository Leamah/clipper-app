import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Resolve a client purely by their unguessable portal token. The token IS the
// credential — no session. Always uses the service-role client server-side and
// returns only the fields a client should see (never fee / notes / other clients).
async function resolveByToken(token: string) {
  if (!token || token.length < 20) return { error: 'Invalid link', status: 404 as const }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: client } = await admin
    .from('klippa_practice_clients')
    .select('id, organisation_id, full_name, return_type, tax_year, filing_status, doc_checklist, portal_enabled, status')
    .eq('portal_token', token)
    .maybeSingle()

  if (!client || client.status !== 'active' || !client.portal_enabled)
    return { error: 'This portal link is no longer active. Please contact your accountant.', status: 404 as const }

  return { admin, client }
}

const FILING_STEPS = ['not_started', 'collecting', 'in_progress', 'review', 'filed', 'assessed'] as const

// GET /api/portal/[token] — sanitised client view + checklist + uploaded docs
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const ctx = await resolveByToken(params.token)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, client } = ctx

  const { data: org } = await admin
    .from('klippa_organisations')
    .select('name, logo_url, brand_color')
    .eq('id', client.organisation_id)
    .single()

  const { data: docRows } = await admin
    .from('klippa_practice_client_documents')
    .select('id, file_name, checklist_item_id, created_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    client: {
      full_name:     client.full_name,
      return_type:   client.return_type,
      tax_year:      client.tax_year,
      filing_status: client.filing_status,
      checklist:     Array.isArray(client.doc_checklist) ? client.doc_checklist : [],
    },
    org: {
      name:        org?.name        ?? 'Your accountant',
      logo_url:    org?.logo_url    ?? null,
      brand_color: org?.brand_color ?? '#10b981',
    },
    documents:    docRows ?? [],
    filing_steps: FILING_STEPS,
  })
}
