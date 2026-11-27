-- Disposable CI, no network calls or real subscriptions.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); v uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid(); sc uuid:=gen_random_uuid(); sv uuid:=gen_random_uuid();
 r uuid; r2 uuid; d uuid; d2 uuid; delivery uuid; pending uuid; admin_pending uuid;
 now_at timestamptz:=clock_timestamp(); first_due timestamptz; second_due timestamptz;
 ep text:='https://web.push.apple.com/rehearsal-fixture-'||gen_random_uuid()::text;
 ep2 text:='https://web.push.apple.com/rehearsal-other-'||gen_random_uuid()::text;
 fn text; initial_reports bigint; initial_assignments bigint;
begin
 foreach fn in array array['public.register_rehearsal_reminder_device(uuid,uuid,uuid,text,text,text)',
  'public.disable_rehearsal_reminder_device(uuid,text)','public.claim_rehearsal_reminders(timestamptz,integer)',
  'public.take_rehearsal_reminder(uuid,timestamptz)','public.finish_rehearsal_reminder(uuid,text,integer,timestamptz)'] loop
   if has_function_privilege('anon',fn,'execute') or has_function_privilege('authenticated',fn,'execute')
    or not has_function_privilege('service_role',fn,'execute') then raise exception 'Incorrect rehearsal push grants: %',fn; end if;
 end loop;
 if has_table_privilege('authenticated','service_rehearsal_private.devices','select')
   or has_table_privilege('anon','service_rehearsal_private.deliveries','select') then raise exception 'Private push tables exposed'; end if;
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,'push-admin-'||a||'@example.invalid','{"display_name":"Practice Admin"}'),
 (c,'push-coord-'||c||'@example.invalid','{"display_name":"Practice Coordinator"}'),
 (v,'push-volunteer-'||v||'@example.invalid','{"display_name":"Practice Volunteer"}');
 update public.profiles set is_active=true where id in(a,c,v);
 insert into public.user_roles(user_id,role) values(a,'admin'),(c,'coordinator'),(v,'volunteer') on conflict do nothing;
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,now_at,now_at),(sc,c,now_at,now_at),(sv,v,now_at,now_at);
 select count(*) into initial_reports from public.service_check_ins;
 select count(*) into initial_assignments from public.service_assignments;
 update public.timeline_nodes set is_active=false where service_id is null and service_type='主一堂';
 insert into public.timeline_nodes(id,service_type,time,title,sort_order,is_active) values
 ('__practice_push_a__','主一堂','08:00','First',0,true),('__practice_push_b__','主一堂','08:00','Same time',1,true),
 ('__practice_push_c__','主一堂','08:30','Next',2,true);
 execute 'set local role service_role';
 r:=public.start_service_rehearsal(a,sa,'主一堂');
 select min(due_at),max(due_at) into first_due,second_due from public.service_rehearsal_nodes where rehearsal_id=r;
 begin perform public.register_rehearsal_reminder_device(c,sc,r,ep,repeat('A',87),repeat('B',22)); raise exception 'Unreported user subscribed';
 exception when object_not_in_prerequisite_state then null; end;
 begin perform public.register_rehearsal_reminder_device(v,sv,r,ep,repeat('A',87),repeat('B',22)); raise exception 'Volunteer subscribed';
 exception when insufficient_privilege then null; end;
 perform public.check_in_service_rehearsal(c,sc,r,true);
 perform public.check_in_service_rehearsal(a,sa,r,true);
 begin perform public.register_rehearsal_reminder_device(c,sa,r,ep,repeat('A',87),repeat('B',22)); raise exception 'Foreign session subscribed';
 exception when insufficient_privilege then null; end;
 select x.device_id into d from public.register_rehearsal_reminder_device(c,sc,r,ep,repeat('A',87),repeat('B',22)) x;
 select x.device_id into d2 from public.register_rehearsal_reminder_device(a,sa,r,ep2,repeat('A',87),repeat('B',22)) x;
 if d is null or d2 is null then raise exception 'Reported participants must be able to register'; end if;
 if exists(select 1 from public.register_rehearsal_reminder_device(a,sa,r,ep,repeat('A',87),repeat('B',22))) then raise exception 'Foreign device reused'; end if;
 if (select count(*) from service_rehearsal_private.push_candidates(first_due+interval '5 seconds'))<>2 then raise exception 'Expected one cue per device, not per node'; end if;
 if background_reminder_private.admin_test_allowed(a,sa,first_due+interval '5 seconds') then raise exception 'Admin test and rehearsal overlap'; end if;
 if exists(select 1 from service_rehearsal_private.push_candidates(first_due+interval '21 seconds')) then raise exception 'Expired reminder replay'; end if;
 perform public.claim_rehearsal_reminders(first_due+interval '5 seconds',50);
 select id into delivery from service_rehearsal_private.deliveries where device_id=d and rehearsal_id=r and scheduled_at=first_due;
 if delivery is null then raise exception 'Claim missing'; end if;
 if not exists(select 1 from public.take_rehearsal_reminder(delivery,first_due+interval '5 seconds')) then raise exception 'Take missing'; end if;
 if exists(select 1 from public.take_rehearsal_reminder(delivery,first_due+interval '6 seconds')) then raise exception 'Duplicate take'; end if;
 if not public.finish_rehearsal_reminder(delivery,'accepted',201,first_due+interval '6 seconds') then raise exception 'Finish missing'; end if;
 if exists(select 1 from public.claim_rehearsal_reminders(first_due+interval '7 seconds',50) x where x.delivery_id=delivery) then raise exception 'Duplicate claim'; end if;
 if public.disable_rehearsal_reminder_device(a,ep) then raise exception 'Foreign device disabled'; end if;
 if not public.disable_rehearsal_reminder_device(c,ep) then raise exception 'Owner disable failed'; end if;
 if exists(select 1 from service_rehearsal_private.push_candidates(second_due+interval '5 seconds') where device_id=d) then raise exception 'Disabled device dispatched'; end if;
 perform public.register_rehearsal_reminder_device(c,sc,r,ep,repeat('A',87),repeat('B',22));
 perform public.claim_rehearsal_reminders(second_due+interval '5 seconds',50);
 select id into pending from service_rehearsal_private.deliveries where device_id=d and rehearsal_id=r and scheduled_at=second_due;
 select id into admin_pending from service_rehearsal_private.deliveries where device_id=d2 and rehearsal_id=r and scheduled_at=second_due;
 if pending is null or admin_pending is null then raise exception 'Pending cue missing'; end if;
 execute 'reset role';
 delete from auth.sessions where id=sc;
 if exists(select 1 from public.take_rehearsal_reminder(pending,second_due+interval '6 seconds')) then raise exception 'Revoked session dispatched'; end if;
 if not background_reminder_private.should_dispatch(second_due+interval '6 seconds') then raise exception 'Existing scheduler did not see rehearsal cue'; end if;
 execute 'set local role service_role';
 perform public.end_service_rehearsal(a,sa,r);
 if exists(select 1 from service_rehearsal_private.devices where rehearsal_id=r and enabled)
  or exists(select 1 from service_rehearsal_private.push_candidates(second_due+interval '7 seconds'))
  or exists(select 1 from public.take_rehearsal_reminder(admin_pending,second_due+interval '7 seconds')) then raise exception 'Manual end did not stop devices'; end if;
 r2:=public.start_service_rehearsal(a,sa,'主一堂');
 perform public.check_in_service_rehearsal(a,sa,r2,true);
 select x.device_id into d2 from public.register_rehearsal_reminder_device(a,sa,r2,ep2,repeat('A',87),repeat('B',22)) x;
 if d2 is null or exists(select 1 from service_rehearsal_private.devices where rehearsal_id=r and enabled) then raise exception 'New session inherited old binding'; end if;
 perform public.end_service_rehearsal(a,sa,r2);
 execute 'reset role';
 if initial_reports<>(select count(*) from public.service_check_ins)
  or initial_assignments<>(select count(*) from public.service_assignments) then raise exception 'Rehearsal push wrote formal records'; end if;
end $$;
rollback;
