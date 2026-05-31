/**
 * Apply a promo code to the authenticated user.
 *
 * - trial      → sets klippa_profiles.trial_ends_at and subscription_tier to 'starter'
 * - discount   → returned in response so the subscription page can apply it at checkout
 * - free_submission → sets free_submission_used = false and creates a user_promotion record
 */
import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import { addDays }            from 'date-fns'

export async function POST(request: Request) {
  const cookieStore = cookies()

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

  const { code } = await request.json() as { code: string }
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  // Fetch the promotion (RLS ensures it must be active + valid)
  const { data: promo, error: promoErr } = await supabase
    .from('klippa_promotions')
    .select('id, type, trial_days, discount_pct, free_submissions')
    .eq('code', code.toUpperCase().trim())
    .single()

  if (promoErr || !promo) {
    return NextResponse.json({ error: 'Invalid or expired promo code.' }, { status: 404 })
  }

  // Check if user already used this code
  const { data: existing } = await supabase
    .from('klippa_user_promotions')
    .select('id')
    .eq('user_id', user.id)
    .eq('promotion_id', promo.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'You have already used this promo code.' }, { status: 409 })
  }

  // Use service role for the writes (need to update profiles + increment used_count)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()

  if (promo.type === 'trial') {
    const trialEnds = addDays(now, promo.trial_days ?? 7)

    // Grant trial on profile
    await adminClient
      .from('klippa_profiles')
      .update({
        subscription_tier: 'starter',   // trial gives starter access
        trial_ends_at:     trialEnds.toISOString(),
        updated_at:        now.toISOString(),
      })
      .eq('id', user.id)

    // Record redemption
    await adminClient.from('klippa_user_promotions').insert({
      user_id:       user.id,
      promotion_id:  promo.id,
      trial_ends_at: trialEnds.toISOString(),
      free_submissions_remaining: 0,
    })

    // Increment used_count (atomic; defined as a SECURITY DEFINER rpc)
    await adminClient.rpc('increment_promo_used', { promo_id: promo.id })

    return NextResponse.json({
      type:       'trial',
      trialDays:  promo.trial_days,
      trialEnds:  trialEnds.toISOString(),
      message:    `${promo.trial_days}-day free trial activated! You now have full Starter access.`,
    })
  }

  if (promo.type === 'discount') {
    // Just record it — actual discount applied at checkout
    await adminClient.from('klippa_user_promotions').insert({
      user_id:                    user.id,
      promotion_id:               promo.id,
      discount_expires_at:        null,
      free_submissions_remaining: 0,
    })

    await adminClient.rpc('increment_promo_used', { promo_id: promo.id })

    return NextResponse.json({
      type:        'discount',
      discountPct: promo.discount_pct,
      message:     `${promo.discount_pct}% discount applied — use it at checkout.`,
    })
  }

  if (promo.type === 'free_submission') {
    await adminClient
      .from('klippa_profiles')
      .update({
        free_submission_used: false,  // reset so they can use it
        updated_at:           now.toISOString(),
      })
      .eq('id', user.id)

    await adminClient.from('klippa_user_promotions').insert({
      user_id:                    user.id,
      promotion_id:               promo.id,
      free_submissions_remaining: promo.free_submissions ?? 1,
    })

    await adminClient.rpc('increment_promo_used', { promo_id: promo.id })

    return NextResponse.json({
      type:    'free_submission',
      message: 'Your first ITR12 filing is now free.',
    })
  }

  return NextResponse.json({ error: 'Unknown promo type' }, { status: 400 })
}
