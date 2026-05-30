'use client'

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react'

function CancelContent() {
  const searchParams = useSearchParams()
  const isError      = searchParams.get('error') === '1'
  const ref          = searchParams.get('ref')

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="inline-flex w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 items-center justify-center mx-auto">
          <XCircle className="w-8 h-8 text-red-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            {isError ? 'Payment error' : 'Payment cancelled'}
          </h1>
          <p className="text-sm text-ink-2 leading-relaxed">
            {isError
              ? 'Something went wrong with your payment. Your card was not charged. Please try again.'
              : 'No worries — your payment was cancelled and nothing was charged.'}
          </p>
          {ref && (
            <p className="text-xs text-ink-3 font-mono">Ref: {ref.slice(0, 8)}…</p>
          )}
        </div>

        <div className="space-y-3">
          <Link
            href="/subscription"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-edge text-ink-1 text-sm font-medium hover:border-zinc-500 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function PaymentCancelPage() {
  return <Suspense><CancelContent /></Suspense>
}
