-- Keep the initiating registration session as a status-only observer.
-- The existing session_digest remains the sole credential that can claim
-- registration. Observing email verification must never authorize account creation.
alter table public.registration_email_challenges
  add column linked_from_session_digest text unique
    check (linked_from_session_digest is null or linked_from_session_digest ~ '^[0-9a-f]{64}$'),
  add column handoff_used boolean not null default false;

create or replace function public.registration_email_verify_link(p_link text, p_new_session text)
returns text language plpgsql security invoker set search_path = pg_catalog
as $$
declare challenge public.registration_email_challenges%rowtype;
begin
  select * into challenge from public.registration_email_challenges
    where link_digest = p_link for update;
  if not found then return 'invalid'; end if;
  if challenge.status <> 'pending' or challenge.expires_at <= now() then return 'expired'; end if;
  update public.registration_email_challenges
    set linked_from_session_digest = challenge.session_digest,
      session_digest = p_new_session,
      status = 'verified', verified_at = now(), expires_at = now() + interval '30 minutes'
    where id = challenge.id;
  return 'verified';
end;
$$;

-- An original device can regain the single claim only by presenting the
-- original, still-valid OTP. The same row lock serializes this transfer with
-- registration_email_claim. No second email verification or second account.
-- A failed handoff must not invalidate the browser that already proved email ownership.
create function public.registration_email_resume(p_session text, p_code text)
returns text language plpgsql security invoker set search_path = pg_catalog
as $$
declare challenge public.registration_email_challenges%rowtype;
begin
  select * into challenge from public.registration_email_challenges
    where linked_from_session_digest = p_session for update;
  if not found then return 'invalid'; end if;
  if challenge.status <> 'verified' or challenge.handoff_used
    or challenge.expires_at <= now()
    or challenge.created_at + interval '10 minutes' <= now()
    or challenge.attempts >= 5 then
    return 'resume_unavailable';
  end if;
  if challenge.code_digest <> p_code then
    update public.registration_email_challenges
      set attempts = attempts + 1 where id = challenge.id;
    return case when challenge.attempts + 1 >= 5 then 'resume_locked' else 'incorrect' end;
  end if;
  update public.registration_email_challenges
    set session_digest = p_session,
      linked_from_session_digest = challenge.session_digest,
      handoff_used = true
    where id = challenge.id;
  return 'verified';
end;
$$;

revoke all on function public.registration_email_verify_link(text,text) from public, anon, authenticated;
grant execute on function public.registration_email_verify_link(text,text) to service_role;
revoke all on function public.registration_email_resume(text,text) from public, anon, authenticated;
grant execute on function public.registration_email_resume(text,text) to service_role;
