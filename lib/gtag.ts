// Google Ads conversion helpers.
// The base gtag config tag is loaded sitewide in app/layout.tsx (required for
// tag detection). Conversion events fire only at specific moments — signup
// completion and (future) purchase — not on every page load.

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function fireSignupConversion() {
  window.gtag?.('event', 'conversion', { send_to: 'AW-16982139445/QVzjCMut0skcELXE26E_' })
}

export function firePurchaseConversion(value?: number) {
  window.gtag?.('event', 'conversion', { send_to: 'AW-16982139445', value, currency: 'ZAR' })
}
