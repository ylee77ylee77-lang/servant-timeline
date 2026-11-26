-- Isolated database verification: never send email or create production users.
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
  v text;
  n integer;
begin
  if has_table_privilege('anon','public.registration_email_challenges','SELECT')
    or has_table_privilege('authenticated','public.registration_email_challenges','SELECT')
    or has_function_privilege('anon','public.registration_email_start(text,text,text,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.registration_email_verify_link(text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.registration_email_claim(text,text,text,text)','EXECUTE')
  then raise exception 'registration verification is not isolated from public clients'; end if;
  v := public.registration_email_start('',a,b,c,'測試同工','email-test-one','reg-one@example.test','');
  if v <> 'created' then raise exception 'challenge creation failed: %',v; end if;
  if public.registration_email_claim(a,'測試同工','email-test-one','reg-one@example.test') is not null
  then raise exception 'unverified registration accepted'; end if;
  v := public.registration_email_start(a,d,e,f,'測試同工','email-test-one','reg-one@example.test','');
  if v <> 'cooldown' then raise exception 'resend cooldown failed: %',v; end if;
  for n in 1..4 loop
    if public.registration_email_verify_code(a,d) <> 'incorrect' then raise exception 'incorrect attempt handling failed'; end if;
  end loop;
  if public.registration_email_verify_code(a,d) <> 'locked' then raise exception 'fifth attempt did not lock'; end if;
  if public.registration_email_verify_code(a,c) = 'verified' or public.registration_email_verify_link(b,e) = 'verified'
  then raise exception 'locked challenge accepted'; end if;
  update public.registration_email_challenges set created_at = now() - interval '61 seconds' where session_digest=a;
  v := public.registration_email_start(a,d,e,f,'測試同工','email-test-one','reg-one@example.test','');
  if v <> 'created' then raise exception 'resend failed: %',v; end if;
  if public.registration_email_verify_code(d,f) <> 'verified' then raise exception 'valid OTP rejected'; end if;
  if public.registration_email_verify_link(e,g) = 'verified' then raise exception 'second path accepted'; end if;
  if public.registration_email_claim(d,'測試同工','email-test-one','changed@example.test') is not null
  then raise exception 'changed email accepted'; end if;
  if public.registration_email_claim(d,'測試同工','email-test-one','reg-one@example.test') is null
  then raise exception 'verified claim rejected'; end if;
  if public.registration_email_claim(d,'測試同工','email-test-one','reg-one@example.test') is not null
  then raise exception 'claim replay accepted'; end if;
  v := public.registration_email_start('',g,h,i,'測試同工','email-test-two','reg-two@example.test','');
  if v <> 'created' or public.registration_email_verify_link(h,j) <> 'verified'
  then raise exception 'link verification failed'; end if;
  if public.registration_email_claim(g,'測試同工','email-test-two','reg-two@example.test') is not null
  then raise exception 'original browser retained link verification capability'; end if;
  if public.registration_email_claim(j,'測試同工','email-test-two','reg-two@example.test') is null
  then raise exception 'redeeming browser could not complete registration'; end if;
  v := public.registration_email_start('',k,l,a,'測試同工','email-test-three','reg-three@example.test','');
  if v <> 'created' then raise exception 'expiration challenge creation failed'; end if;
  update public.registration_email_challenges set expires_at=now() - interval '1 second' where session_digest=k;
  if public.registration_email_verify_code(k,a) = 'verified' or public.registration_email_verify_link(l,b) = 'verified'
  then raise exception 'expired verification accepted'; end if;
end;
$$;
rollback;
