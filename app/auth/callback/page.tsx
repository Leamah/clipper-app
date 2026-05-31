'use client'

/**
 * Auth Callback — implicit flow
 *
 * With flowType:'implicit', Supabase magic links redirect here with the
 * session tokens in the URL hash:
 *   https://klippa.co.za/auth/callback#access_token=...&refresh_token=...
 *
 * Hash fragments are client-only — they never reach the server — so this
 * must be a client component. The Supabase SDK (detectSessionInUrl:true)
 * processes the hash automatically when the client is first used.
 */

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    // ── Check for errors forwarded via hash or query string ──────────────
    const hash   = typeof window !== 'undefined' ? window.location.hash : ''
    const search = typeof window !== 'undefined' ? window.location.search : ''

    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.slice(1))
      const desc   = params.get('error_description') ?? params.get('error') ?? 'Authentication failed'
      router.replace(`/login?error=${encodeURIComponent(desc)}`)
      return
    }

    const qp    = new URLSearchParams(search)
    const qErr  = qp.get('error')
    if (qErr) {
      const desc = qp.get('error_description') ?? qErr
      router.replace(`/login?error=${encodeURIComponent(desc)}`)
      return
    }

    // ── Route the authenticated user ──────────────────────────────────────
    let handled = false

    async function proceed(userId: string) {
      if (handled) return
      handled = true

      // Honour an explicit post-login destination (e.g. accepting an invite),
      // but never let it short-circuit onboarding.
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
      } else if (profile.user_type === 'company_owner' || profile.user_type === 'practitioner') {
        router.replace('/org/dashboard')
      } else {
        router.replace('/dashboard')
      }
    }

    // Case 1: SDK already processed the hash by the time this effect runs
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) proceed(session.user.id)
    })

    // Case 2: SDK processes hash asynchronously, fires SIGNED_IN
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) proceed(session.user.id)
      }
    )

    // Fallback if neither fires within 6 s (expired / tampered link)
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
