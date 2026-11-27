-- Run only in the disposable CI database. All fixture changes roll back.
begin;
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); late_user uuid := gen_random_uuid();
  v uuid := gen_random_uuid(); inactive_user uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); sc uuid := gen_random_uuid(); sv uuid := gen_random_uuid();
  r uuid; r2 uuid; first_due timestamptz; second_due timestamptz; ended timestamptz;
  table_name text; fn text; stamp timestamptz := clock_timestamp();
  state jsonb; repeated_end timestamptz; eligible_before bigint;
  original_services bigint; original_checkins bigint; original_assignments bigint;
begin
  foreach table_name in array array['service_rehearsals','service_rehearsal_members','service_rehearsal_nodes','service_rehearsal_items','service_rehearsal_item_states'] loop
    if not exists(select 1 from pg_class pc join pg_namespace ns on ns.oid=pc.relnamespace
      where ns.nspname='public' and pc.relname=table_name and pc.relrowsecurity)
      or has_table_privilege('anon','public.'||table_name,'SELECT')
      or has_table_privilege('authenticated','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Table % must have RLS and no client access',table_name;
    end if;
  end loop;
  foreach fn in array array['public.start_service_rehearsal(uuid,uuid,text)','public.end_service_rehearsal(uuid,uuid,uuid)',
    'public.get_service_rehearsal_admin_state(uuid,uuid)','service_rehearsal_private.is_eligible_user(uuid)'] loop
    if has_function_privilege('anon',fn,'execute') or has_function_privilege('authenticated',fn,'execute')
      or not has_function_privilege('service_role',fn,'execute') then
      raise exception 'Wrong RPC grants: %',fn;
    end if;
  end loop;
  if has_table_privilege('service_role','public.service_rehearsal_item_states','INSERT,UPDATE,DELETE') then
    raise exception 'Item writes must remain disabled pending participant RPC';
  end if;

  insert into auth.users(id,email,raw_user_meta_data) values
    (a,'rehearsal-admin-'||a||'@example.invalid','{"display_name":"Rehearsal admin"}'),
    (c,'rehearsal-coordinator-'||c||'@example.invalid','{"display_name":"Rehearsal coordinator"}'),
    (late_user,'rehearsal-late-'||late_user||'@example.invalid','{"display_name":"Late coordinator"}'),
    (v,'rehearsal-volunteer-'||v||'@example.invalid','{"display_name":"Volunteer"}'),
    (inactive_user,'rehearsal-inactive-'||inactive_user||'@example.invalid','{"display_name":"Inactive"}');
  update public.profiles set is_active=true where id in(a,c,v);
  insert into public.user_roles(user_id,role) values(a,'admin'),(c,'coordinator'),(late_user,'coordinator'),(v,'volunteer'),(inactive_user,'coordinator') on conflict do nothing;
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,stamp,stamp),(sc,c,stamp,stamp),(sv,v,stamp,stamp);

  select count(*) into original_services from public.worship_services;
  select count(*) into original_checkins from public.service_check_ins;
  select count(*) into original_assignments from public.service_assignments;
  update public.timeline_nodes set is_active=false where service_id is null and service_type='主一堂';
  insert into public.timeline_nodes(id,service_type,time,title,sort_order,is_active,voice_now_simple) values
    ('__rehearsal_a__','主一堂','08:00','First',0,true,'First cue'),
    ('__rehearsal_b__','主一堂','8:00:00','Same block',1,true,null),
    ('__rehearsal_c__','主一堂','09:30','Second',2,true,null),
    ('__rehearsal_off__','主一堂','10:00','Disabled',3,false,null);
  insert into public.checklist_items(id,node_id,text,sort_order,is_active) values
    ('__rehearsal_item__','__rehearsal_a__','Snapshot checklist',0,true),
    ('__rehearsal_item_off__','__rehearsal_a__','Disabled checklist',1,false);

  begin perform public.start_service_rehearsal(v,sv,'主一堂'); raise exception 'Volunteer start allowed';
    exception when insufficient_privilege then null; end;
  begin perform public.start_service_rehearsal(a,sc,'主一堂'); raise exception 'Foreign session allowed';
    exception when insufficient_privilege then null; end;
  if not service_rehearsal_private.is_eligible_user(c)
    or not service_rehearsal_private.is_eligible_user(a)
    or service_rehearsal_private.is_eligible_user(v)
    or service_rehearsal_private.is_eligible_user(inactive_user)
    or service_rehearsal_private.is_eligible_user(late_user) then
    raise exception 'Current active roles must determine eligibility'; end if;

  -- An invalid source time rolls back the entire start, including membership.
  insert into public.timeline_nodes(id,service_type,time,title,sort_order,is_active) values
    ('__rehearsal_bad__','主一堂','24:00','Invalid',4,true);
  begin perform public.start_service_rehearsal(a,sa,'主一堂'); raise exception 'Invalid template allowed';
    exception when not_null_violation then null; end;
  delete from public.timeline_nodes where id='__rehearsal_bad__';
  if exists(select 1 from public.service_rehearsals where ended_at is null) then raise exception 'Failed start leaked a session'; end if;

  -- Invoke real management RPCs as the server role (not as postgres).
  execute 'set local role service_role';
  r := public.start_service_rehearsal(a,sa,'主一堂');
  if r is null or (select count(*) from public.service_rehearsal_members where rehearsal_id=r)<>0
    or (select count(*) from public.service_rehearsal_nodes where rehearsal_id=r)<>3
    or (select count(*) from public.service_rehearsal_items where rehearsal_id=r)<>1 then
    raise exception 'Incomplete snapshot or unexpected pre-enrollment';
  end if;
  select due_at into first_due from public.service_rehearsal_nodes where rehearsal_id=r and source_node_id='__rehearsal_a__';
  select due_at into second_due from public.service_rehearsal_nodes where rehearsal_id=r and source_node_id='__rehearsal_c__';
  if first_due is null or second_due-first_due<>interval '2 minutes'
    or not exists(select 1 from public.service_rehearsal_nodes where rehearsal_id=r and source_node_id='__rehearsal_b__' and due_at=first_due)
    or not exists(select 1 from public.service_rehearsal_nodes n join public.service_rehearsals s on s.id=n.rehearsal_id
      where n.rehearsal_id=r and n.source_node_id='__rehearsal_a__' and n.content->>'voice_now_simple'='First cue'
        and n.due_at>=s.started_at+interval '6 minutes' and n.due_at<s.started_at+interval '7 minutes')
    then raise exception 'Incorrect grouped task times or voice snapshot'; end if;

  begin perform public.start_service_rehearsal(a,sa,'主一堂'); raise exception 'Second active session allowed';
    exception when unique_violation then null; end;
  state := public.get_service_rehearsal_admin_state(a,sa);
  if state#>>'{rehearsal,id}' is distinct from r::text
    or (state->>'checkedInCount')::integer<>0
    or state ? 'members' or state ? 'eligibleUsers' then
    raise exception 'Incorrect admin aggregate or unexpected roster'; end if;
  eligible_before := (state->>'eligibleCount')::bigint;
  if eligible_before<2 then raise exception 'Existing coordinators must be eligible'; end if;
  begin perform public.get_service_rehearsal_admin_state(c,sc); raise exception 'Coordinator viewed admin roster';
    exception when insufficient_privilege then null; end;
  begin perform public.get_service_rehearsal_admin_state(a,sc); raise exception 'Foreign session viewed admin roster';
    exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- Newly activated coordinators count immediately without adding a member row.
  update public.profiles set is_active=true where id=late_user;
  execute 'set local role service_role';
  if not service_rehearsal_private.is_eligible_user(late_user) then raise exception 'Late approval not recognized'; end if;
  state := public.get_service_rehearsal_admin_state(a,sa);
  if (state->>'eligibleCount')::bigint<>eligible_before+1
    or exists(select 1 from public.service_rehearsal_members where rehearsal_id=r) then
    raise exception 'Late approval must not require pre-enrollment'; end if;
  execute 'reset role';
  delete from public.user_roles where user_id=late_user and role='coordinator';
  state := public.get_service_rehearsal_admin_state(a,sa);
  if service_rehearsal_private.is_eligible_user(late_user)
    or (state->>'eligibleCount')::bigint<>eligible_before then
    raise exception 'Role removal must remove eligibility'; end if;
  insert into public.user_roles(user_id,role) values(late_user,'coordinator');

  -- Later template edits must not change an active snapshot.
  update public.timeline_nodes set title='Edited' where id='__rehearsal_a__';
  update public.checklist_items set text='Edited' where id='__rehearsal_item__';
  if not exists(select 1 from public.service_rehearsal_nodes where rehearsal_id=r and source_node_id='__rehearsal_a__' and content->>'title'='First')
    or not exists(select 1 from public.service_rehearsal_items where rehearsal_id=r and text='Snapshot checklist') then
    raise exception 'Formal template edit changed snapshot'; end if;
  -- Simulate a long session and a future participant check-in. Only manual
  -- end (not the age or last task) clears it.
  update public.service_rehearsals set started_at=clock_timestamp()-interval '2 hours' where id=r;
  -- Fixture only: simulate a future participant check-in; no HTTP check-in yet.
  insert into public.service_rehearsal_members(rehearsal_id,user_id,checked_in_at) values(r,c,clock_timestamp());
  state := public.get_service_rehearsal_admin_state(a,sa);
  if (state->>'checkedInCount')::bigint<>1 then raise exception 'Expected check-in count'; end if;
  if not exists(select 1 from public.service_rehearsals where id=r and ended_at is null) then raise exception 'Unexpected expiry'; end if;
  begin perform public.end_service_rehearsal(c,sc,r); raise exception 'Coordinator ended session';
    exception when insufficient_privilege then null; end;
  delete from auth.sessions where id=sa;
  begin perform public.end_service_rehearsal(a,sa,r); raise exception 'Revoked login ended session';
    exception when insufficient_privilege then null; end;
  -- Administrator can reconnect using a newly verified session.
  sa := gen_random_uuid();
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,clock_timestamp(),clock_timestamp());
  execute 'set local role service_role';
  ended := public.end_service_rehearsal(a,sa,r);
  repeated_end := public.end_service_rehearsal(a,sa,r);
  if ended is null or repeated_end is distinct from ended
    or exists(select 1 from public.service_rehearsal_members where rehearsal_id=r and checked_in_at is not null) then
    raise exception 'End must be idempotent and clear check-in'; end if;
  r2 := public.start_service_rehearsal(a,sa,'主一堂');
  if r2=r or exists(select 1 from public.service_rehearsal_members where rehearsal_id=r2 and checked_in_at is not null)
    or not exists(select 1 from public.service_rehearsal_nodes where rehearsal_id=r2 and content->>'title'='Edited') then
    raise exception 'New rehearsal must have independent state and snapshot'; end if;
  perform public.end_service_rehearsal(a,sa,r);
  if not exists(select 1 from public.service_rehearsals where id=r2 and ended_at is null) then raise exception 'Old end request closed new session'; end if;
  perform public.end_service_rehearsal(a,sa,r2);
  state := public.get_service_rehearsal_admin_state(a,sa);
  if state->'rehearsal' is distinct from 'null'::jsonb or (state->>'checkedInCount')::integer<>0 then
    raise exception 'Ended rehearsal remains visible'; end if;
  execute 'reset role';
  if original_services<>(select count(*) from public.worship_services)
    or original_checkins<>(select count(*) from public.service_check_ins)
    or original_assignments<>(select count(*) from public.service_assignments)
    or exists(select 1 from public.service_check_ins where user_id in(a,c,late_user,v,inactive_user)) then
    raise exception 'Rehearsal changed formal data'; end if;
end;
$$;
rollback;
