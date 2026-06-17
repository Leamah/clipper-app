/**
 * Shared Brevo transactional email helper.
 * All outbound email goes through here — single place to swap providers.
 */

export async function sendBrevoEmail({
  to,
  subject,
  html,
  replyTo,
  apiKey,
  senderName = 'Klippa',
}: {
  to:          string | string[]
  subject:     string
  html:        string
  replyTo?:    string
  apiKey?:     string
  senderName?: string
}): Promise<void> {
  const key = (apiKey ?? process.env.BREVO_API_KEY ?? '').trim()
  if (!key) throw new Error('BREVO_API_KEY not configured')

  const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ email }))

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      accept:         'application/json',
      'api-key':      key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: senderName, email: 'noreply@mail.klippa.co.za' },
      to:          recipients,
      replyTo:     replyTo ? { email: replyTo } : undefined,
      subject,
      htmlContent: html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
}
