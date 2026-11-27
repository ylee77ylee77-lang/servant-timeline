-- Disposable database only; exercise real server-role RPCs and roll back.
begin;
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); late_user uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); sc uuid := gen_random_uuid(); sl uuid := gen_random_uuid(); sv uuid := gen_random_uuid();
  r uuid; r2 uuid; item_id uuid; old_item uuid; ci uuid; f uuid; fa uuid;
  stamp timestamptz := clock_timestamp(); t1 timestamptz; t2 timestamptz; state jsonb; fn text;
  today date := (clock_timestamp() at time zone 'Asia/Taipei')::date;
  fixed_sunday date := '2030-01-06';
  fixed_service uuid; fixed_assignment uuid; fixed_report uuid;
  original_reports bigint; original_assignments bigint; original_states bigint;
begin
  foreach fn in array array['public.check_in_service_rehearsal(uuid,uuid,uuid,boolean)',
    'public.set_service_rehearsal_item(uuid,uuid,uuid,uuid,boolean)',
    'public.get_service_rehearsal_participant_state(uuid,uuid)',
    'service_rehearsal_private.assert_open_for_write(uuid,uuid,uuid,boolean)',
    'service_rehearsal_private.has_formal_check_in(uuid,timestamptz)'] loop
    if has_function_privilege('anon',fn,'execute') or has_function_privilege('authenticated',fn,'execute')
      or not has_function_privilege('service_role',fn,'execute') then raise exception 'RPC grants: %',fn; end if;
  end loop;
  if has_function_privilege('authenticated','service_rehearsal_private.release_on_formal_report()','execute')
    or has_function_privilege('anon','service_rehearsal_private.release_on_formal_report()','execute') then
    raise exception 'Trigger must not be public'; end if;

  insert into auth.users(id,email,raw_user_meta_data) values
    (a,'rehearsal-participant-admin-'||a||'@example.invalid','{"display_name":"Admin"}'),
    (c,'rehearsal-participant-coordinator-'||c||'@example.invalid','{"display_name":"Coordinator"}'),
    (late_user,'rehearsal-participant-late-'||late_user||'@example.invalid','{"display_name":"Late"}'),
    (v,'rehearsal-participant-volunteer-'||v||'@example.invalid','{"display_name":"Volunteer"}');
  update public.profiles set is_active=true where id in(a,c,v);
  insert into public.user_roles(user_id,role) values(a,'admin'),(c,'coordinator'),(late_user,'coordinator'),(v,'volunteer') on conflict do nothing;
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,stamp,stamp),(sc,c,stamp,stamp),(sl,late_user,stamp,stamp),(sv,v,stamp,stamp);
  select count(*) into original_reports from public.service_check_ins;
  select count(*) into original_assignments from public.service_assignments;
  select count(*) into original_states from public.assignment_checklist_states;
  update public.timeline_nodes set is_active=false where service_id is null and service_type='主一堂';
  insert into public.timeline_nodes(id,service_type,time,title,sort_order,is_active) values
    ('__participant_node__','主一堂','08:00','Practice task',0,true);
  insert into public.checklist_items(id,node_id,text,sort_order,is_active) values
    ('__participant_item__','__participant_node__','Practice checklist',0,true);

  execute 'set local role service_role';
  state := public.get_service_rehearsal_participant_state(c,sc);
  if state->'rehearsal' is distinct from 'null'::jsonb then raise exception 'Closed session visible'; end if;
  r := public.start_service_rehearsal(a,sa,'主一堂');
  select i.id into item_id from public.service_rehearsal_items i where i.rehearsal_id=r;
  state := public.get_service_rehearsal_participant_state(c,sc);
  if state#>>'{rehearsal,id}' is distinct from r::text or state->'checkedInAt' is distinct from 'null'::jsonb
    or jsonb_array_length(state->'nodes')<>0 then raise exception 'Before report, only metadata is visible'; end if;
  begin perform public.check_in_service_rehearsal(c,sc,r,false); raise exception 'Offsite report allowed';
    exception when insufficient_privilege then null; end;
  begin perform public.check_in_service_rehearsal(c,sa,r,true); raise exception 'Foreign session allowed';
    exception when insufficient_privilege then null; end;
  begin perform public.check_in_service_rehearsal(v,sv,r,true); raise exception 'Volunteer allowed';
    exception when insufficient_privilege then null; end;
  begin perform public.check_in_service_rehearsal(late_user,sl,r,true); raise exception 'Inactive allowed';
    exception when insufficient_privilege then null; end;
  begin perform public.set_service_rehearsal_item(c,sc,r,item_id,true); raise exception 'Unchecked operation allowed';
    exception when object_not_in_prerequisite_state then null; end;
  t1 := public.check_in_service_rehearsal(c,sc,r,true);
  t2 := public.check_in_service_rehearsal(c,sc,r,true);
  if t1 is null or t1 is distinct from t2 or (select count(*) from public.service_rehearsal_members m where m.rehearsal_id=r and m.user_id=c)<>1 then
    raise exception 'Duplicate report not idempotent'; end if;
  perform public.set_service_rehearsal_item(c,sc,r,item_id,true);
  state := public.get_service_rehearsal_participant_state(c,sc);
  if state#>>'{nodes,0,checklist,0,isCompleted}' is distinct from 'true'
    or state#>>'{nodes,0,checklist,0,id}' is distinct from item_id::text then raise exception 'Own snapshot state not persisted'; end if;
  select s.completed_at into t1 from public.service_rehearsal_item_states s where s.rehearsal_id=r and s.user_id=c;
  perform public.set_service_rehearsal_item(c,sc,r,item_id,true);
  select s.completed_at into t2 from public.service_rehearsal_item_states s where s.rehearsal_id=r and s.user_id=c;
  if t1 is null or t1 is distinct from t2 then raise exception 'Repeated completion changed timestamp'; end if;
  begin perform public.set_service_rehearsal_item(c,sc,r,gen_random_uuid(),true); raise exception 'Unknown item allowed';
    exception when invalid_parameter_value then null; end;
  execute 'reset role';

  update public.profiles set is_active=true where id=late_user;
  execute 'set local role service_role';
  perform public.check_in_service_rehearsal(late_user,sl,r,true);
  state := public.get_service_rehearsal_participant_state(late_user,sl);
  if state#>>'{nodes,0,checklist,0,isCompleted}' is distinct from 'false' then raise exception 'Another user inherited task state'; end if;
  perform public.set_service_rehearsal_item(late_user,sl,r,item_id,true);
  perform public.set_service_rehearsal_item(c,sc,r,item_id,false);
  state := public.get_service_rehearsal_participant_state(late_user,sl);
  if state#>>'{nodes,0,checklist,0,isCompleted}' is distinct from 'true' then raise exception 'Other user state overwritten'; end if;
  execute 'reset role';
  delete from public.user_roles where user_id=c and role='coordinator';
  begin perform public.set_service_rehearsal_item(c,sc,r,item_id,true); raise exception 'Demoted user wrote';
    exception when insufficient_privilege then null; end;
  insert into public.user_roles(user_id,role) values(c,'coordinator');
  delete from auth.sessions where id=sl;
  begin perform public.get_service_rehearsal_participant_state(late_user,sl); raise exception 'Revoked session read';
    exception when insufficient_privilege then null; end;

  if original_reports<>(select count(*) from public.service_check_ins)
    or original_assignments<>(select count(*) from public.service_assignments)
    or original_states<>(select count(*) from public.assignment_checklist_states)
    or exists(select 1 from public.checklist_items where id='__participant_item__' and is_completed is true) then
    raise exception 'Rehearsal touched formal data'; end if;

  -- A real current-day report (including staff-assisted) clears only the
  -- affected rehearsal binding. Test is deterministic even on a weekday.
  insert into public.worship_services(service_date,service_type,starts_at,status)
    values(today,'主一堂',(today+time '09:00') at time zone 'Asia/Taipei','published') on conflict(service_date,service_type) do nothing;
  select id into f from public.worship_services where service_date=today and service_type='主一堂';
  update public.worship_services set status='published' where id=f;
  insert into public.service_assignments(service_id,user_id,role_label) values(f,c,'總招') returning id into fa;
  insert into public.service_check_ins(service_id,user_id,assignment_id,check_in_source) values(f,c,fa,'staff_assisted') returning id into ci;
  if exists(select 1 from public.service_rehearsal_members m where m.rehearsal_id=r and m.user_id=c and m.checked_in_at is not null)
    or not exists(select 1 from public.service_rehearsal_members m where m.rehearsal_id=r and m.user_id=late_user and m.checked_in_at is not null)
    or not exists(select 1 from public.service_check_ins where id=ci and status='checked_in') then raise exception 'Formal report did not win'; end if;
  if service_rehearsal_private.has_formal_check_in(c,clock_timestamp()) then
    state := public.get_service_rehearsal_participant_state(c,sc);
    if state->>'formalCheckIn' is distinct from 'true' or state->'rehearsal' is distinct from 'null'::jsonb then raise exception 'Formal priority read failed'; end if;
    begin perform public.check_in_service_rehearsal(c,sc,r,true); raise exception 'Formal report did not block rehearsal';
      exception when object_not_in_prerequisite_state then null; end;
  end if;

  -- Validate formal service cutoffs with an explicit clock independently
  -- of the day this disposable CI job runs.
  -- Build an isolated fixture through the same-day insert boundary first.
  -- Move only this disposable fixture to the fixed clock's date afterwards.
  -- Do not disable or relax the production check-in trigger.
  insert into public.worship_services(service_date,service_type,starts_at,status)
    values(today,'__rehearsal_clock__',(today+time '09:00') at time zone 'Asia/Taipei','published') returning id into fixed_service;
  insert into public.service_assignments(service_id,user_id,role_label) values(fixed_service,c,'總招') returning id into fixed_assignment;
  insert into public.service_check_ins(service_id,user_id,assignment_id,checked_in_at) values(fixed_service,c,fixed_assignment,'2030-01-06 08:00+08') returning id into fixed_report;
  update public.worship_services set service_date=fixed_sunday,service_type='主一堂',
    starts_at=(fixed_sunday+time '09:00') at time zone 'Asia/Taipei' where id=fixed_service;
  if not service_rehearsal_private.has_formal_check_in(c,'2030-01-06 10:44+08')
    or service_rehearsal_private.has_formal_check_in(c,'2030-01-06 10:45+08')
    or service_rehearsal_private.has_formal_check_in(c,'2030-01-07 09:00+08') then raise exception 'Incorrect formal lead window'; end if;
  update public.service_check_ins set status='cancelled' where id=fixed_report;
  if service_rehearsal_private.has_formal_check_in(c,'2030-01-06 10:44+08') then raise exception 'Cancelled report blocks rehearsal'; end if;

  perform public.end_service_rehearsal(a,sa,r);
  state := public.get_service_rehearsal_participant_state(c,sc);
  if state->'rehearsal' is distinct from 'null'::jsonb or jsonb_array_length(state->'nodes')<>0 then raise exception 'Closed snapshot visible'; end if;
  begin perform public.check_in_service_rehearsal(c,sc,r,true); raise exception 'Ended report allowed';
    exception when invalid_parameter_value then null; end;
  old_item := item_id;
  r2 := public.start_service_rehearsal(a,sa,'主一堂');
  perform public.check_in_service_rehearsal(a,sa,r2,true);
  begin perform public.set_service_rehearsal_item(a,sa,r2,old_item,true); raise exception 'Old rehearsal item accepted';
    exception when invalid_parameter_value then null; end;
  state := public.get_service_rehearsal_participant_state(a,sa);
  if state#>>'{nodes,0,checklist,0,isCompleted}' is distinct from 'false' then raise exception 'New rehearsal inherited old state'; end if;
  perform public.end_service_rehearsal(a,sa,r2);
end;
$$;
rollback;
