// First-party marketing attribution — captures first-touch UTM/gclid params
// into a cookie so they can be attached to the user's profile at signup,
// without a third-party analytics dependency (no GA4/gtag).

const COOKIE_NAME    = 'klippa_attribution'
const MAX_AGE_DAYS    = 30

export interface AttributionData {
  utm_source?:   string
  utm_medium?:   string
  utm_campaign?: string
  gclid?:        string
  landing_page?: string
}

/** Reads UTM/gclid params from the current URL and stores them as a
 *  first-touch cookie. No-ops if a cookie already exists (never overwrite),
 *  or if none of the tracked params are present (organic visits don't get
 *  a landing_page stamped — that field is only meaningful for ad traffic). */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return
  if (readAttributionCookie()) return

  const params = new URLSearchParams(window.location.search)
  const data: AttributionData = {
    utm_source:   params.get('utm_source')   ?? undefined,
    utm_medium:   params.get('utm_medium')   ?? undefined,
    utm_campaign: params.get('utm_campaign') ?? undefined,
    gclid:        params.get('gclid')        ?? undefined,
  }

  const hasSignal = data.utm_source || data.utm_medium || data.utm_campaign || data.gclid
  if (!hasSignal) return

  data.landing_page = window.location.pathname

  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=${maxAge}; SameSite=Lax`
}

/** Reads the first-touch attribution cookie, if present. */
export function readAttributionCookie(): AttributionData | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`))
    if (!match) return null
    const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1))
    return JSON.parse(raw) as AttributionData
  } catch {
    return null
  }
}
