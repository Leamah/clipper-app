/**
 * Ozow Notification Webhook
 *
 * Ozow POSTs to this URL after every payment attempt (success, cancel, error).
 * We verify the hash, then update the subscription and user's plan accordingly.
 * Must return 200 quickly — Ozow retries on non-200.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'
import { verifyOzowWebhook, planToTier } from '@/lib/ozow'
import { addMonths, addYears } from 'date-fns'

export async function POST(request: Request) {
  // Ozow sends application/x-www-form-urlencoded
  const raw      = await request.text()
  const body     = Object.fromEntries(new URLSearchParams(raw))

  const privateKey = process.env.OZOW_PRIVATE_KEY ?? ''

  // Verify hash — reject if tampered
  if (!verifyOzowWebhook(body, privateKey)) {
    console.error('[ozow/notify] Hash verification failed', body)
    return NextResponse.json({ error: 'Invalid hash' }, { status: 400 })
  }

  const {
    TransactionId,
    TransactionReference: ozowRef,
    Status,
    Amount,
    Optional1: userId,
    Optional2: plan,
    Optional3: billingCycle,
  } = body

  // Use service role to update records regardless of RLS
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (Status === 'Complete') {
    // ── Idempotency guard ─────────────────────────────────────
    // Ozow retries on non-200 and a captured callback can be replayed. Only
    // process a 'Complete' once: if this subscription is already active, ack
    // and stop so we never re-extend the period or re-increment a promo.
    const { data: current } = await adminClient
      .from('klippa_subscriptions')
      .select('status')
      .eq('ozow_reference', ozowRef)
      .single()

    if (!current) {
      console.error(`[ozow/notify] No subscription for ref=${ozowRef} — ignoring`)
      return NextResponse.json({ received: true })
    }
    if (current.status === 'active') {
      console.log(`[ozow/notify] Replay ignored — ref=${ozowRef} already active`)
      return NextResponse.json({ received: true, idempotent: true })
    }

    const now   = new Date()
    const start = now
    const end   = billingCycle === 'annual'
      ? addYears(now, 1)
      : addMonths(now, 1)

    const newTier = planToTier(plan)

    // 1. Update the subscription record
    await adminClient
      .from('klippa_subscriptions')
      .update({
        status:                'active',
        ozow_transaction_id:   TransactionId,
        current_period_start:  start.toISOString(),
        current_period_end:    end.toISOString(),
        updated_at:            now.toISOString(),
      })
      .eq('ozow_reference', ozowRef)

    // 2. Upgrade the user's subscription tier on their profile
    await adminClient
      .from('klippa_profiles')
      .update({
        subscription_tier:    newTier,
        subscription_ends_at: end.toISOString(),
        updated_at:           now.toISOString(),
      })
      .eq('id', userId)

    // 3. If a discount promo was used, increment its used_count
    const { data: sub } = await adminClient
      .from('klippa_subscriptions')
      .select('promo_code_used')
      .eq('ozow_reference', ozowRef)
      .single()

    if (sub?.promo_code_used) {
      // Read-then-write increment (PostgREST doesn't support server-side expressions)
      const { data: promo } = await adminClient
        .from('klippa_promotions')
        .select('used_count')
        .eq('code', sub.promo_code_used)
        .single()
      if (promo) {
        await adminClient
          .from('klippa_promotions')
          .update({ used_count: (promo.used_count ?? 0) + 1 })
          .eq('code', sub.promo_code_used)
      }
    }

    console.log(`[ozow/notify] Payment complete: user=${userId} plan=${plan} amount=${Amount} txn=${TransactionId}`)

  } else if (Status === 'Cancelled' || Status === 'Error' || Status === 'PendingInvestigation') {
    // Mark the subscription as cancelled so we don't leave pending rows around
    await adminClient
      .from('klippa_subscriptions')
      .update({
        status:              Status === 'Cancelled' ? 'cancelled' : 'expired',
        ozow_transaction_id: TransactionId,
        updated_at:          new Date().toISOString(),
      })
      .eq('ozow_reference', ozowRef)

    console.log(`[ozow/notify] Payment ${Status}: user=${userId} ref=${ozowRef}`)
  }

  return NextResponse.json({ received: true })
}
