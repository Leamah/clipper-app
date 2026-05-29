'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import {
  ArrowRight, Check, Smartphone, Laptop, Car,
  ShieldCheck, TrendingUp, FileCheck, Receipt, FileText,
} from 'lucide-react'

// ── Static data ───────────────────────────────────────────

const PAIN_POINTS = [
  'How much should I actually be saving for tax?',
  'What percentage of my phone bill can I claim?',
  'Do I have enough proof if SARS audits me?',
  'Am I leaving deductions on the table?',
]

const FEATURES = [
  'Live tax provision meter so you always know exactly what to set aside for SARS',
  'Snap a receipt to see what is deductible and exactly how much',
  'Mixed-use intelligence: the right percentage for phone, laptop, home office',
  'Auto-generated mileage logbook, SARS-compliant',
  'Step-by-step eFiling guide with exact SARS line numbers',
  'Audit-ready evidence list so you know what to keep before SARS asks',
]

const MIXED_USE_EXAMPLES = [
  {
    icon:   <Smartphone className="w-4 h-4 text-emerald-400" />,
    q:      'My phone contract, personal and work. What do I claim?',
    answer: "Klippa looks at your work setup and says: 65%. Here's why, and here's what to keep.",
  },
  {
    icon:   <Laptop className="w-4 h-4 text-emerald-400" />,
    q:      'I use my laptop for work and personal. Is it 60% or 80%?',
    answer: 'Klippa gives you a conservative and aggressive range, with SARS reasoning behind each number.',
  },
  {
    icon:   <Car className="w-4 h-4 text-emerald-400" />,
    q:      'Do I need a logbook or just my fuel receipts?',
    answer: 'A logbook is mandatory. Fuel receipts alone get disallowed. Klippa builds the logbook for you.',
  },
]

const HOW_IT_WORKS = [
  {
    icon:  <TrendingUp className="w-5 h-5 text-emerald-400" />,
    step:  '01',
    title: 'Tell Klippa how you work',
    body:  'Two minutes to set up. Employment type, home office, vehicle, RA: we tailor everything to your situation.',
  },
  {
    icon:  <ShieldCheck className="w-5 h-5 text-emerald-400" />,
    step:  '02',
    title: 'Track income and expenses',
    body:  'Add what comes in, snap what goes out. Klippa classifies each expense, handles the partial-deduction maths, and builds your evidence trail.',
  },
  {
    icon:  <FileCheck className="w-5 h-5 text-emerald-400" />,
    step:  '03',
    title: 'File with confidence',
    body:  'Get a personalised eFiling guide with exact rand values and SARS line numbers. Fill it in under 10 minutes.',
  },
]

const WHO_ITS_FOR = [
  'Freelancers', 'Contractors', 'Consultants', 'Content creators',
  'Influencers', 'Coaches & trainers', 'Sole traders', 'Side-hustlers',
]

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

      {/* Outer pulse ring */}
      <motion.div
        animate={{ scale: [1, 1.12, 1], opacity: [0.06, 0.14, 0.06] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute w-72 h-72 rounded-full border border-emerald-500/20 bg-emerald-500/5"
      />
      {/* Inner pulse ring */}
      <motion.div
        animate={{ scale: [1, 1.07, 1], opacity: [0.10, 0.20, 0.10] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        className="absolute w-52 h-52 rounded-full border border-emerald-500/25"
      />

      {/* Central figure */}
      <motion.div
        animate={{ y: [0, -9, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10 flex flex-col items-center gap-1"
      >
        {/* Head */}
        <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-900/60">
          <span className="text-2xl font-black text-white tracking-tighter">K</span>
        </div>
        {/* Torso */}
        <div className="w-[88px] h-[96px] rounded-2xl bg-gradient-to-b from-zinc-700 to-zinc-800 border border-zinc-600/40 flex items-center justify-center shadow-2xl">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
        </div>
        {/* Ground shadow */}
        <div className="w-16 h-2.5 rounded-full bg-black/40 blur-sm" />
      </motion.div>

      {/* Floating card — Receipt top-left */}
      <motion.div
        animate={{ y: [0, -10, 0], rotate: [-2, 1, -2] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        className="absolute top-10 left-2 bg-zinc-900 border border-zinc-700/70 rounded-xl p-3 shadow-xl w-36"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Receipt className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-zinc-400 font-medium">Receipt</span>
        </div>
        <p className="text-[11px] text-zinc-500">MTN Monthly</p>
        <p className="text-sm font-bold text-white tabular-nums">R 1,299</p>
        <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="text-[9px] text-emerald-400 font-medium">65% deductible</span>
        </div>
      </motion.div>

      {/* Floating card — Tax Provision top-right */}
      <motion.div
        animate={{ y: [0, -13, 0], rotate: [2, -1, 2] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute top-6 right-0 bg-zinc-900 border border-zinc-700/70 rounded-xl p-3 shadow-xl w-40"
      >
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Tax Provision</p>
        <p className="text-lg font-bold text-amber-300 tabular-nums">R 23,450</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">Set this aside →</p>
      </motion.div>

      {/* Floating card — IRP5 bottom-left */}
      <motion.div
        animate={{ y: [0, -7, 0], rotate: [1, -2, 1] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
        className="absolute bottom-14 left-4 bg-zinc-900 border border-zinc-700/70 rounded-xl p-3 shadow-xl w-32"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <FileText className="w-3 h-3 text-teal-400" />
          <span className="text-[10px] text-zinc-400 font-medium">IRP5</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-400">OCR Complete</span>
        </div>
      </motion.div>

      {/* Floating card — Safe to Spend bottom-right */}
      <motion.div
        animate={{ y: [0, -11, 0], rotate: [-1, 2, -1] }}
        transition={{ duration: 4.3, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
        className="absolute bottom-10 right-2 bg-gradient-to-br from-emerald-950/80 to-teal-950/60 border border-emerald-600/30 rounded-xl p-3 shadow-xl w-36"
      >
        <p className="text-[9px] text-emerald-400 uppercase tracking-wider mb-1">Safe to Spend</p>
        <p className="text-lg font-bold text-emerald-300 tabular-nums">R 198,000</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">after tax + expenses</p>
      </motion.div>

    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard')
      else setReady(true)
    })
  }, [router])

  if (!ready) return null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-600/[0.06] blur-[160px] rounded-full" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-zinc-800/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md shadow-emerald-900/40">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
            <span className="text-xs text-zinc-600 ml-1">Tax Platform</span>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero — two columns on desktop */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">

          {/* Left: text */}
          <Reveal>
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-zinc-500 uppercase tracking-widest">
                  For South Africans who work for themselves
                </span>
              </div>

              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.06]">
                Know your tax.<br />
                <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                  Keep more money.
                </span>
              </h1>

              <p className="text-lg text-zinc-400 leading-relaxed max-w-md">
                Klippa tracks your income, figures out exactly what you can
                deduct and how much, then walks you through eFiling step by step.
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
                <span className="inline-flex items-center text-sm text-zinc-500 px-2">
                  No credit card required
                </span>
              </div>

              <div className="space-y-2 pt-1">
                {PAIN_POINTS.map((q) => (
                  <div key={q} className="flex items-center gap-2.5 text-sm text-zinc-500">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    {q}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Right: animated illustration (desktop only) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.25 }}
            className="hidden sm:block"
          >
            <HeroIllustration />
          </motion.div>

        </div>
      </section>

      {/* Who it's for */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <Reveal>
            <p className="text-xs text-zinc-600 uppercase tracking-widest mb-5">Who it&apos;s for</p>
            <div className="flex flex-wrap gap-2.5">
              {WHO_ITS_FOR.map((label) => (
                <span
                  key={label}
                  className="px-3.5 py-1.5 rounded-full border border-zinc-700/60 text-xs text-zinc-400 bg-zinc-900/60"
                >
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

      {/* Mixed-use intelligence — trimmed to 2×2 grid */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <div className="space-y-3 mb-10">
              <p className="text-xs text-zinc-600 uppercase tracking-widest">The hard questions</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                When the answer isn&apos;t simply yes or no,{' '}
                <span className="text-zinc-500">Klippa gives you the number.</span>
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed max-w-lg">
                Most deductions are partially claimable. SARS has specific rules for each.
                Klippa gives you a defensible range so you can claim with confidence.
              </p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-4">
            {MIXED_USE_EXAMPLES.map((ex, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5 space-y-3 h-full">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    {ex.icon}
                  </div>
                  <p className="text-sm font-medium text-zinc-200 leading-snug">{ex.q}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{ex.answer}</p>
                </div>
              </Reveal>
            ))}
            <Reveal delay={0.24}>
              <div className="rounded-2xl border border-emerald-700/30 bg-emerald-950/20 p-5 flex flex-col justify-between gap-4 h-full">
                <p className="text-sm font-medium text-emerald-300 leading-snug">
                  Got an expense you&apos;re not sure about?
                </p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Add it in Klippa. Our SARS intelligence engine will classify it, give you the deductible range, and tell you exactly what documentation to keep.
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Try it free <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <p className="text-xs text-zinc-600 uppercase tracking-widest mb-12">How it works</p>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((s, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      {s.icon}
                    </div>
                    <span className="text-xs font-mono text-zinc-600">{s.step}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid sm:grid-cols-2 gap-12 items-start">
            <Reveal>
              <div className="space-y-4">
                <p className="text-xs text-zinc-600 uppercase tracking-widest">What you get</p>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                  Everything a self-employed South African needs.{' '}
                  <span className="text-zinc-600">Nothing they don&apos;t.</span>
                </h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Built specifically for the South African tax system: ITR12, SARS deduction rules,
                  and real eFiling workflows.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <ul className="space-y-3 pt-1">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </span>
                    <span className="text-zinc-300">{f}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="space-y-1">
                <p className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Know what you owe. File with confidence.
                </p>
                <p className="text-sm text-zinc-500">
                  Join South Africans who work for themselves and take control of their tax.
                </p>
              </div>
              <motion.div whileTap={{ scale: 0.97 }}>
                <Link
                  href="/login"
                  className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-900/30"
                >
                  Get started free <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-xs font-medium text-zinc-600">Klippa</span>
          </div>
          <p className="text-xs text-zinc-700">© 2025 Klippa. For South African taxpayers.</p>
        </div>
      </footer>

    </div>
  )
}
