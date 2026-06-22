-- ============================================================
-- 019 — Practice templates and reminder history
-- Reusable checklist templates plus reminder audit history.
-- ============================================================

create table if not exists public.klippa_practice_checklist_templates (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid references public.klippa_organisations(id) on delete cascade,
  name                  text not null,
  return_type           text not null,
  entity_type           text,
  description           text,
  checklist             jsonb not null default '[]'::jsonb,
  reminder_cadence_days integer,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_klippa_practice_templates_org
  on public.klippa_practice_checklist_templates(organisation_id, return_type, entity_type);

alter table public.klippa_practice_checklist_templates enable row level security;

insert into public.klippa_practice_checklist_templates (
  organisation_id, name, return_type, entity_type, description, checklist, reminder_cadence_days
)
values
  (
    null,
    'Salary ITR12',
    'ITR12',
    'individual',
    'Employees with salary income, medical aid, RA, and interest certificates.',
    '[
      {"id":"itr12-irp5","label":"IRP5 / IT3(a)","received":false},
      {"id":"itr12-bank","label":"Bank interest certificates","received":false},
      {"id":"itr12-medical","label":"Medical aid tax certificate","received":false},
      {"id":"itr12-ra","label":"RA / pension contribution certificate","received":false},
      {"id":"itr12-id","label":"ID copy and proof of address","received":false}
    ]'::jsonb,
    5
  ),
  (
    null,
    'Provisional taxpayer ITR12',
    'ITR12',
    'sole_prop',
    'Freelancers or sole props with business expenses and supporting records.',
    '[
      {"id":"prov-income","label":"Income summary or bank statement export","received":false},
      {"id":"prov-expenses","label":"Expense support and receipts","received":false},
      {"id":"prov-logbook","label":"Vehicle logbook or mileage evidence","received":false},
      {"id":"prov-medical","label":"Medical aid / insurance certificates","received":false},
      {"id":"prov-id","label":"Tax number and SARS correspondence","received":false}
    ]'::jsonb,
    4
  ),
  (
    null,
    'Company ITR14',
    'ITR14',
    'company',
    'Core annual company tax pack for SMEs.',
    '[
      {"id":"itr14-afs","label":"Annual financial statements","received":false},
      {"id":"itr14-trial","label":"Trial balance / ledger export","received":false},
      {"id":"itr14-bank","label":"Bank confirmations and interest certificates","received":false},
      {"id":"itr14-dividends","label":"Dividend / loan account schedules","received":false},
      {"id":"itr14-cor","label":"CIPC / company registration documents","received":false}
    ]'::jsonb,
    7
  )
on conflict do nothing;

create table if not exists public.klippa_practice_reminder_events (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.klippa_organisations(id) on delete cascade,
  client_id       uuid not null references public.klippa_practice_clients(id) on delete cascade,
  return_id       uuid not null references public.klippa_practice_returns(id) on delete cascade,
  channel         text not null default 'email',
  recipient_email text,
  template_name   text,
  sent_by         uuid references auth.users(id) on delete set null,
  sent_at         timestamptz not null default now()
);

create index if not exists idx_klippa_practice_reminders_return
  on public.klippa_practice_reminder_events(return_id, sent_at desc);

alter table public.klippa_practice_reminder_events enable row level security;
