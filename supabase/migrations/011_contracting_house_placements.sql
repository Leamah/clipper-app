-- ===== Contracting-house placement layer =====
-- First-class clients and placements for labour brokers / contracting houses.

create table if not exists public.klippa_org_clients (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.klippa_organisations(id) on delete cascade,
  name            text not null,
  contact_person  text,
  contact_email   text,
  default_site    text,
  status          text not null default 'active', -- active | paused | archived
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.klippa_org_placements (
  id                      uuid primary key default gen_random_uuid(),
  organisation_id         uuid not null references public.klippa_organisations(id) on delete cascade,
  client_id               uuid not null references public.klippa_org_clients(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  role_title              text not null,
  site                    text,
  client_manager_name     text,
  client_manager_email    text,
  start_date              date,
  end_date                date,
  bill_rate               numeric(15,2),
  pay_rate                numeric(15,2),
  rate_type               text not null default 'hourly', -- hourly | daily | monthly | project
  status                  text not null default 'active', -- active | ending | ended | paused
  compliance_requirements text[] not null default array[]::text[],
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists klippa_org_clients_org_idx
  on public.klippa_org_clients (organisation_id, status);

create index if not exists klippa_org_placements_org_idx
  on public.klippa_org_placements (organisation_id, status);

create index if not exists klippa_org_placements_client_idx
  on public.klippa_org_placements (client_id);

create index if not exists klippa_org_placements_user_idx
  on public.klippa_org_placements (user_id);

alter table public.klippa_org_clients enable row level security;
alter table public.klippa_org_placements enable row level security;

drop policy if exists org_clients_service_all on public.klippa_org_clients;
create policy org_clients_service_all on public.klippa_org_clients
  for all to service_role using (true) with check (true);

drop policy if exists org_placements_service_all on public.klippa_org_placements;
create policy org_placements_service_all on public.klippa_org_placements
  for all to service_role using (true) with check (true);
