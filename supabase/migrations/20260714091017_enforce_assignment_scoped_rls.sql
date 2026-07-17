-- Replace global role policies with assignment- and service-scoped policies.
-- Existing task/checklist definition rows remain untouched.

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
      and (select app_private.can_coordinate_service(sa.service_id))
  )
  or exists (
    select 1
    from public.service_coordinators sc
    where sc.user_id = profiles.id
      and (select app_private.can_coordinate_service(sc.service_id))
  )
);

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select app_private.is_admin())
);

drop policy if exists worship_services_select on public.worship_services;
create policy worship_services_select on public.worship_services
for select to authenticated
using (
  (select app_private.can_coordinate_service(id))
  or (
    status in ('published', 'completed')
    and (select app_private.has_service_assignment(id))
  )
);

drop policy if exists worship_services_manage on public.worship_services;
create policy worship_services_manage on public.worship_services
for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists service_stations_select on public.service_stations;
create policy service_stations_select on public.service_stations
for select to authenticated
using (
  (select app_private.can_coordinate_service(service_id))
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

drop policy if exists service_stations_manage on public.service_stations;
create policy service_stations_manage on public.service_stations
for all to authenticated
using ((select app_private.can_coordinate_service(service_id)))
with check ((select app_private.can_coordinate_service(service_id)));

drop policy if exists schedule_templates_manage on public.schedule_templates;
create policy schedule_templates_manage on public.schedule_templates
for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists service_assignments_select on public.service_assignments;
create policy service_assignments_select on public.service_assignments
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.can_coordinate_service(service_id))
);

drop policy if exists service_assignments_manage on public.service_assignments;
create policy service_assignments_manage on public.service_assignments
for all to authenticated
using ((select app_private.can_coordinate_service(service_id)))
with check ((select app_private.can_coordinate_service(service_id)));

drop policy if exists service_check_ins_select on public.service_check_ins;
create policy service_check_ins_select on public.service_check_ins
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.can_coordinate_service(service_id))
);

drop policy if exists service_check_ins_manage on public.service_check_ins;
create policy service_check_ins_manage on public.service_check_ins
for update to authenticated
using ((select app_private.can_coordinate_service(service_id)))
with check ((select app_private.can_coordinate_service(service_id)));

drop policy if exists station_confirmations_select
on public.check_in_station_confirmations;
create policy station_confirmations_select
on public.check_in_station_confirmations
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.can_coordinate_service(service_id))
);

drop policy if exists station_confirmations_manage
on public.check_in_station_confirmations;
create policy station_confirmations_manage
on public.check_in_station_confirmations
for update to authenticated
using ((select app_private.can_coordinate_service(service_id)))
with check ((select app_private.can_coordinate_service(service_id)));

drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
for select to authenticated
using (
  (select app_private.is_admin())
  or (
    service_id is not null
    and (select app_private.can_coordinate_service(service_id))
  )
);

drop policy if exists post_service_reviews_select
on public.post_service_reviews;
create policy post_service_reviews_select
on public.post_service_reviews
for select to authenticated
using (
  (
    author_user_id = (select auth.uid())
    and (select app_private.has_service_assignment(service_id))
  )
  or (select app_private.can_coordinate_service(service_id))
);

drop policy if exists post_service_reviews_insert_own
on public.post_service_reviews;
create policy post_service_reviews_insert_own
on public.post_service_reviews
for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and (select app_private.has_service_assignment(service_id))
  and status in ('draft', 'submitted')
);

drop policy if exists post_service_reviews_update_own_draft
on public.post_service_reviews;
create policy post_service_reviews_update_own_draft
on public.post_service_reviews
for update to authenticated
using (
  author_user_id = (select auth.uid())
  and status = 'draft'
  and (select app_private.has_service_assignment(service_id))
)
with check (
  author_user_id = (select auth.uid())
  and status in ('draft', 'submitted')
  and (select app_private.has_service_assignment(service_id))
);

drop policy if exists post_service_reviews_manage
on public.post_service_reviews;
create policy post_service_reviews_manage
on public.post_service_reviews
for all to authenticated
using ((select app_private.can_coordinate_service(service_id)))
with check ((select app_private.can_coordinate_service(service_id)));

drop policy if exists timeline_nodes_select_active on public.timeline_nodes;
create policy timeline_nodes_select_active on public.timeline_nodes
for select to authenticated
using (
  (select app_private.is_admin())
  or (
    (select app_private.has_role('coordinator'::public.app_role))
    and (
      (
        service_id is not null
        and (select app_private.can_coordinate_service(service_id))
      )
      or (
        service_id is null
        and exists (
          select 1
          from public.worship_services ws
          where ws.service_type = timeline_nodes.service_type
            and (select app_private.can_coordinate_service(ws.id))
        )
      )
    )
  )
  or exists (
    select 1
    from public.service_task_assignments sta
    join public.service_assignments sa on sa.id = sta.assignment_id
    join public.worship_services ws on ws.id = sta.service_id
    where sta.timeline_node_id = timeline_nodes.id
      and sa.user_id = (select auth.uid())
      and sa.status in ('scheduled', 'confirmed', 'completed')
      and ws.status in ('published', 'completed')
      and (select app_private.is_active_user())
  )
);

drop policy if exists timeline_nodes_manage_staff on public.timeline_nodes;
create policy timeline_nodes_manage_staff on public.timeline_nodes
for all to authenticated
using (
  (select app_private.is_admin())
  or (
    service_id is not null
    and (select app_private.can_coordinate_service(service_id))
  )
)
with check (
  (select app_private.is_admin())
  or (
    service_id is not null
    and (select app_private.can_coordinate_service(service_id))
  )
);

drop policy if exists checklist_items_select_active on public.checklist_items;
create policy checklist_items_select_active on public.checklist_items
for select to authenticated
using (
  exists (
    select 1
    from public.timeline_nodes tn
    where tn.id = checklist_items.node_id
  )
);

drop policy if exists checklist_items_manage_staff on public.checklist_items;
create policy checklist_items_manage_staff on public.checklist_items
for all to authenticated
using (
  (select app_private.is_admin())
  or exists (
    select 1
    from public.timeline_nodes tn
    where tn.id = checklist_items.node_id
      and tn.service_id is not null
      and (select app_private.can_coordinate_service(tn.service_id))
  )
)
with check (
  (select app_private.is_admin())
  or exists (
    select 1
    from public.timeline_nodes tn
    where tn.id = checklist_items.node_id
      and tn.service_id is not null
      and (select app_private.can_coordinate_service(tn.service_id))
  )
);

-- Existing self-service check-in rows must be linked to an assignment before
-- the strict boundary is activated. Abort instead of guessing a relationship.
do $$
begin
  if exists (
    select 1
    from public.service_check_ins
    where assignment_id is null
  ) then
    raise exception 'Cannot enforce assignment scope: a check-in lacks assignment_id';
  end if;
end;
$$;

alter table public.service_check_ins
  alter column assignment_id set not null;

create or replace function app_private.prepare_check_in()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.service_assignments sa
    join public.profiles p on p.id = sa.user_id and p.is_active
    join public.worship_services ws on ws.id = sa.service_id
    where sa.id = new.assignment_id
      and sa.service_id = new.service_id
      and sa.user_id = new.user_id
      and sa.status in (
        'scheduled'::public.assignment_status,
        'confirmed'::public.assignment_status
      )
      and ws.status = 'published'::public.service_status
      and ws.service_date = (current_timestamp at time zone 'Asia/Taipei')::date
  ) then
    raise exception 'An active same-day service assignment is required for check-in'
      using errcode = '42501';
  end if;

  if auth.uid() is not null
     and not app_private.can_coordinate_service(new.service_id) then
    new.user_id := auth.uid();
    new.status := 'checked_in';
    new.checked_in_at := now();
    new.check_in_source := 'web';
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.prepare_station_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  resolved_station_name text;
begin
  if auth.uid() is not null
     and not app_private.can_coordinate_service(new.service_id) then
    new.user_id := auth.uid();
    new.confirmed_at := now();
    new.created_at := now();
    if new.confirmation_source = 'staff_assisted' then
      raise exception 'Only staff may create a staff-assisted confirmation';
    end if;
  end if;

  select ss.name
  into resolved_station_name
  from public.service_check_ins sci
  join public.service_assignments sa
    on sa.id = sci.assignment_id
   and sa.service_id = sci.service_id
   and sa.user_id = sci.user_id
  join public.service_stations ss
    on ss.id = sa.station_id
   and ss.service_id = sa.service_id
  where sci.id = new.check_in_id
    and sci.service_id = new.service_id
    and sci.user_id = new.user_id
    and sci.status in ('checked_in', 'station_confirmed')
    and ss.id = new.station_id
    and ss.is_active;

  if resolved_station_name is null then
    raise exception 'The station is not assigned to this check-in assignment'
      using errcode = '42501';
  end if;

  new.station_name_snapshot := resolved_station_name;
  return new;
end;
$$;

revoke all on function app_private.prepare_check_in()
from public, anon, authenticated;
revoke all on function app_private.prepare_station_confirmation()
from public, anon, authenticated;

-- The legacy two-argument RPC remains available only to administrators for
-- editing preserved task templates. Volunteers use assignment-scoped state.
create or replace function app_private.set_checklist_item_completion(
  p_item_id text,
  p_is_completed boolean
)
returns table(id text, is_completed boolean, completed_at varchar)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not app_private.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  return query
  update public.checklist_items as ci
  set
    is_completed = coalesce(p_is_completed, false),
    completed_at = case
      when coalesce(p_is_completed, false)
        then to_char(current_timestamp at time zone 'Asia/Taipei', 'HH24:MI')
      else null
    end
  where ci.id = p_item_id
  returning ci.id, ci.is_completed, ci.completed_at;

  if not found then
    raise exception 'Checklist item not found' using errcode = 'P0002';
  end if;
end;
$$;

create function app_private.set_assignment_checklist_state(
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
      or app_private.can_coordinate_service(sta.service_id)
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

create function public.set_assignment_checklist_state(
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
language sql
security invoker
set search_path = pg_catalog
as $$
  select *
  from app_private.set_assignment_checklist_state(
    p_assignment_id,
    p_item_id,
    p_is_completed
  );
$$;

revoke all on function public.set_assignment_checklist_state(uuid, text, boolean)
from public, anon, authenticated;
grant execute on function public.set_assignment_checklist_state(uuid, text, boolean)
to authenticated;
