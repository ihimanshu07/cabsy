-- CABSY driver identity-reference migration.
-- Store only the Aadhaar last four digits; do not store full Aadhaar numbers or identity-document images.
alter table public.driver_applications
  add column if not exists aadhaar_last_four char(4),
  add column if not exists aadhaar_confirmed boolean not null default false;

alter table public.driver_applications
  drop constraint if exists driver_applications_aadhaar_last_four_check;
alter table public.driver_applications
  add constraint driver_applications_aadhaar_last_four_check
  check (aadhaar_last_four is null or aadhaar_last_four ~ '^[0-9]{4}$');

comment on column public.driver_applications.aadhaar_last_four is 'Last four Aadhaar digits for driver application identity reference; full Aadhaar number is intentionally not stored';
comment on column public.driver_applications.aadhaar_confirmed is 'Applicant confirms the Aadhaar reference supplied belongs to them';
