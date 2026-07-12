-- 023: Gamification — XP events, levels, badges, quest progress.
--
-- Design:
--  * klippa_xp_catalog is server-authoritative: clients insert event KEYS,
--    the BEFORE trigger overwrites whatever xp they sent with the catalogue
--    value, so points cannot be forged beyond "earn each event once".
--  * klippa_xp_events PK (user_id, event_key) + FK to the catalogue makes
--    every award idempotent by schema — no application-level dedupe needed.
--  * first_* events are awarded by AFTER-INSERT triggers on the record
--    tables so every path (manual add, CSV import, recurring-template cron,
--    invoice pay) counts without client involvement. Trigger functions are
--    security definer and never reference auth.uid(), so service-role
--    inserts work.
--  * XP values must mirror lib/gamification.ts (DB wins via the trigger).

-- ── Catalogue ─────────────────────────────────────────────────────────
create table if not exists public.klippa_xp_catalog (
  event_key text primary key,
  xp        int  not null check (xp between 0 and 1000)
);

insert into public.klippa_xp_catalog (event_key, xp) values
  ('onboarding_complete',       25),
  ('first_income',              50),
  ('first_expense',             50),
  ('first_ai_confirmed',        40),
  ('first_document',            30),
  ('first_invoice',             40),
  ('first_mileage_trip',        30),
  ('answered_vehicle',          20),
  ('answered_work_location',    20),
  ('answered_products',         30),
  ('personal_details_complete', 25),
  ('home_office_setup',         40),
  ('vehicle_setup',             40),
  ('five_expenses',             40),
  ('tax_profile_complete',      75),
  ('return_filed',             150)
on conflict (event_key) do nothing;

-- ── Progress / events / badges ────────────────────────────────────────
create table if not exists public.klippa_user_progress (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  xp           int not null default 0,
  free_ai_used int not null default 0,          -- free-tier AI-classification taste counter
  last_level_celebrated int not null default 1, -- celebration dedupe
  has_income   boolean not null default false,  -- nav unlock inputs
  has_expense  boolean not null default false,
  has_document boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.klippa_xp_events (
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_key  text not null references public.klippa_xp_catalog(event_key),
  xp         int  not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, event_key)   -- idempotency: every event is one-time
);

create table if not exists public.klippa_user_badges (
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_id   text not null,
  earned_at  timestamptz not null default now(),
  celebrated boolean not null default false,
  primary key (user_id, badge_id)    -- idempotency
);

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.klippa_xp_catalog    enable row level security;
alter table public.klippa_user_progress enable row level security;
alter table public.klippa_xp_events     enable row level security;
alter table public.klippa_user_badges   enable row level security;

create policy xp_catalog_read     on public.klippa_xp_catalog    for select to authenticated using (true);
create policy progress_own_select on public.klippa_user_progress for select using (user_id = auth.uid());
create policy progress_own_insert on public.klippa_user_progress for insert with check (user_id = auth.uid());
create policy progress_own_update on public.klippa_user_progress for update using (user_id = auth.uid());
create policy xp_own_select       on public.klippa_xp_events     for select using (user_id = auth.uid());
create policy xp_own_insert       on public.klippa_xp_events     for insert with check (user_id = auth.uid());
-- xp_events: no update/delete policies — append-only
create policy badges_own_select   on public.klippa_user_badges   for select using (user_id = auth.uid());
create policy badges_own_insert   on public.klippa_user_badges   for insert with check (user_id = auth.uid());
create policy badges_own_update   on public.klippa_user_badges   for update using (user_id = auth.uid()); -- celebrated flag

-- ── XP triggers: force catalogue points, then roll up into progress ──
-- Two triggers, deliberately: a BEFORE-INSERT trigger fires before the
-- ON CONFLICT check, so a combined trigger would roll XP into progress
-- even for swallowed duplicates (double-count). BEFORE sets the points
-- (no side effects); AFTER fires only for rows actually inserted.
create or replace function public.klippa_xp_event_set_points()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  select xp into new.xp from klippa_xp_catalog where event_key = new.event_key;
  new.xp := coalesce(new.xp, 0);
  return new;
end $fn$;

create or replace function public.klippa_xp_event_rollup()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into klippa_user_progress (user_id, xp) values (new.user_id, new.xp)
  on conflict (user_id) do update
    set xp = klippa_user_progress.xp + excluded.xp, updated_at = now();
  return new;
end $fn$;

drop trigger if exists klippa_xp_events_set_points on public.klippa_xp_events;
create trigger klippa_xp_events_set_points
  before insert on public.klippa_xp_events
  for each row execute function public.klippa_xp_event_set_points();

drop trigger if exists klippa_xp_events_rollup on public.klippa_xp_events;
create trigger klippa_xp_events_rollup
  after insert on public.klippa_xp_events
  for each row execute function public.klippa_xp_event_rollup();

-- ── Record-derived events, awarded server-side ────────────────────────
create or replace function public.klippa_award_record_event()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.user_id is null then return new; end if;
  if tg_table_name = 'klippa_income_records' then
    insert into klippa_xp_events (user_id, event_key) values (new.user_id, 'first_income') on conflict do nothing;
    insert into klippa_user_progress (user_id, has_income) values (new.user_id, true)
      on conflict (user_id) do update set has_income = true, updated_at = now();
  elsif tg_table_name = 'klippa_expense_records' then
    insert into klippa_xp_events (user_id, event_key) values (new.user_id, 'first_expense') on conflict do nothing;
    insert into klippa_user_progress (user_id, has_expense) values (new.user_id, true)
      on conflict (user_id) do update set has_expense = true, updated_at = now();
    if (select count(*) from klippa_expense_records where user_id = new.user_id) >= 5 then
      insert into klippa_xp_events (user_id, event_key) values (new.user_id, 'five_expenses') on conflict do nothing;
    end if;
  elsif tg_table_name = 'klippa_documents' then
    insert into klippa_xp_events (user_id, event_key) values (new.user_id, 'first_document') on conflict do nothing;
    insert into klippa_user_progress (user_id, has_document) values (new.user_id, true)
      on conflict (user_id) do update set has_document = true, updated_at = now();
  elsif tg_table_name = 'klippa_mileage_trips' then
    insert into klippa_xp_events (user_id, event_key) values (new.user_id, 'first_mileage_trip') on conflict do nothing;
  elsif tg_table_name = 'klippa_invoices' then
    insert into klippa_xp_events (user_id, event_key) values (new.user_id, 'first_invoice') on conflict do nothing;
  end if;
  return new;
end $fn$;

drop trigger if exists klippa_income_gamify   on public.klippa_income_records;
drop trigger if exists klippa_expense_gamify  on public.klippa_expense_records;
drop trigger if exists klippa_document_gamify on public.klippa_documents;
drop trigger if exists klippa_mileage_gamify  on public.klippa_mileage_trips;
drop trigger if exists klippa_invoice_gamify  on public.klippa_invoices;
create trigger klippa_income_gamify   after insert on public.klippa_income_records  for each row execute function public.klippa_award_record_event();
create trigger klippa_expense_gamify  after insert on public.klippa_expense_records for each row execute function public.klippa_award_record_event();
create trigger klippa_document_gamify after insert on public.klippa_documents       for each row execute function public.klippa_award_record_event();
create trigger klippa_mileage_gamify  after insert on public.klippa_mileage_trips   for each row execute function public.klippa_award_record_event();
create trigger klippa_invoice_gamify  after insert on public.klippa_invoices        for each row execute function public.klippa_award_record_event();

-- ── Atomic free-AI counter (called from /api/expenses) ────────────────
create or replace function public.klippa_increment_free_ai(uid uuid)
returns int language plpgsql security definer set search_path = public as $fn$
declare v int;
begin
  if uid <> auth.uid() then raise exception 'forbidden'; end if;
  insert into klippa_user_progress (user_id, free_ai_used) values (uid, 1)
  on conflict (user_id) do update set free_ai_used = klippa_user_progress.free_ai_used + 1, updated_at = now()
  returning free_ai_used into v;
  return v;
end $fn$;

-- ── Backfill: seed progress rows for existing users ───────────────────
insert into public.klippa_user_progress (user_id, has_income, has_expense, has_document)
select p.id,
  exists(select 1 from klippa_income_records  i where i.user_id = p.id),
  exists(select 1 from klippa_expense_records e where e.user_id = p.id),
  exists(select 1 from klippa_documents       d where d.user_id = p.id)
from klippa_profiles p
on conflict (user_id) do nothing;

-- ── Function hardening (applied to prod as 023b/023c) ─────────────────
-- Trigger functions can never be called directly, and the RPC guards
-- uid = auth.uid(), but anon/public have no reason to hold EXECUTE.
revoke execute on function public.klippa_xp_event_set_points()     from public, anon, authenticated;
revoke execute on function public.klippa_xp_event_rollup()         from public, anon, authenticated;
revoke execute on function public.klippa_award_record_event()      from public, anon, authenticated;
revoke execute on function public.klippa_increment_free_ai(uuid)   from public, anon;
