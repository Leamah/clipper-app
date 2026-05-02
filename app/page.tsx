'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Scissors, ArrowRight, Check } from 'lucide-react'

const STEPS = [
  {
    n:     '01',
    title: 'Paste a link',
    body:  'Drop any YouTube, TikTok, Instagram, X or Facebook URL. No accounts, no installs. Just the link.',
  },
  {
    n:     '02',
    title: 'AI finds the moments',
    body:  'The AI analyses the transcript and picks the sharpest 45–90 second windows, ranked by virality score.',
  },
  {
    n:     '03',
    title: 'Download & post',
    body:  'Clips land in your gallery with hooks written for each one. One-click download, straight to your device.',
  },
]

const FEATURES = [
  'Clips scored by virality potential',
  'Hook copy written for each clip',
  'Works across every major platform',
  'One-click download to device',
  'Content queue & posting schedule',
  'Processes a 60-min video in under 3 min',
]

export default function LandingPage() {
  const router        = useRouter()
  const [url, setUrl] = useState('')
  const [ready, setReady] = useState(false)

  // If already signed in, skip straight to the dashboard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard')
      else setReady(true)
    })
  }, [router])

  if (!ready) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-violet-600/[0.07] blur-[160px] rounded-full" />
      </div>

      {/* ── Nav ── */}
      <header className="relative z-10 border-b border-zinc-800/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-md shadow-violet-900/40">
              <Scissors className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-24">
        <div className="max-w-2xl space-y-8">

          {/* Badge */}
          <div className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-xs text-zinc-500 uppercase tracking-widest">
              AI-powered video clipping
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.04]">
            Long videos.<br />
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-violet-300 bg-clip-text text-transparent">
              Sharp clips.
            </span>
          </h1>

          {/* Subtext */}
          <p className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-lg">
            Paste any link. Klippa finds the best moments,
            cuts them, scores them, and writes the hooks.
            Ready to post in minutes.
          </p>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-900/30 whitespace-nowrap"
            >
              Get clips <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Platforms */}
          <p className="text-xs text-zinc-700 tracking-wider">
            YouTube &nbsp;·&nbsp; TikTok &nbsp;·&nbsp; Instagram &nbsp;·&nbsp; X &nbsp;·&nbsp; Facebook
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-14">How it works</p>
          <div className="grid sm:grid-cols-3 gap-10 sm:gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="space-y-4">
                <span className="block text-7xl font-black text-zinc-800/70 leading-none select-none">
                  {s.n}
                </span>
                <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What you get ── */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="grid sm:grid-cols-2 gap-14 items-start">

            <div className="space-y-5">
              <p className="text-xs text-zinc-600 uppercase tracking-widest">What you get</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Everything a creator
                needs.{' '}
                <span className="text-zinc-600">Nothing they don&apos;t.</span>
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Klippa is built for speed. No timeline to scrub, no settings
                to configure. Paste a link, wait two minutes, post.
              </p>
            </div>

            <ul className="space-y-3 pt-1">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-violet-400" />
                  </span>
                  <span className="text-zinc-300">{f}</span>
                </li>
              ))}
            </ul>

          </div>
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-bold tracking-tight">
              Made for creators who move fast.
            </p>
            <p className="text-sm text-zinc-500">No editing skills required.</p>
          </div>
          <Link
            href="/login"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-900/30"
          >
            Start clipping <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-zinc-800/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Scissors className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-xs font-medium text-zinc-600">Klippa</span>
          </div>
          <p className="text-xs text-zinc-700">© 2025 Klippa. All rights reserved.</p>
        </div>
      </footer>

    </div>
  )
}
