import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { randomUUID }         from 'crypto'
import {
  buildOzowRequest, getPlanAmount,
  type PlanKey, type BillingCycle,
} from '@/lib/ozow'

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

  const { plan, billingCycle, promoCode } = await request.json() as {
    plan:         PlanKey
    billingCycle: BillingCycle
    promoCode?:   string
  }

  if (!plan || !billingCycle) {
    return NextResponse.json({ error: 'plan and billingCycle are required' }, { status: 400 })
  }

  // Service-role client for DB writes — bypasses RLS so inserts always succeed
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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
  const origin         = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'

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

  const siteCode   = process.env.OZOW_SITE_CODE   ?? ''
  const privateKey = process.env.OZOW_PRIVATE_KEY ?? ''

  if (!siteCode || !privateKey) {
    return NextResponse.json({ error: 'Ozow credentials not configured' }, { status: 500 })
  }

  const payload = buildOzowRequest(
    {
      transactionRef,
      amount,
      bankReference: `Klippa ${plan}`,   // max 20 chars, alphanumeric + spaces only
      successUrl:    `${origin}/payments/success?ref=${transactionRef}`,
      cancelUrl:     `${origin}/payments/cancel?ref=${transactionRef}`,
      errorUrl:      `${origin}/payments/cancel?ref=${transactionRef}&error=1`,
      notifyUrl:     `${origin}/api/payments/ozow/notify`,
      userId:        user.id,
      plan,
      billingCycle,
    },
    siteCode,
    privateKey,
  )

  return NextResponse.json(payload)
}
