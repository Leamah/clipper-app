import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isFreeUser, FREE_INCOME_LIMIT } from '@/lib/tier'

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

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch tier for cap check
  const { data: tierProfile } = await supabase
    .from('klippa_profiles')
    .select('subscription_tier, organisation_id')
    .eq('id', user.id)
    .single()

  // Free-tier monthly cap: 3 income records per calendar month
  if (isFreeUser(tierProfile)) {
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
    const { count }  = await supabase
      .from('klippa_income_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd)
    if ((count ?? 0) >= FREE_INCOME_LIMIT) {
      return NextResponse.json(
        { error: 'free_limit_reached', limit: FREE_INCOME_LIMIT, type: 'income' },
        { status: 402 }
      )
    }
  }

  const body = await request.json()
  const { source_name, income_type, amount, received_date, description, tax_return_id } = body

  if (!source_name || !amount || isNaN(parseFloat(amount))) {
    return NextResponse.json({ error: 'source_name and amount are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('klippa_income_records')
    .insert({
      user_id:        user.id,
      tax_return_id:  tax_return_id ?? null,
      source_name,
      income_type:    income_type ?? 'freelance',
      amount:         parseFloat(amount),
      received_date:  received_date ?? null,
      description:    description ?? null,
      capture_method: 'manual',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ record: data })
}

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('klippa_income_records')
    .select('*')
    .eq('user_id', user.id)
    .order('received_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, source_name, income_type, amount, received_date, description } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (amount !== undefined && isNaN(parseFloat(amount))) {
    return NextResponse.json({ error: 'amount must be a number' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('klippa_income_records')
    .update({
      source_name,
      income_type,
      amount: amount !== undefined ? parseFloat(amount) : undefined,
      received_date,
      description,
    })
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
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('klippa_income_records')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
