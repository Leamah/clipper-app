'use client'

/**
 * Global error boundary — catches React render errors in the root layout.
 * Reports to Sentry so render crashes show up in the dashboard.
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router
 */

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0a', color: '#e5e7eb', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '400px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg,#10b981,#0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '20px' }}>
            K
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '18px', fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={reset}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', background: '#10b981', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
