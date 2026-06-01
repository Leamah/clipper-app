'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import {
  ArrowRight, Check, Smartphone, Laptop, Car,
  ShieldCheck, TrendingUp, FileCheck, Receipt, FileText,
  X, Zap, BookOpen, AlertCircle,
} from 'lucide-react'

// ── Scroll-reveal wrapper ─────────────────────────────────

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  )
}

// ── Hero illustration ─────────────────────────────────────

function HeroIllustration() {
  return (
    <div className="relative w-full h-[420px] flex items-center justify-center select-none">
      <motion.div
        animate={{ scale: [1, 1.12, 1], opacity: [0.06, 0.14, 0.06] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute w-72 h-72 rounded-full border border-emerald-500/20 bg-emerald-500/5"
      />
      <motion.div
        animate={{ scale: [1, 1.07, 1], opacity: [0.10, 0.20, 0.10] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        className="absolute w-52 h-52 rounded-full border border-emerald-500/25"
      />
      <motion.div
        animate={{ y: [0, -9, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10 flex flex-col items-center gap-1"
      >
        <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-900/60">
          <span className="text-2xl font-black text-white tracking-tighter">K</span>
        </div>
        <div className="w-[88px] h-[96px] rounded-2xl bg-gradient-to-b from-zinc-700 to-raised border border-zinc-600/40 flex items-center justify-center shadow-2xl">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
        </div>
        <div className="w-16 h-2.5 rounded-full bg-black/40 blur-sm" />
      </motion.div>

      {/* Receipt — 65% deductible */}
      <motion.div
        animate={{ y: [0, -10, 0], rotate: [-2, 1, -2] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        className="absolute top-10 left-2 bg-surface border border-edge/70 rounded-xl p-3 shadow-xl w-36"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Receipt className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-ink-2 font-medium">Receipt</span>
        </div>
        <p className="text-[11px] text-ink-2">MTN Monthly</p>
        <p className="text-sm font-bold text-white tabular-nums">R 1,299</p>
        <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="text-[9px] text-emerald-400 font-medium">65% deductible</span>
        </div>
      </motion.div>

      {/* Tax Provision */}
      <motion.div
        animate={{ y: [0, -13, 0], rotate: [2, -1, 2] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute top-6 right-0 bg-surface border border-edge/70 rounded-xl p-3 shadow-xl w-40"
      >
        <p className="text-[9px] text-ink-2 uppercase tracking-wider mb-1">Tax Provision</p>
        <p className="text-lg font-bold text-amber-300 tabular-nums">R 23,450</p>
        <p className="text-[10px] text-ink-3 mt-0.5">Set this aside →</p>
      </motion.div>

      {/* IRP5 OCR */}
      <motion.div
        animate={{ y: [0, -7, 0], rotate: [1, -2, 1] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
        className="absolute bottom-14 left-4 bg-surface border border-edge/70 rounded-xl p-3 shadow-xl w-32"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <FileText className="w-3 h-3 text-teal-400" />
          <span className="text-[10px] text-ink-2 font-medium">IRP5</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-400">OCR Complete</span>
        </div>
      </motion.div>

      {/* Safe to Spend */}
      <motion.div
        animate={{ y: [0, -11, 0], rotate: [-1, 2, -1] }}
        transition={{ duration: 4.3, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
        className="absolute bottom-10 right-2 bg-gradient-to-br from-emerald-950/80 to-teal-950/60 border border-emerald-600/30 rounded-xl p-3 shadow-xl w-36"
      >
        <p className="text-[9px] text-emerald-400 uppercase tracking-wider mb-1">Safe to Spend</p>
        <p className="text-lg font-bold text-emerald-300 tabular-nums">R 198,000</p>
        <p className="text-[10px] text-ink-2 mt-0.5">after tax + expenses</p>
      </motion.div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function LandingPage() {
  const router  = useRouter()
  // React has a well-known bug where the `muted` *prop* is not reflected as a
  // DOM *property* on <video> elements during hydration, so browsers may see an
  // unmuted video and block autoPlay.  Setting the property via a ref ensures it.
  const videoRef = useRef<HTMLVideoElement>(null)

  // Redirect logged-in users to the app, but NEVER gate the marketing content on
  // this check — returning null until the client-side auth call resolves would
  // serve crawlers (and the initial HTML) a blank page, killing SEO.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard')
    })
  }, [router])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true
      videoRef.current.play().catch(() => { /* autoplay blocked — controls still visible */ })
    }
  }, [])

  return (
    <div className="min-h-screen bg-base text-ink-1 overflow-x-hidden">

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-600/[0.06] blur-[160px] rounded-full" />
      </div>

      {/* Nav */}
      <header className="relative z-30 border-b border-edge/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md shadow-emerald-900/40">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink-1 transition-colors"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">

          {/* Left: text */}
          <Reveal>
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-ink-2 uppercase tracking-widest">
                  Built for South African freelancers
                </span>
              </div>

              {/* Transformation headline */}
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.06]">
                Receipts{' '}
                <span className="text-ink-3">→</span>{' '}
                <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                  sorted.
                </span>
                <br />
                Tax{' '}
                <span className="text-ink-3">→</span>{' '}
                <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                  ready.
                </span>
              </h1>

              <p className="text-lg text-ink-2 leading-relaxed max-w-md">
                Organise your receipts, invoices and expenses automatically — and
                stay ready for SARS all year, not just in October.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-900/30"
                  >
                    Start for free <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
                <span className="inline-flex items-center text-sm text-ink-2 px-2">
                  No credit card required
                </span>
              </div>

              {/* Recognition bullets — states not questions */}
              <div className="space-y-2 pt-1">
                {[
                  'Know exactly what to set aside for SARS every month',
                  'Every expense categorized, partial deductions calculated',
                  'Audit-ready evidence list built automatically',
                  'File in minutes with your exact eFiling line numbers',
                ].map((s) => (
                  <div key={s} className="flex items-center gap-2.5 text-sm text-ink-2">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Right: hero video
              Plain div (not motion.div) so the container is visible immediately —
              motion.div starts at opacity:0 in SSR and requires JS hydration to
              become visible; a plain div has no such delay. */}
          <div className="relative">
            <div className="absolute -inset-4 bg-emerald-600/10 blur-3xl rounded-full pointer-events-none" />
            {/* aspect-[3/4] gives a portrait-friendly frame for the 9:16 clip.
                object-top anchors the top of the frame so the person's face
                is always visible even though the video is taller than the box. */}
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-edge/70 shadow-2xl shadow-emerald-950/40 bg-surface">
              <video
                ref={videoRef}
                className="w-full h-full object-cover object-top"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-label="Klippa product preview"
              >
                <source src="/influencer.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* ── Before / After ───────────────────────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <p className="text-xs text-ink-3 uppercase tracking-widest mb-3">The difference</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
              Sound familiar?{' '}
              <span className="text-ink-2">Here&apos;s what changes.</span>
            </h2>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Before */}
            <Reveal delay={0.05}>
              <div className="rounded-2xl border border-red-900/30 bg-red-950/10 p-6 space-y-4 h-full">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
                    <X className="w-3 h-3 text-red-400" />
                  </div>
                  <p className="text-sm font-semibold text-red-400 uppercase tracking-wider">Before</p>
                </div>
                {[
                  'Receipts in WhatsApp, email, and a shoebox',
                  '"I\'ll sort it all out in October"',
                  'Guessing what percentage of your phone to claim',
                  'No logbook — SARS disallows your travel deduction',
                  'Discover a large tax bill weeks before the deadline',
                  'Not sure if your records would survive an audit',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-red-300/60">
                    <div className="w-1 h-1 rounded-full bg-red-500/40 mt-2 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </Reveal>

            {/* After */}
            <Reveal delay={0.12}>
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/15 p-6 space-y-4 h-full">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </div>
                  <p className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">With Klippa</p>
                </div>
                {[
                  'Every receipt logged and categorized as it happens',
                  'Your tax position is current right now, not in October',
                  'Exact percentage with SARS reasoning you can defend',
                  'Auto-generated SARS-compliant mileage logbook',
                  'Tax provision calculated in real time — no surprises',
                  'Every expense comes with its audit evidence checklist',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-emerald-300/80">
                    <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Three pillars ─────────────────────────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <p className="text-xs text-ink-3 uppercase tracking-widest mb-3">How Klippa helps</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
              Messy today. Tax-ready tomorrow.
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                icon:  <Receipt className="w-5 h-5 text-emerald-400" />,
                from:  'Scattered receipts',
                to:    'Organized & categorized',
                body:  'Snap a photo, import a bank CSV, or upload. Klippa categorizes every expense and calculates the deductible amount — no spreadsheets.',
              },
              {
                icon:  <TrendingUp className="w-5 h-5 text-emerald-400" />,
                from:  'Uncertainty',
                to:    'Exact numbers',
                body:  'See your real Safe-to-Spend balance after SARS provision, any time. Know your tax number before your accountant does.',
              },
              {
                icon:  <FileCheck className="w-5 h-5 text-emerald-400" />,
                from:  'October panic',
                to:    '20-minute filing',
                body:  'Your personalised eFiling cheat sheet — exact rand values, SARS line numbers, and all supporting documents already attached.',
              },
            ].map((pillar, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4 h-full">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    {pillar.icon}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-ink-3 line-through">{pillar.from}</p>
                    <p className="text-sm font-semibold text-ink-1">{pillar.to}</p>
                  </div>
                  <p className="text-sm text-ink-2 leading-relaxed">{pillar.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── The moat ──────────────────────────────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <div className="space-y-3 mb-10">
              <p className="text-xs text-ink-3 uppercase tracking-widest">Why Klippa is different</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Not just a calculator.{' '}
                <span className="text-ink-2">Your tax intelligence layer.</span>
              </h2>
              <p className="text-sm text-ink-2 leading-relaxed max-w-lg">
                Any spreadsheet can add up your income. Klippa knows SARS rules — and applies them to your specific situation automatically.
              </p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                icon:  <Zap className="w-5 h-5 text-amber-400" />,
                title: 'Mixed-use AI intelligence',
                body:  'Not "yes it\'s deductible". The exact percentage. Phone: 65%. Laptop: 80%. Home office: 32%. With SARS reasoning you can defend in an audit — not just a number you guessed.',
                tag:   'No other SA app does this',
              },
              {
                icon:  <Car className="w-5 h-5 text-teal-400" />,
                title: 'Auto mileage logbook',
                body:  'SARS requires a logbook, not just fuel receipts. Fuel receipts alone get disallowed. Klippa generates your SARS-compliant logbook automatically — one less thing you\'ll forget.',
                tag:   'Mandatory. Now automatic.',
              },
              {
                icon:  <BookOpen className="w-5 h-5 text-purple-400" />,
                title: 'Audit-ready from day one',
                body:  'Every expense comes with a SARS evidence checklist: what to keep, what audit risk looks like, and what a SARS auditor would ask for. You\'ll know before they do.',
                tag:   'Confidence before the call',
              },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4 h-full flex flex-col">
                  <div className="w-10 h-10 rounded-xl bg-raised flex items-center justify-center">
                    {item.icon}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-sm font-semibold text-ink-1">{item.title}</h3>
                    <p className="text-sm text-ink-2 leading-relaxed">{item.body}</p>
                  </div>
                  <span className="inline-block text-[10px] font-semibold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full w-fit">
                    {item.tag}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── The hard questions ────────────────────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <div className="space-y-3 mb-10">
              <p className="text-xs text-ink-3 uppercase tracking-widest">The questions SARS won&apos;t answer for you</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                "What percentage can I actually claim?"{' '}
                <span className="text-ink-2">Klippa tells you.</span>
              </h2>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon:   <Smartphone className="w-4 h-4 text-emerald-400" />,
                q:      'My phone is personal and work. What do I claim?',
                answer: "Klippa analyses your work setup and says: 65%. Here's why, and here's what to keep.",
              },
              {
                icon:   <Laptop className="w-4 h-4 text-emerald-400" />,
                q:      'I use my laptop for work and personal. Is it 60% or 80%?',
                answer: 'Klippa gives you a conservative and aggressive range, with SARS reasoning behind each number.',
              },
              {
                icon:   <Car className="w-4 h-4 text-emerald-400" />,
                q:      'Do I need a logbook or just my fuel receipts?',
                answer: 'A logbook is mandatory. Fuel receipts alone get disallowed. Klippa builds it for you.',
              },
              {
                icon:   <AlertCircle className="w-4 h-4 text-emerald-400" />,
                q:      'If SARS audits me, what will they ask for?',
                answer: "Every expense in Klippa comes with an audit evidence checklist — before they ask.",
              },
            ].map((ex, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="rounded-2xl border border-edge/60 bg-surface/40 p-5 space-y-3 h-full">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    {ex.icon}
                  </div>
                  <p className="text-sm font-medium text-ink-1 leading-snug">{ex.q}</p>
                  <p className="text-xs text-ink-2 leading-relaxed">{ex.answer}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <p className="text-xs text-ink-3 uppercase tracking-widest mb-12">How it works</p>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                icon:  <TrendingUp className="w-5 h-5 text-emerald-400" />,
                step:  '01',
                title: 'Two minutes to set up',
                body:  'Tell Klippa how you work: employment type, home office, vehicle, retirement annuity. Everything is tailored to your exact situation.',
              },
              {
                icon:  <ShieldCheck className="w-5 h-5 text-emerald-400" />,
                step:  '02',
                title: 'Capture as you go',
                body:  'Add income, snap receipts, import bank statements. Klippa classifies each expense, handles the partial-deduction maths, and builds your evidence trail automatically.',
              },
              {
                icon:  <FileCheck className="w-5 h-5 text-emerald-400" />,
                step:  '03',
                title: 'File with confidence',
                body:  'Get your personalised eFiling guide with exact rand values and SARS line numbers. Fill it in under 20 minutes — with proof for every line.',
              },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      {s.icon}
                    </div>
                    <span className="text-xs font-mono text-ink-3">{s.step}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-ink-1">{s.title}</h3>
                  <p className="text-sm text-ink-2 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Your tax co-pilot (illustration) ──────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">
            <Reveal>
              <div className="space-y-5">
                <p className="text-xs text-ink-3 uppercase tracking-widest">Always working in the background</p>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                  Your tax co-pilot,{' '}
                  <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                    always on.
                  </span>
                </h2>
                <p className="text-base text-ink-2 leading-relaxed max-w-md">
                  While you work, Klippa reads your receipts, sorts every expense, sets aside
                  your SARS provision, and keeps your evidence trail audit-ready — so there&apos;s
                  nothing to scramble for when filing season arrives.
                </p>
              </div>
            </Reveal>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="hidden sm:block"
            >
              <HeroIllustration />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Who it's for ──────────────────────────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <Reveal>
            <p className="text-xs text-ink-3 uppercase tracking-widest mb-5">Who it&apos;s for</p>
            <div className="flex flex-wrap gap-2.5">
              {[
                'Freelancers', 'Contractors', 'Consultants', 'Content creators',
                'Coaches & trainers', 'Sole traders', 'Commission earners', 'Side-hustlers',
              ].map((label) => (
                <span key={label} className="px-3.5 py-1.5 rounded-full border border-edge/60 text-xs text-ink-2 bg-surface/60">
                  {label}
                </span>
              ))}
              <span className="px-3.5 py-1.5 rounded-full border border-emerald-600/40 text-xs text-emerald-400 bg-emerald-950/40">
                Anyone who invoices for their work
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────── */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <Reveal>
            <div className="text-center space-y-6 max-w-2xl mx-auto">
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                Stop dreading tax season.
                <br />
                <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                  Start your 2-minute setup.
                </span>
              </h2>
              <p className="text-base text-ink-2 leading-relaxed">
                Join South African freelancers who capture receipts as they happen,
                know their tax position in real time, and file without the scramble.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-xl shadow-emerald-900/30"
                  >
                    Get started — it&apos;s free <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
                <span className="text-sm text-ink-3">No credit card · No accountant needed</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-edge/40">
        <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-xs font-medium text-ink-3">© 2026 Klippa. Built for South African taxpayers.</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-ink-3">
            <Link href="/terms" className="hover:text-ink-2 transition-colors">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-ink-2 transition-colors">Privacy Policy</Link>
            <a href="mailto:support@klippa.co.za" className="hover:text-ink-2 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
