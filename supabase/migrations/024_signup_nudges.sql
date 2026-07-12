-- 024: Abandoned-signup nudge tracking.
--
-- Two nullable timestamps on klippa_profiles, set once each stage is
-- resolved (email sent OR the user progressed past that stage on their
-- own) so the daily cron (/api/cron/nudge-signups) never re-processes a
-- row or double-sends. NULL = still pending that stage.

alter table public.klippa_profiles
  add column if not exists verify_nudge_sent_at     timestamptz,
  add column if not exists onboarding_nudge_sent_at  timestamptz;
