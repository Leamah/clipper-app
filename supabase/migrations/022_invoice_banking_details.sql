-- Free-text banking/payment details printed on freelancer invoices
alter table public.klippa_profiles
  add column if not exists invoice_banking_details text;
