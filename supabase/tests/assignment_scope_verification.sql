-- Representative assignment-scoped authorization checks.
-- Run only on a local or preview database after all migrations. Every fixture
-- is created inside this transaction and removed by the final rollback.

begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assignment scope verification failed: %', message;
  end if;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'rbac-volunteer-1@example.invalid', '{"display_name":"RBAC Volunteer 1"}'),
  ('22222222-2222-4222-8222-222222222222', 'rbac-volunteer-2@example.invalid', '{"display_name":"RBAC Volunteer 2"}'),
  ('33333333-3333-4333-8333-333333333333', 'rbac-coordinator@example.invalid', '{"display_name":"RBAC Coordinator"}'),
  ('44444444-4444-4444-8444-444444444444', 'rbac-admin@example.invalid', '{"display_name":"RBAC Admin"}'),
  ('55555555-5555-4555-8555-555555555555', 'rbac-inactive@example.invalid', '{"display_name":"RBAC Inactive"}');

update public.profiles
set is_active = id <> '55555555-5555-4555-8555-555555555555',
    account_code = case id
      when '11111111-1111-4111-8111-111111111111' then 'rbac-volunteer-1'
      when '22222222-2222-4222-8222-222222222222' then 'rbac-volunteer-2'
      when '33333333-3333-4333-8333-333333333333' then 'rbac-coordinator'
      when '44444444-4444-4444-8444-444444444444' then 'rbac-admin'
      else 'rbac-inactive'
    end
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);

insert into public.user_roles (user_id, role, granted_by) values
  ('33333333-3333-4333-8333-333333333333', 'coordinator', '44444444-4444-4444-8444-444444444444'),
  ('44444444-4444-4444-8444-444444444444', 'admin', '44444444-4444-4444-8444-444444444444');

insert into public.worship_services (
  id, service_date, service_type, starts_at, report_at, status, created_by, updated_by
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    (current_timestamp at time zone 'Asia/Taipei')::date,
    '__rbac_s1__',
    current_timestamp + interval '1 hour',
    current_timestamp - interval '1 hour',
    'published',
    '44444444-4444-4444-8444-444444444444',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    (current_timestamp at time zone 'Asia/Taipei')::date,
    '__rbac_s2__',
    current_timestamp + interval '2 hours',
    current_timestamp - interval '1 hour',
    'published',
    '44444444-4444-4444-8444-444444444444',
    '44444444-4444-4444-8444-444444444444'
  );

insert into public.service_stations (id, service_id, name, role_label) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'RBAC Station 1', '專招'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'RBAC Wrong Station', '專招'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'RBAC Station 2', '牧招');

insert into public.service_assignments (
  id, service_id, user_id, station_id, role_label, status, created_by
) values
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    '專招',
    'scheduled',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    '牧招',
    'scheduled',
    '44444444-4444-4444-8444-444444444444'
  );

insert into public.service_coordinators (service_id, user_id, granted_by) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
);

insert into public.timeline_nodes (id, time, title, assignee, service_type) values
  ('__rbac_node_s1__', '08:00', 'RBAC S1 Task', '專招', '__rbac_s1__'),
  ('__rbac_node_s2__', '09:00', 'RBAC S2 Task', '牧招', '__rbac_s2__');

insert into public.checklist_items (id, node_id, text, sort_order) values
  ('__rbac_item_s1__', '__rbac_node_s1__', 'RBAC S1 Checklist', 0),
  ('__rbac_item_s2__', '__rbac_node_s2__', 'RBAC S2 Checklist', 0);

insert into public.service_task_assignments (
  service_id, assignment_id, timeline_node_id, created_by
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    '__rbac_node_s1__',
    '44444444-4444-4444-8444-444444444444'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    '__rbac_node_s2__',
    '44444444-4444-4444-8444-444444444444'
  );

insert into public.service_check_ins (
  id, service_id, user_id, assignment_id, status, check_in_source
) values
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'checked_in',
    'web'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '22222222-2222-4222-8222-222222222222',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    'checked_in',
    'web'
  );

insert into public.check_in_station_confirmations (
  id, check_in_id, service_id, user_id, station_id, station_name_snapshot
) values
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'RBAC Station 1'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    'RBAC Station 2'
  );

do $$
begin
  begin
    insert into public.check_in_station_confirmations (
      check_in_id, service_id, user_id, station_id, station_name_snapshot
    ) values (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      '11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'RBAC Wrong Station'
    );
    raise exception 'wrong-station confirmation unexpectedly succeeded';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.worship_services limit 1;
    raise exception 'anonymous service read unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.worship_services),
  'inactive user can read worship services'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.timeline_nodes),
  'inactive user can read timeline tasks'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select pg_temp.assert_true(
  (select array_agg(id order by id) = array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid] from public.worship_services),
  'volunteer can read a cross-service worship service'
);
select pg_temp.assert_true(
  (select array_agg(id order by id) = array['cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid] from public.service_assignments),
  'volunteer can read another assignment'
);
select pg_temp.assert_true(
  (select array_agg(id order by id) = array['__rbac_node_s1__'::text] from public.timeline_nodes),
  'volunteer task visibility is not assignment scoped'
);
select pg_temp.assert_true(
  (select array_agg(id order by id) = array['__rbac_item_s1__'::text] from public.checklist_items),
  'volunteer checklist visibility is not assignment scoped'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(user_id = '11111111-1111-4111-8111-111111111111') from public.service_check_ins),
  'volunteer can read another check-in'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(user_id = '11111111-1111-4111-8111-111111111111') from public.check_in_station_confirmations),
  'volunteer can read another station confirmation'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.service_coordinators),
  'volunteer can read service coordinator grants'
);

do $$
declare
  affected integer;
begin
  update public.service_assignments
  set notes = 'volunteer write must fail'
  where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'volunteer can update an assignment');
end;
$$;

select * from public.set_assignment_checklist_state(
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  '__rbac_item_s1__',
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(is_completed) from public.assignment_checklist_states),
  'volunteer could not persist their own checklist state'
);

do $$
begin
  begin
    perform public.set_assignment_checklist_state(
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
      '__rbac_item_s2__',
      true
    );
    raise exception 'cross-assignment checklist update unexpectedly succeeded';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select pg_temp.assert_true(
  (select array_agg(id order by id) = array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid] from public.worship_services),
  'coordinator service visibility is not authorization scoped'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(service_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') from public.service_assignments),
  'coordinator assignment visibility is not authorization scoped'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(service_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') from public.service_coordinators),
  'coordinator cannot read coordination grants for the authorized service'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  'coordinator can read a profile outside the authorized team'
);

do $$
declare
  affected integer;
begin
  update public.service_assignments
  set notes = 'authorized coordinator update'
  where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 1, 'coordinator cannot update an authorized assignment');

  update public.service_assignments
  set notes = 'cross-service coordinator update must fail'
  where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'coordinator can update a cross-service assignment');
end;
$$;

do $$
begin
  begin
    insert into public.service_task_assignments (
      service_id, assignment_id, timeline_node_id
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      '__rbac_node_s2__'
    );
    raise exception 'cross-service task mapping unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.worship_services (
      service_date, service_type, starts_at, status
    ) values (
      date '2099-01-01', '__coordinator_forbidden__', timestamptz '2099-01-01 01:00:00+00', 'draft'
    );
    raise exception 'coordinator service creation unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select pg_temp.assert_true(
  (select count(*) = 2 from public.worship_services),
  'administrator cannot read every worship service'
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.service_assignments),
  'administrator cannot read every assignment'
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.timeline_nodes where id like '__rbac_node_%'),
  'administrator cannot read every task definition'
);

do $$
declare
  affected integer;
begin
  update public.worship_services
  set location = 'administrator verified'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 1, 'administrator cannot manage a worship service');
end;
$$;

reset role;
rollback;
