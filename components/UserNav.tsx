'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { LogOut, Shield, User } from 'lucide-react'
import type { KlippaProfile } from '@/lib/types'

export default function UserNav() {
  const [email,   setEmail]   = useState<string | null>(null)
  const [profile, setProfile] = useState<Pick<KlippaProfile, 'subscription_tier'> | null>(null)
  const [open,    setOpen]    = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? null)
      supabase
        .from('klippa_profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  if (!email) return null

  const initials  = email.slice(0, 2).toUpperCase()
  const isAdmin   = profile?.subscription_tier === 'admin'
  const isPro     = profile?.subscription_tier === 'professional'

  return (
    <div className="flex items-center gap-2">
      <a
        href="/auth/signout"
        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-red-400 hover:bg-red-900/10 transition-colors"
        title="Sign out"
      >
        <LogOut className="w-3.5 h-3.5" />
        Sign out
      </a>

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 transition-colors text-xs"
        >
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-[10px] font-bold">
            {initials}
          </span>
          <span className="text-zinc-300 max-w-[120px] truncate hidden sm:block">{email}</span>
          {(isAdmin || isPro) && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold uppercase tracking-wide">
              {isAdmin ? 'Admin' : 'Pro'}
            </span>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/40 overflow-hidden">
              <div className="px-3 py-3 border-b border-zinc-800">
                <p className="text-xs text-zinc-400 truncate">{email}</p>
                <p className="text-xs font-medium text-zinc-200 mt-0.5 capitalize flex items-center gap-1">
                  {isAdmin || isPro
                    ? <Shield className="w-3 h-3 text-emerald-400" />
                    : <User className="w-3 h-3 text-zinc-500" />}
                  {isAdmin ? 'Admin' : isPro ? 'Professional' : 'Free plan'}
                </p>
              </div>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Admin panel
                </Link>
              )}
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Tax profile settings
              </Link>
              <a
                href="/auth/signout"
                className="sm:hidden w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
