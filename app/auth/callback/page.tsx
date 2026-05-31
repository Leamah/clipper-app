'use client'

/**
 * Auth Callback — handles BOTH implicit-flow (hash tokens) and PKCE (?code=).
 *
 * Why both?
 *   @supabase/ssr 0.6.x ignores flowType:'implicit' and hardcodes PKCE in the
 *   browser client. Its detectSessionInUrl only looks for ?code=, never for hash
 *   tokens. Our server-side OTP proxy sends links WITHOUT a code_challenge, so
 *   Supabase delivers tokens in the URL hash (implicit flow). We must manually
 *   parse that hash and call setSession() ourselves — the SDK won't do it.
 *
 *   We also keep the getSession() / onAuthStateChange listeners as a fallback
 *   for any path that does go through the SDK's own PKCE exchange.
 */

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const hash   = typeof window !== 'undefined' ? window.location.hash   : ''
    const search = typeof window !== 'undefined' ? window.location.search : ''

    // ── Error forwarded by Supabase in hash or query string ──────────────
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.slice(1))
      const desc   = params.get('error_description') ?? params.get('error') ?? 'Authentication failed'
      router.replace(`/login?error=${encodeURIComponent(desc)}`)
      return
    }

    const qp   = new URLSearchParams(search)
    const qErr = qp.get('error')
    if (qErr) {
      const desc = qp.get('error_description') ?? qErr
      router.replace(`/login?error=${encodeURIComponent(desc)}`)
      return
    }

    // ── Route the authenticated user ─────────────────────────────────────
    let handled = false

    async function proceed(userId: string) {
      if (handled) return
      handled = true

      const next = qp.get('next')

      const { data: profile } = await supabase
        .from('klippa_profiles')
        .select('onboarding_complete, user_type')
        .eq('id', userId)
        .single()

      if (!profile || !profile.onboarding_complete) {
        router.replace('/onboarding')
      } else if (next && next.startsWith('/')) {
        router.replace(next)
      } else if (profile.user_type === 'practitioner') {
        router.replace('/practice/dashboard')
      } else if (profile.user_type === 'company_owner') {
        router.replace('/org/dashboard')
      } else {
        router.replace('/dashboard')
      }
    }

    // ── Case 1: Implicit-flow hash tokens ─────────────────────────────────
    // @supabase/ssr 0.6.x forces PKCE on the browser client and ignores hash
    // tokens entirely. We parse them manually and call setSession() directly.
    // This is the path taken when the OTP was sent via our /api/auth/send-otp
    // proxy (which sends links without a code_challenge → Supabase puts tokens
    // in the hash, not in ?code=).
    if (hash.includes('access_token=')) {
      const params       = new URLSearchParams(hash.slice(1))
      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data, error }) => {
            if (error || !data.session) {
              router.replace('/login?error=auth_callback_failed')
              return
            }
            proceed(data.session.user.id)
          })
        return
      }
    }

    // ── Case 2: SDK already exchanged a PKCE ?code= by the time effect runs
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) proceed(session.user.id)
    })

    // ── Case 3: SDK exchanges PKCE ?code= asynchronously → SIGNED_IN event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) proceed(session.user.id)
      }
    )

    // Fallback: expired / tampered / unrecognised link
    const timeout = setTimeout(() => {
      if (!handled) router.replace('/login?error=auth_callback_failed')
    }, 6000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <p className="text-sm text-ink-2">Signing you in…</p>
      </div>
    </div>
  )
}
