'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function UsageBar() {
  const [used,  setUsed]  = useState<number | null>(null)
  const [limit, setLimit] = useState<number | null>(null)
  const [plan,  setPlan]  = useState<string>('free')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Profile for limit
      const { data: profile } = await supabase
        .from('clipper_user_profiles')
        .select('plan, clips_limit')
        .eq('id', user.id)
        .single()

      if (!profile) return
      setPlan(profile.plan)
      setLimit(profile.clips_limit)

      // Count jobs this month
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { count } = await supabase
        .from('clipper_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString())

      setUsed(count ?? 0)
    }
    load()
  }, [])

  if (used === null) return null
  if (plan === 'admin') return (
    <p className="text-xs text-zinc-600">
      <span className="text-violet-400 font-medium">∞</span> clips — admin
    </p>
  )

  const cap    = limit ?? 5
  const pct    = Math.min((used / cap) * 100, 100)
  const almostFull = pct >= 80
  const full   = used >= cap

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${full ? 'bg-red-500' : almostFull ? 'bg-yellow-500' : 'bg-violet-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs ${full ? 'text-red-400' : almostFull ? 'text-yellow-400' : 'text-zinc-500'}`}>
        {used} / {cap} clips this month
      </p>
    </div>
  )
}
