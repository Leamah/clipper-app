-- ============================================================
-- Migration 017 - FINscope Invest moat hardening
-- Repairs the v1 Invest schema so the admin Yahoo Finance sync
-- and gated product flows can run against the deployed DB.
-- ============================================================

alter table public.klippa_invest_companies
  add column if not exists yahoo_ticker text,
  add column if not exists is_tracked boolean not null default true,
  add column if not exists last_synced_at timestamptz;

update public.klippa_invest_companies
set yahoo_ticker = coalesce(yahoo_ticker, code || '.JO')
where yahoo_ticker is null;

create index if not exists invest_companies_tracked
  on public.klippa_invest_companies (is_tracked, code);

alter table public.klippa_invest_financials
  drop constraint if exists klippa_invest_financials_source_check;

alter table public.klippa_invest_financials
  add constraint klippa_invest_financials_source_check
  check (source in ('sharedata','manual','pdf_extract','yahoo_finance'));

create index if not exists invest_rec_log_user_source_time
  on public.klippa_invest_recommendations_log (user_id, source, surfaced_at desc);

create index if not exists invest_gains_user_year
  on public.klippa_invest_realised_gains (user_id, tax_year);

create index if not exists invest_dividends_user_year
  on public.klippa_invest_dividends (user_id, tax_year);
