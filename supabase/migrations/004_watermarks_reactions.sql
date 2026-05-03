-- ============================================================
-- Klippa: Watermarks + Reaction Videos (Premium Features)
-- ============================================================

-- 1. Watermarks table
create table if not exists clipper_user_watermarks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  name          text not null,
  storage_path  text not null,
  position      text not null default 'bottom-right'
                  check (position in ('top-left','top-right','bottom-left','bottom-right')),
  opacity       numeric(3,2) not null default 0.80
                  check (opacity >= 0 and opacity <= 1),
  scale         numeric(3,2) not null default 0.15
                  check (scale > 0 and scale <= 1),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table clipper_user_watermarks enable row level security;

create policy "watermarks_owner" on clipper_user_watermarks
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Only one default watermark per user
create unique index clipper_user_watermarks_one_default
  on clipper_user_watermarks (user_id)
  where is_default = true;

-- 2. Reaction videos table
create table if not exists clipper_user_reactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  name            text not null,
  storage_path    text not null,
  thumbnail_path  text,
  duration_sec    numeric(4,1) check (duration_sec > 0 and duration_sec <= 5),
  created_at      timestamptz not null default now()
);

alter table clipper_user_reactions enable row level security;

create policy "reactions_owner" on clipper_user_reactions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Add 'premium' plan to clipper_user_profiles if the check constraint exists
-- (no-op if the column is plain text without a constraint)
-- alter table clipper_user_profiles drop constraint if exists clipper_user_profiles_plan_check;
-- alter table clipper_user_profiles add constraint clipper_user_profiles_plan_check
--   check (plan in ('free', 'premium', 'admin'));

-- ──────────────────────────────────────────────────────────────
-- Storage buckets + policies
-- Run these via Supabase dashboard > Storage, then SQL editor
-- ──────────────────────────────────────────────────────────────

-- INSERT INTO storage.buckets (id, name, public) VALUES ('clipper_watermarks', 'clipper_watermarks', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('clipper_reaction_videos', 'clipper_reaction_videos', false) ON CONFLICT DO NOTHING;

-- create policy "watermarks_storage" on storage.objects for all
--   using (bucket_id = 'clipper_watermarks' and auth.uid()::text = (storage.foldername(name))[1])
--   with check (bucket_id = 'clipper_watermarks' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "reactions_storage" on storage.objects for all
--   using (bucket_id = 'clipper_reaction_videos' and auth.uid()::text = (storage.foldername(name))[1])
--   with check (bucket_id = 'clipper_reaction_videos' and auth.uid()::text = (storage.foldername(name))[1]);
