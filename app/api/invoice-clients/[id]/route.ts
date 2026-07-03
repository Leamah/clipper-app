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

const EDITABLE = ['name', 'contact_person', 'email', 'phone', 'vat_number', 'address', 'notes', 'status'] as const

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of EDITABLE) if (key in body) updates[key] = body[key]

  const { data, error } = await supabase
    .from('klippa_freelancer_clients')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update client' }, { status: 500 })
  return NextResponse.json({ client: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Clients with invoices can't be hard-deleted (FK restrict) — archive instead
  const { count } = await supabase
    .from('klippa_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', params.id)
    .eq('user_id', user.id)

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from('klippa_freelancer_clients')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: 'Failed to archive client' }, { status: 500 })
    return NextResponse.json({ archived: true })
  }

  const { error } = await supabase
    .from('klippa_freelancer_clients')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
