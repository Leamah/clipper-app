'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { LogOut, Shield, User, Car, Settings, CreditCard, Zap } from 'lucide-react'
import type { KlippaProfile } from '@/lib/types'

export default function UserNav({ sidebar = false }: { sidebar?: boolean }) {
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
  const isStarter = profile?.subscription_tier === 'starter'
  const isFree    = !isAdmin && !isPro && !isStarter

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-edge hover:border-edge bg-surface/60 transition-colors text-xs"
        >
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-[10px] font-bold">
            {initials}
          </span>
          <span className="text-ink-1 max-w-[120px] truncate hidden sm:block">{email}</span>
          {(isAdmin || isPro || isStarter) && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold uppercase tracking-wide">
              {isAdmin ? 'Admin' : isPro ? 'Pro' : 'Starter'}
            </span>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className={sidebar
              ? 'fixed left-52 bottom-4 z-50 w-56 rounded-xl border border-edge bg-surface shadow-xl shadow-black/40 overflow-hidden'
              : 'absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-edge bg-surface shadow-xl shadow-black/40 overflow-hidden'
            }>
              <div className="px-4 py-3 border-b border-edge">
                <p className="text-xs text-ink-2 truncate">{email}</p>
                <p className="text-xs font-medium text-ink-1 mt-0.5 capitalize flex items-center gap-1.5">
                  {isAdmin || isPro || isStarter
                    ? <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    : <User className="w-3.5 h-3.5 text-ink-2" />}
                  {isAdmin ? 'Admin' : isPro ? 'Professional' : isStarter ? 'Starter' : 'Free plan'}
                </p>
              </div>

              <div className="py-1">
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-ink-1 hover:bg-raised hover:text-white transition-colors"
                  >
                    <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    Admin panel
                  </Link>
                )}
                <Link
                  href="/mileage"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-ink-1 hover:bg-raised hover:text-white transition-colors"
                >
                  <Car className="w-4 h-4 text-ink-2 flex-shrink-0" />
                  Mileage logbook
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-ink-1 hover:bg-raised hover:text-white transition-colors"
                >
                  <Settings className="w-4 h-4 text-ink-2 flex-shrink-0" />
                  Tax profile settings
                </Link>
                {isFree ? (
                  <Link
                    href="/pricing"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-emerald-300 hover:bg-emerald-950/40 hover:text-emerald-200 transition-colors"
                  >
                    <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    Upgrade plan
                  </Link>
                ) : (
                  <Link
                    href="/subscription"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-ink-1 hover:bg-raised hover:text-white transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-ink-2 flex-shrink-0" />
                    Subscription
                  </Link>
                )}
              </div>

              <div className="border-t border-edge py-1">
                <a
                  href="/auth/signout"
                  className="flex items-center gap-3 px-4 py-3 text-sm text-ink-2 hover:text-red-400 hover:bg-raised transition-colors"
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  Sign out
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
