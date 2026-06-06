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
  const [membersRes, periodsRes, contractsRes, complianceRes, clientsRes, placementsRes, authRes] = await Promise.all([
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

    admin.from('klippa_org_clients')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('status', 'active')
      .order('name', { ascending: true }),

    admin.from('klippa_org_placements')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('status', 'active'),

    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const members    = membersRes.data    ?? []
  const contracts  = contractsRes.data  ?? []
  const compliance = complianceRes.data ?? []
  const clients     = clientsRes.data    ?? []
  const placements  = placementsRes.data ?? []
  const emailMap   = Object.fromEntries((authRes.data?.users ?? []).map(u => [u.id, u.email ?? '']))
  const currentPeriod = periodsRes.data?.[0] ?? null

  // ── Timesheets for current period month ─────────────────────
  let timesheetMap: Record<string, { id: string; status: string; month: string; client_signed_at: string | null; org_approved_at: string | null }> = {}
  let timesheetHours: Record<string, number> = {}
  if (members.length > 0) {
    const memberIds = members.map(m => m.id)

    let tsQuery = admin.from('klippa_timesheets')
      .select('id, user_id, status, month, client_signed_at, org_approved_at')
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
      if (!timesheetMap[ts.user_id]) {
        timesheetMap[ts.user_id] = {
          id: ts.id,
          status: ts.status,
          month: ts.month,
          client_signed_at: ts.client_signed_at,
          org_approved_at: ts.org_approved_at,
        }
      }
    }

    const tsIds = (timesheets ?? []).map(t => t.id)
    if (tsIds.length > 0) {
      const { data: entries } = await admin
        .from('klippa_timesheet_entries')
        .select('timesheet_id, hours')
        .in('timesheet_id', tsIds)
      for (const e of entries ?? []) {
        timesheetHours[e.timesheet_id] = (timesheetHours[e.timesheet_id] ?? 0) + Number(e.hours ?? 0)
      }
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

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]))

  const placementReadiness = placements.map(p => {
    const member = memberMap[p.user_id]
    const ts = timesheetMap[p.user_id] ?? null
    const comp = complianceMap[p.user_id] ?? null
    const complianceScore = comp ? [
      comp.tax_profile_complete,
      comp.banking_verified,
      comp.id_verified,
      comp.popia_consent,
      !!comp.signed_agreement_at,
    ].filter(Boolean).length : 0
    const hours = ts ? (timesheetHours[ts.id] ?? 0) : 0
    const billRate = Number(p.bill_rate ?? 0)
    const payRate = Number(p.pay_rate ?? 0)
    const expectedBill = hours * billRate
    const expectedPay = hours * payRate
    const expectedMargin = expectedBill - expectedPay
    const marginPct = expectedBill > 0 ? Math.round((expectedMargin / expectedBill) * 100) : null
    const todayDate = new Date()
    const blockers: string[] = []
    const riskFlags: string[] = []

    if (!ts || ts.status === 'draft') blockers.push('Contractor has not submitted time')
    if (ts && !ts.client_signed_at) blockers.push('Client manager has not signed the timesheet')
    if (ts && ts.status !== 'approved' && !ts.org_approved_at) blockers.push('Placement house has not approved the timesheet')
    if (complianceScore < 5) blockers.push('Contractor compliance is incomplete')
    if (!p.bill_rate || !p.pay_rate) blockers.push('Bill rate or pay rate is missing')
    if (p.end_date && new Date(p.end_date) < todayDate) blockers.push('Placement has ended')
    if (billRate > 0 && payRate > billRate) blockers.push('Pay rate is higher than bill rate')

    if (!p.end_date) riskFlags.push('Open-ended placement')
    if (p.end_date) {
      const daysLeft = Math.ceil((new Date(p.end_date).getTime() - todayDate.getTime()) / 86_400_000)
      if (daysLeft >= 0 && daysLeft <= 30) riskFlags.push('Placement ends within 30 days')
    }
    if (p.rate_type === 'monthly') riskFlags.push('Monthly pay pattern')
    if (marginPct != null && marginPct < 15) riskFlags.push('Low margin')
    if (!p.client_manager_email) riskFlags.push('No client approver recorded')
    if ((p.compliance_requirements ?? []).length > 0 && complianceScore < 5) {
      riskFlags.push('Client/site documents still need evidence')
    }

    return {
      placement: p,
      client: clientMap[p.client_id] ?? null,
      consultant: {
        id: p.user_id,
        full_name: member?.full_name ?? null,
        email: emailMap[p.user_id] ?? '',
      },
      timesheet: ts ? { ...ts, hours } : null,
      compliance_score: complianceScore,
      expected_bill: expectedBill,
      expected_pay: expectedPay,
      expected_margin: expectedMargin,
      margin_pct: marginPct,
      ready_to_bill: blockers.length === 0 && expectedBill > 0,
      ready_to_pay: !!ts && (ts.status === 'approved' || !!ts.org_approved_at) && complianceScore === 5 && !!p.pay_rate,
      blockers,
      risk_flags: riskFlags,
      risk_score: Math.min(100, riskFlags.length * 20 + blockers.length * 10),
    }
  })

  const projectedBill = placementReadiness.reduce((sum, p) => sum + p.expected_bill, 0)
  const projectedPay = placementReadiness.reduce((sum, p) => sum + p.expected_pay, 0)
  const projectedMargin = projectedBill - projectedPay
  const placementSummary = {
    active: placements.length,
    ready_to_bill: placementReadiness.filter(p => p.ready_to_bill).length,
    ready_to_pay: placementReadiness.filter(p => p.ready_to_pay).length,
    blocked: placementReadiness.filter(p => p.blockers.length > 0).length,
    client_approval_due: placementReadiness.filter(p => p.blockers.includes('Client manager has not signed the timesheet')).length,
    projected_bill: projectedBill,
    projected_pay: projectedPay,
    projected_margin: projectedMargin,
    margin_pct: projectedBill > 0 ? Math.round((projectedMargin / projectedBill) * 100) : null,
  }

  return NextResponse.json({
    active_consultants:  members.length,
    submission_rate:     submissionRate,
    missing_timesheets:  missingTimesheets,
    expiring_contracts:  expiringContracts,
    current_period:      currentPeriod,
    days_until_deadline: daysUntilDeadline,
    consultants,
    clients,
    placements:         placementReadiness,
    placement_summary:  placementSummary,
  })
}
