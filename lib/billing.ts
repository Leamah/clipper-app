// ============================================================
// Klippa billing attribution + entitlement helpers
// ============================================================
// Single source of truth for "who pays" and "is this workspace paid".
//
//  • solo            — an individual (organisation_id IS NULL). Pays their own
//                      Starter/Premium tier. Gated by their personal subscription.
//  • org-payer       — the org owner / admin (org_role = 'org-admin'). Pays the
//                      annual seat bundle for the whole organisation.
//  • invited-member  — joined via an invite (organisation_id set, NOT org-admin).
//                      Covered by the org's seats. NEVER charged or prompted.
//
// The soft payment gate only ever blocks an *org-payer's* first value action
// (invite first consultant / add first client). Invited members and the
// freelancer surface are never gated by org entitlement.

import type { SupabaseClient } from '@supabase/supabase-js'

export type BillingRole = 'solo' | 'org-payer' | 'invited-member'

export interface BillingProfile {
  organisation_id: string | null
  org_role:        string | null
}

/** Classify a profile into a billing role from data we already store. */
export function billingRole(p: BillingProfile | null | undefined): BillingRole {
  if (!p?.organisation_id) return 'solo'
  if (p.org_role === 'org-admin') return 'org-payer'
  return 'invited-member'
}

/** True when the caller must never be charged or shown a payment prompt. */
export function isInvitedMember(p: BillingProfile | null | undefined): boolean {
  return billingRole(p) === 'invited-member'
}

export interface OrgEntitlement {
  entitled:    boolean
  status:      string
  seat_count:  number
  ends_at:     string | null
}

/**
 * Whether an organisation has an active, unexpired seat subscription.
 * Uses the service-role client (bypasses RLS) — call from API routes only.
 */
export async function getOrgEntitlement(
  admin: SupabaseClient,
  orgId: string,
): Promise<OrgEntitlement> {
  const { data } = await admin
    .from('klippa_organisations')
    .select('subscription_status, subscription_ends_at, seat_count')
    .eq('id', orgId)
    .single()

  const status     = (data?.subscription_status as string) ?? 'free'
  const endsAt     = (data?.subscription_ends_at as string | null) ?? null
  const seatCount  = (data?.seat_count as number) ?? 0
  const notExpired = !endsAt || new Date(endsAt) > new Date()

  return {
    entitled:   status === 'active' && notExpired,
    status,
    seat_count: seatCount,
    ends_at:    endsAt,
  }
}
