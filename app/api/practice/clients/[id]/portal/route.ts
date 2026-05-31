import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

// Practice-admin guard → { admin, orgId }
async function resolvePracticeContext() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: caller } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role, user_type')
    .eq('id', user.id)
    .single()

  if (!caller?.organisation_id || caller.user_type !== 'practitioner')
    return { error: 'Practice workspace only', status: 403 as const }
  if (caller.org_role !== 'org-admin')
    return { error: 'Only practice admins can manage clients', status: 403 as const }

  return { admin, orgId: caller.organisation_id as string }
}

function portalUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'
  return `${base.replace(/\/$/, '')}/portal/${token}`
}

// POST /api/practice/clients/[id]/portal — enable the portal & (re)generate a token.
// Body: { rotate?: boolean }  — rotate forces a fresh token even if one exists.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const { data: existing } = await admin
    .from('klippa_practice_clients')
    .select('id, organisation_id, portal_token')
    .eq('id', params.id)
    .single()

  if (!existing || existing.organisation_id !== orgId)
    return NextResponse.json({ error: 'Client not found in your practice' }, { status: 404 })

  const body   = await request.json().catch(() => ({}))
  const rotate = !!body.rotate

  const now   = new Date().toISOString()
  const token = (!existing.portal_token || rotate) ? crypto.randomUUID() : existing.portal_token

  const { data: client, error } = await admin
    .from('klippa_practice_clients')
    .update({
      portal_token:            token,
      portal_enabled:          true,
      portal_token_created_at: now,
      updated_at:              now,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client, url: portalUrl(token) })
}

// PATCH /api/practice/clients/[id]/portal — enable / disable without rotating.
// Body: { enabled: boolean }
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await resolvePracticeContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx

  const { data: existing } = await admin
    .from('klippa_practice_clients')
    .select('id, organisation_id, portal_token')
    .eq('id', params.id)
    .single()

  if (!existing || existing.organisation_id !== orgId)
    return NextResponse.json({ error: 'Client not found in your practice' }, { status: 404 })

  const body    = await request.json().catch(() => ({}))
  const enabled = !!body.enabled

  const { data: client, error } = await admin
    .from('klippa_practice_clients')
    .update({ portal_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client, url: existing.portal_token ? portalUrl(existing.portal_token) : null })
}
