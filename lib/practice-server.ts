import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { PracticeTeamMember } from './types'

export type PracticeContext =
  | { error: string; status: 401 | 403 }
  | { admin: SupabaseClient; orgId: string; userId: string }

export async function resolvePracticeContext(requireAdmin = true): Promise<PracticeContext> {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: caller } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role, user_type')
    .eq('id', user.id)
    .single()

  if (!caller?.organisation_id || caller.user_type !== 'practitioner') {
    return { error: 'Practice workspace only', status: 403 }
  }
  if (requireAdmin && caller.org_role !== 'org-admin') {
    return { error: 'Only practice admins can manage clients', status: 403 }
  }

  return { admin, orgId: caller.organisation_id as string, userId: user.id }
}

export async function listPracticeTeam(admin: SupabaseClient, orgId: string): Promise<PracticeTeamMember[]> {
  const [{ data: members }, authRes] = await Promise.all([
    admin
      .from('klippa_profiles')
      .select('id, full_name, org_role')
      .eq('organisation_id', orgId)
      .order('full_name', { ascending: true }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap = Object.fromEntries((authRes.data?.users ?? []).map(u => [u.id, u.email ?? '']))
  return (members ?? []).map(member => ({
    id: member.id,
    full_name: member.full_name ?? null,
    email: emailMap[member.id] ?? '',
    org_role: member.org_role ?? null,
  }))
}

export async function logPracticeEvent(
  admin: SupabaseClient,
  input: {
    organisation_id: string
    client_id: string
    return_id?: string | null
    actor_user_id?: string | null
    event_type: string
    event_label: string
    detail?: string | null
    metadata?: Record<string, unknown> | null
  },
) {
  await admin.from('klippa_practice_activity_events').insert({
    organisation_id: input.organisation_id,
    client_id: input.client_id,
    return_id: input.return_id ?? null,
    actor_user_id: input.actor_user_id ?? null,
    event_type: input.event_type,
    event_label: input.event_label,
    detail: input.detail ?? null,
    metadata: input.metadata ?? null,
  })
}
