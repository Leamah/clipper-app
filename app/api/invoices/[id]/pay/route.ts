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

/** POST — mark invoice paid and log the amount as an income record. Idempotent. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const paidDate: string = body.paid_date || new Date().toISOString().slice(0, 10)

  const { data: invoice } = await supabase
    .from('klippa_invoices')
    .select('*, client:klippa_freelancer_clients(name)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (invoice.status === 'paid') return NextResponse.json({ invoice }) // idempotent no-op
  if (invoice.status === 'cancelled') return NextResponse.json({ error: 'Cancelled invoices cannot be marked paid' }, { status: 400 })

  // Attach to the user's latest tax return (same convention as income page)
  const { data: taxReturn } = await supabase
    .from('klippa_tax_returns')
    .select('id')
    .eq('user_id', user.id)
    .order('tax_year', { ascending: false })
    .limit(1)
    .maybeSingle()

  const invoiceRef = `INV-${String(invoice.invoice_number).padStart(4, '0')}`
  const { data: incomeRecord, error: incomeError } = await supabase
    .from('klippa_income_records')
    .insert({
      user_id:        user.id,
      tax_return_id:  taxReturn?.id ?? null,
      source_name:    invoice.client?.name ?? 'Invoice payment',
      income_type:    'freelance',
      amount:         invoice.total,
      received_date:  paidDate,
      description:    `${invoiceRef} paid`,
      capture_method: 'invoice',
    })
    .select()
    .single()

  if (incomeError) {
    console.error('Income record from invoice failed:', incomeError)
    return NextResponse.json({ error: 'Failed to log income record' }, { status: 500 })
  }

  const { data: updated, error } = await supabase
    .from('klippa_invoices')
    .update({
      status:           'paid',
      paid_at:          new Date(`${paidDate}T12:00:00Z`).toISOString(),
      income_record_id: incomeRecord.id,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*, client:klippa_freelancer_clients(*)')
    .single()

  if (error) {
    // Roll back the income record so a retry doesn't double-log
    await supabase.from('klippa_income_records').delete().eq('id', incomeRecord.id).eq('user_id', user.id)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }

  return NextResponse.json({ invoice: updated, income_record: incomeRecord })
}
