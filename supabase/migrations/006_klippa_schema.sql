-- ============================================================
-- Klippa Tax Platform Schema
-- All tables prefixed klippa_ to avoid collisions
-- ============================================================

-- User tax profiles (one per user, linked to auth.users)
create table if not exists public.klippa_profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text,
  tax_number          text,
  id_number           text,
  employment_type     text not null default 'freelance', -- freelance | employee | mixed
  works_from_home     boolean not null default false,
  home_office_pct     numeric(5,2) default 0,           -- % of home used for work
  has_vehicle         boolean not null default false,
  has_ra              boolean not null default false,    -- retirement annuity
  tax_year            integer not null default 2025,     -- e.g. 2025 = March 2024–Feb 2025
  subscription_tier   text not null default 'free',      -- free | starter | professional
  onboarding_complete boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Tax returns (one per user per year per type)
create table if not exists public.klippa_tax_returns (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  tax_year          integer not null,
  return_type       text not null default 'ITR12',  -- ITR12 | IRP6
  status            text not null default 'draft',  -- draft | ready | submitted | assessed
  gross_income      numeric(15,2) not null default 0,
  total_deductions  numeric(15,2) not null default 0,
  taxable_income    numeric(15,2) not null default 0,
  tax_payable       numeric(15,2) not null default 0,
  rebates           numeric(15,2) not null default 0,
  net_tax_payable   numeric(15,2) not null default 0,
  sars_reference    text,
  submitted_at      timestamptz,
  assessed_at       timestamptz,
  refund_amount     numeric(15,2),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, tax_year, return_type)
);

-- Income records
create table if not exists public.klippa_income_records (
  id              uuid primary key default gen_random_uuid(),
  tax_return_id   uuid references public.klippa_tax_returns(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  source_name     text not null,
  income_type     text not null default 'freelance', -- freelance | salary | interest | rental | commission | other
  amount          numeric(15,2) not null,
  received_date   date,
  description     text,
  capture_method  text not null default 'manual',   -- manual | irp5_ocr | csv_import
  created_at      timestamptz not null default now()
);

-- Expense records
create table if not exists public.klippa_expense_records (
  id                      uuid primary key default gen_random_uuid(),
  tax_return_id           uuid references public.klippa_tax_returns(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  category                text not null default 'other',
  -- phone_internet | home_office | vehicle_travel | equipment | software_subscriptions
  -- client_entertainment | professional_fees | training | marketing
  -- bank_charges | insurance | stationery | other
  description             text,
  merchant_name           text,
  amount                  numeric(15,2) not null,
  deductible_percentage   numeric(5,2) not null default 100,
  deductible_amount       numeric(15,2) generated always as (amount * deductible_percentage / 100) stored,
  expense_date            date,
  receipt_id              uuid,  -- FK to klippa_documents added below
  classification_status   text not null default 'pending', -- pending | confirmed | rejected
  ai_confidence           text,   -- high | medium | low
  ai_reasoning            text,
  ai_audit_risk           text,   -- high | medium | low
  capture_method          text not null default 'manual',  -- manual | csv_import | receipt_upload
  created_at              timestamptz not null default now()
);

-- Documents (uploaded files: receipts, IRP5, bank statements, etc.)
create table if not exists public.klippa_documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  tax_return_id     uuid references public.klippa_tax_returns(id) on delete set null,
  document_type     text not null default 'receipt',
  -- receipt | irp5 | bank_statement | invoice | medical | ra_certificate | other
  original_filename text,
  storage_path      text,
  file_size_bytes   integer,
  file_hash         text,           -- SHA-256 for duplicate detection
  ocr_status        text not null default 'pending', -- pending | processing | complete | failed
  ocr_confidence    numeric(5,2),
  extracted_data    jsonb,
  tax_year          integer,
  upload_method     text not null default 'upload',  -- upload | camera
  created_at        timestamptz not null default now()
);

-- Add FK from expense_records → documents now that documents table exists
alter table public.klippa_expense_records
  add constraint fk_klippa_expense_receipt
  foreign key (receipt_id) references public.klippa_documents(id) on delete set null;

-- Mileage trips
create table if not exists public.klippa_mileage_trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  tax_return_id    uuid references public.klippa_tax_returns(id) on delete cascade,
  trip_date        date not null,
  start_location   text,
  end_location     text,
  distance_km      numeric(8,2) not null,
  purpose          text not null,
  trip_type        text not null default 'business', -- business | private
  deductible_amount numeric(15,2),
  created_at       timestamptz not null default now()
);

-- ============================================================
-- Row-Level Security
-- ============================================================

alter table public.klippa_profiles       enable row level security;
alter table public.klippa_tax_returns    enable row level security;
alter table public.klippa_income_records enable row level security;
alter table public.klippa_expense_records enable row level security;
alter table public.klippa_documents      enable row level security;
alter table public.klippa_mileage_trips  enable row level security;

-- klippa_profiles: users access own row
create policy "klippa_profiles_self" on public.klippa_profiles
  for all using (id = auth.uid());

-- klippa_tax_returns: users access own rows
create policy "klippa_tax_returns_self" on public.klippa_tax_returns
  for all using (user_id = auth.uid());

-- klippa_income_records
create policy "klippa_income_self" on public.klippa_income_records
  for all using (user_id = auth.uid());

-- klippa_expense_records
create policy "klippa_expense_self" on public.klippa_expense_records
  for all using (user_id = auth.uid());

-- klippa_documents
create policy "klippa_documents_self" on public.klippa_documents
  for all using (user_id = auth.uid());

-- klippa_mileage_trips
create policy "klippa_mileage_self" on public.klippa_mileage_trips
  for all using (user_id = auth.uid());

-- ============================================================
-- Indexes for common query patterns
-- ============================================================

create index if not exists idx_klippa_income_user_return
  on public.klippa_income_records(user_id, tax_return_id);

create index if not exists idx_klippa_expense_user_return
  on public.klippa_expense_records(user_id, tax_return_id);

create index if not exists idx_klippa_documents_user
  on public.klippa_documents(user_id, tax_year);

create index if not exists idx_klippa_mileage_user
  on public.klippa_mileage_trips(user_id, tax_return_id);

-- ============================================================
-- Auto-update updated_at triggers
-- ============================================================

create or replace function public.klippa_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger klippa_profiles_updated_at
  before update on public.klippa_profiles
  for each row execute function public.klippa_set_updated_at();

create trigger klippa_tax_returns_updated_at
  before update on public.klippa_tax_returns
  for each row execute function public.klippa_set_updated_at();
