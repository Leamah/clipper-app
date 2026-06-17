import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'standardwebhooks'

export const runtime = 'nodejs'

type ActionType =
  | 'signup'
  | 'recovery'
  | 'invite'
  | 'magic_link'
  | 'email_change'
  | 'reauthentication'

interface HookPayload {
  user: { email: string }
  email_data: {
    token:             string
    token_hash:        string
    redirect_to:       string
    email_action_type: ActionType
    site_url:          string
  }
}

function buildActionUrl(tokenHash: string, type: ActionType, redirectTo: string): string {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY not configured')

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'accept':       'application/json',
      'api-key':      apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: 'Klippa', email: 'noreply@mail.klippa.co.za' },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Klippa</title>
</head>
<body style="margin:0;padding:0;background:#0b0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f14;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;">
        <!-- Logo -->
        <tr><td style="padding-bottom:32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Klippa</span>
        </td></tr>
        <!-- Card -->
        <tr><td style="background:#141920;border:1px solid #1e2530;border-radius:16px;padding:40px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#4b5563;">
            © 2026 Klippa · Built for South African freelancers
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#374151;">
            If you didn't request this email, you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function ctaButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:#10b981;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${label}</a>`
}

function fallbackLink(url: string): string {
  return `<p style="margin:20px 0 0;font-size:12px;color:#6b7280;">
    Or copy this link into your browser:<br />
    <span style="color:#10b981;word-break:break-all;">${url}</span>
  </p>`
}

function buildEmail(type: ActionType, actionUrl: string, email: string): { subject: string; html: string } {
  const h1 = (text: string) =>
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">${text}</h1>`
  const p = (text: string) =>
    `<p style="margin:8px 0 0;font-size:15px;color:#9ca3af;line-height:1.6;">${text}</p>`

  switch (type) {
    case 'magic_link':
      return {
        subject: 'Your Klippa sign-in link',
        html: emailShell(`
          ${h1('Sign in to Klippa')}
          ${p(`Click the button below to sign in to your account. This link expires in 1 hour and can only be used once.`)}
          ${ctaButton(actionUrl, 'Sign in to Klippa')}
          ${fallbackLink(actionUrl)}
        `),
      }

    case 'signup':
      return {
        subject: 'Confirm your Klippa account',
        html: emailShell(`
          ${h1('Welcome to Klippa')}
          ${p(`Thanks for signing up. Confirm your email address to activate your account and start managing your finances.`)}
          ${ctaButton(actionUrl, 'Confirm my account')}
          ${fallbackLink(actionUrl)}
        `),
      }

    case 'recovery':
      return {
        subject: 'Reset your Klippa password',
        html: emailShell(`
          ${h1('Reset your password')}
          ${p(`We received a request to reset the password for <strong style="color:#ffffff;">${email}</strong>. Click below to choose a new password. This link expires in 1 hour.`)}
          ${ctaButton(actionUrl, 'Reset password')}
          ${fallbackLink(actionUrl)}
          ${p(`If you didn't request a password reset, you can safely ignore this email — your account is secure.`)}
        `),
      }

    case 'invite':
      return {
        subject: "You've been invited to Klippa",
        html: emailShell(`
          ${h1("You've been invited")}
          ${p(`You've been invited to join a workspace on Klippa. Accept the invitation below to get started.`)}
          ${ctaButton(actionUrl, 'Accept invitation')}
          ${fallbackLink(actionUrl)}
          ${p(`This invitation link expires in 24 hours.`)}
        `),
      }

    case 'email_change':
      return {
        subject: 'Confirm your new Klippa email address',
        html: emailShell(`
          ${h1('Confirm email change')}
          ${p(`You requested to change your Klippa email address to <strong style="color:#ffffff;">${email}</strong>. Click below to confirm this change.`)}
          ${ctaButton(actionUrl, 'Confirm new email')}
          ${fallbackLink(actionUrl)}
          ${p(`If you didn't request this change, contact us immediately at support@klippa.co.za.`)}
        `),
      }

    case 'reauthentication':
      return {
        subject: 'Klippa security verification',
        html: emailShell(`
          ${h1('Verify it\'s you')}
          ${p(`A sensitive action was requested on your Klippa account. Click below to verify your identity and continue.`)}
          ${ctaButton(actionUrl, 'Verify my identity')}
          ${fallbackLink(actionUrl)}
          ${p(`If you didn't initiate this, you can safely ignore this email.`)}
        `),
      }

    default:
      return {
        subject: 'Action required on your Klippa account',
        html: emailShell(`
          ${h1('Action required')}
          ${p(`Click below to complete the requested action on your Klippa account.`)}
          ${ctaButton(actionUrl, 'Continue')}
          ${fallbackLink(actionUrl)}
        `),
      }
  }
}

export async function POST(req: NextRequest) {
  const fullSecret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!fullSecret) {
    console.error('[email-hook] SEND_EMAIL_HOOK_SECRET not set')
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const rawBody = await req.text()
  const headers = Object.fromEntries(req.headers)

  let body: HookPayload
  try {
    const wh = new Webhook(fullSecret.replace('v1,whsec_', ''))
    body = wh.verify(rawBody, headers) as HookPayload
  } catch (err) {
    console.error('[email-hook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user, email_data } = body
  const { token_hash, redirect_to, email_action_type } = email_data
  const actionUrl = buildActionUrl(token_hash, email_action_type, redirect_to)

  try {
    const { subject, html } = buildEmail(email_action_type, actionUrl, user.email)
    await sendEmail(user.email, subject, html)
  } catch (err) {
    console.error('[email-hook] Failed to send email:', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }

  return NextResponse.json({})
}
