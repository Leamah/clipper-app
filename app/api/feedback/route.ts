import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate-limit: 5 submissions per IP per minute
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!checkRateLimit(`feedback:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — try again in a minute.' }, { status: 429 })
  }

  try {
    const { subject, message, email, page } = await req.json() as {
      subject?: string
      message?: string
      email?:   string
      page?:    string
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const apiKey = (process.env.BREVO_API_KEY ?? '').trim()
    if (!apiKey) {
      console.error('[feedback] BREVO_API_KEY not set')
      return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
    }

    const subjectLine = subject?.trim()
      ? `[Klippa Feedback] ${subject.trim()}`
      : '[Klippa Feedback] New message'

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#10b981;padding:20px 28px;">
          <p style="margin:0;color:#fff;font-size:16px;font-weight:700;letter-spacing:-0.3px;">Klippa — User Feedback</p>
        </td></tr>
        <tr><td style="padding:28px;">
          ${email ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">From: <strong style="color:#111827;">${email}</strong></p>` : ''}
          ${page  ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Page: <span style="color:#111827;font-family:monospace;">${page}</span></p>` : ''}
          ${subject ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Subject: <strong style="color:#111827;">${subject}</strong></p>` : ''}
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:4px;">
            <p style="margin:0;font-size:14px;color:#111827;line-height:1.7;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Sent via Klippa feedback widget · ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: 'Klippa Feedback', email: 'noreply@mail.klippa.co.za' },
        to:          [{ email: 'info@leamah.co.za', name: 'Klippa Support' }],
        replyTo:     email ? { email } : undefined,
        subject:     subjectLine,
        htmlContent: html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[feedback] Brevo error:', res.status, body)
      return NextResponse.json({ error: 'Failed to send feedback' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[feedback] Unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
