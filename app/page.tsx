'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ArrowRight,
  Check,
  Smartphone,
  Laptop,
  Coffee,
  Car,
  Home,
  ShieldCheck,
  TrendingUp,
  FileCheck,
} from 'lucide-react'

// Questions that keep self-employed people up at night
const PAIN_POINTS = [
  'How much should I actually be saving for tax?',
  'What percentage of my phone bill can I claim?',
  'Do I have enough proof if SARS audits me?',
  'Am I leaving deductions on the table?',
]

// Outcome-focused features (no tool names)
const FEATURES = [
  'Live "Tax to Save" meter so you always know what to set aside',
  'Snap a receipt to see what is deductible and exactly how much',
  'Mixed-use intelligence: the right percentage for phone, laptop, home office',
  'Auto-generated mileage logbook, SARS-compliant',
  'Step-by-step eFiling guide with exact SARS line numbers',
  'Audit-ready evidence list so you know what to keep before SARS asks',
]

// Mixed-use proof points: the hard questions Klippa answers
const MIXED_USE_EXAMPLES = [
  {
    icon:    <Smartphone className="w-4 h-4 text-emerald-400" />,
    q:       'My phone contract, personal and work. What do I claim?',
    answer:  'Klippa looks at your work setup and says: 65%. Here\'s why, and here\'s what to keep.',
  },
  {
    icon:    <Laptop className="w-4 h-4 text-emerald-400" />,
    q:       'I use my laptop for work and personal. Is it 60% or 80%?',
    answer:  'Klippa gives you a conservative and aggressive range, with SARS reasoning behind each number.',
  },
  {
    icon:    <Coffee className="w-4 h-4 text-emerald-400" />,
    q:       'That restaurant receipt: was it a business meal?',
    answer:  'Client present: 50% max under SARS rules. Solo lunch: 0%. Klippa knows the difference.',
  },
  {
    icon:    <Car className="w-4 h-4 text-emerald-400" />,
    q:       'Do I need a logbook or just my fuel receipts?',
    answer:  'A logbook is mandatory. Fuel receipts alone get disallowed. Klippa builds the logbook for you.',
  },
  {
    icon:    <Home className="w-4 h-4 text-emerald-400" />,
    q:       'My home office is also my living room. Can I still claim?',
    answer:  'Yes, with conditions. Klippa calculates the deductible percentage based on your floor plan.',
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

// Who Klippa is for (explicit and broad)
const WHO_ITS_FOR = [
  'Freelancers',
  'Contractors',
  'Consultants',
  'Content creators',
  'Influencers',
  'Coaches & trainers',
  'Sole traders',
  'Side-hustlers',
]

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

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-2xl space-y-8">
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

          <p className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-lg">
            Klippa tracks your income, figures out exactly what you can
            deduct and how much, then walks you through eFiling step by step.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-900/30"
            >
              Start for free <ArrowRight className="w-4 h-4" />
            </Link>
            <span className="inline-flex items-center text-sm text-zinc-500 px-2">
              No credit card required
            </span>
          </div>

          {/* Pain points answered */}
          <div className="pt-2 space-y-2">
            {PAIN_POINTS.map((q) => (
              <div key={q} className="flex items-center gap-2.5 text-sm text-zinc-500">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {q}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-6">Who it&apos;s for</p>
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
        </div>
      </section>

      {/* Mixed-use intelligence */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="space-y-3 mb-14">
            <p className="text-xs text-zinc-600 uppercase tracking-widest">The hard questions</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              When the answer isn&apos;t simply yes or no,{' '}
              <span className="text-zinc-500">Klippa gives you the number.</span>
            </h2>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-lg">
              Most deductions are partially claimable. SARS has specific rules for each.
              Klippa knows them and gives you a defensible range, so you can claim with confidence.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MIXED_USE_EXAMPLES.map((ex, i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5 space-y-3"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  {ex.icon}
                </div>
                <p className="text-sm font-medium text-zinc-200 leading-snug">{ex.q}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{ex.answer}</p>
              </div>
            ))}
            {/* Sixth card */}
            <div className="rounded-2xl border border-emerald-700/30 bg-emerald-950/20 p-5 flex flex-col justify-between gap-4">
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
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-14">How it works</p>
          <div className="grid sm:grid-cols-3 gap-10">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    {s.icon}
                  </div>
                  <span className="text-xs font-mono text-zinc-600">{s.step}</span>
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="grid sm:grid-cols-2 gap-14 items-start">
            <div className="space-y-5">
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
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-bold tracking-tight">
              Know what you owe. File with confidence.
            </p>
            <p className="text-sm text-zinc-500">
              Join South Africans who work for themselves and take control of their tax.
            </p>
          </div>
          <Link
            href="/login"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-900/30"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
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
