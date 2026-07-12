import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendBrevoEmail } from '@/lib/brevo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000 // 24h, matches abandoned-cart convention

/**
 * Daily cron — "you forgot something" nudges for signups that stall
 * before finishing setup. Two stages, both one-time (a single email per
 * stage, not a sequence):
 *
 *   1. Verify: signed up, never confirmed email (never clicked the magic
 *      link) — resent 24h after signup, pointing back at /login for a
 *      fresh link since the original one has likely expired.
 *   2. Onboarding: confirmed email, never finished the 2-tap onboarding —
 *      sent 24h after confirmation.
 *
 * Idempotency: klippa_profiles.verify_nudge_sent_at /
 * onboarding_nudge_sent_at are set once a stage is resolved (sent OR the
 * user progressed past it on their own), so a row is only ever
 * considered once per stage. Guarded by INTERNAL_CRON_SECRET/CRON_SECRET,
 * same pattern as /api/cron/recurring.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const secrets = [process.env.INTERNAL_CRON_SECRET, process.env.CRON_SECRET].filter(Boolean)
  if (secrets.length === 0 || !secrets.some((s) => authHeader === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.BREVO_API_KEY) {
    return NextResponse.json({ error: 'BREVO_API_KEY not configured' }, { status: 503 })
  }

  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  const admin  = createClient(supabaseUrl, serviceKey)
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://klippa.co.za'

  const { data: candidates, error: loadError } = await admin
    .from('klippa_profiles')
    .select('id, full_name, created_at, verify_nudge_sent_at, onboarding_nudge_sent_at')
    .eq('onboarding_complete', false)
    .or('verify_nudge_sent_at.is.null,onboarding_nudge_sent_at.is.null')
    .limit(500)

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })

  const now = Date.now()
  const results = { verify_sent: 0, onboarding_sent: 0, resolved: 0, skipped: 0, errors: [] as string[] }

  for (const profile of candidates ?? []) {
    try {
      const { data: userData, error: userErr } = await admin.auth.admin.getUserById(profile.id)
      const email = userData?.user?.email
      if (userErr || !email) { results.skipped++; continue }

      const confirmedAt = userData.user.email_confirmed_at
      const name = profile.full_name ?? 'there'
      const updates: Record<string, string> = {}

      // ── Stage 1: verify email ──────────────────────────────────
      if (!profile.verify_nudge_sent_at) {
        if (confirmedAt) {
          // Confirmed on their own before we got to it — resolve, no email
          updates.verify_nudge_sent_at = new Date().toISOString()
          results.resolved++
        } else if (now - new Date(profile.created_at).getTime() >= REMINDER_DELAY_MS) {
          await sendBrevoEmail({
            to: email,
            subject: "You started signing up for Klippa — one step left",
            html: verifyNudgeHtml({ name, appUrl }),
          })
          updates.verify_nudge_sent_at = new Date().toISOString()
          results.verify_sent++
        }
      }

      // ── Stage 2: finish onboarding (only once verified) ────────
      if (!profile.onboarding_nudge_sent_at && confirmedAt) {
        if (now - new Date(confirmedAt).getTime() >= REMINDER_DELAY_MS) {
          await sendBrevoEmail({
            to: email,
            subject: "You're 2 taps from knowing what SARS owes you",
            html: onboardingNudgeHtml({ name, appUrl }),
          })
          updates.onboarding_nudge_sent_at = new Date().toISOString()
          results.onboarding_sent++
        }
      }

      if (Object.keys(updates).length > 0) {
        await admin.from('klippa_profiles').update(updates).eq('id', profile.id)
      }
    } catch (e: unknown) {
      results.errors.push(`${profile.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, ...results })
}

function emailShell(body: string): string {
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#e4e4e7">
  <div style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:32px">
    <p style="font-size:13px;color:#71717a;margin:0 0 4px">Klippa · Tax Platform</p>
    ${body}
    <p style="font-size:11px;color:#52525b;margin:24px 0 0;line-height:1.5">
      If this wasn't you, you can safely ignore this email.
    </p>
  </div>
</div>`
}

function verifyNudgeHtml({ name, appUrl }: { name: string; appUrl: string }): string {
  return emailShell(`
    <h1 style="font-size:20px;font-weight:700;color:#f4f4f5;margin:0 0 20px">You left something behind</h1>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 20px">
      Hi ${name}, you started creating your Klippa account but never confirmed your email —
      so we haven't been able to get you set up. Klippa works out what SARS owes you, or what
      you owe them, from your income and expenses. It only takes a minute to finish.
    </p>
    <a href="${appUrl}/login"
       style="display:inline-block;background:#059669;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none">
      Finish signing up →
    </a>`)
}

function onboardingNudgeHtml({ name, appUrl }: { name: string; appUrl: string }): string {
  return emailShell(`
    <h1 style="font-size:20px;font-weight:700;color:#f4f4f5;margin:0 0 20px">You're almost in</h1>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.6;margin:0 0 20px">
      Hi ${name}, you confirmed your email but didn't finish setting up your Klippa profile.
      It's one quick question — pick how you work, and you're straight onto your dashboard.
    </p>
    <a href="${appUrl}/login"
       style="display:inline-block;background:#059669;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none">
      Finish setting up →
    </a>`)
}
