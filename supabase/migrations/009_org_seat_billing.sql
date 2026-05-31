-- ===== Klippa B2B seat-billing support =====
-- Applied live to project soiymskxrtbeszgwigpw via apply_migration
-- (migration name: klippa_org_seat_billing).
--
-- A subscription row can now belong to an organisation (a seat purchase) rather
-- than only to an individual user. Orgs carry their own paid status + expiry so
-- the soft payment gate can check entitlement without touching the owner's
-- personal (free) tier. Invited members are covered by the org's seats and are
-- never charged or prompted to pay.

alter table public.klippa_subscriptions
  add column if not exists organisation_id uuid references public.klippa_organisations(id) on delete set null,
  add column if not exists seats integer not null default 1;

alter table public.klippa_organisations
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_ends_at timestamptz;

-- Helpful for webhook lookups that activate an org by its pending subscription.
create index if not exists klippa_subscriptions_org_idx
  on public.klippa_subscriptions (organisation_id);
