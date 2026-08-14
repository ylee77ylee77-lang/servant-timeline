-- Live-service status authorization scenarios. All fixtures are rolled back.

begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'live status scope verification failed: %', message;
  end if;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('81000000-0000-4000-8000-000000000001', 'live-admin@example.invalid', '{"display_name":"Live Admin"}'),
  ('81000000-0000-4000-8000-000000000002', 'live-lead@example.invalid', '{"display_name":"Live Lead"}'),
  ('81000000-0000-4000-8000-000000000003', 'live-deputy@example.invalid', '{"display_name":"Live Deputy"}'),
  ('81000000-0000-4000-8000-000000000004', 'live-second-floor@example.invalid', '{"display_name":"Live 2F"}'),
  ('81000000-0000-4000-8000-000000000005', 'live-third-floor@example.invalid', '{"display_name":"Live 3F"}');

update public.profiles
set is_active = true,
    account_code = 'live-' || right(id::text, 4)
where id::text like '81000000-0000-4000-8000-%';

insert into public.user_roles (user_id, role, granted_by) values
  ('81000000-0000-4000-8000-000000000001', 'admin', '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000002', 'coordinator', '81000000-0000-4000-8000-000000000001'),
  ('81000000-0000-4000-8000-000000000003', 'coordinator', '81000000-0000-4000-8000-000000000001');

insert into public.worship_services (
  id, service_date, service_type, starts_at, report_at, status, created_by, updated_by
) values
  (
    '82000000-0000-4000-8000-000000000001',
    (current_timestamp at time zone 'Asia/Taipei')::date,
    '主二堂', current_timestamp + interval '1 hour', current_timestamp,
    'published', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001'
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    (current_timestamp at time zone 'Asia/Taipei')::date + 7,
    '__live_unrelated__', current_timestamp + interval '7 days', current_timestamp + interval '6 days',
    'published', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001'
  );

insert into public.service_stations (id, service_id, name, role_label) values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '總招', '總招'),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '副總招', '副總招'),
  ('83000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', '2A 區塊牧招', '牧招'),
  ('83000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', '7A 區塊牧招', '牧招'),
  ('83000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000002', 'Unrelated Station', '專招');

insert into public.service_assignments (
  id, service_id, user_id, station_id, role_label, status, created_by
) values
  ('84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001', '總招', 'scheduled', '81000000-0000-4000-8000-000000000001'),
  ('84000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000002', '副總招', 'scheduled', '81000000-0000-4000-8000-000000000001'),
  ('84000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000003', '牧招', 'scheduled', '81000000-0000-4000-8000-000000000001'),
  ('84000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000005', '83000000-0000-4000-8000-000000000004', '牧招', 'scheduled', '81000000-0000-4000-8000-000000000001'),
  ('84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000005', '專招', 'scheduled', '81000000-0000-4000-8000-000000000001');

insert into public.service_coordinators (service_id, user_id, granted_by) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001');

select pg_temp.assert_true(
  (
    select array_agg(coordination_scope order by user_id) = array['all', 'third_floor']
    from public.service_coordinators
    where service_id = '82000000-0000-4000-8000-000000000001'
  ),
  'coordinator scopes were not derived from 總招 and 副總招 assignments'
);

update public.service_assignments
set role_label = '總招'
where id = '84000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(
  (
    select coordination_scope = 'all'
    from public.service_coordinators
    where user_id = '81000000-0000-4000-8000-000000000003'
      and service_id = '82000000-0000-4000-8000-000000000001'
  ),
  'coordinator scope did not refresh after an assignment role change'
);
update public.service_assignments
set role_label = '副總招'
where id = '84000000-0000-4000-8000-000000000002';

insert into public.timeline_nodes (
  id, service_id, service_type, time, title, assignee, is_active
) values
  ('__live_2f_task__', '82000000-0000-4000-8000-000000000001', '主二堂', '10:00', 'Live 2F Task', '牧招', true),
  ('__live_3f_task__', '82000000-0000-4000-8000-000000000001', '主二堂', '10:00', 'Live 3F Task', '牧招', true);

insert into public.checklist_items (id, node_id, text, sort_order, is_active) values
  ('__live_2f_item__', '__live_2f_task__', 'Live 2F Item', 0, true),
  ('__live_3f_item__', '__live_3f_task__', 'Live 3F Item', 0, true);

insert into public.service_task_assignments (
  service_id, assignment_id, timeline_node_id, created_by
) values
  ('82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000003', '__live_2f_task__', '81000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000004', '__live_3f_task__', '81000000-0000-4000-8000-000000000001');

insert into public.service_check_ins (
  id, service_id, user_id, assignment_id, status, check_in_source
) values
  ('85000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000003', 'checked_in', 'web'),
  ('85000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000005', '84000000-0000-4000-8000-000000000004', 'checked_in', 'web');

set local role authenticated;

-- A volunteer can still read their own operational row, never the team.
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);
select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(user_id = '81000000-0000-4000-8000-000000000004') from public.service_assignments),
  'volunteer can read team assignments'
);

-- 總招 sees the whole granted service but not unrelated services.
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(id = '82000000-0000-4000-8000-000000000001') from public.worship_services),
  'lead can read an unrelated service'
);
select pg_temp.assert_true(
  (select count(*) = 4 from public.service_assignments),
  'lead cannot read the assigned service team'
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.service_task_assignments),
  'lead cannot read all related task mappings'
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.timeline_nodes where id like '__live_%'),
  'lead cannot read all service task definitions'
);

-- 副總招 sees self plus three-floor rows, never second-floor rows or tasks.
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true(
  (
    select array_agg(id order by id) = array[
      '84000000-0000-4000-8000-000000000002'::uuid,
      '84000000-0000-4000-8000-000000000004'::uuid
    ]
    from public.service_assignments
  ),
  'deputy assignment visibility is not limited to three-floor scope'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(timeline_node_id = '__live_3f_task__') from public.service_task_assignments),
  'deputy task visibility is not limited to three-floor scope'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(id = '__live_3f_task__') from public.timeline_nodes where id like '__live_%'),
  'deputy task definitions are not limited to three-floor scope'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(assignment_id = '84000000-0000-4000-8000-000000000004') from public.service_check_ins),
  'deputy check-in visibility is not limited to three-floor scope'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.profiles
    where id = '81000000-0000-4000-8000-000000000004'
  ),
  'deputy can read a second-floor profile'
);

select * from public.set_assignment_checklist_state(
  '84000000-0000-4000-8000-000000000004', '__live_3f_item__', true
);
do $$
begin
  begin
    perform public.set_assignment_checklist_state(
      '84000000-0000-4000-8000-000000000003', '__live_2f_item__', true
    );
    raise exception 'deputy unexpectedly updated a second-floor task';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;

-- Admin retains the all-services view.
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) = 2 from public.worship_services),
  'admin cannot read all authorized services'
);
select pg_temp.assert_true(
  (select count(*) = 5 from public.service_assignments),
  'admin cannot read all assignments'
);

rollback;
