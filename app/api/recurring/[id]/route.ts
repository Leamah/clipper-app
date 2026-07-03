import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('active' in body) updates.active = Boolean(body.active)
  if ('amount' in body) {
    const amount = Number(body.amount)
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    updates.amount = amount
  }
  for (const key of ['source_name', 'description', 'income_type', 'category'] as const) {
    if (key in body) updates[key] = body[key]
  }
  if ('deductible_percentage' in body) updates.deductible_percentage = Number(body.deductible_percentage) || 100
  if ('day_of_month' in body) {
    const day = Math.min(28, Math.max(1, Number(body.day_of_month) || 1))
    updates.day_of_month = day
    updates.next_run     = nextRunDate(day)
  }

  const { data, error } = await supabase
    .from('klippa_recurring_templates')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('klippa_recurring_templates')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
