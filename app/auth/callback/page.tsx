'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

function CallbackHandler() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const finish = (path: string) => {
      if (!cancelled) router.replace(path)
    }

    // 1) Hard error param from Supabase (e.g. expired link)
    const supaError = searchParams.get('error')
    const errDesc   = searchParams.get('error_description')
    if (supaError) {
      finish(`/login?error=${encodeURIComponent(errDesc ?? supaError)}`)
      return
    }

    // 2) PKCE flow — exchange code (works only if same browser as the request)
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            console.error('[auth/callback] exchange failed:', error)
            // Don't fail yet — implicit fallback might still kick in
            return
          }
          finish('/dashboard')
        })
    }

    // 3) Listen for SIGNED_IN regardless of flow.
    //    For implicit flow, the browser client picks up the URL hash
    //    fragment automatically when the page loads (detectSessionInUrl).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
          finish('/dashboard')
        }
      }
    )

    // 4) Also explicitly check if a session is already present
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish('/dashboard')
    })

    // 5) Last-resort timeout — show actionable error
    const timer = setTimeout(() => {
      if (cancelled) return
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const params = typeof window !== 'undefined' ? window.location.search : ''
      console.error('[auth/callback] timeout. hash:', hash, 'params:', params)
      setErrorMsg('Sign-in could not be completed. The link may have expired or been opened in a different browser. Please request a new one.')
    }, 8_000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [router, searchParams])

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full space-y-5 text-center">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{errorMsg}</p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

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
