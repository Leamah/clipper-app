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
    const finish = (path: string) => { if (!cancelled) router.replace(path) }

    // 1) Hard error param from Supabase (expired link, etc.)
    const supaError = searchParams.get('error')
    if (supaError) {
      finish(`/login?error=${encodeURIComponent(searchParams.get('error_description') ?? supaError)}`)
      return
    }

    // 2) PKCE flow — ?code= in query string (same-browser only)
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setErrorMsg('Sign-in failed. The link may have expired — please request a new one.')
        else finish('/dashboard')
      })
      return
    }

    // 3) Implicit flow — access_token in URL hash.
    //    Parse it manually instead of relying on detectSessionInUrl timing,
    //    because the supabase singleton fires SIGNED_IN before this component
    //    mounts, so onAuthStateChange would miss it.
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    if (hash) {
      const p             = new URLSearchParams(hash)
      const access_token  = p.get('access_token')
      const refresh_token = p.get('refresh_token')
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
          if (error) setErrorMsg('Sign-in failed. The link may have expired — please request a new one.')
          else finish('/dashboard')
        })
        return
      }
    }

    // 4) Already signed in (e.g. user hit Back after a successful sign-in)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish('/dashboard')
      else setErrorMsg('Sign-in could not be completed. The link may have expired — please request a new one.')
    })

    return () => { cancelled = true }
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
