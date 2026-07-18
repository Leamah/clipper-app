-- ── Free-tier receipt-scan taste counter ──────────────────────────────
-- Mirrors the free_ai_used pattern (023): free users get a lifetime taste
-- of OCR receipt capture before the Starter gate, tracked atomically.

alter table public.klippa_user_progress
  add column if not exists free_scans_used int not null default 0;

create or replace function public.klippa_increment_free_scans(uid uuid)
returns int language plpgsql security definer set search_path = public as $fn$
declare v int;
begin
  if uid <> auth.uid() then raise exception 'forbidden'; end if;
  insert into klippa_user_progress (user_id, free_scans_used) values (uid, 1)
  on conflict (user_id) do update set free_scans_used = klippa_user_progress.free_scans_used + 1, updated_at = now()
  returning free_scans_used into v;
  return v;
end $fn$;

revoke execute on function public.klippa_increment_free_scans(uuid) from public, anon;
