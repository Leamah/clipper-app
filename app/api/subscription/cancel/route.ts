/**
 * POST /api/subscription/cancel
 *
 * Cancels the user's active subscription immediately and downgrades
 * their profile tier back to 'free'. No partial-period refunds — the
 * user retains access until the current_period_end shown on the plan
 * page; from there they revert to free features.
 *
 * Note: Ozow EFT doesn't support automated recurring billing or refunds,
 * so cancellation here is purely a tier downgrade.  For annual plans where
 * the user is entitled to a partial refund they should email support.
 */
import { createServerClient }      from '@supabase/ssr'
import { createClient }            from '@supabase/supabase-js'
import { cookies }                 from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest) {
  const cookieStore = cookies()

  // Verify session via cookie auth
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await anon.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Find their active subscription
  const { data: sub } = await admin
    .from('klippa_subscriptions')
    .select('id, status, current_period_end, billing_cycle')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!sub) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // Mark subscription as cancelled
  await admin
    .from('klippa_subscriptions')
    .update({ status: 'cancelled', updated_at: now })
    .eq('id', sub.id)

  // Downgrade profile tier to free immediately
  await admin
    .from('klippa_profiles')
    .update({
      subscription_tier:    'free',
      subscription_ends_at: now,
      updated_at:           now,
    })
    .eq('id', user.id)

  console.log(`[subscription/cancel] user=${user.id} sub=${sub.id} billing_cycle=${sub.billing_cycle}`)

  return NextResponse.json({
    success: true,
    message: 'Subscription cancelled. Your plan has been downgraded to Free.',
  })
}
