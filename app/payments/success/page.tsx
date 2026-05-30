'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams }    from 'next/navigation'
import Link                               from 'next/link'
import { CheckCircle2, Loader2, ArrowRight, ShieldCheck } from 'lucide-react'

function SuccessContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const ref          = searchParams.get('ref')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Give webhook a moment to process, then reload the user session
    const t = setTimeout(() => setReady(true), 2000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-emerald-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative max-w-sm w-full text-center space-y-6">
        <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 items-center justify-center mx-auto">
          {ready
            ? <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            : <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          }
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            {ready ? 'Payment confirmed!' : 'Confirming payment…'}
          </h1>
          <p className="text-sm text-ink-2 leading-relaxed">
            {ready
              ? 'Your subscription is now active. Welcome to Klippa.'
              : 'We\'re confirming your payment with Ozow. This takes a few seconds.'}
          </p>
          {ref && (
            <p className="text-xs text-ink-3 font-mono">Ref: {ref.slice(0, 8)}…</p>
          )}
        </div>

        {ready && (
          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all"
            >
              Go to dashboard <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/subscription" className="block text-xs text-ink-2 hover:text-ink-1 transition-colors">
              View subscription details
            </Link>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-ink-3">
          <ShieldCheck className="w-3.5 h-3.5" />
          Secured by Ozow
        </div>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return <Suspense><SuccessContent /></Suspense>
}
