-- ============================================================
-- 007 — Practice client portal
-- Tokenised, client-facing document collection for accounting
-- practices. Clients open a magic link (no login), see their
-- document checklist + filing status, and upload files directly.
-- ============================================================

alter table public.klippa_practice_clients
  add column if not exists portal_token uuid,
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists portal_token_created_at timestamptz;

create unique index if not exists idx_klippa_practice_clients_portal_token
  on public.klippa_practice_clients(portal_token)
  where portal_token is not null;

-- Documents uploaded against a practice client (by the client via the
-- portal, or by the practice directly).
create table if not exists public.klippa_practice_client_documents (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.klippa_practice_clients(id) on delete cascade,
  organisation_id   uuid not null references public.klippa_organisations(id) on delete cascade,
  checklist_item_id text,
  file_name         text not null,
  storage_path      text not null,
  mime_type         text,
  size_bytes        integer,
  uploaded_via      text not null default 'portal', -- portal | practice
  created_at        timestamptz not null default now()
);

-- All access flows through the service-role server client, so RLS is on with
-- no permissive policies (deny-by-default for anon/authenticated direct access).
alter table public.klippa_practice_client_documents enable row level security;

create index if not exists idx_klippa_pcd_client
  on public.klippa_practice_client_documents(client_id, created_at desc);
