-- Run after all migrations on a local or preview database. Fixtures roll back.
begin;
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$ begin if not coalesce(condition,false) then raise exception 'snapshot verification failed: %',message; end if; end $$;

insert into auth.users(id,email,raw_user_meta_data) values
('71111111-1111-4111-8111-111111111111','snapshot-admin@example.invalid','{"display_name":"Snapshot Admin"}'),
('72222222-2222-4222-8222-222222222222','snapshot-coordinator@example.invalid','{"display_name":"Snapshot Coordinator"}');
update public.profiles set is_active=true where id in ('71111111-1111-4111-8111-111111111111','72222222-2222-4222-8222-222222222222');
insert into public.user_roles(user_id,role) values ('71111111-1111-4111-8111-111111111111','admin'),('72222222-2222-4222-8222-222222222222','coordinator');
insert into public.worship_services(id,service_date,service_type,starts_at,report_at,status) values ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2099-01-04','主一堂','2099-01-04 09:00+08','2099-01-04 08:20+08','draft');
insert into public.service_coordinators(service_id,user_id,granted_by) values ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','72222222-2222-4222-8222-222222222222','71111111-1111-4111-8111-111111111111');
insert into public.timeline_nodes(id,time,title,service_type) values ('__snapshot_template__','08:00','Template task','主一堂');

set local role authenticated;
select set_config('request.jwt.claim.sub','72222222-2222-4222-8222-222222222222',true);
select pg_temp.assert_true((select count(*)=1 from public.timeline_nodes),'coordinator cannot read authorized template');
do $$ declare affected integer; begin update public.timeline_nodes set title='must fail' where id='__snapshot_template__'; get diagnostics affected=row_count; perform pg_temp.assert_true(affected=0,'coordinator changed schedule definition'); end $$;

select set_config('request.jwt.claim.sub','71111111-1111-4111-8111-111111111111',true);
insert into public.timeline_nodes(id,service_id,source_template_node_id,time,title,service_type) values ('__snapshot_service__','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','__snapshot_template__','08:05','Service-only task','主一堂');
select pg_temp.assert_true((select title='Template task' from public.timeline_nodes where id='__snapshot_template__'),'service snapshot changed template');
select pg_temp.assert_true((select title='Service-only task' from public.timeline_nodes where id='__snapshot_service__'),'service snapshot missing');
rollback;
