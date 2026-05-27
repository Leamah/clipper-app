'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ArrowRight, Check, Receipt, Calculator, FileText, ShieldCheck } from 'lucide-react'

const PAIN_POINTS = [
  'How much tax should I save this month?',
  'Can I claim my phone bill?',
  'What proof does SARS need?',
  'How do I fill in the eFiling form?',
]

const FEATURES = [
  'Live "Tax to Save" meter — always know what to set aside',
  'Upload receipts — AI tells you what\'s deductible',
  'Import bank statements via CSV',
  'IRP5 certificate scanning (Mathpix OCR)',
  'Step-by-step eFiling cheat sheet',
  'Filing deadline countdown',
]

const HOW_IT_WORKS = [
  {
    icon: <Receipt className="w-5 h-5 text-emerald-400" />,
    title: 'Track income & expenses',
    body:  'Add income manually or import your bank statement. Upload receipts and our AI tells you what\'s deductible and why.',
  },
  {
    icon: <Calculator className="w-5 h-5 text-emerald-400" />,
    title: 'Know your tax in real time',
    body:  'Your "Safe to Spend" dashboard updates live. See exactly what you owe SARS before the deadline — no surprises.',
  },
  {
    icon: <FileText className="w-5 h-5 text-emerald-400" />,
    title: 'File with confidence',
    body:  'Get a personalised eFiling cheat sheet with exact SARS line numbers and values. You fill the form — we do the thinking.',
  },
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
              Built for South African freelancers
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.06]">
            Know your tax.<br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
              Keep more money.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 leading-relaxed max-w-lg">
            Klippa tracks your income, classifies your expenses, and generates
            a step-by-step SARS eFiling guide — so you always know what you owe
            before the deadline hits.
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

      {/* How it works */}
      <section className="relative z-10 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-14">How it works</p>
          <div className="grid sm:grid-cols-3 gap-10">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  {s.icon}
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
                Everything a freelancer
                needs.{' '}
                <span className="text-zinc-600">Nothing they don&apos;t.</span>
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Klippa is built specifically for the South African tax system —
                ITR12, IRP6, SARS deduction rules, and real eFiling workflows.
                No generic accounting software nonsense.
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
              Stop guessing what SARS wants.
            </p>
            <p className="text-sm text-zinc-500">Join South African freelancers who file with confidence.</p>
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
