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

interface ItemInput {
  description: string
  quantity:    number
  unit_price:  number
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('klippa_invoices')
    .select('*, client:klippa_freelancer_clients(*), items:klippa_invoice_items(*)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  data.items?.sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
  return NextResponse.json({ invoice: data })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  const { data: existing } = await supabase
    .from('klippa_invoices')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (existing.status === 'paid') return NextResponse.json({ error: 'Paid invoices cannot be edited' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['client_id', 'issue_date', 'due_date', 'notes', 'payment_reference', 'vat_enabled', 'vat_rate'] as const) {
    if (key in body) updates[key] = body[key]
  }
  if (body.status && ['draft', 'sent', 'cancelled'].includes(body.status)) {
    updates.status = body.status
  }

  // Replace line items if provided, and recompute totals
  if (Array.isArray(body.items)) {
    const items: ItemInput[] = body.items.filter((it: ItemInput) => it.description?.trim())
    if (items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

    const { data: current } = await supabase
      .from('klippa_invoices')
      .select('vat_enabled, vat_rate')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    const vatEnabled = 'vat_enabled' in body ? Boolean(body.vat_enabled) : Boolean(current?.vat_enabled)
    const vatRate    = 'vat_rate' in body ? Number(body.vat_rate) || 15 : Number(current?.vat_rate) || 15

    const subtotal   = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
    updates.subtotal   = subtotal
    updates.vat_amount = vatEnabled ? subtotal * (vatRate / 100) : 0
    updates.total      = subtotal + (updates.vat_amount as number)

    await supabase.from('klippa_invoice_items').delete().eq('invoice_id', params.id).eq('user_id', user.id)
    const { error: itemsError } = await supabase
      .from('klippa_invoice_items')
      .insert(items.map((it, i) => ({
        invoice_id:  params.id,
        user_id:     user.id,
        description: it.description.trim(),
        quantity:    Number(it.quantity) || 1,
        unit_price:  Number(it.unit_price) || 0,
        amount:      (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
        sort_order:  i,
      })))
    if (itemsError) return NextResponse.json({ error: 'Failed to save line items' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('klippa_invoices')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*, client:klippa_freelancer_clients(*), items:klippa_invoice_items(*)')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  return NextResponse.json({ invoice: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabase
    .from('klippa_invoices')
    .select('id, status')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (existing.status !== 'draft' && existing.status !== 'cancelled') {
    return NextResponse.json({ error: 'Only draft or cancelled invoices can be deleted' }, { status: 400 })
  }

  const { error } = await supabase
    .from('klippa_invoices')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
