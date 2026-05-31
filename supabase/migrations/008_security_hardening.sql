-- ===== Klippa security hardening (Supabase advisor remediation) =====
-- Applied live to project soiymskxrtbeszgwigpw via apply_migration
-- (migration name: klippa_security_hardening).

-- #1: Remove "service_role_all_*" policies that were defined TO public USING(true),
-- which exposed every org's payroll/contracts/compliance through the direct
-- PostgREST/GraphQL API. These tables are accessed only via the service-role
-- client (which bypasses RLS), so dropping the policies leaves default-deny for
-- anon/authenticated while the app keeps working.
drop policy if exists service_role_all_compliance on public.klippa_consultant_compliance;
drop policy if exists service_role_all_contracts  on public.klippa_consultant_contracts;
drop policy if exists service_role_all_payroll    on public.klippa_payroll_periods;

-- #2: Enable RLS on klippa_tier_features (was fully open to read/write via the API).
-- Read-only for authenticated; all writes go through the service-role.
alter table public.klippa_tier_features enable row level security;
drop policy if exists tier_features_read on public.klippa_tier_features;
create policy tier_features_read on public.klippa_tier_features
  for select to authenticated using (true);

-- #3: Lock down Klippa SECURITY DEFINER functions from direct /rpc abuse + pin
-- search_path. (clipper-app functions check_clipper_job_limit/is_clipper_admin are
-- intentionally left to the sibling app's owner to avoid breaking its RLS.)
revoke execute on function public.handle_new_klippa_user()   from public, anon, authenticated;
revoke execute on function public.increment_promo_used(uuid)  from public, anon, authenticated;
grant  execute on function public.increment_promo_used(uuid)  to service_role;
alter  function public.increment_promo_used(uuid) set search_path = public, pg_temp;
-- Harden trigger-helper search_path (safe: they only set NEW.updated_at).
alter function public.klippa_set_updated_at()    set search_path = '';
alter function public.set_updated_at()           set search_path = '';
alter function public.update_updated_at_column() set search_path = '';

-- #4: Remove the broad public SELECT (list) policy on the public org-assets bucket.
-- Public object URLs still resolve via the CDN; only directory listing is removed.
drop policy if exists klippa_org_assets_public_read on storage.objects;
