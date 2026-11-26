
begin;
do $$
declare
 a uuid := gen_random_uuid();
 v uuid := gen_random_uuid();
 sa uuid := gen_random_uuid();
 sv uuid := gen_random_uuid();
 opt timestamptz := '2030-01-03 18:00:00+08';
 due timestamptz := '2030-01-03 19:00:05+08';
 ep text := 'https://web.push.apple.com/admin-fixture-'||gen_random_uuid()::text;
 dev uuid;
 delivery uuid;
begin
 if extract(dow from opt at time zone 'Asia/Taipei')<>4 then raise exception 'Expected Thursday'; end if;
 if has_function_privilege('authenticated','public.register_admin_timeline_reminder_device(uuid,uuid,text,text,text,text,timestamptz)','execute')
 or has_function_privilege('anon','public.take_admin_timeline_reminder(uuid,timestamptz)','execute')
 or has_table_privilege('authenticated','background_reminder_private.admin_test_devices','select') then
 raise exception 'Admin test tables and RPCs must remain server-only'; end if;
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,'admin-fixture-'||a||'@example.invalid','{"display_name":"Admin fixture"}'),
 (v,'volunteer-fixture-'||v||'@example.invalid','{"display_name":"Volunteer fixture"}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,opt,opt),(sv,v,opt,opt);
 update public.profiles set is_active=true where id in(a,v);
 insert into public.user_roles(user_id,role) values(a,'admin'),(v,'volunteer') on conflict do nothing;
 update public.timeline_nodes set is_active=false where service_id is null and service_type='六晚崇';
 insert into public.timeline_nodes(id,service_type,time,title,sort_order,is_active) values
 ('__admin_vib_start__','六晚崇','18:30','開始',0,true),
 ('__admin_vib_1__','六晚崇','19:00','任務',1,true),
 ('__admin_vib_2__','六晚崇','19:00','同分鐘',2,true),
 ('__admin_vib_3__','六晚崇','19:01','下一任務',3,true),
 ('__admin_vib_disabled__','六晚崇','18:40','停用',4,false);
 if exists(select 1 from public.register_admin_timeline_reminder_device(v,sv,'六晚崇',ep,repeat('A',87),repeat('B',22),opt))
 or exists(select 1 from public.register_admin_timeline_reminder_device(a,sv,'六晚崇',ep,repeat('A',87),repeat('B',22),opt))
 then raise exception 'Unauthorized registration'; end if;
 select r.device_id into dev from public.register_admin_timeline_reminder_device(a,sa,'六晚崇',ep,repeat('A',87),repeat('B',22),opt) r;
 if dev is null then raise exception 'Admin must register on Thursday without check-in'; end if;
 if exists(select 1 from public.service_check_ins where user_id=a) then raise exception 'Test must not create check-ins'; end if;
 if exists(select 1 from background_reminder_private.admin_test_candidates('2030-01-03 18:30:05+08'))
 or exists(select 1 from background_reminder_private.admin_test_candidates('2030-01-03 18:40:05+08'))
 then raise exception 'First and inactive blocks must not fire'; end if;
 if (select count(*) from background_reminder_private.admin_test_candidates(due) where device_id=dev)<>1
 or not background_reminder_private.should_dispatch(due) then raise exception 'Expected one weekday cue'; end if;
 select c.delivery_id into delivery from public.claim_admin_timeline_reminders(due,50)c;
 if delivery is null then raise exception 'Expected claim'; end if;
 if not exists(select 1 from public.take_admin_timeline_reminder(delivery,due) t where t.service_type='六晚崇' and t.task_time='19:00') then raise exception 'Expected correct task'; end if;
 if exists(select 1 from public.take_admin_timeline_reminder(delivery,due)) then raise exception 'Claim must be atomically taken only once'; end if;
 if not public.finish_admin_timeline_reminder(delivery,'accepted',201,due) then raise exception 'Finish failed'; end if;
 if exists(select 1 from public.claim_admin_timeline_reminders(due,50)) then raise exception 'Duplicate delivery'; end if;
 if public.disable_admin_timeline_reminder_device(v,ep,due) then raise exception 'Foreign owner revoked device'; end if;
 if not public.disable_admin_timeline_reminder_device(a,ep,due) then raise exception 'Owner revoke failed'; end if;
 if exists(select 1 from background_reminder_private.admin_test_candidates(due+interval '1 minute') where device_id=dev) then raise exception 'Disabled device dispatched'; end if;
 perform public.register_admin_timeline_reminder_device(a,sa,'六晚崇',ep,repeat('A',87),repeat('B',22),due+interval '1 second');
 delete from public.user_roles where user_id=a and role='admin';
 if exists(select 1 from background_reminder_private.admin_test_candidates(due+interval '1 minute') where device_id=dev) then raise exception 'Demoted admin dispatched'; end if;
end $$;
rollback;
