-- ============================================================
-- 021 — Freelancer invoicing + recurring templates
-- Golden items for monthly use: freelancers invoice their own
-- clients (distinct from org/practice clients), track payment,
-- and set up recurring income/expense templates materialised
-- by a daily cron.
-- ============================================================

-- ── Freelancer clients ────────────────────────────────────

create table if not exists public.klippa_freelancer_clients (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  contact_person text,
  email          text,
  phone          text,
  vat_number     text,
  address        text,
  notes          text,
  status         text not null default 'active', -- active | archived
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Invoices ──────────────────────────────────────────────

create table if not exists public.klippa_invoices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  client_id         uuid not null references public.klippa_freelancer_clients(id) on delete restrict,
  invoice_number    integer not null,
  status            text not null default 'draft', -- draft | sent | paid | overdue | cancelled
  issue_date        date not null default current_date,
  due_date          date,
  currency          text not null default 'ZAR',
  vat_enabled       boolean not null default false,
  vat_rate          numeric(5,2) not null default 15,
  subtotal          numeric(15,2) not null default 0,
  vat_amount        numeric(15,2) not null default 0,
  total             numeric(15,2) not null default 0,
  notes             text,
  payment_reference text,
  sent_at           timestamptz,
  paid_at           timestamptz,
  income_record_id  uuid references public.klippa_income_records(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, invoice_number)
);

create table if not exists public.klippa_invoice_items (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.klippa_invoices(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  description text not null,
  quantity   numeric(12,2) not null default 1,
  unit_price numeric(15,2) not null default 0,
  amount     numeric(15,2) not null default 0,
  sort_order integer not null default 0
);

-- ── Recurring templates ───────────────────────────────────
-- Materialised into klippa_income_records / klippa_expense_records
-- by /api/cron/recurring (daily). capture_method = 'recurring'.

create table if not exists public.klippa_recurring_templates (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  kind                  text not null, -- income | expense
  source_name           text,          -- income: source; expense: merchant
  income_type           text,          -- income kinds (freelance | salary | ...)
  category              text,          -- expense category
  amount                numeric(15,2) not null,
  description           text,
  deductible_percentage numeric(5,2) not null default 100,
  day_of_month          integer not null default 1 check (day_of_month between 1 and 28),
  active                boolean not null default true,
  next_run              date not null,
  last_run              date,
  created_at            timestamptz not null default now()
);

-- ── RLS ───────────────────────────────────────────────────

alter table public.klippa_freelancer_clients  enable row level security;
alter table public.klippa_invoices            enable row level security;
alter table public.klippa_invoice_items       enable row level security;
alter table public.klippa_recurring_templates enable row level security;

create policy "klippa_freelancer_clients_self" on public.klippa_freelancer_clients
  for all using (user_id = auth.uid());

create policy "klippa_invoices_self" on public.klippa_invoices
  for all using (user_id = auth.uid());

create policy "klippa_invoice_items_self" on public.klippa_invoice_items
  for all using (user_id = auth.uid());

create policy "klippa_recurring_templates_self" on public.klippa_recurring_templates
  for all using (user_id = auth.uid());

-- ── Indexes ───────────────────────────────────────────────

create index if not exists idx_klippa_freelancer_clients_user
  on public.klippa_freelancer_clients(user_id, status);

create index if not exists idx_klippa_invoices_user_status
  on public.klippa_invoices(user_id, status, due_date);

create index if not exists idx_klippa_invoice_items_invoice
  on public.klippa_invoice_items(invoice_id);

create index if not exists idx_klippa_recurring_due
  on public.klippa_recurring_templates(active, next_run);
