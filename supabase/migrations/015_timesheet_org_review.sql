-- ============================================================
-- Klippa — Timesheet org review columns + invite seat window
-- 1. Adds placement-house review/approval columns to klippa_timesheets
--    so the org approval workflow (approve / reject) can write and read them.
-- 2. Adds seat_access_until to klippa_org_invites so the accept-invite
--    flow can propagate a per-seat contract end date to klippa_profiles.
-- ============================================================

-- ── 1. Timesheet org-review columns ─────────────────────────
-- org_approved_at  — when the placement house approved the timesheet
-- org_approved_by  — which admin approved it (FK for audit trail)
-- org_rejected_at  — when the placement house bounced it back to draft
-- org_review_note  — optional note attached to an approve / reject action
-- locked_at        — set at approval; prevents consultant edits after sign-off
alter table public.klippa_timesheets
  add column if not exists org_approved_at  timestamptz,
  add column if not exists org_approved_by  uuid references auth.users(id) on delete set null,
  add column if not exists org_rejected_at  timestamptz,
  add column if not exists org_review_note  text,
  add column if not exists locked_at        timestamptz;

-- Index to speed up "timesheets pending org approval" queries
create index if not exists klippa_timesheets_org_approved_idx
  on public.klippa_timesheets (org_approved_at)
  where org_approved_at is not null;

-- ── 2. Seat access window on org invites ─────────────────────
-- When an org admin invites a fixed-term contractor they can supply a
-- seat_access_until date. accept-invite copies the value to the
-- consultant's klippa_profiles.seat_access_until at acceptance time.
alter table public.klippa_org_invites
  add column if not exists seat_access_until timestamptz;
