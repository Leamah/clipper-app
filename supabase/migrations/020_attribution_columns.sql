-- First-party marketing attribution: capture first-touch UTM/gclid params
-- on signup so GTM campaign performance can be measured against actual
-- conversions, without a third-party analytics dependency (GA4 etc.).
alter table public.klippa_profiles
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists gclid        text,
  add column if not exists landing_page text;
