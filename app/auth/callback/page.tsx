'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

function CallbackHandler() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code  = searchParams.get('code')
    const error = searchParams.get('error')

    // Supabase passed back an explicit error (e.g. expired link)
    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`)
      return
    }

    // PKCE flow — exchange auth code using the browser client which holds
    // the code verifier in its own storage (localStorage / cookies)
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            console.error('[auth/callback] exchange error:', error.message)
            router.replace('/login?error=auth_callback_failed')
          } else {
            router.replace('/dashboard')
          }
        })
      return
    }

    // Implicit / hash-fragment flow — the browser client picks up
    // #access_token from the URL automatically; wait for SIGNED_IN event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          router.replace('/dashboard')
        }
      }
    )

    // Safety fallback — if nothing happens in 6s, treat as failure
    const timer = setTimeout(() => {
      router.replace('/login?error=auth_callback_failed')
    }, 6_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        </div>
        <p className="text-sm text-zinc-400">Signing you in...</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  )
}
