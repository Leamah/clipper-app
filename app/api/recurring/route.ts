import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isStarterOrAbove } from '@/lib/tier'
import { nextRunDate } from '@/lib/recurring'

function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options?: object }[]) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)),
      },
    }
  )
}

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('klippa_recurring_templates')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  return NextResponse.json({ templates: data })
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tierProfile } = await supabase
    .from('klippa_profiles')
    .select('subscription_tier, organisation_id')
    .eq('id', user.id)
    .single()

  if (!isStarterOrAbove(tierProfile)) {
    return NextResponse.json({ error: 'starter_required' }, { status: 402 })
  }

  const body = await request.json()
  if (!['income', 'expense'].includes(body.kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
  const dayOfMonth = Math.min(28, Math.max(1, Number(body.day_of_month) || 1))

  const { data, error } = await supabase
    .from('klippa_recurring_templates')
    .insert({
      user_id:               user.id,
      kind:                  body.kind,
      source_name:           body.source_name || null,
      income_type:           body.kind === 'income' ? (body.income_type || 'freelance') : null,
      category:              body.kind === 'expense' ? (body.category || 'other') : null,
      amount,
      description:           body.description || null,
      deductible_percentage: body.kind === 'expense' ? (Number(body.deductible_percentage) || 100) : 100,
      day_of_month:          dayOfMonth,
      next_run:              nextRunDate(dayOfMonth),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  return NextResponse.json({ template: data })
}
