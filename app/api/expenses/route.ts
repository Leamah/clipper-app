import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { classifyExpense } from '@/lib/expense-classifier'
import { analyzeMixedUse } from '@/lib/mixed-use-classifier'
import { isFreeUser, isStarterOrAbove, FREE_EXPENSE_LIMIT, FREE_AI_TASTE_LIMIT } from '@/lib/tier'
import type { KlippaProfile } from '@/lib/types'

function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options?: object }[]) =>
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)),
      },
    }
  )
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch tier early — needed for both the cap check and AI gate
  const { data: tierProfile } = await supabase
    .from('klippa_profiles')
    .select('subscription_tier, organisation_id')
    .eq('id', user.id)
    .single()

  // Free-tier monthly cap: 15 expenses per calendar month
  if (isFreeUser(tierProfile)) {
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
    const { count }  = await supabase
      .from('klippa_expense_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd)
    if ((count ?? 0) >= FREE_EXPENSE_LIMIT) {
      return NextResponse.json(
        { error: 'free_limit_reached', limit: FREE_EXPENSE_LIMIT, type: 'expense' },
        { status: 402 }
      )
    }
  }

  const body = await request.json()
  const { merchant_name, amount, expense_date, description, category, receipt_id, tax_return_id, classify } = body

  if (!amount || isNaN(parseFloat(amount))) {
    return NextResponse.json({ error: 'amount is required' }, { status: 400 })
  }

  let classification = null
  let mixedUse       = null

  // AI classification is Starter+ — but free users get a taste: the first
  // FREE_AI_TASTE_LIMIT classifications are on the house (lifetime counter
  // on klippa_user_progress) so the wow moment lands before the paywall.
  const starter = isStarterOrAbove(tierProfile)
  let freeTaste = false
  let freeAiRemaining: number | null = null
  if (classify && !starter) {
    const { data: prog } = await supabase
      .from('klippa_user_progress')
      .select('free_ai_used')
      .eq('user_id', user.id)
      .maybeSingle()
    const used = prog?.free_ai_used ?? 0
    freeTaste = used < FREE_AI_TASTE_LIMIT
    freeAiRemaining = Math.max(0, FREE_AI_TASTE_LIMIT - used)
  }
  const aiAllowed = classify && (starter || freeTaste)

  if (aiAllowed) {
    const { data: profile } = await supabase
      .from('klippa_profiles')
      .select('employment_type, works_from_home, work_location, has_vehicle, home_office_pct')
      .eq('id', user.id)
      .single()

    if (profile) {
      const expenseInput = {
        merchant_name: merchant_name ?? '',
        amount:        parseFloat(amount),
        description,
        expense_date,
      }

      // Run both classifiers in parallel
      const [classResult, mixedResult] = await Promise.all([
        classifyExpense(
          expenseInput,
          profile as Pick<KlippaProfile, 'employment_type' | 'works_from_home' | 'has_vehicle'>
        ),
        analyzeMixedUse(expenseInput, {
          employment_type: profile.employment_type,
          work_location:   profile.work_location ?? 'office_only',
          works_from_home: profile.works_from_home,
          has_vehicle:     profile.has_vehicle,
          home_office_pct: profile.home_office_pct ?? 0,
        }),
      ])

      classification = classResult
      mixedUse       = mixedResult
    }

    // Burn one free-taste credit only when classification actually ran
    if (freeTaste && (classification || mixedUse)) {
      const { data: newCount } = await supabase.rpc('klippa_increment_free_ai', { uid: user.id })
      if (typeof newCount === 'number') freeAiRemaining = Math.max(0, FREE_AI_TASTE_LIMIT - newCount)
    }
  }

  // Use mixed-use percentage if available (more accurate), else fall back to basic classifier
  const deductiblePct = mixedUse?.business_pct ?? classification?.deductible_percentage ?? 100

  const { data, error } = await supabase
    .from('klippa_expense_records')
    .insert({
      user_id:               user.id,
      tax_return_id:         tax_return_id ?? null,
      category:              mixedUse?.category ?? classification?.category ?? category ?? 'other',
      merchant_name:         merchant_name ?? null,
      amount:                parseFloat(amount),
      deductible_percentage: deductiblePct,
      expense_date:          expense_date ?? null,
      description:           description ?? null,
      receipt_id:            receipt_id   ?? null,
      // Pending only when classification actually ran — a blocked/failed AI
      // request must not strand the record in review with no AI data.
      classification_status: (classification || mixedUse) ? 'pending' : 'confirmed',
      ai_confidence:         mixedUse?.confidence        ?? classification?.confidence ?? null,
      ai_reasoning:          mixedUse?.reasoning         ?? classification?.reasoning  ?? null,
      ai_audit_risk:         mixedUse?.audit_risk        ?? classification?.audit_risk ?? null,
      ai_is_mixed_use:       mixedUse?.is_mixed_use      ?? false,
      ai_conservative_pct:   mixedUse?.conservative_pct  ?? null,
      ai_aggressive_pct:     mixedUse?.aggressive_pct    ?? null,
      ai_sars_rule:          mixedUse?.sars_rule         ?? null,
      ai_audit_triggers:     mixedUse?.audit_triggers    ?? null,
      ai_required_evidence:  mixedUse?.required_evidence ?? null,
      ai_behavioral_tip:     mixedUse?.behavioral_tip    ?? null,
      capture_method:        'manual',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ record: data, classification, mixedUse, free_ai_remaining: freeAiRemaining })
}

export async function PATCH(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, classification_status, category, deductible_percentage } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('klippa_expense_records')
    .update({ classification_status, category, deductible_percentage })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}

export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  const { error } = await supabase
    .from('klippa_expense_records')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
