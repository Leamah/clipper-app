import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['soiymskxrtbeszgwigpw.supabase.co'],
  },
}

export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress Sentry CLI output during build
  silent: true,

  // Automatically instrument Next.js data fetching methods and API routes
  autoInstrumentServerFunctions: true,

  // Upload source maps to Sentry so stack traces show original code
  widenClientFileUpload: true,

  // Hide source maps from the client bundle
  hideSourceMaps: true,

  // Tree-shake Sentry logger in prod
  disableLogger: true,
})
