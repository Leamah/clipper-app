import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture 10% of sessions for performance tracing in prod; 100% in dev
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replay 1% of sessions normally, 100% of sessions with errors
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText:   true,
      blockAllMedia: false,
    }),
  ],

  // Don't print Sentry debug logs
  debug: false,
})

// Instruments client-side navigations for Sentry performance tracing
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
