create table if not exists public.account_recovery_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  contact_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_recovery_contacts_email_length
    check (char_length(contact_email) between 3 and 254),
  constraint account_recovery_contacts_email_format
    check (contact_email = lower(btrim(contact_email))
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

alter table public.account_recovery_contacts enable row level security;

revoke all on table public.account_recovery_contacts from anon, authenticated;
grant select, insert, update, delete on table public.account_recovery_contacts to service_role;

comment on table public.account_recovery_contacts is
  'Private recovery email destinations. Access only through server-side service-role routes.';
