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

    // Hard error param from Supabase (expired link, etc.)
    const supaError = searchParams.get('error')
    if (supaError) {
      finish(`/login?error=${encodeURIComponent(searchParams.get('error_description') ?? supaError)}`)
      return
    }

    // PKCE: exchange code — only works when the same browser made the request
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!cancelled) {
          if (error) finish('/login?error=auth_callback_failed')
          else finish('/dashboard')
        }
      })
      return
    }

    // Implicit flow (hash-based) or already signed in.
    // The supabase singleton's detectSessionInUrl processes the hash automatically
    // and fires onAuthStateChange. We listen for that AND poll getSession() in case
    // the event already fired before this component mounted.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish('/dashboard')
    })

    const poll = () => supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session) finish('/dashboard')
    })

    poll()
    const t1 = setTimeout(poll, 300)
    const t2 = setTimeout(poll, 1000)
    const t3 = setTimeout(() => {
      if (!cancelled) finish('/login?error=auth_callback_failed')
    }, 6000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
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
