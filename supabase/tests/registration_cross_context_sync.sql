-- Run only against an isolated database; all fixtures roll back.
begin;
do $$
declare
  a text := repeat('a',64);
  b text := repeat('b',64);
  c text := repeat('c',64);
  d text := repeat('d',64);
  e text := repeat('e',64);
  f text := repeat('f',64);
  g text := repeat('1',64);
  h text := repeat('2',64);
  i text := repeat('3',64);
  j text := repeat('4',64);
  k text := repeat('5',64);
  l text := repeat('6',64);
  n integer;
begin
  if has_function_privilege('anon','public.registration_email_resume(text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.registration_email_resume(text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.registration_email_resume(text,text)','EXECUTE')
  then raise exception 'handoff RPC grant invalid'; end if;
  if public.registration_email_start('',a,b,c,'Sync','sync-ci-one','sync-one@example.test','') <> 'created'
    or public.registration_email_verify_link(b,d) <> 'verified'
  then raise exception 'link verification failed'; end if;
  if not exists(select 1 from public.registration_email_challenges where session_digest=d
    and linked_from_session_digest=a and status='verified' and not handoff_used)
  then raise exception 'original session association missing'; end if;
  if public.registration_email_claim(a,'Sync','sync-ci-one','sync-one@example.test') is not null
  then raise exception 'observer obtained claim'; end if;
  if public.registration_email_resume(a,e) <> 'incorrect'
    or public.registration_email_resume(a,c) <> 'verified'
  then raise exception 'handoff rejected'; end if;
  if public.registration_email_resume(d,c) = 'verified'
    or public.registration_email_claim(d,'Sync','sync-ci-one','sync-one@example.test') is not null
  then raise exception 'previous browser still authorized'; end if;
  if public.registration_email_claim(a,'Sync','sync-ci-one','sync-one@example.test') is null
    or public.registration_email_claim(a,'Sync','sync-ci-one','sync-one@example.test') is not null
  then raise exception 'single claim failed'; end if;
  if public.registration_email_start('',e,f,g,'Sync','sync-ci-two','sync-two@example.test','') <> 'created'
    or public.registration_email_verify_link(f,h) <> 'verified'
  then raise exception 'lock fixture failed'; end if;
  for n in 1..4 loop
    if public.registration_email_resume(e,i) <> 'incorrect' then raise exception 'handoff attempt failed'; end if;
  end loop;
  if public.registration_email_resume(e,i) <> 'resume_locked'
    or public.registration_email_resume(e,g) = 'verified'
    or public.registration_email_claim(h,'Sync','sync-ci-two','sync-two@example.test') is null
  then raise exception 'handoff limits must not disable verified browser'; end if;
  if public.registration_email_start('',i,j,k,'Sync','sync-ci-three','sync-three@example.test','') <> 'created'
    or public.registration_email_verify_link(j,l) <> 'verified'
  then raise exception 'expiry fixture failed'; end if;
  update public.registration_email_challenges set created_at=now()-interval '11 minutes' where session_digest=l;
  if public.registration_email_resume(i,k) = 'verified'
    or public.registration_email_claim(l,'Sync','sync-ci-three','sync-three@example.test') is null
  then raise exception 'original code lifetime incorrectly extended'; end if;
end;
$$;
rollback;
