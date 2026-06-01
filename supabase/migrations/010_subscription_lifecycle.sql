-- ============================================================
-- Klippa — Subscription lifecycle management
-- 1. seat_access_until: per-member custom end date (nullable)
-- 2. klippa_leads: off-system request tracking
-- 3. pg_cron: nightly expiry enforcement (02:00 UTC = 04:00 SAST)
-- ============================================================

-- ── 1. Per-member seat access window ─────────────────────────
-- NULL = covered by org subscription_ends_at (default)
-- Set by org admin when inviting with a fixed contract end date
alter table public.klippa_profiles
  add column if not exists seat_access_until timestamptz;

-- ── 2. Leads table for off-system requests ───────────────────
-- Used for: custom org pricing, seat reassignment, other manual ops
create table if not exists public.klippa_leads (
  id              uuid primary key default gen_random_uuid(),
  lead_type       text not null,          -- 'custom_org_pricing' | 'seat_reassignment' | 'renewal_reminder'
  organisation_id uuid references public.klippa_organisations(id) on delete set null,
  submitted_by    uuid references auth.users(id) on delete set null,
  contact_email   text,
  notes           text,
  metadata        jsonb,
  status          text not null default 'new',  -- new | contacted | resolved
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RLS: leads are write-only for authenticated users; only service role reads
alter table public.klippa_leads enable row level security;

create policy "users can create leads"
  on public.klippa_leads for insert
  to authenticated
  with check (submitted_by = auth.uid());

-- ── 3. Expiry enforcement via pg_cron ────────────────────────
-- Requires pg_cron extension (available on all Supabase projects)
create extension if not exists pg_cron;

-- Remove any existing job with this name before re-scheduling
select cron.unschedule('klippa-expire-subscriptions')
where exists (
  select 1 from cron.job where jobname = 'klippa-expire-subscriptions'
);

-- Nightly at 02:00 UTC (04:00 SAST, no DST adjustment needed — SA is UTC+2 fixed)
select cron.schedule(
  'klippa-expire-subscriptions',
  '0 2 * * *',
  $sql$
    -- 1. Expire solo user subscriptions
    update public.klippa_profiles
    set subscription_tier    = 'free',
        subscription_ends_at = null,
        updated_at           = now()
    where subscription_tier  != 'free'
      and subscription_ends_at is not null
      and subscription_ends_at < now();

    -- 2. Expire org-level subscriptions
    update public.klippa_organisations
    set subscription_status = 'expired',
        updated_at          = now()
    where subscription_status = 'active'
      and subscription_ends_at is not null
      and subscription_ends_at < now();

    -- 3. Expire per-member custom seat access windows
    --    The member keeps their organisation_id (data stays linked) but their
    --    seat_access_until being in the past signals expired access to feature gates.
    --    We null it out here — the nightly job will also create a lead for follow-up.
    update public.klippa_profiles
    set seat_access_until = null,
        updated_at        = now()
    where organisation_id  is not null
      and org_role          = 'member'
      and seat_access_until is not null
      and seat_access_until < now();

    -- 4. Mark subscription rows as expired
    update public.klippa_subscriptions
    set status     = 'expired',
        updated_at = now()
    where status   = 'active'
      and current_period_end is not null
      and current_period_end < now();
  $sql$
);

-- 14-day renewal reminder — fires at 08:00 UTC daily
-- Creates a lead row for each solo user expiring within 14 days who has no lead yet
select cron.unschedule('klippa-renewal-reminders')
where exists (
  select 1 from cron.job where jobname = 'klippa-renewal-reminders'
);

select cron.schedule(
  'klippa-renewal-reminders',
  '0 8 * * *',
  $sql$
    insert into public.klippa_leads (lead_type, submitted_by, metadata, status)
    select
      'renewal_reminder',
      p.id,
      jsonb_build_object(
        'subscription_tier',    p.subscription_tier,
        'subscription_ends_at', p.subscription_ends_at,
        'days_remaining',       extract(day from (p.subscription_ends_at - now()))
      ),
      'new'
    from public.klippa_profiles p
    where p.subscription_tier != 'free'
      and p.subscription_ends_at is not null
      and p.subscription_ends_at > now()
      and p.subscription_ends_at <= now() + interval '14 days'
      -- Avoid duplicate reminders — don't insert if a reminder lead already exists for today
      and not exists (
        select 1 from public.klippa_leads l
        where l.lead_type    = 'renewal_reminder'
          and l.submitted_by = p.id
          and l.created_at   >= now() - interval '24 hours'
      );
  $sql$
);
