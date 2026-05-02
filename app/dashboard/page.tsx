'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClipperJob } from '@/lib/types'
import ClipForm from '@/components/ClipForm'
import JobsList from '@/components/JobsList'
import ClipsGallery from '@/components/ClipsGallery'
import UserNav from '@/components/UserNav'
import UsageBar from '@/components/UsageBar'
import { Scissors } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const [jobs,    setJobs]    = useState<ClipperJob[]>([])
  const [loading, setLoading] = useState(true)
  const [userId,  setUserId]  = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  const fetchJobs = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('clipper_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setJobs(data as ClipperJob[])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetchJobs()

    const channel = supabase
      .channel('clipper_jobs_rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clipper_jobs', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setJobs((prev) => [payload.new as ClipperJob, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setJobs((prev) =>
              prev.map((j) => (j.id === payload.new.id ? (payload.new as ClipperJob) : j))
            )
          } else if (payload.eventType === 'DELETE') {
            setJobs((prev) => prev.filter((j) => j.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchJobs])

  const activeJobs = jobs.filter((j) => j.status !== 'done' && j.status !== 'error')
  const doneJobs   = jobs.filter((j) => j.status === 'done')

  return (
    <div className="min-h-screen">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Scissors className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <nav className="flex items-center gap-1 ml-4">
            <span className="px-3 py-1.5 rounded-lg text-xs text-violet-300 bg-violet-500/10 font-medium">Clips</span>
            <Link href="/schedule" className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Stream</Link>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <UsageBar />
            <UserNav />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Powered by GPT-4o-mini + Whisper
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            Turn long videos into<br />
            <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              viral clips
            </span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto">
            Paste any YouTube, TikTok, Instagram or X video. Tell the AI exactly what you want — it finds and cuts those moments for you.
          </p>
          <ClipForm onJobCreated={(job) => setJobs((prev) => [job, ...prev])} />
        </section>

        {/* Active Jobs */}
        {(loading || activeJobs.length > 0) && (
          <section>
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest mb-4">Processing</h2>
            <JobsList jobs={activeJobs} loading={loading} />
          </section>
        )}

        {/* Clips Gallery */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest">Your Clips</h2>
            {doneJobs.length > 0 && (
              <span className="text-xs text-zinc-500">
                {doneJobs.reduce((acc, j) => acc + (j.clips?.length ?? 0), 0)} clips
              </span>
            )}
          </div>
          <ClipsGallery jobs={doneJobs} />
        </section>
      </main>
    </div>
  )
}
