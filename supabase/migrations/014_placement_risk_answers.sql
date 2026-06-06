-- ===== Placement labour-risk questionnaire =====
-- Stores contracting-house answers used to flag contractor-vs-employee risk.

alter table public.klippa_org_placements
  add column if not exists risk_answers jsonb not null default '{}'::jsonb;
