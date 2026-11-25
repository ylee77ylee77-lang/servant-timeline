-- Run after applying the committed migrations in a disposable local database.
-- All test data is rolled back. No extensions or network requests here.
begin;

do $$
declare
  lead_user uuid := gen_random_uuid();
  deputy_user uuid := gen_random_uuid();
  volunteer_user uuid := gen_random_uuid();
  lead_session uuid := gen_random_uuid();
  deputy_session uuid := gen_random_uuid();
  volunteer_session uuid := gen_random_uuid();
  svc uuid := gen_random_uuid();
  other_svc uuid := gen_random_uuid();
  lead_assignment uuid := gen_random_uuid();
  deputy_assignment uuid := gen_random_uuid();
  volunteer_assignment uuid := gen_random_uuid();
  lead_check uuid := gen_random_uuid();
  deputy_check uuid := gen_random_uuid();
  volunteer_check uuid := gen_random_uuid();
  lead_device uuid := gen_random_uuid();
  second_device uuid := gen_random_uuid();
  deputy_device uuid := gen_random_uuid();
  volunteer_device uuid := gen_random_uuid();
  disabled_device uuid := gen_random_uuid();
  expired_device uuid := gen_random_uuid();
  wrong_binding uuid := gen_random_uuid();
  -- The existing check-in trigger requires the real current Taipei date.
  -- Seed on that date, then simulate a Sunday inside this rollback-only test.
  today date := (current_timestamp at time zone 'Asia/Taipei')::date;
  day date := date '2030-01-06';
  opted timestamptz := '2030-01-06 08:00:00+08';
  due timestamptz := '2030-01-06 09:30:05+08';
  event_id uuid;
  cancel_event uuid;
  deputy_event uuid;
  n integer;
  registered_device uuid;
  registration_expiry timestamptz;
  registration_endpoint text := 'https://web.push.apple.com/registration-test-' || gen_random_uuid()::text;
  rejected_event uuid;
begin
  if extract(dow from day) <> 0 then raise exception 'Fixture date must be Sunday'; end if;
  if has_table_privilege('authenticated', 'public.background_reminder_devices', 'select')
     or has_table_privilege('authenticated', 'public.background_reminder_devices', 'insert')
     or has_table_privilege('anon', 'public.background_reminder_devices', 'select')
     or has_table_privilege('authenticated', 'public.background_task_reminder_deliveries', 'select')
     or has_function_privilege('authenticated', 'public.background_reminder_candidates(timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.claim_background_task_reminders(timestamptz, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.take_background_task_reminder(uuid, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.finish_background_task_reminder(uuid, text, integer, timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.claim_background_task_reminders(timestamptz, integer)', 'execute')
     or not has_function_privilege('service_role', 'public.take_background_task_reminder(uuid, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.register_background_reminder_device(uuid,uuid,text,text,text,text,timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.disable_background_reminder_device(uuid,text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.background_reminder_open_bindings(timestamptz,uuid,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.register_background_reminder_device(uuid,uuid,text,text,text,text,timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.disable_background_reminder_device(uuid,text,timestamptz)', 'execute')
     or has_schema_privilege('authenticated', 'background_reminder_private', 'USAGE')
     or has_function_privilege('authenticated', 'background_reminder_private.session_is_live(uuid,uuid,timestamptz)', 'execute')
  then raise exception 'Reminder tables and dispatch functions must be server-only'; end if;

  if exists (
    select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relname in ('background_reminder_devices','background_task_reminder_deliveries')
    and not c.relrowsecurity
  ) then raise exception 'Both reminder tables must enable RLS'; end if;

  insert into auth.users (id, email, raw_user_meta_data) values
    (lead_user, 'bg-lead-' || lead_user::text || '@example.invalid', '{"display_name":"Test Lead"}'),
    (deputy_user, 'bg-deputy-' || deputy_user::text || '@example.invalid', '{"display_name":"Test Deputy"}'),
    (volunteer_user, 'bg-volunteer-' || volunteer_user::text || '@example.invalid', '{"display_name":"Test Volunteer"}');
  insert into auth.sessions (id,user_id,created_at,updated_at) values
    (lead_session,lead_user,opted,opted),(deputy_session,deputy_user,opted,opted),(volunteer_session,volunteer_user,opted,opted);
  update public.profiles set is_active = true where id in (lead_user, deputy_user, volunteer_user);
  insert into public.user_roles (user_id, role) values
    (lead_user,'coordinator'), (deputy_user,'coordinator'), (volunteer_user,'volunteer')
    on conflict do nothing;

  insert into public.worship_services (id, service_date, service_type, starts_at, status) values
    (svc, today, '__bg_fixture_first__', (today + time '09:00') at time zone 'Asia/Taipei', 'published'),
    (other_svc, today, '__bg_fixture_second__', (today + time '11:00') at time zone 'Asia/Taipei', 'published');
  insert into public.service_assignments (id, service_id, user_id, role_label) values
    (lead_assignment,svc,lead_user,'總招'),
    (deputy_assignment,svc,deputy_user,'副總招'),
    (volunteer_assignment,svc,volunteer_user,'專招');
  insert into public.service_check_ins (id, service_id, user_id, assignment_id, checked_in_at) values
    (lead_check,svc,lead_user,lead_assignment,(today + time '08:00') at time zone 'Asia/Taipei'),
    (deputy_check,svc,deputy_user,deputy_assignment,(today + time '08:00') at time zone 'Asia/Taipei'),
    (volunteer_check,svc,volunteer_user,volunteer_assignment,(today + time '08:00') at time zone 'Asia/Taipei');

  -- Preserve all real insert-time authorization checks. Retimestamp only our
  -- own isolated fixtures afterwards so the planner can use a fixed Sunday.
  update public.worship_services set service_date = day, service_type = '主一堂',
    starts_at = (day + time '09:00') at time zone 'Asia/Taipei' where id = svc;
  update public.worship_services set service_date = day, service_type = '主二堂',
    starts_at = (day + time '11:00') at time zone 'Asia/Taipei' where id = other_svc;
  update public.service_check_ins set checked_in_at = opted
    where id in (lead_check, deputy_check, volunteer_check);

  insert into public.timeline_nodes (id, service_id, service_type, time, title, sort_order, is_active) values
    ('__bg_first__',svc,'主一堂','08:30','三樓集合',0,true),
    ('__bg_two_floor__',svc,'主一堂','09:30','二樓就位',100,true),
    ('__bg_three_floor__',svc,'主一堂','09:30','三樓就位',1,true),
    ('__bg_own__',svc,'主一堂','09:30','專招任務',2,true),
    ('__bg_inactive__',svc,'主一堂','09:30','三樓停用任務',1000,false),
    ('__bg_late__',svc,'主一堂','10:45','三樓散場',0,true),
    ('__bg_other__',other_svc,'主二堂','09:30','其他堂次',0,true),
    ('__bg_invalid_time__',svc,'主一堂','invalid','三樓錯誤時間',0,true);
  insert into public.service_task_assignments (service_id, assignment_id, timeline_node_id)
  select svc, lead_assignment, fixture.node_id from unnest(array[
    '__bg_first__','__bg_two_floor__','__bg_three_floor__','__bg_inactive__','__bg_late__','__bg_invalid_time__'
  ]) as fixture(node_id);
  insert into public.service_task_assignments (service_id, assignment_id, timeline_node_id)
  select svc, deputy_assignment, fixture.node_id from unnest(array[
    '__bg_first__','__bg_two_floor__','__bg_three_floor__','__bg_late__'
  ]) as fixture(node_id);
  insert into public.service_task_assignments (service_id, assignment_id, timeline_node_id)
  select svc, volunteer_assignment, fixture.node_id from unnest(array['__bg_first__','__bg_own__']) as fixture(node_id);

  -- Real check-ins, fictional subscription keys. No network operation.
  if exists(select 1 from public.register_background_reminder_device(lead_user,deputy_session,'主一堂',
    registration_endpoint,repeat('A',87),repeat('B',22),opted)) then
    raise exception 'A session owned by another account must not authorize registration'; end if;
  select x.device_id, x.expires_at into registered_device, registration_expiry
    from public.register_background_reminder_device(lead_user,lead_session,'主一堂',
      registration_endpoint,repeat('A',87),repeat('B',22),opted) x;
  if registered_device is null or registration_expiry is distinct from '2030-01-06 10:45:00+08'::timestamptz
    then raise exception 'Registration must bind the actual service cutoff'; end if;
  if not exists(select 1 from public.background_reminder_devices d
      where d.id = registered_device and d.user_id = lead_user and d.session_id = lead_session and d.check_in_id = lead_check
      and d.assignment_id = lead_assignment and d.service_id = svc)
    then raise exception 'Registration binding must be server-derived'; end if;
  if not exists(select 1 from public.register_background_reminder_device(lead_user,lead_session,'主一堂',
      registration_endpoint,repeat('A',87),repeat('B',22),opted + interval '1 minute') r
      where r.device_id = registered_device and r.expires_at = registration_expiry)
    then raise exception 'An unchanged active subscription must be idempotent'; end if;
  if exists(select 1 from public.register_background_reminder_device(deputy_user,deputy_session,'主一堂',
      registration_endpoint,repeat('A',87),repeat('B',22),opted + interval '1 minute'))
    then raise exception 'Another user must not take over a registered subscription'; end if;
  if exists(select 1 from public.register_background_reminder_device(lead_user,lead_session,'主一堂',
      registration_endpoint,repeat('C',87),repeat('B',22),opted + interval '1 minute'))
    then raise exception 'An existing endpoint must not change keys'; end if;
  if exists(select 1 from public.register_background_reminder_device(lead_user,lead_session,'主二堂',
      'https://web.push.apple.com/wrong-service',repeat('A',87),repeat('B',22),opted))
    then raise exception 'An unchecked-in service must not register a subscription'; end if;
  if exists(select 1 from public.register_background_reminder_device(lead_user,lead_session,'主一堂',
      'https://web.push.apple.com/closed-service',repeat('A',87),repeat('B',22),'2030-01-06 10:45:00+08'))
    then raise exception 'Closed service must not register a subscription'; end if;
  if public.disable_background_reminder_device(deputy_user,registration_endpoint,opted + interval '2 minutes')
    then raise exception 'Another user must not disable a subscription'; end if;
  if not public.disable_background_reminder_device(lead_user,registration_endpoint,opted + interval '2 minutes')
    then raise exception 'Owner must be able to disable their subscription'; end if;
  if exists(select 1 from public.register_background_reminder_device(lead_user,lead_session,'主一堂',
      registration_endpoint,repeat('A',87),repeat('B',22),opted + interval '1 minute'))
    then raise exception 'An older registration must not overwrite a later disable'; end if;
  if not exists(select 1 from public.register_background_reminder_device(lead_user,lead_session,'主一堂',
      registration_endpoint,repeat('A',87),repeat('B',22),opted + interval '3 minutes') r
      where r.device_id = registered_device)
    then raise exception 'Owner must be able to re-enable their own subscription'; end if;
  if not exists(select 1 from public.background_reminder_devices d
    where d.id = registered_device and d.opted_in_at = opted + interval '3 minutes')
    then raise exception 'Re-enable must start a fresh opt-in window'; end if;
  perform public.disable_background_reminder_device(lead_user,registration_endpoint,opted + interval '4 minutes');

  -- Fictional endpoints and non-cryptographic placeholder keys: never sent.
  insert into public.background_reminder_devices (
    id, user_id, session_id, check_in_id, service_id, assignment_id, endpoint, p256dh, auth_secret,
    enabled, opted_in_at, expires_at
  )
  select fixture.id, fixture.user_id,
    case when fixture.user_id = lead_user then lead_session
      when fixture.user_id = deputy_user then deputy_session else volunteer_session end,
    fixture.check_in_id, svc, fixture.assignment_id,
    'https://web.push.apple.com/test-' || fixture.id::text, repeat('A',87), repeat('B',22),
    fixture.enabled, opted, fixture.expires_at
  from (values
    (lead_device, lead_user, lead_check, lead_assignment, true, opted + interval '4 hours'),
    (second_device, lead_user, lead_check, lead_assignment, true, opted + interval '4 hours'),
    (deputy_device, deputy_user, deputy_check, deputy_assignment, true, opted + interval '4 hours'),
    (volunteer_device, volunteer_user, volunteer_check, volunteer_assignment, true, opted + interval '4 hours'),
    (disabled_device, lead_user, lead_check, lead_assignment, false, opted + interval '4 hours'),
    (expired_device, lead_user, lead_check, lead_assignment, true, opted + interval '1 hour'),
    (wrong_binding, lead_user, deputy_check, lead_assignment, true, opted + interval '4 hours')
  ) as fixture(id,user_id,check_in_id,assignment_id,enabled,expires_at);

  if exists(select 1 from public.background_reminder_candidates('2030-01-06 08:30:02+08'))
    then raise exception 'Initial task must not produce an extra block vibration'; end if;
  if exists(select 1 from public.background_reminder_candidates('2030-01-06 09:29:59+08'))
    then raise exception 'Do not send early'; end if;
  if exists(select 1 from public.background_reminder_candidates('2030-01-06 09:30:21+08'))
    then raise exception 'Do not replay stale events'; end if;

  if has_function_privilege('authenticated','background_reminder_private.queue_due_dispatch()','execute')
    or has_function_privilege('service_role','background_reminder_private.queue_due_dispatch()','execute')
    or has_function_privilege('anon','background_reminder_private.queue_due_dispatch_at(timestamptz)','execute')
    or has_function_privilege('authenticated','background_reminder_private.queue_due_dispatch_at(timestamptz)','execute')
    or has_function_privilege('service_role','background_reminder_private.queue_due_dispatch_at(timestamptz)','execute')
    or has_function_privilege('authenticated','background_reminder_private.dispatch_authorization(text,timestamptz)','execute')
    or has_function_privilege('service_role','background_reminder_private.dispatch_authorization(text,timestamptz)','execute')
    then raise exception 'Cron and signer must be owner-only'; end if;
  if background_reminder_private.dispatch_authorization(null,due) is not null
    or background_reminder_private.dispatch_authorization('invalid',due) is not null
    then raise exception 'Signer must fail closed without a valid secret'; end if;
  if background_reminder_private.should_dispatch('2030-01-06 09:29:59+08')
    or background_reminder_private.should_dispatch('2030-01-06 09:30:21+08')
    or background_reminder_private.should_dispatch('2030-01-07 09:30:05+08')
    or background_reminder_private.should_dispatch('2030-01-06 12:45:00+08')
    then raise exception 'Cron must avoid early, stale and out-of-service requests'; end if;
  if not background_reminder_private.should_dispatch(due)
    then raise exception 'Cron must detect a due eligible task'; end if;
  select count(*) into n from public.background_reminder_candidates(due);
  if n <> 4 then raise exception 'Expected 4 eligible devices, got %', n; end if;
  if not exists(select 1 from public.background_reminder_candidates(due) c
    where c.device_id = deputy_device and c.timeline_node_id = '__bg_three_floor__')
    or not exists(select 1 from public.background_reminder_candidates(due) c
    where c.device_id = volunteer_device and c.timeline_node_id = '__bg_own__')
    or not exists(select 1 from public.background_reminder_candidates(due) c
    where c.device_id = lead_device and c.timeline_node_id = '__bg_two_floor__')
    then raise exception 'Scope, mappings, active nodes and simultaneous block selection must be correct'; end if;
  if exists(select 1 from public.background_reminder_candidates(due) c
    where c.service_id <> svc or c.task_time <> '09:30' or c.service_date <> day)
    then raise exception 'Wrong service date/time'; end if;

  select count(*) into n from public.claim_background_task_reminders(due, 50);
  if n <> 4 then raise exception 'Claim count expected 4, got %', n; end if;
  select count(*) into n from public.claim_background_task_reminders(due, 50);
  if n <> 4 or (select count(*) from public.background_task_reminder_deliveries) <> 4
    then raise exception 'Repeated claim should recover the same four unstarted events'; end if;
  if not background_reminder_private.should_dispatch(due)
    then raise exception 'Unstarted claims must remain recoverable'; end if;

  select id into event_id from public.background_task_reminder_deliveries where device_id = lead_device;
  select id into cancel_event from public.background_task_reminder_deliveries where device_id = second_device;
  select id into deputy_event from public.background_task_reminder_deliveries where device_id = deputy_device;
  select count(*) into n from public.take_background_task_reminder(event_id,due);
  if n <> 1 then raise exception 'First consumption must take exactly one event'; end if;
  if exists(select 1 from public.take_background_task_reminder(event_id,due))
    then raise exception 'Claim may be consumed only once'; end if;

  if not public.finish_background_task_reminder(event_id,'accepted',201,due)
    then raise exception 'First completion must finalize the delivery'; end if;
  if public.finish_background_task_reminder(event_id,'accepted',201,due)
    then raise exception 'Final state may be recorded only once'; end if;

  -- Revalidate just before dispatch: changing a check-in or preference after
  -- a claim invalidates the pending event.
  update public.background_reminder_devices set enabled = false where id = second_device;
  if exists(select 1 from public.take_background_task_reminder(cancel_event,due))
    then raise exception 'Disabled device must never be taken'; end if;
  -- An invalidated old check-in must no longer authorize a claimed event,
  -- including the cancellation performed by the existing correction RPC.
  update public.service_check_ins set status = 'cancelled' where id = deputy_check;
  if exists(select 1 from public.take_background_task_reminder(deputy_event,due))
    then raise exception 'Cancelled check-in must never be taken'; end if;
  -- Even a matching check-in cannot authorize a now-cancelled assignment.
  update public.service_assignments set status = 'cancelled' where id = volunteer_assignment;
  if exists(select 1 from public.background_reminder_candidates(due) c where c.device_id = volunteer_device)
    then raise exception 'Cancelled assignment must not receive a reminder'; end if;
  update public.service_assignments set status = 'scheduled' where id = volunteer_assignment;
  select id into rejected_event from public.background_task_reminder_deliveries where device_id = volunteer_device;
  select count(*) into n from public.take_background_task_reminder(rejected_event,due);
  if n <> 1 then raise exception 'Expected valid volunteer delivery'; end if;
  if not public.finish_background_task_reminder(rejected_event,'rejected',410,due)
    then raise exception 'Gone subscription rejection must finalize'; end if;
  if exists(select 1 from public.background_reminder_devices d where d.id = volunteer_device and d.enabled)
    then raise exception '410 must disable the expired subscription'; end if;
  update public.profiles set is_active = false where id = volunteer_user;
  if exists(select 1 from public.background_reminder_candidates(due) c where c.device_id = volunteer_device)
    then raise exception 'Inactive account must not receive a reminder'; end if;
  if exists(select 1 from public.background_reminder_candidates('2030-01-06 10:45:01+08') c where c.device_id = lead_device)
    then raise exception 'Lead first-service cutoff must be honored'; end if;
  delete from auth.sessions where id = lead_session;
  if exists(select 1 from public.background_reminder_candidates(due) c where c.device_id = lead_device)
    then raise exception 'Signed-out session must not receive reminders'; end if;
  if exists(select 1 from public.register_background_reminder_device(lead_user,lead_session,'主一堂',
    registration_endpoint,repeat('A',87),repeat('B',22),due))
    then raise exception 'Signed-out session cannot re-register using an old token'; end if;
  if background_reminder_private.should_dispatch(due)
    then raise exception 'No cron request after all claims are terminal or ineligible'; end if;
  update public.worship_services set status = 'completed' where id = svc;
  if exists(select 1 from public.background_reminder_candidates(due))
    then raise exception 'Completed service must not generate reminders'; end if;
end;
$$;

rollback;
