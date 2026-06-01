'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams }                 from 'next/navigation'
import Link                                            from 'next/link'
import {
  ShieldCheck, ArrowLeft, Check, Loader2, AlertCircle,
  Tag, Zap, ArrowRight, Calendar, XCircle, ChevronDown,
} from 'lucide-react'
import { supabase }                                   from '@/lib/supabase'
import { PLANS, getPlanAmount, type PlanKey, type BillingCycle } from '@/lib/ozow'
import { format, parseISO }                           from 'date-fns'

interface ActiveSub {
  plan:                string
  status:              string
  billing_cycle:       string
  current_period_end:  string | null
  amount_paid:         number
}

interface ActivePromo {
  type:                        string
  trial_ends_at:               string | null
  discount_expires_at:         string | null
  free_submissions_remaining:  number
  klippa_promotions: { code: string; discount_pct: number | null; trial_days: number | null }
}

function SubscriptionContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const defaultPlan  = (searchParams.get('plan') ?? 'starter') as PlanKey
  const defaultCycle = (searchParams.get('cycle') ?? 'monthly') as BillingCycle

  const [plan,       setPlan]       = useState<PlanKey>(defaultPlan)
  const [cycle,      setCycle]      = useState<BillingCycle>(defaultCycle)
  const [promoCode,  setPromoCode]  = useState('')
  const [promoMsg,   setPromoMsg]   = useState<{ text: string; ok: boolean } | null>(null)
  const [discount,   setDiscount]   = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [paying,     setPaying]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [activeSub,      setActiveSub]      = useState<ActiveSub | null>(null)
  const [promos,         setPromos]         = useState<ActivePromo[]>([])
  const [profile,        setProfile]        = useState<{ subscription_tier: string; trial_ends_at: string | null } | null>(null)
  const [showCancel,     setShowCancel]     = useState(false)
  const [cancelling,     setCancelling]     = useState(false)
  const [cancelError,    setCancelError]    = useState<string | null>(null)
  const [cancelDone,     setCancelDone]     = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const [subRes, promoRes, profileRes] = await Promise.all([
      supabase
        .from('klippa_subscriptions')
        .select('plan, status, billing_cycle, current_period_end, amount_paid')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('klippa_user_promotions')
        .select('type, trial_ends_at, discount_expires_at, free_submissions_remaining, klippa_promotions(code, discount_pct, trial_days)')
        .eq('user_id', user.id),
      supabase
        .from('klippa_profiles')
        .select('subscription_tier, trial_ends_at')
        .eq('id', user.id)
        .single(),
    ])

    setActiveSub(subRes.data ?? null)
    setPromos((promoRes.data as unknown as ActivePromo[]) ?? [])
    setProfile(profileRes.data ?? null)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  const applyPromo = async () => {
    if (!promoCode.trim()) return
    setPromoMsg(null)
    try {
      const r = await fetch('/api/promotions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      })
      const d = await r.json()
      if (!r.ok) {
        setPromoMsg({ text: d.error, ok: false })
        return
      }
      setPromoMsg({ text: d.message, ok: true })
      if (d.type === 'discount' && d.discountPct) {
        setDiscount(d.discountPct)
      }
      loadData()
    } catch {
      setPromoMsg({ text: 'Could not apply promo code.', ok: false })
    }
  }

  const cancelSub = async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      const r = await fetch('/api/subscription/cancel', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setCancelError(d.error ?? 'Cancellation failed'); return }
      setCancelDone(true)
      setActiveSub(null)
      setProfile(prev => prev ? { ...prev, subscription_tier: 'free' } : prev)
      setShowCancel(false)
    } catch {
      setCancelError('Could not reach server — please try again.')
    } finally {
      setCancelling(false)
    }
  }

  const startPayment = async () => {
    setPaying(true)
    setError(null)
    try {
      const r = await fetch('/api/payments/ozow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingCycle: cycle, promoCode: promoCode.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error); return }

      // Submit a hidden form to Ozow (form POST redirect)
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = d.url
      Object.entries(d.fields as Record<string, string>).forEach(([k, v]) => {
        const input = document.createElement('input')
        input.type  = 'hidden'
        input.name  = k
        input.value = v
        form.appendChild(input)
      })
      document.body.appendChild(form)
      form.submit()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment failed. Please try again.')
      setPaying(false)
    }
  }

  const finalAmount = getPlanAmount(plan, cycle, discount)
  const selectedPlan = PLANS[plan]
  const isOnTrial    = profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date()
  const hasActiveSub = activeSub?.status === 'active'

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="relative z-30 border-b border-edge/60 bg-base/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href="/pricing" className="text-xs text-ink-2 hover:text-ink-1 transition-colors">
            View pricing
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </button>
          <h1 className="text-lg font-semibold">Your Plan</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-ink-3" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-5 gap-6">

            {/* Left — plan selector + checkout */}
            <div className="sm:col-span-3 space-y-6">

              {/* Trial banner */}
              {isOnTrial && (
                <div className="rounded-xl border border-emerald-600/40 bg-emerald-950/30 px-4 py-3 flex items-start gap-2.5">
                  <Zap className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-emerald-300">Free trial active</p>
                    <p className="text-ink-2 mt-0.5">
                      Expires {format(parseISO(profile!.trial_ends_at!), 'd MMM yyyy')}. Subscribe before then to keep access.
                    </p>
                  </div>
                </div>
              )}

              {/* Active subscription banner + cancel flow */}
              {cancelDone && (
                <div className="rounded-xl border border-edge bg-surface/50 px-4 py-3 text-xs text-ink-2">
                  Subscription cancelled — you&apos;re now on the <span className="font-semibold text-ink-1">Free</span> plan.
                </div>
              )}
              {hasActiveSub && !cancelDone && (
                <div className="rounded-xl border border-edge bg-surface/50 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Calendar className="w-4 h-4 text-ink-2 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 text-xs">
                      <p className="font-semibold text-ink-1">
                        {activeSub.plan.charAt(0).toUpperCase() + activeSub.plan.slice(1)} plan active
                      </p>
                      <p className="text-ink-2 mt-0.5">
                        {activeSub.billing_cycle === 'annual' ? 'Annual' : 'Monthly'} · renews{' '}
                        {activeSub.current_period_end ? format(parseISO(activeSub.current_period_end), 'd MMM yyyy') : '—'}
                      </p>
                    </div>
                    <button
                      onClick={() => { setShowCancel(c => !c); setCancelError(null) }}
                      className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2 transition-colors"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCancel ? 'rotate-180' : ''}`} />
                      Cancel
                    </button>
                  </div>

                  {/* Cancel confirmation */}
                  {showCancel && (
                    <div className="border-t border-edge pt-3 space-y-3">
                      <div className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                        <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                        <span>
                          Cancelling immediately downgrades you to the <strong>Free</strong> plan.
                          {activeSub.billing_cycle === 'annual' &&
                            ' For an annual refund on unused months, email support@klippa.co.za after cancelling.'}
                        </span>
                      </div>
                      {cancelError && (
                        <p className="text-xs text-red-400">{cancelError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancel(false)}
                          className="flex-1 py-2 rounded-xl text-xs font-medium border border-edge text-ink-2 hover:text-ink-1 transition-colors"
                        >
                          Keep my plan
                        </button>
                        <button
                          onClick={cancelSub}
                          disabled={cancelling}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
                        >
                          {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Yes, cancel plan'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Plan picker */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-ink-2">Choose a plan</p>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(PLANS) as [PlanKey, typeof PLANS[PlanKey]][]).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => setPlan(key)}
                      className={`rounded-xl border p-4 text-left transition-all space-y-1 ${
                        plan === key
                          ? 'border-emerald-500 bg-emerald-950/30'
                          : 'border-edge hover:border-zinc-500 bg-surface/40'
                      }`}
                    >
                      <p className="text-xs font-semibold text-ink-1">{p.name}</p>
                      <p className="text-lg font-bold">
                        R {cycle === 'monthly' ? p.monthlyPrice : Math.round(p.annualPrice / 12)}
                        <span className="text-xs font-normal text-ink-2">/mo</span>
                      </p>
                    </button>
                  ))}
                </div>

                {/* Billing cycle */}
                <div className="flex gap-2 pt-1">
                  {(['monthly', 'annual'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCycle(c)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                        cycle === c
                          ? 'bg-raised text-ink-1 border border-zinc-600'
                          : 'text-ink-2 border border-edge hover:text-ink-1'
                      }`}
                    >
                      {c === 'monthly' ? 'Monthly' : 'Annual (save ~17%)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Promo code */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-ink-2">Promo code</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-2" />
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="e.g. TRIAL30"
                      className="w-full bg-raised/60 border border-edge rounded-xl pl-9 pr-4 py-2.5 text-sm text-ink-1 placeholder:text-ink-3 outline-none focus:border-emerald-500/60 transition-colors"
                    />
                  </div>
                  <button
                    onClick={applyPromo}
                    disabled={!promoCode.trim()}
                    className="px-4 py-2.5 rounded-xl bg-raised hover:bg-edge text-xs font-semibold text-ink-1 disabled:opacity-40 transition-all"
                  >
                    Apply
                  </button>
                </div>
                {promoMsg && (
                  <p className={`text-xs px-3 py-2 rounded-lg ${promoMsg.ok ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800/40' : 'bg-red-900/20 text-red-400 border border-red-900/30'}`}>
                    {promoMsg.text}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{error}
                </div>
              )}

              <button
                onClick={startPayment}
                disabled={paying}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-900/30"
              >
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {paying ? 'Redirecting to payment…' : `Pay R ${finalAmount.toFixed(2)} via Ozow`}
              </button>
              <p className="text-xs text-ink-3 text-center">
                Instant EFT via Ozow · Secure · No card needed
              </p>
            </div>

            {/* Right — plan summary */}
            <div className="sm:col-span-2 space-y-4">
              <div className="rounded-2xl border border-edge bg-surface/40 p-5 space-y-4">
                <p className="text-xs font-medium text-ink-2">What you get</p>
                <ul className="space-y-2.5">
                  {selectedPlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-ink-1">
                      <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-edge pt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-ink-2">
                    <span>{selectedPlan.name} ({cycle})</span>
                    <span>R {cycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.annualPrice}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-xs text-emerald-400">
                      <span>Discount ({discount}%)</span>
                      <span>− R {((cycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.annualPrice) * discount / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-ink-1 pt-1">
                    <span>Total</span>
                    <span>R {finalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Active promos */}
              {promos.length > 0 && (
                <div className="rounded-xl border border-edge bg-surface/30 p-4 space-y-2">
                  <p className="text-xs font-medium text-ink-2">Your promos</p>
                  {promos.map((up) => (
                    <div key={up.klippa_promotions?.code} className="text-xs text-ink-2 flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-emerald-500" />
                      <span className="font-mono text-emerald-400">{up.klippa_promotions?.code}</span>
                      {up.type === 'trial' && up.trial_ends_at && (
                        <span className="text-ink-2">trial until {format(parseISO(up.trial_ends_at), 'd MMM')}</span>
                      )}
                      {up.type === 'discount' && (
                        <span className="text-ink-2">{up.klippa_promotions?.discount_pct}% off</span>
                      )}
                      {up.type === 'free_submission' && (
                        <span className="text-ink-2">{up.free_submissions_remaining} free filing(s)</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

export default function SubscriptionPage() {
  return (
    <Suspense>
      <SubscriptionContent />
    </Suspense>
  )
}
