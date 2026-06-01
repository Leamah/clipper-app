/**
 * Shared Brevo transactional email helper.
 * All outbound email goes through here — single place to swap providers.
 */

export async function sendBrevoEmail({
  apiKey,
  to,
  subject,
  html,
  replyTo,
}: {
  apiKey:   string
  to:       string | string[]
  subject:  string
  html:     string
  replyTo?: string
}): Promise<void> {
  const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ email }))

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      accept:         'application/json',
      'api-key':      apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: 'Klippa', email: 'noreply@mail.klippa.co.za' },
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
