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

alter table public.service_coordinators
  add column coordination_scope text not null default 'all'
  check (coordination_scope in ('all', 'third_floor'));

create function app_private.resolve_live_coordination_scope(
  p_service_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $$
  select case
    when exists (
      select 1
      from public.service_assignments sa
      where sa.service_id = p_service_id
        and sa.user_id = p_user_id
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
        and sa.user_id = p_user_id
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

create function app_private.set_service_coordinator_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
begin
  new.coordination_scope := app_private.resolve_live_coordination_scope(
    new.service_id,
    new.user_id
  );
  return new;
end;
$$;

create trigger service_coordinators_set_live_scope
before insert or update of service_id, user_id
on public.service_coordinators
for each row execute function app_private.set_service_coordinator_scope();

create function app_private.sync_service_coordinator_scope_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
begin
  if tg_op <> 'INSERT' then
    update public.service_coordinators sc
    set coordination_scope = app_private.resolve_live_coordination_scope(
      old.service_id,
      old.user_id
    )
    where sc.service_id = old.service_id
      and sc.user_id = old.user_id;
  end if;

  if tg_op <> 'DELETE' then
    update public.service_coordinators sc
    set coordination_scope = app_private.resolve_live_coordination_scope(
      new.service_id,
      new.user_id
    )
    where sc.service_id = new.service_id
      and sc.user_id = new.user_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger service_assignments_sync_live_scope_insert_delete
after insert or delete
on public.service_assignments
for each row execute function app_private.sync_service_coordinator_scope_from_assignment();

create trigger service_assignments_sync_live_scope_update
after update of service_id, user_id, role_label, status
on public.service_assignments
for each row execute function app_private.sync_service_coordinator_scope_from_assignment();

update public.service_coordinators sc
set coordination_scope = app_private.resolve_live_coordination_scope(sc.service_id, sc.user_id);

create or replace function app_private.live_coordination_scope(p_service_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $$
  select case
    when app_private.is_admin() then 'all'
    when not app_private.has_role('coordinator'::public.app_role) then 'none'
    else coalesce((
      select sc.coordination_scope
      from public.service_coordinators sc
      where sc.service_id = p_service_id
        and sc.user_id = auth.uid()
    ), 'none')
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
set row_security = off
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
set row_security = off
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
set row_security = off
as $$
  select exists (
    select 1
    from public.service_check_ins sci
    where sci.id = p_check_in_id
      and sci.service_id = p_service_id
      and app_private.can_view_live_assignment(sci.service_id, sci.assignment_id)
  );
$$;

-- Keep legacy all-scope and volunteer behavior while avoiding nested RLS joins
-- from the timeline policy into the newly scoped assignment policies.
create function app_private.can_view_live_timeline_node(
  p_node_id text,
  p_service_id uuid,
  p_service_type text,
  p_is_active boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $$
begin
  return
    app_private.is_admin()
    or (
      p_service_id is not null
      and app_private.live_coordination_scope(p_service_id) = 'all'
    )
    or (
      p_service_id is null
      and exists (
        select 1
        from public.worship_services ws
        where ws.service_type = p_service_type
          and app_private.live_coordination_scope(ws.id) = 'all'
      )
    )
    or (
      p_is_active
      and exists (
        select 1
        from public.service_task_assignments sta
        join public.service_assignments sa on sa.id = sta.assignment_id
        join public.worship_services ws on ws.id = sta.service_id
        where sta.timeline_node_id = p_node_id
          and (
            app_private.can_view_live_assignment(sta.service_id, sta.assignment_id)
            or (
              sa.user_id = auth.uid()
              and sa.status in (
                'scheduled'::public.assignment_status,
                'confirmed'::public.assignment_status,
                'completed'::public.assignment_status
              )
              and ws.status in (
                'published'::public.service_status,
                'completed'::public.service_status
              )
              and app_private.is_active_user()
            )
          )
      )
    );
end;
$$;

revoke all on function app_private.is_third_floor_station(text)
from public, anon, authenticated;
revoke all on function app_private.resolve_live_coordination_scope(uuid, uuid)
from public, anon, authenticated;
revoke all on function app_private.set_service_coordinator_scope()
from public, anon, authenticated;
revoke all on function app_private.sync_service_coordinator_scope_from_assignment()
from public, anon, authenticated;
revoke all on function app_private.live_coordination_scope(uuid)
from public, anon, authenticated;
revoke all on function app_private.can_view_live_station(uuid, uuid)
from public, anon, authenticated;
revoke all on function app_private.can_view_live_assignment(uuid, uuid)
from public, anon, authenticated;
revoke all on function app_private.can_view_live_check_in(uuid, uuid)
from public, anon, authenticated;
revoke all on function app_private.can_view_live_timeline_node(text, uuid, text, boolean)
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
  case (select app_private.live_coordination_scope(service_id))
    when 'all' then true
    when 'third_floor' then app_private.is_third_floor_station(name)
    else false
  end
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
  or case (select app_private.live_coordination_scope(service_id))
    when 'all' then true
    when 'third_floor' then
      user_id = (select auth.uid())
      or app_private.is_third_floor_station(role_label)
      or (
        station_id is not null
        and (select app_private.can_view_live_station(service_id, station_id))
      )
    else false
  end
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

drop policy if exists timeline_nodes_select_active on public.timeline_nodes;
create policy timeline_nodes_select_active on public.timeline_nodes
for select to authenticated
using (
  (select app_private.can_view_live_timeline_node(
    id,
    service_id,
    service_type,
    is_active
  ))
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
set row_security = off
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
