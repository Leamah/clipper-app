'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, Mail, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: 'Sign-in link failed. Please request a new one.',
  access_denied:        'Access denied. Your link may have expired. Request a new one.',
  otp_expired:          'This magic link has expired. Please request a new one below.',
}

function LoginForm() {
  const searchParams = useSearchParams()
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [notice,  setNotice]  = useState<string | null>(null)

  useEffect(() => {
    const raw = searchParams.get('error')
    if (raw) setError(ERROR_MESSAGES[raw] ?? 'Something went wrong. Please try again.')

    if (searchParams.get('reason') === 'idle') {
      setNotice('You were signed out after 1 hour of inactivity. Sign in again to continue.')
    }

    // If we just signed out, aggressively kill any leftover session state
    // before the Supabase client has a chance to silently refresh.
    if (searchParams.get('signedout') === '1') {
      void (async () => {
        try { await supabase.auth.signOut({ scope: 'global' }) } catch { /* noop */ }
        if (typeof window !== 'undefined') {
          // Wipe all sb-* / supabase-* entries from web storage
          ;[localStorage, sessionStorage].forEach((store) => {
            Object.keys(store).forEach((k) => {
              if (k.startsWith('sb-') || k.includes('supabase')) store.removeItem(k)
            })
          })
          // And nuke every visible sb-* cookie across all domain/path combos
          const host = window.location.hostname
          const apex = host.replace(/^www\./, '')
          const domains = ['', host, `.${host}`, apex, `.${apex}`]
          const paths   = ['/', '/auth', '/dashboard', '/login']
          document.cookie.split(';').forEach((c) => {
            const name = c.split('=')[0].trim()
            if (!name.startsWith('sb-')) return
            domains.forEach((d) => paths.forEach((p) => {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p}${d ? `; domain=${d}` : ''}`
            }))
          })
        }
      })()
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Forward any post-login destination (e.g. accepting an org invite)
      // through the magic-link redirect so the callback can honour it.
      const redirectTo = searchParams.get('redirectTo')
      const callbackUrl = redirectTo
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`
        : `${window.location.origin}/auth/callback`

      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: callbackUrl,
        },
      })
      if (authError) throw authError
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      {/* Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 items-center justify-center mx-auto shadow-lg shadow-emerald-900/40">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Klippa</h1>
            <p className="text-sm text-ink-2 mt-1">Tax made simple for South African freelancers</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-edge bg-surface/60 backdrop-blur p-6 shadow-xl">
          {sent ? (
            <div className="text-center space-y-3 py-4">
              <div className="inline-flex w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="font-semibold text-white text-lg">Check your inbox</p>
              <p className="text-sm text-ink-2 leading-relaxed">
                We sent a magic link to{' '}
                <span className="text-emerald-300 font-medium">{email}</span>.
                <br />
                Click the link to sign in. No password needed.
              </p>
              <p className="text-xs text-ink-3 pt-1">The link expires in 60 minutes.</p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="text-xs text-ink-2 hover:text-ink-1 underline underline-offset-2 mt-2 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink-1">Sign in</p>
                <p className="text-xs text-ink-2">Enter your email and we'll send a magic link.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-2">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={loading}
                    className="w-full bg-raised/60 border border-edge rounded-xl pl-9 pr-4 py-2.5 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60 transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              {notice && (
                <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2.5">
                  <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {notice}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-br from-emerald-500 to-purple-600 text-white hover:from-emerald-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/30"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-ink-3">
          Free to start. Built for South African freelancers &amp; consultants.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
