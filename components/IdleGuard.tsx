'use client'

/**
 * IdleGuard — automatically signs out authenticated users after IDLE_MS of
 * inactivity. Listens for mouse, keyboard, scroll, and touch events to reset
 * the countdown. When the timer fires it clears the Supabase session and all
 * related storage, then redirects to /login?reason=idle.
 *
 * This component renders nothing — mount it once in the root layout.
 */

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const IDLE_MS = 60 * 60 * 1000 // 1 hour
const EVENTS  = [
  'mousemove', 'mousedown', 'keydown',
  'scroll',    'touchstart', 'click',
] as const

export default function IdleGuard() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------- sign-out on idle ----------------------------------------
  const signOutIdle = useCallback(async () => {
    try { await supabase.auth.signOut() } catch { /* best-effort */ }

    // Wipe all Supabase storage keys client-side
    try {
      ;[localStorage, sessionStorage].forEach((store) => {
        Object.keys(store).forEach((k) => {
          if (k.startsWith('sb-') || k.includes('supabase')) store.removeItem(k)
        })
      })
    } catch { /* ignore */ }

    window.location.replace('/login?reason=idle')
  }, [])

  // ---------- activity → reset countdown -------------------------------
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(signOutIdle, IDLE_MS)
  }, [signOutIdle])

  // ---------- arm / disarm listeners -----------------------------------
  useEffect(() => {
    let armed = false

    const arm = () => {
      if (armed) return
      armed = true
      resetTimer()
      EVENTS.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    }

    const disarm = () => {
      if (!armed) return
      armed = false
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      EVENTS.forEach((e) => window.removeEventListener(e, resetTimer))
    }

    // Arm immediately if a session already exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) arm()
    })

    // Stay in sync: arm on sign-in, disarm on sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) arm()
      else disarm()
    })

    return () => {
      disarm()
      subscription.unsubscribe()
    }
  }, [resetTimer])

  return null
}
