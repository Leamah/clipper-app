import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

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
