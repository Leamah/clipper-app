import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { randomUUID }         from 'crypto'
import {
  buildOzowRequest, getPlanAmount, getSeatTotal, SEAT_PRICE_ANNUAL,
  type PlanKey, type BillingCycle,
} from '@/lib/ozow'
import { getSiteUrl } from '@/lib/security'

export async function POST(request: Request) {
  const cookieStore = cookies()

  // Auth check — uses anon key + session cookie to verify the caller
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll:  () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bodyJson = await request.json() as {
    kind?:        'org_seats'
    plan?:        PlanKey
    billingCycle?: BillingCycle
    promoCode?:   string
    seats?:       number
  }

  // Service-role client for DB writes — bypasses RLS so inserts always succeed
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const siteCode   = process.env.OZOW_SITE_CODE   ?? ''
  const privateKey = process.env.OZOW_PRIVATE_KEY ?? ''
  const siteUrl    = getSiteUrl()

  if (!siteCode || !privateKey) {
    return NextResponse.json({ error: 'Ozow credentials not configured' }, { status: 500 })
  }

  // ── B2B seat purchase (annual, one EFT push) ──────────────
  if (bodyJson.kind === 'org_seats') {
    // Only an org admin may buy seats for their organisation.
    const { data: prof } = await adminClient
      .from('klippa_profiles')
      .select('organisation_id, org_role')
      .eq('id', user.id)
      .single()

    if (!prof?.organisation_id || prof.org_role !== 'org-admin') {
      return NextResponse.json({ error: 'Only org admins can purchase seats' }, { status: 403 })
    }

    const seats  = Math.max(1, Math.min(500, Math.floor(Number(bodyJson.seats) || 1)))
    const amount = getSeatTotal(seats)
    const ref    = randomUUID()

    const { error: insErr } = await adminClient
      .from('klippa_subscriptions')
      .insert({
        user_id:         user.id,
        organisation_id: prof.organisation_id,
        seats,
        plan:            'team',
        status:          'pending',
        billing_cycle:   'annual',
        amount_paid:     amount,
        ozow_reference:  ref,
      })

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    const orgRenewFrom = (bodyJson as { renewFrom?: string }).renewFrom

    const payload = buildOzowRequest(
      {
        transactionRef: ref,
        amount,
        bankReference:  'Klippa seats',
        successUrl:     `${siteUrl}/payments/success?ref=${ref}`,
        cancelUrl:      `${siteUrl}/payments/cancel?ref=${ref}`,
        errorUrl:       `${siteUrl}/payments/cancel?ref=${ref}&error=1`,
        notifyUrl:      `${siteUrl}/api/payments/ozow/notify`,
        userId:         user.id,
        plan:           'team',
        billingCycle:   'annual',
        renewFrom:      orgRenewFrom,
      },
      siteCode,
      privateKey,
    )

    return NextResponse.json({ ...payload, seats, amount, seatPrice: SEAT_PRICE_ANNUAL })
  }

  // ── Solo subscription purchase ────────────────────────────
  const { plan, billingCycle, promoCode, renewFrom } = bodyJson as typeof bodyJson & { renewFrom?: string }

  if (!plan || !billingCycle) {
    return NextResponse.json({ error: 'plan and billingCycle are required' }, { status: 400 })
  }

  // Look up any applied discount
  let discountPct = 0
  if (promoCode) {
    const { data: promo } = await adminClient
      .from('klippa_promotions')
      .select('id, type, discount_pct, trial_days, free_submissions')
      .eq('code', promoCode.toUpperCase())
      .eq('is_active', true)
      .single()

    if (promo?.type === 'discount' && promo.discount_pct) {
      discountPct = promo.discount_pct
    }
  }

  const amount         = getPlanAmount(plan, billingCycle, discountPct)
  const transactionRef = randomUUID()

  // Persist the pending subscription so we can match it in the webhook
  const { error: insertError } = await adminClient
    .from('klippa_subscriptions')
    .insert({
      user_id:         user.id,
      plan,
      status:          'pending',
      billing_cycle:   billingCycle,
      amount_paid:     amount,
      discount_pct:    discountPct,
      ozow_reference:  transactionRef,
      promo_code_used: promoCode?.toUpperCase() ?? null,
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const payload = buildOzowRequest(
    {
      transactionRef,
      amount,
      bankReference: `Klippa ${plan}`,   // max 20 chars, alphanumeric + spaces only
      successUrl:    `${siteUrl}/payments/success?ref=${transactionRef}`,
      cancelUrl:     `${siteUrl}/payments/cancel?ref=${transactionRef}`,
      errorUrl:      `${siteUrl}/payments/cancel?ref=${transactionRef}&error=1`,
      notifyUrl:     `${siteUrl}/api/payments/ozow/notify`,
      userId:        user.id,
      plan,
      billingCycle,
      renewFrom:     renewFrom ?? undefined,  // Optional4: existing period end for renewals
    },
    siteCode,
    privateKey,
  )

  return NextResponse.json(payload)
}
