import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { classifyExpense } from '@/lib/expense-classifier'
import { analyzeMixedUse } from '@/lib/mixed-use-classifier'
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

  const body = await request.json()
  const { merchant_name, amount, expense_date, description, category, tax_return_id, classify } = body

  if (!amount || isNaN(parseFloat(amount))) {
    return NextResponse.json({ error: 'amount is required' }, { status: 400 })
  }

  let classification = null
  let mixedUse       = null

  if (classify) {
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
      classification_status: classify ? 'pending' : 'confirmed',
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

  return NextResponse.json({ record: data, classification, mixedUse })
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
