begin;

-- Live coordination keeps existing coordinator grants, but a coordinator who
-- is assigned as 副總招 can only read three-floor people and their task state.
-- Existing grants without a 總招/副總招 assignment retain full scope so this
-- additive migration does not break previously configured coordinators.

create or replace function app_private.is_third_floor_station(p_station_name text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select
    coalesce(p_station_name, '') like '%副總招%'
    or coalesce(p_station_name, '') like '%3樓%'
    or btrim(coalesce(p_station_name, '')) ~* '^(6|7A|7B|8|9A|9B|10)([[:space:]]|區|$)';
$$;

create or replace function app_private.live_coordination_scope(p_service_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when app_private.is_admin() then 'all'
    when not app_private.can_coordinate_service(p_service_id) then 'none'
    when exists (
      select 1
      from public.service_assignments sa
      where sa.service_id = p_service_id
        and sa.user_id = auth.uid()
        and btrim(sa.role_label) = '副總招'
        and sa.status in (
          'scheduled'::public.assignment_status,
          'confirmed'::public.assignment_status,
          'completed'::public.assignment_status
        )
    ) and not exists (
      select 1
      from public.service_assignments sa
      where sa.service_id = p_service_id
        and sa.user_id = auth.uid()
        and btrim(sa.role_label) = '總招'
        and sa.status in (
          'scheduled'::public.assignment_status,
          'confirmed'::public.assignment_status,
          'completed'::public.assignment_status
        )
    ) then 'third_floor'
    else 'all'
  end;
$$;

create or replace function app_private.can_view_live_station(
  p_service_id uuid,
  p_station_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case app_private.live_coordination_scope(p_service_id)
    when 'all' then true
    when 'third_floor' then exists (
      select 1
      from public.service_stations ss
      where ss.id = p_station_id
        and ss.service_id = p_service_id
        and app_private.is_third_floor_station(ss.name)
    )
    else false
  end;
$$;

create or replace function app_private.can_view_live_assignment(
  p_service_id uuid,
  p_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case app_private.live_coordination_scope(p_service_id)
    when 'all' then true
    when 'third_floor' then exists (
      select 1
      from public.service_assignments sa
      left join public.service_stations ss
        on ss.id = sa.station_id
       and ss.service_id = sa.service_id
      where sa.id = p_assignment_id
        and sa.service_id = p_service_id
        and (
          sa.user_id = auth.uid()
          or app_private.is_third_floor_station(sa.role_label)
          or app_private.is_third_floor_station(ss.name)
        )
    )
    else false
  end;
$$;

create or replace function app_private.can_view_live_check_in(
  p_service_id uuid,
  p_check_in_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.service_check_ins sci
    where sci.id = p_check_in_id
      and sci.service_id = p_service_id
      and app_private.can_view_live_assignment(sci.service_id, sci.assignment_id)
  );
$$;

revoke all on function app_private.is_third_floor_station(text)
from public, anon, authenticated;
revoke all on function app_private.live_coordination_scope(uuid)
from public, anon, authenticated;
revoke all on function app_private.can_view_live_station(uuid, uuid)
from public, anon, authenticated;
revoke all on function app_private.can_view_live_assignment(uuid, uuid)
from public, anon, authenticated;
revoke all on function app_private.can_view_live_check_in(uuid, uuid)
from public, anon, authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select app_private.is_admin())
  or exists (
    select 1
    from public.service_assignments sa
    where sa.user_id = profiles.id
      and (select app_private.can_view_live_assignment(sa.service_id, sa.id))
  )
);

drop policy if exists service_stations_select on public.service_stations;
create policy service_stations_select on public.service_stations
for select to authenticated
using (
  (select app_private.can_view_live_station(service_id, id))
  or exists (
    select 1
    from public.service_assignments sa
    join public.worship_services ws on ws.id = sa.service_id
    where sa.service_id = service_stations.service_id
      and sa.station_id = service_stations.id
      and sa.user_id = (select auth.uid())
      and sa.status in ('scheduled', 'confirmed', 'completed')
      and ws.status in ('published', 'completed')
      and (select app_private.is_active_user())
  )
);

drop policy if exists service_assignments_select on public.service_assignments;
create policy service_assignments_select on public.service_assignments
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.can_view_live_assignment(service_id, id))
);

drop policy if exists service_check_ins_select on public.service_check_ins;
create policy service_check_ins_select on public.service_check_ins
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.can_view_live_assignment(service_id, assignment_id))
);

drop policy if exists service_check_ins_manage on public.service_check_ins;
create policy service_check_ins_manage on public.service_check_ins
for update to authenticated
using ((select app_private.can_view_live_assignment(service_id, assignment_id)))
with check ((select app_private.can_view_live_assignment(service_id, assignment_id)));

drop policy if exists station_confirmations_select on public.check_in_station_confirmations;
create policy station_confirmations_select on public.check_in_station_confirmations
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.can_view_live_check_in(service_id, check_in_id))
);

drop policy if exists station_confirmations_manage on public.check_in_station_confirmations;
create policy station_confirmations_manage on public.check_in_station_confirmations
for update to authenticated
using ((select app_private.can_view_live_check_in(service_id, check_in_id)))
with check ((select app_private.can_view_live_check_in(service_id, check_in_id)));

drop policy if exists service_task_assignments_select on public.service_task_assignments;
create policy service_task_assignments_select on public.service_task_assignments
for select to authenticated
using (
  (select app_private.can_view_live_assignment(service_id, assignment_id))
  or (select app_private.owns_assignment(assignment_id))
);

drop policy if exists assignment_checklist_states_select on public.assignment_checklist_states;
create policy assignment_checklist_states_select on public.assignment_checklist_states
for select to authenticated
using (
  (select app_private.can_view_live_assignment(service_id, assignment_id))
  or (select app_private.owns_assignment(assignment_id))
);

drop policy if exists service_coordinators_select on public.service_coordinators;
create policy service_coordinators_select on public.service_coordinators
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select app_private.live_coordination_scope(service_id)) = 'all'
);

drop policy if exists timeline_nodes_select_active on public.timeline_nodes;
create policy timeline_nodes_select_active
on public.timeline_nodes for select to authenticated
using (
  (select app_private.is_admin())
  or (
    service_id is not null
    and (select app_private.live_coordination_scope(service_id)) = 'all'
  )
  or (
    service_id is null
    and exists (
      select 1
      from public.worship_services ws
      where ws.service_type = timeline_nodes.service_type
        and app_private.live_coordination_scope(ws.id) = 'all'
    )
  )
  or exists (
    select 1
    from public.service_task_assignments sta
    join public.service_assignments sa
      on sa.id = sta.assignment_id
     and sa.service_id = sta.service_id
    join public.worship_services ws on ws.id = sta.service_id
    where sta.timeline_node_id = timeline_nodes.id
      and (
        (select app_private.can_view_live_assignment(sta.service_id, sta.assignment_id))
        or (
          sa.user_id = (select auth.uid())
          and sa.status in ('scheduled', 'confirmed', 'completed')
          and ws.status in ('published', 'completed')
          and (select app_private.is_active_user())
        )
      )
  )
);

create or replace function app_private.set_assignment_checklist_state(
  p_assignment_id uuid,
  p_item_id text,
  p_is_completed boolean
)
returns table(
  id uuid,
  assignment_id uuid,
  checklist_item_id text,
  is_completed boolean,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  resolved_service_id uuid;
begin
  if auth.uid() is null or not app_private.is_active_user() then
    raise exception 'Active authentication required' using errcode = '42501';
  end if;

  select sta.service_id
  into resolved_service_id
  from public.service_task_assignments sta
  join public.service_assignments sa
    on sa.id = sta.assignment_id
   and sa.service_id = sta.service_id
  join public.checklist_items ci on ci.node_id = sta.timeline_node_id
  where sta.assignment_id = p_assignment_id
    and ci.id = p_item_id
    and (
      sa.user_id = auth.uid()
      or app_private.can_view_live_assignment(sta.service_id, sta.assignment_id)
    );

  if resolved_service_id is null then
    raise exception 'Checklist item is not available for this assignment'
      using errcode = '42501';
  end if;

  return query
  insert into public.assignment_checklist_states as state (
    service_id,
    assignment_id,
    checklist_item_id,
    is_completed,
    completed_at,
    completed_by
  ) values (
    resolved_service_id,
    p_assignment_id,
    p_item_id,
    coalesce(p_is_completed, false),
    case when coalesce(p_is_completed, false) then now() else null end,
    case when coalesce(p_is_completed, false) then auth.uid() else null end
  )
  on conflict on constraint assignment_checklist_states_scope_key
  do update set
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by,
    updated_at = now()
  returning
    state.id,
    state.assignment_id,
    state.checklist_item_id,
    state.is_completed,
    state.completed_at;
end;
$$;

revoke all on function app_private.set_assignment_checklist_state(uuid, text, boolean)
from public, anon, authenticated;
grant execute on function app_private.set_assignment_checklist_state(uuid, text, boolean)
to authenticated;

commit;
