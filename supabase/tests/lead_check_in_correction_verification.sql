begin;

do $$
declare
  lead_id uuid := gen_random_uuid();
  deputy_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  unused_target_id uuid := gen_random_uuid();
  station_id uuid := gen_random_uuid();
  first_assignment_id uuid := gen_random_uuid();
  deputy_assignment_id uuid := gen_random_uuid();
  first_check_in_id uuid := gen_random_uuid();
  deputy_check_in_id uuid := gen_random_uuid();
  corrected public.service_check_ins;
  second_check_in_id uuid;
  today date := (current_timestamp at time zone 'Asia/Taipei')::date;
begin
  if has_function_privilege('authenticated', 'public.correct_lead_check_in(uuid, uuid, uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.correct_lead_check_in(uuid, uuid, uuid, text)', 'execute')
    or not has_function_privilege('service_role', 'public.correct_lead_check_in(uuid, uuid, uuid, text)', 'execute')
  then
    raise exception 'Correction must be callable only by the server role';
  end if;

  insert into auth.users (id, email, raw_user_meta_data) values
    (lead_id, 'correction-lead@example.invalid', '{"display_name":"Correction Lead"}'),
    (deputy_id, 'correction-deputy@example.invalid', '{"display_name":"Correction Deputy"}');
  update public.profiles set is_active = true where id in (lead_id, deputy_id);
  insert into public.user_roles (user_id, role) values (lead_id, 'coordinator'), (deputy_id, 'coordinator');

  insert into public.worship_services (id, service_date, service_type, starts_at, status)
  values
    (first_id, today, '__correction_first__', (today + time '09:00') at time zone 'Asia/Taipei', 'published'),
    (second_id, today, '__correction_second__', (today + time '11:00') at time zone 'Asia/Taipei', 'published'),
    (unused_target_id, today, '__correction_unused__', (today + time '19:00') at time zone 'Asia/Taipei', 'published');

  insert into public.service_stations (id, service_id, name, role_label)
  values (station_id, first_id, '總招', '總招');
  insert into public.service_assignments (id, service_id, user_id, station_id, role_label)
  values
    (first_assignment_id, first_id, lead_id, station_id, '總招'),
    (deputy_assignment_id, first_id, deputy_id, null, '副總招');
  insert into public.service_check_ins (id, service_id, user_id, assignment_id)
  values
    (first_check_in_id, first_id, lead_id, first_assignment_id),
    (deputy_check_in_id, first_id, deputy_id, deputy_assignment_id);

  begin
    perform public.correct_lead_check_in(deputy_id, deputy_check_in_id, second_id, null);
    raise exception 'Deputy unexpectedly corrected check-in' using errcode = 'XX000';
  exception when raise_exception then null;
  end;
  begin
    perform public.correct_lead_check_in(lead_id, deputy_check_in_id, second_id, null);
    raise exception 'Lead unexpectedly changed someone else''s check-in' using errcode = 'XX000';
  exception when raise_exception then null;
  end;

  insert into public.service_assignments (service_id, user_id, role_label, status)
  values (second_id, lead_id, '總招', 'cancelled');
  begin
    perform public.correct_lead_check_in(lead_id, first_check_in_id, second_id, null);
    raise exception 'Correction unexpectedly used a cancelled assignment' using errcode = 'XX000';
  exception when raise_exception then null;
  end;
  if not exists (select 1 from public.service_check_ins where id = first_check_in_id and status = 'checked_in') then
    raise exception 'Failed correction must leave the original check-in active';
  end if;

  update public.service_assignments set status = 'scheduled'
  where service_id = second_id and user_id = lead_id;
  corrected := public.correct_lead_check_in(lead_id, first_check_in_id, second_id, null);
  if corrected.service_id <> second_id or corrected.status <> 'checked_in'
    or not exists (select 1 from public.service_check_ins where id = first_check_in_id and status = 'cancelled')
    or not exists (
      select 1 from public.activity_logs
      where actor_user_id = lead_id and subject_id = first_check_in_id::text
        and event_type = 'check_in.service_corrected'
        and metadata->>'target_check_in_id' = corrected.id::text
    )
  then
    raise exception 'Correction must preserve the original record and link it to the new one';
  end if;

  second_check_in_id := corrected.id;
  corrected := public.correct_lead_check_in(lead_id, second_check_in_id, first_id, null);
  if corrected.id <> first_check_in_id or corrected.status <> 'checked_in' then
    raise exception 'A correction can be reversed without creating duplicate check-ins';
  end if;
  corrected := public.reopen_corrected_lead_check_in(lead_id, second_check_in_id);
  if corrected.id is distinct from second_check_in_id or not exists (
    select 1 from public.service_check_ins where id = first_check_in_id and status = 'checked_in'
  ) then
    raise exception 'Reporting the next service after a correction must preserve both reports';
  end if;
  update public.service_check_ins set status = 'cancelled' where id = second_check_in_id;
  corrected := public.reopen_corrected_lead_check_in(lead_id, second_check_in_id);
  if corrected.id is not null then
    raise exception 'A later cancellation without a new correction must remain cancelled';
  end if;
  insert into public.timeline_nodes (id, service_id, time, title, service_type)
  values ('__correction_task__', first_id, '08:00', 'Correction verification task', '__correction_first__');
  insert into public.checklist_items (id, node_id, text)
  values ('__correction_item__', '__correction_task__', 'Correction verification item');
  insert into public.service_task_assignments (service_id, assignment_id, timeline_node_id)
  values (first_id, first_assignment_id, '__correction_task__');
  begin
    insert into public.assignment_checklist_states (service_id, assignment_id, checklist_item_id)
    values (first_id, first_assignment_id, '__correction_item__');
    perform public.correct_lead_check_in(lead_id, first_check_in_id, unused_target_id, null);
    raise exception 'A recorded checklist unexpectedly allowed correction' using errcode = 'XX000';
  exception when raise_exception then null;
  end;

  insert into public.check_in_station_confirmations (
    check_in_id, service_id, user_id, station_id, station_name_snapshot
  ) values (first_check_in_id, first_id, lead_id, station_id, '總招');
  begin
    perform public.correct_lead_check_in(lead_id, first_check_in_id, unused_target_id, null);
    raise exception 'A confirmed station unexpectedly allowed correction' using errcode = 'XX000';
  exception when raise_exception then null;
  end;
end;
$$;

rollback;
