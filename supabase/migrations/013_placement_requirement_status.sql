-- ===== Placement requirement tracking =====
-- Tracks completion of client/site requirements on each placement without
-- requiring a client-side portal.

alter table public.klippa_org_placements
  add column if not exists requirement_status jsonb not null default '{}'::jsonb;
