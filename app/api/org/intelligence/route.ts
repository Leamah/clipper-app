import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET() {
  const cookieStore = cookies()
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Caller profile
  const { data: callerProfile } = await admin
    .from('klippa_profiles')
    .select('organisation_id, org_role')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 404 })
  const orgId = callerProfile.organisation_id

  // ── Parallel fetches ────────────────────────────────────────
  const [membersRes, periodsRes, contractsRes, complianceRes, authRes] = await Promise.all([
    admin.from('klippa_profiles')
      .select('id, full_name, org_role, created_at')
      .eq('organisation_id', orgId)
      .neq('org_role', 'org-admin'),

    admin.from('klippa_payroll_periods')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('status', 'open')
      .order('deadline', { ascending: true })
      .limit(1),

    admin.from('klippa_consultant_contracts')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('status', 'active'),

    admin.from('klippa_consultant_compliance')
      .select('*')
      .eq('organisation_id', orgId),

    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const members    = membersRes.data    ?? []
  const contracts  = contractsRes.data  ?? []
  const compliance = complianceRes.data ?? []
  const emailMap   = Object.fromEntries((authRes.data?.users ?? []).map(u => [u.id, u.email ?? '']))
  const currentPeriod = periodsRes.data?.[0] ?? null

  // ── Timesheets for current period month ─────────────────────
  let timesheetMap: Record<string, { status: string; month: string }> = {}
  if (members.length > 0) {
    const memberIds = members.map(m => m.id)

    let tsQuery = admin.from('klippa_timesheets')
      .select('user_id, status, month')
      .in('user_id', memberIds)
      .order('month', { ascending: false })

    // If there's a current period, filter to that period's months
    if (currentPeriod) {
      tsQuery = tsQuery
        .gte('month', currentPeriod.period_start)
        .lte('month', currentPeriod.period_end)
    }

    const { data: timesheets } = await tsQuery
    for (const ts of timesheets ?? []) {
      if (!timesheetMap[ts.user_id]) timesheetMap[ts.user_id] = { status: ts.status, month: ts.month }
    }
  }

  // ── Missing timesheets ──────────────────────────────────────
  // Only meaningful when there's an open period
  const missingTimesheets = currentPeriod
    ? members
        .filter(m => !timesheetMap[m.id] || timesheetMap[m.id].status === 'draft')
        .map(m => ({ id: m.id, name: m.full_name ?? emailMap[m.id] ?? 'Unknown', email: emailMap[m.id] ?? '' }))
    : []

  // ── Submission rate ─────────────────────────────────────────
  const submittedCount = currentPeriod
    ? members.filter(m => timesheetMap[m.id] && timesheetMap[m.id].status !== 'draft').length
    : members.filter(m => timesheetMap[m.id]).length
  const submissionRate = members.length > 0
    ? Math.round((submittedCount / members.length) * 100)
    : 0

  // ── Expiring contracts (within 30 days) ─────────────────────
  const today = new Date()
  const in30  = new Date(today); in30.setDate(today.getDate() + 30)

  const expiringContracts = contracts
    .filter(c => c.end_date && new Date(c.end_date) <= in30 && new Date(c.end_date) >= today)
    .map(c => {
      const daysLeft = Math.ceil((new Date(c.end_date!).getTime() - today.getTime()) / 86_400_000)
      const member   = members.find(m => m.id === c.user_id)
      return {
        id:       c.id,
        name:     member?.full_name ?? emailMap[c.user_id] ?? 'Unknown',
        email:    emailMap[c.user_id] ?? '',
        end_date: c.end_date!,
        days_left: daysLeft,
      }
    })
    .sort((a, b) => a.days_left - b.days_left)

  // ── Days until deadline ─────────────────────────────────────
  const daysUntilDeadline = currentPeriod
    ? Math.ceil((new Date(currentPeriod.deadline).getTime() - today.getTime()) / 86_400_000)
    : null

  // ── Per-consultant rows ─────────────────────────────────────
  const contractMap    = Object.fromEntries(contracts.map(c => [c.user_id, c]))
  const complianceMap  = Object.fromEntries(compliance.map(c => [c.user_id, c]))

  const consultants = members.map(m => {
    const comp = complianceMap[m.id] ?? null
    // Auto-derive tax_profile_complete from profile fields if no compliance row
    const complianceScore = comp ? [
      comp.tax_profile_complete,
      comp.banking_verified,
      comp.id_verified,
      comp.popia_consent,
      !!comp.signed_agreement_at,
    ].filter(Boolean).length : 0

    return {
      id:               m.id,
      email:            emailMap[m.id] ?? '',
      full_name:        m.full_name,
      org_role:         m.org_role,
      latest_timesheet: timesheetMap[m.id] ?? null,
      contract:         contractMap[m.id]   ?? null,
      compliance:       comp,
      compliance_score: complianceScore,
    }
  })

  return NextResponse.json({
    active_consultants:  members.length,
    submission_rate:     submissionRate,
    missing_timesheets:  missingTimesheets,
    expiring_contracts:  expiringContracts,
    current_period:      currentPeriod,
    days_until_deadline: daysUntilDeadline,
    consultants,
  })
}
