import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sendBrevoEmail } from '@/lib/brevo'

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

function fmtRand(n: number): string {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** POST — email the invoice (client-generated PDF attached as base64) to the client */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const pdfBase64: string | undefined = body.pdf_base64

  const { data: invoice } = await supabase
    .from('klippa_invoices')
    .select('*, client:klippa_freelancer_clients(*)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return NextResponse.json({ error: `Cannot send a ${invoice.status} invoice` }, { status: 400 })
  }

  const clientEmail = body.to || invoice.client?.email
  if (!clientEmail) return NextResponse.json({ error: 'Client has no email address' }, { status: 400 })

  const { data: profile } = await supabase
    .from('klippa_profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const senderName = profile?.full_name || 'Klippa user'
  const invoiceRef = `INV-${String(invoice.invoice_number).padStart(4, '0')}`

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;background:#0c0e12;color:#e7e9ec;border-radius:12px;padding:32px;">
    <h2 style="margin:0 0 4px;color:#10b981;">Invoice ${invoiceRef}</h2>
    <p style="margin:0 0 20px;color:#9aa1ab;font-size:14px;">from ${senderName}</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#9aa1ab;">Amount due</td><td style="padding:6px 0;text-align:right;font-weight:700;">${fmtRand(invoice.total)}</td></tr>
      ${invoice.due_date ? `<tr><td style="padding:6px 0;color:#9aa1ab;">Due date</td><td style="padding:6px 0;text-align:right;">${invoice.due_date}</td></tr>` : ''}
      ${invoice.payment_reference ? `<tr><td style="padding:6px 0;color:#9aa1ab;">Payment reference</td><td style="padding:6px 0;text-align:right;">${invoice.payment_reference}</td></tr>` : ''}
    </table>
    <p style="margin:20px 0 0;color:#9aa1ab;font-size:13px;">The full invoice is attached as a PDF.</p>
    <p style="margin:24px 0 0;color:#5b6472;font-size:11px;">Sent via Klippa · klippa.co.za</p>
  </div>`

  try {
    await sendBrevoEmail({
      to:          clientEmail,
      subject:     `Invoice ${invoiceRef} from ${senderName} — ${fmtRand(invoice.total)}`,
      html,
      replyTo:     user.email ?? undefined,
      senderName,
      attachments: pdfBase64 ? [{ name: `${invoiceRef}.pdf`, content: pdfBase64 }] : undefined,
    })
  } catch (e) {
    console.error('Invoice email failed:', e)
    return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 502 })
  }

  const { data: updated, error } = await supabase
    .from('klippa_invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*, client:klippa_freelancer_clients(*)')
    .single()

  if (error) return NextResponse.json({ error: 'Email sent but status update failed' }, { status: 500 })
  return NextResponse.json({ invoice: updated })
}
