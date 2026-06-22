'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight, ShieldCheck, Calculator, Clock, PiggyBank, Briefcase,
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

export default function ProvisionalTaxLanding() {
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
            Know what to set aside
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
              before SARS asks for it.
            </span>
          </h1>
          <p className="text-lg text-ink-2 leading-relaxed max-w-xl mx-auto mb-8">
            See your real Safe-to-Spend balance after your SARS provision — updated every time you log income, not worked out once a year under pressure.
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

      {/* Safe-to-Spend + Set-aside proof */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <p className="text-xs text-ink-3 uppercase tracking-widest mb-3">Always up to date</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10">
              Two numbers. Always current.
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-5">
            <Reveal>
              <div className="rounded-2xl border border-emerald-600/30 bg-gradient-to-br from-emerald-950/80 to-teal-950/60 p-6 space-y-2">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider">Safe to Spend</p>
                <p className="text-3xl font-bold text-emerald-300 tabular-nums">R 198,000</p>
                <p className="text-xs text-ink-2">after tax + expenses, right now</p>
              </div>
            </Reveal>
            <Reveal delay={0.06}>
              <div className="rounded-2xl border border-edge/70 bg-surface p-6 space-y-2">
                <p className="text-[10px] text-ink-2 uppercase tracking-wider">Tax Provision</p>
                <p className="text-3xl font-bold text-amber-300 tabular-nums">R 23,450</p>
                <p className="text-xs text-ink-3">set this aside for your next IRP6 payment</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* IRP6 planner */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid sm:grid-cols-3 gap-5">
            <Reveal>
              <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-3 h-full">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-ink-1">IRP6 deadlines tracked</p>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Both provisional tax periods, with days-to-deadline counted down so you're never caught out.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.06}>
              <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-3 h-full">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-ink-1">Set-aside calculator</p>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Estimates your payment from the income you've already logged — no spreadsheet, no guesswork.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-3 h-full">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <PiggyBank className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-ink-1">No surprises</p>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Your provision builds up in real time as you log income — not discovered as a shock weeks before the deadline.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <Reveal>
            <div className="rounded-2xl border border-edge/60 bg-surface/40 p-6 flex items-start gap-4 max-w-2xl mx-auto">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-1 mb-1">Built for provisional taxpayers</p>
                <p className="text-xs text-ink-2 leading-relaxed">
                  If you invoice clients directly rather than being on a single employer's PAYE, SARS expects you to file provisional tax twice a year. Klippa turns on the planner automatically the moment your profile says freelance or mixed income.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 border-t border-edge/50">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4">
              Know your number.
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                Before SARS comes asking.
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
