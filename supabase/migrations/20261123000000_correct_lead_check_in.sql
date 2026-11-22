-- Change both report records and write the audit event in one transaction.
create function public.correct_lead_check_in(
  p_user_id uuid,
  p_check_in_id uuid,
  p_target_service_id uuid,
  p_ministry_group text
)
returns public.service_check_ins
language plpgsql
set search_path = pg_catalog
as $$
declare
  original public.service_check_ins;
  target public.worship_services;
  assignment public.service_assignments;
  corrected public.service_check_ins;
  local_now timestamp := statement_timestamp() at time zone 'Asia/Taipei';
  is_lead boolean;
  is_deputy boolean;
begin
  -- Serialize correction attempts by the same coordinator.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into original from public.service_check_ins
  where id = p_check_in_id and user_id = p_user_id for update;
  select * into target from public.worship_services
  where id = p_target_service_id and service_date = local_now::date and status = 'published'
  for share;

  select coalesce(bool_or(sa.role_label = '總招'), false),
    coalesce(bool_or(sa.role_label = '副總招'), false)
  into is_lead, is_deputy
  from public.service_assignments sa
  join public.worship_services ws on ws.id = sa.service_id
  where sa.user_id = p_user_id
    and sa.status in ('scheduled', 'confirmed', 'completed')
    and ws.service_date = local_now::date and ws.status in ('published', 'completed');

  if original.id is null or target.id is null or original.service_id = target.id
    or original.status <> 'checked_in'
    or not exists (
      select 1 from public.worship_services
      where id = original.service_id and service_date = local_now::date and status = 'published'
    )
    or not exists (
      select 1 from public.user_roles ur
      join public.profiles p on p.id = ur.user_id and p.is_active
      where ur.user_id = p_user_id and ur.role = 'coordinator'
    )
    or exists (
      select 1 from public.user_roles where user_id = p_user_id and role = 'admin'
    )
    or (is_deputy and not is_lead)
    or exists (
      select 1 from public.check_in_station_confirmations where check_in_id = original.id
    )
    or exists (
      select 1 from public.assignment_checklist_states where assignment_id = original.assignment_id
    )
  then
    raise exception 'Check-in correction is no longer available';
  end if;

  select * into assignment from public.service_assignments
  where service_id = target.id and user_id = p_user_id and status in ('scheduled', 'confirmed')
  order by (role_label = '總招') desc, (role_label = '待分派'), created_at limit 1 for share;

  if assignment.id is null then
    if exists (
      select 1 from public.service_assignments
      where service_id = target.id and user_id = p_user_id and status in ('declined', 'cancelled')
    ) then
      raise exception 'Target assignment does not allow check-in';
    end if;
    insert into public.service_assignments (
      service_id, user_id, role_label, report_at, report_location, ministry_group, notes
    ) values (
      target.id, p_user_id, '待分派', target.report_at, target.location, p_ministry_group,
      '系統於堂次更正時建立'
    ) returning * into assignment;
  end if;

  select * into corrected from public.service_check_ins
  where service_id = target.id and user_id = p_user_id for update;
  if corrected.id is null then
    insert into public.service_check_ins (service_id, user_id, assignment_id)
    values (target.id, p_user_id, assignment.id) returning * into corrected;
  elsif corrected.status = 'cancelled' and exists (
    select 1 from public.activity_logs
    where event_type = 'check_in.service_corrected'
      and subject_id = corrected.id::text and actor_user_id = p_user_id
      and occurred_at >= corrected.checked_in_at
  ) then
    update public.service_check_ins set status = 'checked_in',
      checked_in_at = clock_timestamp(), assignment_id = assignment.id
    where id = corrected.id returning * into corrected;
  else
    raise exception 'Target already has a report record';
  end if;

  update public.service_check_ins set status = 'cancelled' where id = original.id;
  insert into public.activity_logs (actor_user_id, service_id, event_type, subject_type, subject_id, metadata, occurred_at)
  values (p_user_id, original.service_id, 'check_in.service_corrected', 'service_check_ins', original.id::text,
    jsonb_build_object('target_service_id', target.id, 'target_check_in_id', corrected.id,
      'original_checked_in_at', original.checked_in_at), clock_timestamp());
  return corrected;
end;
$$;

revoke all on function public.correct_lead_check_in(uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.correct_lead_check_in(uuid, uuid, uuid, text)
to service_role;

-- An earlier correction may be followed by a legitimate second report.
-- A staff cancellation without a correction event remains cancelled.
create function public.reopen_corrected_lead_check_in(p_user_id uuid, p_check_in_id uuid)
returns public.service_check_ins
language sql
set search_path = pg_catalog
as $$
  update public.service_check_ins as check_in
  set status = 'checked_in', checked_in_at = clock_timestamp()
  where check_in.id = p_check_in_id and check_in.user_id = p_user_id
    and check_in.status = 'cancelled'
    and exists (
      select 1 from public.activity_logs
      where actor_user_id = p_user_id and subject_id = check_in.id::text
        and event_type = 'check_in.service_corrected' and occurred_at >= check_in.checked_in_at
    )
    and exists (
      select 1 from public.service_assignments sa
      join public.worship_services ws on ws.id = sa.service_id
      join public.profiles p on p.id = sa.user_id and p.is_active
      where sa.id = check_in.assignment_id and sa.status in ('scheduled', 'confirmed')
        and ws.status = 'published' and ws.service_date = (current_timestamp at time zone 'Asia/Taipei')::date
    )
  returning check_in.*
$$;

revoke all on function public.reopen_corrected_lead_check_in(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.reopen_corrected_lead_check_in(uuid, uuid)
to service_role;

-- A station confirmation waiting on a correction must recheck the locked row.
create function app_private.lock_check_in_for_station_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform 1 from public.service_check_ins
  where id = new.check_in_id and service_id = new.service_id and user_id = new.user_id
    and status in ('checked_in', 'station_confirmed')
  for update;
  if not found then
    raise exception 'An active check-in is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.lock_check_in_for_station_confirmation()
from public, anon, authenticated;
create trigger check_in_station_confirmations_lock_check_in
before insert on public.check_in_station_confirmations
for each row execute function app_private.lock_check_in_for_station_confirmation();

-- Serialize checklist writes with correction so a completed correction cannot
-- leave a task on the withdrawn check-in.
create function app_private.lock_check_in_for_checklist_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  related public.service_check_ins;
begin
  select * into related from public.service_check_ins
  where assignment_id = new.assignment_id and service_id = new.service_id
  for update;
  if related.status = 'cancelled' and exists (
    select 1 from public.activity_logs
    where event_type = 'check_in.service_corrected'
      and subject_id = related.id::text and actor_user_id = related.user_id
      and occurred_at >= related.checked_in_at
  ) then
    raise exception 'Tasks cannot be recorded for a corrected check-in' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.lock_check_in_for_checklist_write()
from public, anon, authenticated;
create trigger assignment_checklist_states_lock_check_in
before insert or update on public.assignment_checklist_states
for each row execute function app_private.lock_check_in_for_checklist_write();
