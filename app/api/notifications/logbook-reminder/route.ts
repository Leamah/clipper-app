import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import {
  startOfWeek, addWeeks, isBefore, getISOWeek, getISOWeekYear, format,
} from 'date-fns'

// This route can be called:
//  1. Manually by the user when they save logbook reminder settings
//  2. By a Vercel/Supabase cron job weekly/monthly
//  3. POST /api/notifications/logbook-reminder — sends for the current user
//  4. POST /api/notifications/logbook-reminder?all=1 — admin only, sends for all users

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function getWeekKey(date: Date): string {
  const year = getISOWeekYear(date)
  const week = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function getTaxYearStart(taxYear: number): Date {
  return new Date(taxYear - 1, 2, 1)
}

function countPendingWeeks(
  taxYear: number,
  reviewedWeeks: Set<string>,
): number {
  const taxStart = getTaxYearStart(taxYear)
  const today    = new Date()
  const cutoff   = startOfWeek(today, { weekStartsOn: 1 })

  let count = 0
  let ws    = startOfWeek(taxStart, { weekStartsOn: 1 })
  while (isBefore(ws, cutoff)) {
    if (!reviewedWeeks.has(getWeekKey(ws))) count++
    ws = addWeeks(ws, 1)
  }
  return count
}

export async function POST(request: Request) {
  if (!resend) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 503 })
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const url   = new URL(request.url)
  const isAll = url.searchParams.get('all') === '1'

  // Admin-only for bulk sends
  if (isAll) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('klippa_profiles').select('subscription_tier').eq('id', user.id).single()
    if (profile?.subscription_tier !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  try {
    // Fetch all profiles with logbook_reminder != 'none' and commute set up
    const { data: profiles } = await supabase
      .from('klippa_profiles')
      .select('id, full_name, tax_year, tax_number, logbook_reminder, commute_km, office_mon, office_tue, office_wed, office_thu, office_fri')
      .neq('logbook_reminder', 'none')
      .gt('commute_km', 0)

    if (!profiles?.length) {
      return NextResponse.json({ sent: 0 })
    }

    let sent = 0
    const today = new Date()

    for (const profile of profiles) {
      // Only send if the user's reminder frequency aligns with today
      const isWeeklyDay   = today.getDay() === 1 // Monday
      const isMonthlyDay  = today.getDate() === 1 // 1st of the month
      if (profile.logbook_reminder === 'weekly'  && !isWeeklyDay)  continue
      if (profile.logbook_reminder === 'monthly' && !isMonthlyDay) continue

      // Check how many weeks are pending
      const { data: reviewsData } = await supabase
        .from('klippa_logbook_reviews')
        .select('review_week')
        .eq('user_id', profile.id)

      const reviewedSet   = new Set((reviewsData ?? []).map((r: { review_week: string }) => r.review_week))
      const pendingCount  = countPendingWeeks(profile.tax_year, reviewedSet)

      if (pendingCount === 0) continue

      // Get user email
      const { data: userData } = await supabase.auth.admin.getUserById(profile.id)
      const email = userData?.user?.email
      if (!email) continue

      const name = profile.full_name ?? 'there'

      await resend.emails.send({
        from:    'Klippa <noreply@klippa.co.za>',
        to:      email,
        subject: `Your logbook needs review — ${pendingCount} ${pendingCount === 1 ? 'week' : 'weeks'} pending`,
        html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#e4e4e7">
  <div style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:32px">
    <p style="font-size:13px;color:#71717a;margin:0 0 4px">Klippa · Tax Platform</p>
    <h1 style="font-size:20px;font-weight:700;color:#f4f4f5;margin:0 0 20px">
      ${pendingCount} ${pendingCount === 1 ? 'week needs' : 'weeks need'} your review
    </h1>

    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 20px">
      Hi ${name}, Klippa has auto-built your logbook entries for the
      last ${pendingCount} ${pendingCount === 1 ? 'week' : 'weeks'}.
      Take 2 minutes to confirm which days you drove for business.
    </p>

    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://klippa.co.za'}/mileage"
       style="display:inline-block;background:#059669;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none">
      Review your logbook →
    </a>

    <p style="font-size:11px;color:#52525b;margin:24px 0 0;line-height:1.5">
      SARS requires a logbook for all business travel claims.
      Keeping it up to date takes seconds now, not hours during tax season.
      <br><br>
      To change your reminder frequency, go to Settings in Klippa.
    </p>
  </div>
</div>`,
      })

      sent++
    }

    return NextResponse.json({ sent })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to send'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
