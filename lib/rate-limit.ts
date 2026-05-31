/**
 * Lightweight in-memory rate limiter.
 *
 * Suitable for Vercel serverless (per-instance) — acts as a basic
 * defence against abuse on public endpoints (OTP spam, feedback bombing).
 *
 * Usage:
 *   import { checkRateLimit } from '@/lib/rate-limit'
 *   if (!checkRateLimit(`otp:${email}`, 5, 15 * 60_000)) {
 *     return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 *   }
 */

interface RateLimitEntry {
  count: number
  reset: number   // epoch ms when the window expires
}

const store = new Map<string, RateLimitEntry>()

// Prune expired entries every 10 minutes to avoid unbounded memory growth
let lastPrune = Date.now()
function maybePrune() {
  const now = Date.now()
  if (now - lastPrune < 10 * 60_000) return
  lastPrune = now
  for (const [key, entry] of store.entries()) {
    if (now > entry.reset) store.delete(key)
  }
}

/**
 * Returns true if the request is within the allowed limit, false if it should
 * be blocked.
 *
 * @param key       Unique identifier (e.g. `"otp:user@example.com"`)
 * @param limit     Max allowed requests in the window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  maybePrune()
  const now   = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false

  entry.count++
  return true
}
