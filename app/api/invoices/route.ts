import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isFreeUser, FREE_INVOICE_LIMIT } from '@/lib/tier'

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

function computeTotals(items: ItemInput[], vatEnabled: boolean, vatRate: number) {
  const subtotal  = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
  const vatAmount = vatEnabled ? subtotal * (vatRate / 100) : 0
  return { subtotal, vatAmount, total: subtotal + vatAmount }
}

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('klippa_invoices')
    .select('*, client:klippa_freelancer_clients(*)')
    .eq('user_id', user.id)
    .order('invoice_number', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  return NextResponse.json({ invoices: data })
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body  = await request.json()
  const items: ItemInput[] = (body.items ?? []).filter((it: ItemInput) => it.description?.trim())
  if (!body.client_id) return NextResponse.json({ error: 'Client is required' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

  // Free-tier monthly cap (mirrors income/expense caps)
  const { data: tierProfile } = await supabase
    .from('klippa_profiles')
    .select('subscription_tier, organisation_id')
    .eq('id', user.id)
    .single()

  if (isFreeUser(tierProfile)) {
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
    const { count }  = await supabase
      .from('klippa_invoices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd)
    if ((count ?? 0) >= FREE_INVOICE_LIMIT) {
      return NextResponse.json(
        { error: 'free_limit_reached', limit: FREE_INVOICE_LIMIT, type: 'invoice' },
        { status: 402 }
      )
    }
  }

  const vatEnabled = Boolean(body.vat_enabled)
  const vatRate    = Number(body.vat_rate) || 15
  const { subtotal, vatAmount, total } = computeTotals(items, vatEnabled, vatRate)

  // Assign next invoice number; unique (user_id, invoice_number) catches races — retry once
  let invoice = null
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: maxRow } = await supabase
      .from('klippa_invoices')
      .select('invoice_number')
      .eq('user_id', user.id)
      .order('invoice_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextNumber = (maxRow?.invoice_number ?? 0) + 1

    const { data, error } = await supabase
      .from('klippa_invoices')
      .insert({
        user_id:        user.id,
        client_id:      body.client_id,
        invoice_number: nextNumber,
        status:         'draft',
        issue_date:     body.issue_date || new Date().toISOString().slice(0, 10),
        due_date:       body.due_date || null,
        vat_enabled:    vatEnabled,
        vat_rate:       vatRate,
        subtotal,
        vat_amount:     vatAmount,
        total,
        notes:          body.notes || null,
        payment_reference: body.payment_reference || null,
      })
      .select()
      .single()

    if (!error) { invoice = data; break }
    lastError = error
    if (error.code !== '23505') break // only retry on unique violation
  }

  if (!invoice) {
    console.error('Invoice create failed:', lastError)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }

  const { data: savedItems, error: itemsError } = await supabase
    .from('klippa_invoice_items')
    .insert(items.map((it, i) => ({
      invoice_id:  invoice.id,
      user_id:     user.id,
      description: it.description.trim(),
      quantity:    Number(it.quantity) || 1,
      unit_price:  Number(it.unit_price) || 0,
      amount:      (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
      sort_order:  i,
    })))
    .select()

  if (itemsError) {
    await supabase.from('klippa_invoices').delete().eq('id', invoice.id).eq('user_id', user.id)
    return NextResponse.json({ error: 'Failed to save line items' }, { status: 500 })
  }

  return NextResponse.json({ invoice: { ...invoice, items: savedItems } })
}
