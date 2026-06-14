-- ============================================================
-- Migration 016 — FINscope Invest Module
-- Adds invest opt-in flag, feature flags, persona columns to
-- klippa_profiles, plus all new klippa_invest_* tables.
-- ============================================================

-- 1. Extend klippa_profiles
alter table public.klippa_profiles
  add column if not exists invest_enabled        boolean not null default false,
  add column if not exists feature_invest_basic  boolean not null default false,
  add column if not exists feature_invest_full   boolean not null default false,
  add column if not exists invest_persona        text check (invest_persona in ('beginner','novice','prosumer')),
  add column if not exists invest_goal           text,
  add column if not exists invest_horizon        text check (invest_horizon in ('3m','6m','1y','3y','5y_plus')),
  add column if not exists invest_risk_band      text check (invest_risk_band in ('conservative','balanced','aggressive'));

-- 2. JSE listing reference data (read-public, write-service-role)
create table if not exists public.klippa_invest_companies (
  code           text primary key,
  name           text not null,
  sector         text,
  industry       text,
  listed_at      date,
  fiscal_year_end text,
  auditor        text,
  market_cap_zar numeric,
  is_altx        boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- Public read, no write via anon/authenticated
alter table public.klippa_invest_companies enable row level security;
create policy "invest_companies_read" on public.klippa_invest_companies
  for select using (true);

-- 3. IFRS-normalised financials per company per fiscal year
create table if not exists public.klippa_invest_financials (
  company_code      text not null references public.klippa_invest_companies(code) on delete cascade,
  fiscal_year       integer not null,
  income_statement  jsonb not null default '{}'::jsonb,
  balance_sheet     jsonb not null default '{}'::jsonb,
  cash_flow         jsonb not null default '{}'::jsonb,
  source            text not null check (source in ('sharedata','manual','pdf_extract')),
  ingested_at       timestamptz not null default now(),
  primary key (company_code, fiscal_year)
);

alter table public.klippa_invest_financials enable row level security;
create policy "invest_financials_read" on public.klippa_invest_financials
  for select using (true);

-- 4. Cached 13-module analysis runs (7-day TTL)
create table if not exists public.klippa_invest_analysis_runs (
  id                  uuid primary key default gen_random_uuid(),
  company_code        text not null references public.klippa_invest_companies(code) on delete cascade,
  fiscal_year_range   text not null,
  module_outputs      jsonb not null default '{}'::jsonb,
  ai_commentary       jsonb not null default '{}'::jsonb,
  health_score        integer,
  going_concern_score integer,
  computed_at         timestamptz not null default now()
);

create index if not exists invest_analysis_runs_lookup
  on public.klippa_invest_analysis_runs (company_code, fiscal_year_range);

alter table public.klippa_invest_analysis_runs enable row level security;
create policy "invest_analysis_read" on public.klippa_invest_analysis_runs
  for select using (true);

-- 5. User watchlist (RLS = user_id)
create table if not exists public.klippa_invest_watchlist (
  user_id              uuid not null references auth.users(id) on delete cascade,
  company_code         text not null references public.klippa_invest_companies(code) on delete cascade,
  added_at             timestamptz not null default now(),
  sens_alerts_enabled  boolean not null default true,
  primary key (user_id, company_code)
);

create index if not exists invest_watchlist_user on public.klippa_invest_watchlist (user_id);

alter table public.klippa_invest_watchlist enable row level security;
create policy "invest_watchlist_self" on public.klippa_invest_watchlist
  for all using (user_id = auth.uid());

-- 6. Portfolio + holdings (RLS = user_id)
create table if not exists public.klippa_invest_portfolios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.klippa_invest_portfolios enable row level security;
create policy "invest_portfolios_self" on public.klippa_invest_portfolios
  for all using (user_id = auth.uid());

create table if not exists public.klippa_invest_holdings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  portfolio_id     uuid not null references public.klippa_invest_portfolios(id) on delete cascade,
  company_code     text not null references public.klippa_invest_companies(code),
  shares           numeric not null,
  cost_basis_zar   numeric not null,
  acquired_at      date not null,
  in_tfsa          boolean not null default false,
  closed_at        date,
  closed_price_zar numeric
);

alter table public.klippa_invest_holdings enable row level security;
create policy "invest_holdings_self" on public.klippa_invest_holdings
  for all using (user_id = auth.uid());

-- 7. Recommendations log / behavioural moat
create table if not exists public.klippa_invest_recommendations_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  surfaced_at      timestamptz not null default now(),
  source           text not null check (source in ('compass','philosophy','screener','sens')),
  philosophy       text,
  company_code     text references public.klippa_invest_companies(code),
  rationale_payload jsonb not null default '{}'::jsonb,
  user_action      text check (user_action in ('viewed_detail','added_watchlist','simulated_buy','dismissed','how_to_buy_clicked')),
  acted_at         timestamptz
);

alter table public.klippa_invest_recommendations_log enable row level security;
create policy "invest_rec_log_self" on public.klippa_invest_recommendations_log
  for all using (user_id = auth.uid());

-- 8. SENS events (public read)
create table if not exists public.klippa_invest_sens_events (
  id                       uuid primary key default gen_random_uuid(),
  company_code             text not null references public.klippa_invest_companies(code) on delete cascade,
  sens_id                  text not null unique,
  category                 text,
  published_at             timestamptz not null,
  pdf_url                  text,
  extracted_payload        jsonb,
  re_analysis_triggered_at timestamptz,
  alerts_dispatched_at     timestamptz,
  alerts_dispatched_count  integer
);

create index if not exists invest_sens_events_pub on public.klippa_invest_sens_events (published_at desc);

alter table public.klippa_invest_sens_events enable row level security;
create policy "invest_sens_read" on public.klippa_invest_sens_events
  for select using (true);

-- 9. Dividend receipts (feeds back into ITR12)
create table if not exists public.klippa_invest_dividends (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  holding_id      uuid references public.klippa_invest_holdings(id) on delete set null,
  company_code    text not null references public.klippa_invest_companies(code),
  amount_zar      numeric not null,
  dwt_withheld_zar numeric not null default 0,
  received_at     date not null,
  tax_year        integer not null
);

alter table public.klippa_invest_dividends enable row level security;
create policy "invest_dividends_self" on public.klippa_invest_dividends
  for all using (user_id = auth.uid());

-- 10. Realised capital gains (feeds back into ITR12)
create table if not exists public.klippa_invest_realised_gains (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  holding_id   uuid references public.klippa_invest_holdings(id) on delete set null,
  company_code text not null references public.klippa_invest_companies(code),
  gain_zar     numeric not null,
  closed_at    date not null,
  tax_year     integer not null,
  in_tfsa      boolean not null
);

alter table public.klippa_invest_realised_gains enable row level security;
create policy "invest_gains_self" on public.klippa_invest_realised_gains
  for all using (user_id = auth.uid());

-- 11. Add invest_basic + invest_full rows to tier features table
-- Only insert if these rows don't already exist
insert into public.klippa_tier_features (tier, feature_key, enabled)
values
  ('free',         'invest_basic', true),
  ('starter',      'invest_basic', true),
  ('professional', 'invest_basic', true),
  ('admin',        'invest_basic', true),
  ('free',         'invest_full',  false),
  ('starter',      'invest_full',  true),
  ('professional', 'invest_full',  true),
  ('admin',        'invest_full',  true)
on conflict (tier, feature_key) do nothing;
