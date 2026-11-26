-- Staged schema: the validation runner generates a migration using Supabase CLI.
-- No remote database changes are performed by this branch.
alter table public.account_recovery_contacts
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_required boolean not null default false;

create or replace function app_private.clear_changed_recovery_email_verification()
returns trigger language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  if old.email_verification_required then
    new.email_verification_required := true;
  end if;
  if new.contact_email is distinct from old.contact_email then
    new.email_verified_at := null;
  end if;
  return new;
end;
$$;
revoke all on function app_private.clear_changed_recovery_email_verification() from public, anon, authenticated;
create trigger clear_changed_recovery_email_verification
before update on public.account_recovery_contacts
for each row execute function app_private.clear_changed_recovery_email_verification();

create table public.registration_email_challenges (
  id uuid primary key default gen_random_uuid(),
  session_digest text not null unique check (session_digest ~ '^[0-9a-f]{64}$'),
  link_digest text not null unique check (link_digest ~ '^[0-9a-f]{64}$'),
  code_digest text not null check (code_digest ~ '^[0-9a-f]{64}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  account_code text not null check (account_code ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  source_digest text not null default '' check (source_digest = '' or source_digest ~ '^[0-9a-f]{64} (char_length(contact_email) between 3 and 254
    and contact_email = lower(btrim(contact_email))
    and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null default 'pending' check (status in ('pending','verified','consumed','invalidated','locked')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  verified_at timestamptz
);
alter table public.registration_email_challenges enable row level security;
revoke all on table public.registration_email_challenges from public, anon, authenticated;
grant select, insert, update, delete on table public.registration_email_challenges to service_role;
create index registration_email_challenges_created_idx on public.registration_email_challenges (created_at);
create index registration_email_challenges_email_created_idx on public.registration_email_challenges (contact_email, created_at);

-- Serialize quota checks, including concurrent requests to distinct addresses.
create function public.registration_email_start(
  p_old_session text, p_session text, p_link text, p_code text,
  p_display_name text, p_account_code text, p_contact_email text, p_source text
) returns text language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(74190261);
  delete from public.registration_email_challenges where created_at < now() - interval '2 days';
  if (select count(*) from public.registration_email_challenges where created_at > now() - interval '24 hours') >= 30 then
    return 'daily_limit';
  end if;
  if p_source <> '' and (select count(*) from public.registration_email_challenges
    where source_digest = p_source and created_at > now() - interval '10 minutes') >= 15 then
    return 'source_limit';
  end if;
  if exists(select 1 from public.registration_email_challenges
    where contact_email = p_contact_email and created_at > now() - interval '60 seconds') then
    return 'cooldown';
  end if;
  if (select count(*) from public.registration_email_challenges
    where contact_email = p_contact_email and created_at > now() - interval '1 hour') >= 5 then
    return 'hourly_limit';
  end if;
  if exists(select 1 from public.registration_email_challenges where session_digest = p_old_session
    and created_at > now() - interval '60 seconds') then
    return 'cooldown';
  end if;
  update public.registration_email_challenges set status = 'invalidated'
    where session_digest = p_old_session and status in ('pending','verified');
  insert into public.registration_email_challenges
    (session_digest, link_digest, code_digest, display_name, account_code, contact_email, source_digest)
    values (p_session, p_link, p_code, p_display_name, p_account_code, p_contact_email, p_source);
  return 'created';
end;
$$;

-- The row lock makes the attempt count and both redemption paths atomic.
create function public.registration_email_verify_code(p_session text, p_code text)
returns text language plpgsql security invoker set search_path = pg_catalog
as $$
declare challenge public.registration_email_challenges%rowtype;
begin
  select * into challenge from public.registration_email_challenges
    where session_digest = p_session for update;
  if not found then return 'invalid'; end if;
  if challenge.status <> 'pending' or challenge.expires_at <= now() then return 'expired'; end if;
  if challenge.code_digest = p_code then
    update public.registration_email_challenges set status = 'verified', verified_at = now(),
      expires_at = now() + interval '30 minutes' where id = challenge.id;
    return 'verified';
  end if;
  update public.registration_email_challenges set attempts = attempts + 1,
    status = case when attempts + 1 >= 5 then 'locked' else 'pending' end
    where id = challenge.id;
  return case when challenge.attempts + 1 >= 5 then 'locked' else 'incorrect' end;
end;
$$;

-- Do not authorize the browser that originally requested the email after the
-- link is redeemed elsewhere. Transfer the capability to the redeeming browser.
create function public.registration_email_verify_link(p_link text, p_new_session text)
returns text language plpgsql security invoker set search_path = pg_catalog
as $$
declare challenge public.registration_email_challenges%rowtype;
begin
  select * into challenge from public.registration_email_challenges
    where link_digest = p_link for update;
  if not found then return 'invalid'; end if;
  if challenge.status <> 'pending' or challenge.expires_at <= now() then return 'expired'; end if;
  update public.registration_email_challenges set session_digest = p_new_session,
    status = 'verified', verified_at = now(), expires_at = now() + interval '30 minutes'
    where id = challenge.id;
  return 'verified';
end;
$$;

create function public.registration_email_claim(
  p_session text, p_display_name text, p_account_code text, p_contact_email text
) returns timestamptz language sql security invoker set search_path = pg_catalog
as $$
  update public.registration_email_challenges set status = 'consumed'
    where session_digest = p_session and status = 'verified' and expires_at > now()
      and display_name = p_display_name and account_code = p_account_code
      and contact_email = p_contact_email
    returning verified_at;
$$;

revoke all on function public.registration_email_start(text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.registration_email_verify_code(text,text) from public, anon, authenticated;
revoke all on function public.registration_email_verify_link(text,text) from public, anon, authenticated;
revoke all on function public.registration_email_claim(text,text,text,text) from public, anon, authenticated;
grant execute on function public.registration_email_start(text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.registration_email_verify_code(text,text) to service_role;
grant execute on function public.registration_email_verify_link(text,text) to service_role;
grant execute on function public.registration_email_claim(text,text,text,text) to service_role;
),
  contact_email text not null check (char_length(contact_email) between 3 and 254
    and contact_email = lower(btrim(contact_email))
    and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null default 'pending' check (status in ('pending','verified','consumed','invalidated','locked')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  verified_at timestamptz
);
alter table public.registration_email_challenges enable row level security;
revoke all on table public.registration_email_challenges from public, anon, authenticated;
grant select, insert, update, delete on table public.registration_email_challenges to service_role;
create index registration_email_challenges_created_idx on public.registration_email_challenges (created_at);
create index registration_email_challenges_email_created_idx on public.registration_email_challenges (contact_email, created_at);

-- Serialize quota checks, including concurrent requests to distinct addresses.
create function public.registration_email_start(
  p_old_session text, p_session text, p_link text, p_code text,
  p_display_name text, p_account_code text, p_contact_email text
) returns text language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(74190261);
  delete from public.registration_email_challenges where created_at < now() - interval '2 days';
  if (select count(*) from public.registration_email_challenges where created_at > now() - interval '24 hours') >= 30 then
    return 'daily_limit';
  end if;
  if exists(select 1 from public.registration_email_challenges
    where contact_email = p_contact_email and created_at > now() - interval '60 seconds') then
    return 'cooldown';
  end if;
  if (select count(*) from public.registration_email_challenges
    where contact_email = p_contact_email and created_at > now() - interval '1 hour') >= 5 then
    return 'hourly_limit';
  end if;
  if exists(select 1 from public.registration_email_challenges where session_digest = p_old_session
    and created_at > now() - interval '60 seconds') then
    return 'cooldown';
  end if;
  update public.registration_email_challenges set status = 'invalidated'
    where session_digest = p_old_session and status in ('pending','verified');
  insert into public.registration_email_challenges
    (session_digest, link_digest, code_digest, display_name, account_code, contact_email)
    values (p_session, p_link, p_code, p_display_name, p_account_code, p_contact_email);
  return 'created';
end;
$$;

-- The row lock makes the attempt count and both redemption paths atomic.
create function public.registration_email_verify_code(p_session text, p_code text)
returns text language plpgsql security invoker set search_path = pg_catalog
as $$
declare challenge public.registration_email_challenges%rowtype;
begin
  select * into challenge from public.registration_email_challenges
    where session_digest = p_session for update;
  if not found then return 'invalid'; end if;
  if challenge.status <> 'pending' or challenge.expires_at <= now() then return 'expired'; end if;
  if challenge.code_digest = p_code then
    update public.registration_email_challenges set status = 'verified', verified_at = now(),
      expires_at = now() + interval '30 minutes' where id = challenge.id;
    return 'verified';
  end if;
  update public.registration_email_challenges set attempts = attempts + 1,
    status = case when attempts + 1 >= 5 then 'locked' else 'pending' end
    where id = challenge.id;
  return case when challenge.attempts + 1 >= 5 then 'locked' else 'incorrect' end;
end;
$$;

-- Do not authorize the browser that originally requested the email after the
-- link is redeemed elsewhere. Transfer the capability to the redeeming browser.
create function public.registration_email_verify_link(p_link text, p_new_session text)
returns text language plpgsql security invoker set search_path = pg_catalog
as $$
declare challenge public.registration_email_challenges%rowtype;
begin
  select * into challenge from public.registration_email_challenges
    where link_digest = p_link for update;
  if not found then return 'invalid'; end if;
  if challenge.status <> 'pending' or challenge.expires_at <= now() then return 'expired'; end if;
  update public.registration_email_challenges set session_digest = p_new_session,
    status = 'verified', verified_at = now(), expires_at = now() + interval '30 minutes'
    where id = challenge.id;
  return 'verified';
end;
$$;

create function public.registration_email_claim(
  p_session text, p_display_name text, p_account_code text, p_contact_email text
) returns timestamptz language sql security invoker set search_path = pg_catalog
as $$
  update public.registration_email_challenges set status = 'consumed'
    where session_digest = p_session and status = 'verified' and expires_at > now()
      and display_name = p_display_name and account_code = p_account_code
      and contact_email = p_contact_email
    returning verified_at;
$$;

revoke all on function public.registration_email_start(text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.registration_email_verify_code(text,text) from public, anon, authenticated;
revoke all on function public.registration_email_verify_link(text,text) from public, anon, authenticated;
revoke all on function public.registration_email_claim(text,text,text,text) from public, anon, authenticated;
grant execute on function public.registration_email_start(text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.registration_email_verify_code(text,text) to service_role;
grant execute on function public.registration_email_verify_link(text,text) to service_role;
grant execute on function public.registration_email_claim(text,text,text,text) to service_role;
