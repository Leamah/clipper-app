/**
 * Tier helpers — single source of truth for access checks.
 *
 * Access rules:
 *  - Org/practice members are treated as Starter (seat covered by org owner)
 *  - subscription_tier 'admin' has full access everywhere
 *
 * Import this in both API routes (server) and client components.
 */

export interface TierProfile {
  subscription_tier?: string | null
  organisation_id?:   string | null
}

/** Starter, Professional, Admin — OR any org/practice member */
export function isStarterOrAbove(p: TierProfile | null | undefined): boolean {
  if (!p) return false
  if (p.organisation_id) return true
  return ['starter', 'professional', 'admin'].includes(p.subscription_tier ?? '')
}

/** Professional or Admin only (org members get Starter equivalent, not Professional) */
export function isProfessionalOrAbove(p: TierProfile | null | undefined): boolean {
  if (!p) return false
  return ['professional', 'admin'].includes(p.subscription_tier ?? '')
}

/** Free user with no org — subject to monthly record caps */
export function isFreeUser(p: TierProfile | null | undefined): boolean {
  return !isStarterOrAbove(p)
}

// ── Monthly record caps for free tier ────────────────────
export const FREE_EXPENSE_LIMIT = 15
export const FREE_INCOME_LIMIT  = 3
export const FREE_INVOICE_LIMIT = 3

/** Free users get a taste of AI expense classification before the
    Starter gate — lifetime count, tracked on klippa_user_progress. */
export const FREE_AI_TASTE_LIMIT = 3
