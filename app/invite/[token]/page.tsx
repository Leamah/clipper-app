'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ShieldCheck, Users, Check, Loader2, AlertCircle, LogIn,
} from 'lucide-react'

type State = 'loading' | 'ready' | 'accepting' | 'done' | 'error' | 'login_required'

export default function AcceptInvitePage() {
  const params  = useParams()
  const router  = useRouter()
  const token   = params?.token as string

  const [state,    setState]    = useState<State>('loading')
  const [orgName,  setOrgName]  = useState('')
  const [errMsg,   setErrMsg]   = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => {
    async function check() {
      if (!token) { setState('error'); setErrMsg('Invalid invite link.'); return }

      // Check auth
      const { data: { user } } = await supabase.auth.getUser()

      // Fetch invite details (public lookup by token)
      const res  = await fetch(`/api/org/invite-info?token=${encodeURIComponent(token)}`)
      const json = await res.json()

      if (json.error) {
        setState('error')
        setErrMsg(json.error)
        return
      }

      setOrgName(json.orgName ?? 'your organisation')
      setInviteEmail(json.invitedEmail ?? '')

      if (!user) {
        setState('login_required')
        return
      }

      setUserEmail(user.email ?? null)
      setState('ready')
    }
    check()
  }, [token])

  async function handleAccept() {
    setState('accepting')
    const res  = await fetch('/api/org/accept-invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
    })
    const json = await res.json()

    if (json.error) {
      setState('error')
      setErrMsg(json.error)
      return
    }

    setOrgName(json.orgName ?? orgName)
    setState('done')
    setTimeout(() => router.replace('/dashboard'), 3000)
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-emerald-600/[0.06] blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <ShieldCheck className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-ink-1">Klippa</span>
        </div>

        <div className="rounded-2xl border border-edge bg-surface/60 backdrop-blur-sm p-8 shadow-2xl space-y-6">

          {/* ── Loading ── */}
          {state === 'loading' && (
            <div className="text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
              <p className="text-sm text-ink-2">Loading invite…</p>
            </div>
          )}

          {/* ── Error ── */}
          {state === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-900/20 border border-red-900/30 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {errMsg || 'This invite is invalid or has expired.'}
              </div>
              <Link href="/dashboard" className="block text-center text-xs text-ink-2 hover:text-ink-1 transition-colors">
                Back to dashboard →
              </Link>
            </div>
          )}

          {/* ── Login required ── */}
          {state === 'login_required' && (
            <div className="space-y-5 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-ink-1">You&apos;ve been invited to join</h1>
                <p className="text-xl font-semibold text-emerald-400 mt-1">{orgName}</p>
              </div>
              {inviteEmail && (
                <p className="text-sm text-ink-2">
                  This invite was sent to <span className="text-ink-1 font-medium">{inviteEmail}</span>.
                  Please log in with that email to accept.
                </p>
              )}
              <Link
                href={`/login?redirectTo=/invite/${encodeURIComponent(token)}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors w-full justify-center"
              >
                <LogIn className="w-4 h-4" /> Log in to accept
              </Link>
            </div>
          )}

          {/* ── Ready to accept ── */}
          {state === 'ready' && (
            <div className="space-y-5 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-ink-1">Join</h1>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{orgName}</p>
              </div>
              <p className="text-sm text-ink-2">
                Logged in as <span className="text-ink-1 font-medium">{userEmail}</span>.
                Accepting will link your Klippa account to this organisation.
              </p>
              <button
                onClick={handleAccept}
                disabled={state !== 'ready'}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                <Check className="w-4 h-4" /> Accept invite
              </button>
              <p className="text-xs text-ink-3">
                Your existing tax data and documents stay private. Only your timesheets will be visible to your organisation.
              </p>
            </div>
          )}

          {/* ── Accepting ── */}
          {state === 'accepting' && (
            <div className="text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
              <p className="text-sm text-ink-2">Joining {orgName}…</p>
            </div>
          )}

          {/* ── Done ── */}
          {state === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <Check className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-ink-1">You&apos;re in!</h1>
                <p className="text-sm text-ink-2 mt-1">Successfully joined <span className="text-emerald-400 font-medium">{orgName}</span>.</p>
              </div>
              <p className="text-xs text-ink-3">Redirecting to your dashboard…</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
