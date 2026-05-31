'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, ShieldCheck, Zap, Users, Building2 } from 'lucide-react'
import { PLANS, SEAT_PRICE_ANNUAL, PRACTICE_CLIENT_CAP, type PlanKey, type BillingCycle } from '@/lib/ozow'

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  return (
    <div className="min-h-screen bg-base text-ink-1 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-emerald-600/[0.06] blur-[140px] rounded-full" />
      </div>

      {/* Nav */}
      <header className="relative z-30 border-b border-edge/40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md shadow-emerald-900/40">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href="/login" className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink-1 transition-colors">
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-24 space-y-16">

        {/* Header */}
        <div className="text-center space-y-4 max-w-xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Simple, honest pricing
          </h1>
          <p className="text-ink-2 text-lg leading-relaxed">
            Pay once a month. Cancel any time. No setup fees, no hidden costs.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 bg-surface border border-edge rounded-xl p-1 mt-2">
            {(['monthly', 'annual'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  cycle === c
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-ink-2 hover:text-ink-1'
                }`}
              >
                {c === 'monthly' ? 'Monthly' : 'Annual'}
                {c === 'annual' && (
                  <span className="ml-1.5 text-emerald-300 text-[10px]">2 months free</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Free tier */}
        <div className="grid sm:grid-cols-3 gap-5 items-start">
          <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-5">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink-1">Free</p>
              <p className="text-3xl font-bold">R 0</p>
              <p className="text-xs text-ink-2">Forever free</p>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed">
              Get started, explore the platform, and track your first expenses.
            </p>
            <ul className="space-y-2">
              {['Up to 20 expenses per tax year', 'Basic AI classification', 'Dashboard & tax meter'].map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-ink-2">
                  <Check className="w-3.5 h-3.5 text-ink-2 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="block text-center w-full py-2.5 rounded-xl border border-edge text-xs font-semibold text-ink-1 hover:border-zinc-500 transition-all"
            >
              Get started free
            </Link>
          </div>

          {/* Paid plans */}
          {(Object.entries(PLANS) as [PlanKey, typeof PLANS[PlanKey]][]).map(([key, plan], i) => (
            <div
              key={key}
              className={`rounded-2xl border p-6 space-y-5 ${
                i === 0
                  ? 'border-emerald-600/50 bg-emerald-950/20'
                  : 'border-edge bg-surface/40'
              }`}
            >
              {i === 0 && (
                <div className="inline-flex items-center gap-1 bg-emerald-600/20 border border-emerald-600/30 rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <Zap className="w-2.5 h-2.5" /> Most popular
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink-1">{plan.name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    R {cycle === 'monthly' ? plan.monthlyPrice : Math.round(plan.annualPrice / 12)}
                  </span>
                  <span className="text-xs text-ink-2">/month</span>
                </div>
                {cycle === 'annual' && (
                  <p className="text-xs text-emerald-400">
                    R {plan.annualPrice} billed annually
                  </p>
                )}
              </div>
              <p className="text-xs text-ink-2 leading-relaxed">{plan.description}</p>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-ink-1">
                    <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${i === 0 ? 'text-emerald-400' : 'text-ink-2'}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/subscription?plan=${key}&cycle=${cycle}`}
                className={`block text-center w-full py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  i === 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                    : 'bg-raised hover:bg-edge text-ink-1'
                }`}
              >
                Get {plan.name} <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
              </Link>
            </div>
          ))}
        </div>

        {/* Teams & practices — per-seat */}
        <div className="border-t border-edge/50 pt-16 space-y-6">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <h2 className="text-2xl font-bold tracking-tight">For teams & accounting practices</h2>
            <p className="text-ink-2 text-sm leading-relaxed">
              One simple seat price, billed once a year. Invite your team, manage their work, stay compliant together.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Company */}
            <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <Users className="w-4.5 h-4.5 text-violet-300" />
                </div>
                <p className="text-sm font-semibold">Companies</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">R {SEAT_PRICE_ANNUAL.toLocaleString('en-ZA')}</span>
                <span className="text-xs text-ink-2">/ seat / year</span>
              </div>
              <ul className="space-y-2">
                {['One seat per consultant you invite', 'Timesheets, approvals & payroll periods', 'Contracts & compliance tracking', 'Pay once a year — no monthly admin'].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-ink-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Practice */}
            <div className="rounded-2xl border border-emerald-600/40 bg-emerald-950/20 p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <Building2 className="w-4.5 h-4.5 text-amber-300" />
                </div>
                <p className="text-sm font-semibold">Accounting practices</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">R {SEAT_PRICE_ANNUAL.toLocaleString('en-ZA')}</span>
                <span className="text-xs text-ink-2">/ seat / year</span>
              </div>
              <ul className="space-y-2">
                {[`Manage up to ${PRACTICE_CLIENT_CAP} active clients`, 'Client document portals & checklists', 'Filing status & deadline tracking', 'Need more clients? Contact us for enterprise'].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-ink-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-xs text-ink-3">
            Set up your workspace free — you only pay when you invite your first team member or add your first client.
          </p>
        </div>

        {/* FAQ row */}
        <div className="border-t border-edge/50 pt-12 grid sm:grid-cols-3 gap-8">
          {[
            { q: 'Can I cancel any time?',  a: 'Yes. Cancel before your next billing date and you won\'t be charged again. Your data stays intact.' },
            { q: 'Do you offer a free trial?', a: 'Yes — ask us for a promo code or check your email when you sign up. We regularly run 7 and 30-day trials.' },
            { q: 'Is my payment secure?', a: 'Payments are processed by Ozow, a regulated South African payment provider. We never store your banking details.' },
          ].map(({ q, a }) => (
            <div key={q} className="space-y-2">
              <p className="text-sm font-semibold text-ink-1">{q}</p>
              <p className="text-xs text-ink-2 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
