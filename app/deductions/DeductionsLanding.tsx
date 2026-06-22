'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight, ShieldCheck, Smartphone, Laptop, Car,
  Receipt, BookOpen, AlertCircle, Percent,
} from 'lucide-react'

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

const CLAIM_EXAMPLES = [
  {
    icon: <Smartphone className="w-4 h-4 text-emerald-400" />,
    title: 'Phone & mobile data',
    pct:   '65%',
    body:  'Standard freelancer estimate — up to 80% if your phone is primarily for work. 100% is rarely accepted on a personal contract.',
  },
  {
    icon: <Laptop className="w-4 h-4 text-emerald-400" />,
    title: 'Home internet',
    pct:   '50–65%',
    body:  '50% minimum for a shared household connection, up to 65% if you work from home full-time as a sole trader.',
  },
  {
    icon: <Car className="w-4 h-4 text-emerald-400" />,
    title: 'Vehicle & fuel',
    pct:   'Logbook required',
    body:  'SARS requires a maintained logbook — date, odometer, business purpose. Fuel receipts alone get disallowed without one.',
  },
  {
    icon: <Receipt className="w-4 h-4 text-emerald-400" />,
    title: 'Client entertainment',
    pct:   'Capped 50%',
    body:  'A hard SARS rule. Solo meals with no client present are 0% — not deductible, no matter how the receipt is worded.',
  },
]

export default function DeductionsLanding() {
  return (
    <div className="min-h-screen bg-base text-ink-1 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-600/[0.06] blur-[160px] rounded-full" />
      </div>

      <header className="relative z-30 border-b border-edge/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md shadow-emerald-900/40">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </div>
          <Link href="/login" className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink-1 transition-colors">
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pt-20 pb-12 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-ink-2 uppercase tracking-widest">Built for South African freelancers</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.08] mb-6">
            Stop guessing what{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
              SARS lets you claim.
            </span>
          </h1>
          <p className="text-lg text-ink-2 leading-relaxed max-w-xl mx-auto mb-8">
            Klippa gives you the exact deductible percentage for every expense — not &ldquo;it depends&rdquo; — with the SARS reasoning to defend it and the evidence trail ready before anyone asks.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-900/30"
            >
              Start for free <ArrowRight className="w-4 h-4" />
            </Link>
            <span className="text-sm text-ink-2">No credit card required</span>
          </div>
        </Reveal>
      </section>

      {/* What you can actually claim */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <p className="text-xs text-ink-3 uppercase tracking-widest mb-3">What you can actually claim</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10">
              Real SARS categories. Real percentages.
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-4">
            {CLAIM_EXAMPLES.map((ex, i) => (
              <Reveal key={ex.title} delay={i * 0.06}>
                <div className="rounded-2xl border border-edge/60 bg-surface/40 p-5 space-y-3 h-full">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      {ex.icon}
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      {ex.pct}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink-1">{ex.title}</p>
                  <p className="text-xs text-ink-2 leading-relaxed">{ex.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Receipt OCR proof */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid sm:grid-cols-2 gap-10 items-center">
            <Reveal>
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Snap a receipt. Klippa reads it.</h2>
                <p className="text-sm text-ink-2 leading-relaxed">
                  Merchant, amount, date and VAT extracted automatically the moment you upload a photo — no manual typing, no shoebox of paper receipts at filing time.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="rounded-2xl border border-edge/70 bg-surface p-5 shadow-xl space-y-2 max-w-xs mx-auto">
                <div className="flex items-center gap-1.5 mb-1">
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-ink-2 font-medium">Receipt scanned</span>
                </div>
                <p className="text-xs text-ink-2">MTN Monthly</p>
                <p className="text-lg font-bold text-white tabular-nums">R 1,299</p>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <Percent className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-medium">65% deductible — phone</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Audit evidence */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <div className="space-y-3 mb-10 text-center max-w-xl mx-auto">
              <p className="text-xs text-ink-3 uppercase tracking-widest">If SARS ever asks</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Audit-ready from day one — not a scramble in October.
              </h2>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <Reveal>
              <div className="rounded-2xl border border-edge/60 bg-surface/40 p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-ink-1">Audit evidence checklist</p>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Every expense comes with exactly what to keep on file — so you know before SARS asks.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.06}>
              <div className="rounded-2xl border border-edge/60 bg-surface/40 p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-ink-1">SARS reasoning, not guesswork</p>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Each percentage comes with the plain-English SARS rule behind it, so you can defend it if you're ever queried.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4">
              Know what you can claim.
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                Before you file, not after.
              </span>
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-xl shadow-emerald-900/30"
              >
                Get started, it&apos;s free <ArrowRight className="w-4 h-4" />
              </Link>
              <span className="text-sm text-ink-3">No credit card · No accountant needed</span>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="relative z-10 border-t border-edge/40">
        <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-xs font-medium text-ink-3">© 2026 Klippa. Built for South African freelancers.</span>
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
