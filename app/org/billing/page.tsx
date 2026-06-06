'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams }                 from 'next/navigation'
import Link                                 from 'next/link'
import {
  ShieldCheck, ArrowLeft, ArrowRight, Loader2, AlertCircle,
  Minus, Plus, Check, Users, Calendar, RefreshCw, Building2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface Billing {
  name:                 string
  org_type:             'company' | 'practice'
  seat_count:           number
  seats_used:           number
  subscription_status:  string
  subscription_ends_at: string | null
  entitled:             boolean
  seat_price:           number
  client_cap:           number
}

function OrgBillingContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const gated        = searchParams.get('gate') === '1'

  const [data,         setData]         = useState<Billing | null>(null)
  const [seats,        setSeats]        = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [paying,       setPaying]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [showCustom,   setShowCustom]   = useState(false)
  const [customNotes,  setCustomNotes]  = useState('')
  const [customEmail,  setCustomEmail]  = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [customDone,   setCustomDone]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/org/billing')
    if (r.status === 401) { router.replace('/login'); return }
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'Could not load billing'); setLoading(false); return }
    setData(d)
    setSeats(Math.max(d.seats_used || 1, d.seat_count || 1))
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const submitCustomLead = async () => {
    setSubmitting(true)
    try {
      await fetch('/api/leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_type:     'custom_org_pricing',
          notes:         customNotes.trim() || undefined,
          contact_email: customEmail.trim() || undefined,
          metadata:      { org_name: data?.name, current_seats: data?.seat_count, org_type: data?.org_type },
        }),
      })
      setCustomDone(true)
    } catch {
      // silent — lead DB write may have succeeded even if email failed
      setCustomDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  const startPayment = async () => {
    setPaying(true); setError(null)
    try {
      const r = await fetch('/api/payments/ozow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'org_seats',
          seats,
          // Pass current period end so renewal extends cleanly (no lost days)
          renewFrom: data?.entitled && data?.subscription_ends_at
            ? data.subscription_ends_at
            : undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error); setPaying(false); return }

      const form = document.createElement('form')
      form.method = 'POST'
      form.action = d.url
      Object.entries(d.fields as Record<string, string>).forEach(([k, v]) => {
        const input = document.createElement('input')
        input.type = 'hidden'; input.name = k; input.value = v
        form.appendChild(input)
      })
      document.body.appendChild(form)
      form.submit()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment failed. Please try again.')
      setPaying(false)
    }
  }

  const isPractice = data?.org_type === 'practice'
  const home       = isPractice ? '/practice/dashboard' : '/org/dashboard'
  const price      = data?.seat_price ?? 1490
  const total      = seats * price
  const minSeats   = Math.max(1, data?.seats_used ?? 1)

  return (
    <div className="min-h-screen bg-base text-ink-1">
      <header className="relative z-30 border-b border-edge/60 bg-base/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href={home} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Klippa</span>
          </Link>
          <Link href={home} className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Workspace
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <h1 className="text-lg font-semibold">Seats & billing</h1>
          <p className="text-sm text-ink-2 mt-1">
            {data ? data.name : 'Your workspace'} · billed annually via instant EFT
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-ink-3" /></div>
        ) : !data ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            {gated && !data.entitled && (
              <div className="rounded-xl border border-amber-600/40 bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-amber-300">Activate your workspace to continue</p>
                  <p className="text-ink-2 mt-0.5">
                    Pay for your seats to {isPractice ? 'add your first client' : 'invite your first contractor'}. You can keep exploring in the meantime.
                  </p>
                </div>
              </div>
            )}

            {data.entitled && (
              <div className="rounded-xl border border-emerald-600/40 bg-emerald-950/20 px-4 py-3 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-emerald-300">Workspace active, {data.seat_count} seats</p>
                  <p className="text-ink-2 mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Renews {data.subscription_ends_at ? format(parseISO(data.subscription_ends_at), 'd MMM yyyy') : '—'}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-edge bg-surface/40 p-6 space-y-6">
              <div>
                <p className="text-sm font-semibold">{data.entitled ? 'Adjust seats' : 'How many seats?'}</p>
                <p className="text-xs text-ink-2 mt-1 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {data.seats_used} in use{isPractice ? ` · up to ${data.client_cap} clients included` : ''}
                </p>
              </div>

              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => setSeats((s) => Math.max(minSeats, s - 1))}
                  disabled={seats <= minSeats}
                  className="w-11 h-11 rounded-xl border border-edge flex items-center justify-center hover:border-emerald-500/50 disabled:opacity-40 transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="text-center min-w-[80px]">
                  <p className="text-4xl font-bold tabular-nums">{seats}</p>
                  <p className="text-xs text-ink-2 mt-0.5">{seats === 1 ? 'seat' : 'seats'}</p>
                </div>
                <button
                  onClick={() => setSeats((s) => Math.min(500, s + 1))}
                  className="w-11 h-11 rounded-xl border border-edge flex items-center justify-center hover:border-emerald-500/50 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="border-t border-edge pt-4 space-y-1.5">
                <div className="flex justify-between text-xs text-ink-2">
                  <span>{seats} × R {price.toLocaleString('en-ZA')} / seat / year</span>
                  <span>R {total.toLocaleString('en-ZA')}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-1">
                  <span>Total due today</span>
                  <span>R {total.toLocaleString('en-ZA')}</span>
                </div>
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
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : data?.entitled ? <RefreshCw className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                {paying ? 'Redirecting to payment…' : data?.entitled ? `Renew R ${total.toLocaleString('en-ZA')} via Ozow` : `Pay R ${total.toLocaleString('en-ZA')} via Ozow`}
              </button>
              <p className="text-xs text-ink-3 text-center">Instant EFT via Ozow · Secure · No card needed</p>
            </div>

            {/* Renewal expiry warning */}
            {data.entitled && data.subscription_ends_at && (() => {
              const days = Math.ceil((new Date(data.subscription_ends_at).getTime() - Date.now()) / 86_400_000)
              return days <= 30 && days >= 0 ? (
                <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span>Workspace subscription expires in <strong>{days} day{days !== 1 ? 's' : ''}</strong>. Renew above to avoid interruption for your team.</span>
                </div>
              ) : null
            })()}

            {/* Custom / Enterprise option */}
            <div className="rounded-2xl border border-edge bg-surface/30 p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-violet-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Custom / Enterprise pricing</p>
                  <p className="text-xs text-ink-2 mt-0.5">Variable contract lengths, bulk discounts, or more than 50 seats</p>
                </div>
              </div>

              {customDone ? (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  Request received. Our team will be in touch within 1 business day.
                </div>
              ) : showCustom ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink-2">Best email to reach you</label>
                    <input
                      type="email"
                      value={customEmail}
                      onChange={e => setCustomEmail(e.target.value)}
                      placeholder="you@company.co.za"
                      className="input w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink-2">What do you need? (optional)</label>
                    <textarea
                      value={customNotes}
                      onChange={e => setCustomNotes(e.target.value)}
                      placeholder="e.g. 12 contractors on 6-month placements, need custom billing cycle…"
                      rows={3}
                      className="input w-full resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCustom(false)} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-raised text-ink-2 hover:bg-edge transition-colors">
                      Cancel
                    </button>
                    <button onClick={submitCustomLead} disabled={submitting || !customEmail.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors">
                      {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                      {submitting ? 'Sending…' : 'Request pricing'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowCustom(true)}
                  className="w-full py-2.5 rounded-xl text-xs font-medium border border-edge text-ink-2 hover:border-violet-500/50 hover:text-ink-1 transition-colors">
                  Get a custom quote →
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function OrgBillingPage() {
  return (
    <Suspense>
      <OrgBillingContent />
    </Suspense>
  )
}
