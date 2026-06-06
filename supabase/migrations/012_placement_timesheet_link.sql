-- ===== Link contractor placements to timesheets =====
-- Each placement can create/sync the contractor-facing klippa_clients row.
-- Timesheets then inherit that client_id, allowing org readiness to evaluate
-- the correct placement even when one contractor works across multiple clients.

alter table public.klippa_clients
  add column if not exists organisation_id uuid references public.klippa_organisations(id) on delete set null,
  add column if not exists org_placement_id uuid references public.klippa_org_placements(id) on delete set null;

alter table public.klippa_timesheets
  add column if not exists org_placement_id uuid references public.klippa_org_placements(id) on delete set null;

create index if not exists klippa_clients_org_placement_idx
  on public.klippa_clients (org_placement_id);

create index if not exists klippa_timesheets_org_placement_idx
  on public.klippa_timesheets (org_placement_id);

create unique index if not exists klippa_clients_user_org_placement_unique
  on public.klippa_clients (user_id, org_placement_id)
  where org_placement_id is not null;

alter table public.klippa_consultant_compliance
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;
