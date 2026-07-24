-- Run only on a local or Supabase preview database after all migrations.
begin;
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if not coalesce(condition,false) then raise exception 'schedule verification failed: %',message; end if; end $$;

insert into auth.users(id,email,raw_user_meta_data) values
('71111111-1111-4111-8111-111111111111','schedule-admin@example.invalid','{"display_name":"Schedule Admin"}'),
('72222222-2222-4222-8222-222222222222','schedule-coordinator@example.invalid','{"display_name":"Schedule Coordinator"}'),
('73333333-3333-4333-8333-333333333333','schedule-volunteer@example.invalid','{"display_name":"Schedule Volunteer"}');
update public.profiles set is_active=true where id in ('71111111-1111-4111-8111-111111111111','72222222-2222-4222-8222-222222222222','73333333-3333-4333-8333-333333333333');
insert into public.user_roles(user_id,role,granted_by) values
('71111111-1111-4111-8111-111111111111','admin','71111111-1111-4111-8111-111111111111'),
('72222222-2222-4222-8222-222222222222','coordinator','71111111-1111-4111-8111-111111111111');
insert into public.worship_services(id,service_date,service_type,starts_at,report_at,location,status,created_by,updated_by) values
('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2099-01-04','主一堂','2099-01-04 09:00+08','2099-01-04 08:20+08','夏凱納靈糧堂','draft','71111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111'),
('7ddddddd-dddd-4ddd-8ddd-dddddddddddd','2099-01-18','主一堂','2099-01-18 09:00+08','2099-01-18 08:20+08','夏凱納靈糧堂','draft','71111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111');
insert into public.service_stations(id,service_id,name,role_label) values ('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2樓大堂專招','專招');
insert into public.service_assignments(id,service_id,user_id,station_id,role_label,status,created_by) values ('7ccccccc-cccc-4ccc-8ccc-cccccccccccc','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','73333333-3333-4333-8333-333333333333','7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','專招','scheduled','71111111-1111-4111-8111-111111111111');
insert into public.service_coordinators(service_id,user_id,granted_by) values ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','72222222-2222-4222-8222-222222222222','71111111-1111-4111-8111-111111111111');
insert into public.timeline_nodes(id,time,title,service_type,is_active) values ('__schedule_template__','08:00','標準集合','主一堂',true);
insert into public.checklist_items(id,node_id,text,is_active) values ('__schedule_template_item__','__schedule_template__','領取對講機',true);
insert into public.timeline_nodes(id,service_id,source_template_node_id,time,title,service_type,is_active) values ('__schedule_service_task__','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','__schedule_template__','08:05','本堂提早集合','主一堂',true);
insert into public.checklist_items(id,node_id,source_template_item_id,text,is_active) values ('__schedule_service_item__','__schedule_service_task__','__schedule_template_item__','本堂領取兩台對講機',true);
insert into public.service_task_assignments(service_id,assignment_id,timeline_node_id,created_by) values ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','7ccccccc-cccc-4ccc-8ccc-cccccccccccc','__schedule_service_task__','71111111-1111-4111-8111-111111111111');
insert into public.service_required_items(service_id,name,quantity,created_by,updated_by) values ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','對講機',2,'71111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111');

set local role authenticated;
select set_config('request.jwt.claim.sub','72222222-2222-4222-8222-222222222222',true);
do $$ declare affected integer; begin update public.timeline_nodes set title='must fail' where id='__schedule_service_task__'; get diagnostics affected=row_count; perform pg_temp.assert_true(affected=0,'coordinator changed schedule'); end $$;
do $$ declare affected integer; begin update public.service_assignments set role_label='must fail' where id='7ccccccc-cccc-4ccc-8ccc-cccccccccccc'; get diagnostics affected=row_count; perform pg_temp.assert_true(affected=0,'coordinator changed assignment'); end $$;

select set_config('request.jwt.claim.sub','71111111-1111-4111-8111-111111111111',true);
select public.ensure_service_task_snapshot('7ddddddd-dddd-4ddd-8ddd-dddddddddddd','__schedule_template__') as atomic_snapshot_id \gset
select pg_temp.assert_true((select service_id='7ddddddd-dddd-4ddd-8ddd-dddddddddddd' from public.timeline_nodes where id=:'atomic_snapshot_id'),'atomic snapshot node missing');
select pg_temp.assert_true((select count(*)=1 from public.checklist_items where node_id=:'atomic_snapshot_id' and source_template_item_id='__schedule_template_item__'),'atomic snapshot checklist missing');
select pg_temp.assert_true(public.ensure_service_task_snapshot('7ddddddd-dddd-4ddd-8ddd-dddddddddddd','__schedule_template__')=:'atomic_snapshot_id','snapshot RPC is not idempotent');

update public.worship_services set status='completed' where id='7ddddddd-dddd-4ddd-8ddd-dddddddddddd';
do $$ begin
  perform public.ensure_service_task_snapshot('7ddddddd-dddd-4ddd-8ddd-dddddddddddd','__schedule_template__');
  raise exception 'completed service snapshot unexpectedly succeeded';
exception
  when sqlstate '23514' then null;
end $$;

select public.copy_worship_service_schedule('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2099-01-11','2099-01-11 09:00+08','2099-01-11 08:20+08','夏凱納靈糧堂','verification','draft',true) as copied_service_id \gset
select pg_temp.assert_true((select count(*)=1 from public.timeline_nodes where service_id=:'copied_service_id' and is_active),'resolved task copy failed');
select pg_temp.assert_true((select count(*)=1 from public.service_required_items where service_id=:'copied_service_id'),'required item copy failed');
select pg_temp.assert_true((select count(*)=1 and bool_and(status='scheduled') from public.service_assignments where service_id=:'copied_service_id'),'assignment reset failed');
select pg_temp.assert_true((select count(*)=0 from public.service_check_ins where service_id=:'copied_service_id'),'check-in history copied');
select pg_temp.assert_true((select count(*)=0 from public.assignment_checklist_states where service_id=:'copied_service_id'),'checklist history copied');
select pg_temp.assert_true((select title='標準集合' from public.timeline_nodes where id='__schedule_template__'),'template changed');
rollback;
