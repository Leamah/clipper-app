import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

// Resolve caller → admin client + their org, asserting org-admin role.
async function resolveAdminContext() {
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
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!caller?.organisation_id || caller.org_role !== 'org-admin')
    return { error: 'Only org admins can view consultant records', status: 403 as const }

  return { user, admin, orgId: caller.organisation_id as string }
}

// GET /api/org/consultants/[id] — full consultant drill-down + history
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await resolveAdminContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { admin, orgId } = ctx
  const consultantId = params.id

  // Verify the consultant belongs to the caller's org
  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('id, full_name, org_role, organisation_id, user_type, created_at, feature_timesheets, subscription_tier')
    .eq('id', consultantId)
    .single()

  if (!profile || profile.organisation_id !== orgId)
    return NextResponse.json({ error: 'Consultant not found in your organisation' }, { status: 404 })

  // Parallel fetch: email, contracts, compliance, timesheets, entries
  const [authRes, contractsRes, complianceRes, timesheetsRes] = await Promise.all([
    admin.auth.admin.getUserById(consultantId),
    admin.from('klippa_consultant_contracts')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('user_id', consultantId)
      .order('start_date', { ascending: false }),
    admin.from('klippa_consultant_compliance')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('user_id', consultantId)
      .maybeSingle(),
    admin.from('klippa_timesheets')
      .select('*')
      .eq('user_id', consultantId)
      .order('month', { ascending: false }),
  ])

  const email      = authRes.data?.user?.email ?? ''
  const contracts  = contractsRes.data  ?? []
  const compliance = complianceRes.data ?? null
  const timesheets = timesheetsRes.data ?? []

  // Pull entry hours for all this consultant's timesheets in one query
  const tsIds = timesheets.map(t => t.id)
  const hoursByTs: Record<string, number> = {}
  if (tsIds.length > 0) {
    const { data: entries } = await admin
      .from('klippa_timesheet_entries')
      .select('timesheet_id, hours')
      .in('timesheet_id', tsIds)
    for (const e of entries ?? []) {
      hoursByTs[e.timesheet_id] = (hoursByTs[e.timesheet_id] ?? 0) + Number(e.hours ?? 0)
    }
  }

  // Enrich each timesheet with hours + earnings
  const history = timesheets.map(t => {
    const hours    = hoursByTs[t.id] ?? 0
    const rate     = Number(t.hourly_rate ?? 0)
    const earnings = hours * rate
    return {
      id:                  t.id,
      month:               t.month,
      status:              t.status,
      position:            t.position,
      hourly_rate:         rate,
      hours,
      earnings,
      consultant_signed_at: t.consultant_signed_at,
      client_signed_at:    t.client_signed_at,
      org_approved_at:     t.org_approved_at,
      org_approved_by:     t.org_approved_by,
      org_rejected_at:     t.org_rejected_at,
      org_review_note:     t.org_review_note,
      locked_at:           t.locked_at,
      created_at:          t.created_at,
      updated_at:          t.updated_at,
    }
  })

  // Aggregate stats
  const totalEarnings = history.reduce((s, h) => s + h.earnings, 0)
  const totalHours    = history.reduce((s, h) => s + h.hours, 0)
  const submitted     = history.filter(h => h.status !== 'draft').length
  const approved      = history.filter(h => h.status === 'approved' || h.org_approved_at).length
  const pendingReview = history.filter(h => h.status === 'submitted' && !h.org_approved_at && !h.org_rejected_at).length

  // Earnings trend — chronological (oldest → newest) for charting
  const trend = [...history]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(h => ({ month: h.month, earnings: h.earnings, hours: h.hours, status: h.status }))

  // Compliance score (mirror of intelligence route)
  const complianceScore = compliance ? [
    compliance.tax_profile_complete,
    compliance.banking_verified,
    compliance.id_verified,
    compliance.popia_consent,
    !!compliance.signed_agreement_at,
  ].filter(Boolean).length : 0

  return NextResponse.json({
    consultant: {
      id:         profile.id,
      full_name:  profile.full_name,
      email,
      user_type:  profile.user_type,
      org_role:   profile.org_role,
      created_at: profile.created_at,
    },
    stats: {
      total_earnings:  totalEarnings,
      total_hours:     totalHours,
      timesheet_count: history.length,
      submitted_count: submitted,
      approved_count:  approved,
      pending_review:  pendingReview,
      compliance_score: complianceScore,
    },
    contracts,
    compliance,
    history,
    trend,
  })
}

// POST /api/org/consultants/[id] — approve / reject a timesheet (org workflow)
// Body: { timesheet_id: string, action: 'approve' | 'reject', note?: string }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await resolveAdminContext()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const { user, admin, orgId } = ctx
  const consultantId = params.id

  const { timesheet_id, action, note } = await req.json().catch(() => ({}))
  if (!timesheet_id || (action !== 'approve' && action !== 'reject'))
    return NextResponse.json({ error: 'timesheet_id and a valid action are required' }, { status: 400 })

  // Confirm consultant is in caller's org
  const { data: profile } = await admin
    .from('klippa_profiles')
    .select('organisation_id')
    .eq('id', consultantId)
    .single()

  if (profile?.organisation_id !== orgId)
    return NextResponse.json({ error: 'Consultant not in your organisation' }, { status: 403 })

  // Confirm the timesheet belongs to this consultant
  const { data: ts } = await admin
    .from('klippa_timesheets')
    .select('id, user_id, status, client_id, org_placement_id, hourly_rate')
    .eq('id', timesheet_id)
    .single()

  if (!ts || ts.user_id !== consultantId)
    return NextResponse.json({ error: 'Timesheet not found for this consultant' }, { status: 404 })

  if (action === 'approve') {
    let placementId = ts.org_placement_id
    if (!placementId && ts.client_id) {
      const { data: clientRow } = await admin
        .from('klippa_clients')
        .select('org_placement_id')
        .eq('id', ts.client_id)
        .maybeSingle()
      placementId = clientRow?.org_placement_id ?? null
    }

    if (placementId) {
      const [placementRes, complianceRes] = await Promise.all([
        admin.from('klippa_org_placements')
          .select('*')
          .eq('id', placementId)
          .eq('organisation_id', orgId)
          .maybeSingle(),
        admin.from('klippa_consultant_compliance')
          .select('*')
          .eq('organisation_id', orgId)
          .eq('user_id', consultantId)
          .maybeSingle(),
      ])

      const placement = placementRes.data
      if (!placement || placement.status !== 'active')
        return NextResponse.json({ error: 'This timesheet is not linked to an active placement' }, { status: 400 })

      const comp = complianceRes.data
      const complianceScore = comp ? [
        comp.tax_profile_complete,
        comp.banking_verified,
        comp.id_verified,
        comp.popia_consent,
        !!comp.signed_agreement_at,
      ].filter(Boolean).length : 0

      const blockers: string[] = []
      const billRate = Number(placement.bill_rate ?? 0)
      const payRate = Number(placement.pay_rate ?? 0)
      if (!billRate || !payRate) blockers.push('Placement bill rate or pay rate is missing')
      if (payRate > billRate) blockers.push('Pay rate is higher than bill rate')
      if (placement.end_date && new Date(placement.end_date) < new Date()) blockers.push('Placement has ended')
      if (complianceScore < 5) blockers.push('Contractor compliance is incomplete')
      if (ts.hourly_rate != null && payRate > 0 && Number(ts.hourly_rate) !== payRate) {
        blockers.push('Timesheet rate does not match the placement pay rate')
      }

      if (blockers.length > 0)
        return NextResponse.json({ error: blockers.join('. ') }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const updates = action === 'approve'
    ? {
        status:          'approved',
        org_approved_at: now,
        org_approved_by: user.id,
        org_rejected_at: null,
        org_review_note: note ?? null,
        locked_at:       now,            // approval locks the period from consultant edits
      }
    : {
        status:          'draft',        // bounce back for correction
        org_rejected_at: now,
        org_approved_at: null,
        org_approved_by: null,
        org_review_note: note ?? null,
        locked_at:       null,
      }

  const { data: updated, error } = await admin
    .from('klippa_timesheets')
    .update(updates)
    .eq('id', timesheet_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, timesheet: updated })
}
