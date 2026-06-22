-- ============================================================
-- 018 — Practice returns foundation
-- Split the practice workspace into client masters + per-year
-- returns, with assignment fields and activity events.
-- ============================================================

create table if not exists public.klippa_practice_returns (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.klippa_practice_clients(id) on delete cascade,
  organisation_id      uuid not null references public.klippa_organisations(id) on delete cascade,
  tax_year             integer not null,
  return_type          text not null default 'ITR12',
  filing_status        text not null default 'not_started',
  deadline             date,
  review_due_at        date,
  owner_user_id        uuid references auth.users(id) on delete set null,
  preparer_user_id     uuid references auth.users(id) on delete set null,
  reviewer_user_id     uuid references auth.users(id) on delete set null,
  fee                  numeric(12,2) not null default 0,
  fee_paid             boolean not null default false,
  notes                text,
  blocked_reason_codes text[] not null default '{}',
  doc_checklist        jsonb not null default '[]'::jsonb,
  last_chased_at       timestamptz,
  client_signoff_at    timestamptz,
  filed_at             timestamptz,
  assessed_at          timestamptz,
  sars_reference       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (client_id, tax_year, return_type)
);

create index if not exists idx_klippa_practice_returns_org_status
  on public.klippa_practice_returns(organisation_id, filing_status, deadline);

create index if not exists idx_klippa_practice_returns_owner
  on public.klippa_practice_returns(owner_user_id, preparer_user_id, reviewer_user_id);

insert into public.klippa_practice_returns (
  client_id,
  organisation_id,
  tax_year,
  return_type,
  filing_status,
  deadline,
  fee,
  fee_paid,
  notes,
  doc_checklist,
  created_at,
  updated_at
)
select
  c.id,
  c.organisation_id,
  c.tax_year,
  c.return_type,
  c.filing_status,
  c.deadline,
  c.fee,
  c.fee_paid,
  c.notes,
  coalesce(c.doc_checklist::jsonb, '[]'::jsonb),
  c.created_at,
  c.updated_at
from public.klippa_practice_clients c
on conflict (client_id, tax_year, return_type) do nothing;

alter table public.klippa_practice_client_documents
  add column if not exists return_id uuid references public.klippa_practice_returns(id) on delete cascade;

update public.klippa_practice_client_documents d
set return_id = r.id
from public.klippa_practice_returns r
join public.klippa_practice_clients c on c.id = r.client_id
where d.return_id is null
  and d.client_id = c.id
  and r.tax_year = c.tax_year
  and r.return_type = c.return_type;

create index if not exists idx_klippa_pcd_return
  on public.klippa_practice_client_documents(return_id, created_at desc);

create table if not exists public.klippa_practice_activity_events (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.klippa_organisations(id) on delete cascade,
  client_id        uuid not null references public.klippa_practice_clients(id) on delete cascade,
  return_id        uuid references public.klippa_practice_returns(id) on delete cascade,
  actor_user_id    uuid references auth.users(id) on delete set null,
  event_type       text not null,
  event_label      text not null,
  detail           text,
  metadata         jsonb,
  created_at       timestamptz not null default now()
);

alter table public.klippa_practice_activity_events enable row level security;

create index if not exists idx_klippa_practice_events_return
  on public.klippa_practice_activity_events(return_id, created_at desc);

create index if not exists idx_klippa_practice_events_client
  on public.klippa_practice_activity_events(client_id, created_at desc);
