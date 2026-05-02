'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { LogOut, Shield, User } from 'lucide-react'

interface Profile {
  plan:        string
  clips_limit: number | null
}

export default function UserNav() {
  const router  = useRouter()
  const [email,   setEmail]   = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [open,    setOpen]    = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? null)
      supabase
        .from('clipper_user_profiles')
        .select('plan, clips_limit')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!email) return null

  const initials = email.slice(0, 2).toUpperCase()
  const isAdmin  = profile?.plan === 'admin'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 transition-colors text-xs"
      >
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-[10px] font-bold">
          {initials}
        </span>
        <span className="text-zinc-300 max-w-[120px] truncate hidden sm:block">{email}</span>
        {isAdmin && (
          <span className="px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-semibold uppercase tracking-wide">
            Admin
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-52 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/40 overflow-hidden">
            <div className="px-3 py-3 border-b border-zinc-800">
              <p className="text-xs text-zinc-400 truncate">{email}</p>
              <p className="text-xs font-medium text-zinc-200 mt-0.5 capitalize flex items-center gap-1">
                {isAdmin ? <Shield className="w-3 h-3 text-violet-400" /> : <User className="w-3 h-3 text-zinc-500" />}
                {isAdmin ? 'Admin — unlimited' : `Free — ${profile?.clips_limit ?? 5} clips/mo`}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => { setOpen(false); router.push('/admin') }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-violet-400" />
                Manage users
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
