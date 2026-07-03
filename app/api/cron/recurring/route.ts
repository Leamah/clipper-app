import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { advanceRunDate } from '@/lib/recurring'
import type { KlippaRecurringTemplate } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Daily cron — materialises due recurring templates into
 * income/expense records. Guarded by INTERNAL_CRON_SECRET.
 */
export async function GET(request: Request) {
  // Vercel injects "Authorization: Bearer $CRON_SECRET" automatically when a
  // CRON_SECRET env var exists; INTERNAL_CRON_SECRET supports manual triggers.
  const authHeader = request.headers.get('Authorization')
  const secrets = [process.env.INTERNAL_CRON_SECRET, process.env.CRON_SECRET].filter(Boolean)
  if (secrets.length === 0 || !secrets.some((s) => authHeader === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  const admin = createClient(supabaseUrl, serviceKey)

  const today = new Date().toISOString().slice(0, 10)
  const { data: due, error: loadError } = await admin
    .from('klippa_recurring_templates')
    .select('*')
    .eq('active', true)
    .lte('next_run', today)
    .limit(500)

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })

  const results = { posted: 0, skipped_free: 0, errors: [] as string[] }

  for (const tpl of (due ?? []) as KlippaRecurringTemplate[]) {
    try {
      // Downgrade safety: recurring is Starter+; pause templates of free users
      const { data: profile } = await admin
        .from('klippa_profiles')
        .select('subscription_tier, organisation_id')
        .eq('id', tpl.user_id)
        .single()

      const isStarter = Boolean(profile?.organisation_id) ||
        ['starter', 'professional', 'admin'].includes(profile?.subscription_tier ?? '')

      if (!isStarter) {
        await admin.from('klippa_recurring_templates').update({ active: false }).eq('id', tpl.id)
        results.skipped_free++
        continue
      }

      const { data: taxReturn } = await admin
        .from('klippa_tax_returns')
        .select('id')
        .eq('user_id', tpl.user_id)
        .order('tax_year', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tpl.kind === 'income') {
        const { error } = await admin.from('klippa_income_records').insert({
          user_id:        tpl.user_id,
          tax_return_id:  taxReturn?.id ?? null,
          source_name:    tpl.source_name ?? 'Recurring income',
          income_type:    tpl.income_type ?? 'freelance',
          amount:         tpl.amount,
          received_date:  tpl.next_run,
          description:    tpl.description ?? 'Recurring',
          capture_method: 'recurring',
        })
        if (error) throw error
      } else {
        const { error } = await admin.from('klippa_expense_records').insert({
          user_id:               tpl.user_id,
          tax_return_id:         taxReturn?.id ?? null,
          category:              tpl.category ?? 'other',
          merchant_name:         tpl.source_name,
          amount:                tpl.amount,
          deductible_percentage: tpl.deductible_percentage,
          expense_date:          tpl.next_run,
          description:           tpl.description ?? 'Recurring',
          classification_status: 'confirmed',
          capture_method:        'recurring',
        })
        if (error) throw error
      }

      await admin
        .from('klippa_recurring_templates')
        .update({
          last_run: tpl.next_run,
          next_run: advanceRunDate(tpl.next_run, tpl.day_of_month),
        })
        .eq('id', tpl.id)

      results.posted++
    } catch (e: unknown) {
      results.errors.push(`${tpl.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, due: due?.length ?? 0, ...results })
}
