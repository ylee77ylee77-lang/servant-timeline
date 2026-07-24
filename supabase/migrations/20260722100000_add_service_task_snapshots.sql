begin;

alter table public.timeline_nodes
  add column if not exists sort_order integer not null default 0;
alter table public.timeline_nodes
  add column if not exists is_active boolean not null default true;
alter table public.timeline_nodes
  add column if not exists source_template_node_id text
  references public.timeline_nodes(id) on delete restrict;
alter table public.checklist_items
  add column if not exists is_active boolean not null default true;
alter table public.checklist_items
  add column if not exists source_template_item_id text
  references public.checklist_items(id) on delete restrict;

create unique index if not exists timeline_nodes_service_template_snapshot_key
  on public.timeline_nodes(service_id, source_template_node_id)
  where service_id is not null and source_template_node_id is not null;
create index if not exists timeline_nodes_service_sort_idx
  on public.timeline_nodes(service_id, sort_order, time);
create unique index if not exists checklist_items_node_template_snapshot_key
  on public.checklist_items(node_id, source_template_item_id)
  where source_template_item_id is not null;

create table if not exists public.service_required_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  details text check (details is null or char_length(details) <= 1000),
  quantity integer not null default 1 check (quantity between 1 and 999),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_required_items_service_sort_idx
  on public.service_required_items(service_id, sort_order, name);

alter table public.service_required_items enable row level security;
revoke all on public.service_required_items from anon, authenticated, service_role;
grant all on public.service_required_items to service_role;
grant select, insert, update, delete on public.service_required_items to authenticated;

create policy service_required_items_select
on public.service_required_items for select to authenticated
using (
  (select app_private.can_coordinate_service(service_id))
  or (select app_private.has_service_assignment(service_id))
);

create policy service_required_items_manage_admin
on public.service_required_items for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

create trigger service_required_items_updated_at
before update on public.service_required_items
for each row execute function app_private.set_updated_at();
create trigger service_required_items_activity
after insert or update or delete on public.service_required_items
for each row execute function app_private.record_activity();

-- Active definitions remain visible to assigned volunteers. Admins and authorized
-- coordinators may also inspect inactive service snapshots for audit/recovery.
drop policy if exists timeline_nodes_select_active on public.timeline_nodes;
create policy timeline_nodes_select_active
on public.timeline_nodes for select to authenticated
using (
  (select app_private.is_admin())
  or (
    (select app_private.has_role('coordinator'::public.app_role))
    and (
      (service_id is not null and (select app_private.can_coordinate_service(service_id)))
      or (
        service_id is null
        and exists (
          select 1 from public.worship_services ws
          where ws.service_type = timeline_nodes.service_type
            and (select app_private.can_coordinate_service(ws.id))
        )
      )
    )
  )
  or (
    is_active
    and exists (
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
  )
);

drop policy if exists checklist_items_select_active on public.checklist_items;
create policy checklist_items_select_active
on public.checklist_items for select to authenticated
using (
  is_active
  and exists (
    select 1 from public.timeline_nodes tn
    where tn.id = checklist_items.node_id
  )
);

-- Schedule definitions are admin-owned. Coordinators retain scoped read access.
drop policy if exists timeline_nodes_manage_staff on public.timeline_nodes;
drop policy if exists timeline_nodes_manage_admin on public.timeline_nodes;
create policy timeline_nodes_manage_admin
on public.timeline_nodes for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists checklist_items_manage_staff on public.checklist_items;
drop policy if exists checklist_items_manage_admin on public.checklist_items;
create policy checklist_items_manage_admin
on public.checklist_items for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists service_stations_manage on public.service_stations;
drop policy if exists service_stations_manage_admin on public.service_stations;
create policy service_stations_manage_admin
on public.service_stations for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists service_assignments_manage on public.service_assignments;
drop policy if exists service_assignments_manage_admin on public.service_assignments;
create policy service_assignments_manage_admin
on public.service_assignments for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists service_task_assignments_manage on public.service_task_assignments;
drop policy if exists service_task_assignments_manage_admin on public.service_task_assignments;
create policy service_task_assignments_manage_admin
on public.service_task_assignments for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

create or replace function public.copy_worship_service_schedule(
  p_source_service_id uuid,
  p_service_date date,
  p_starts_at timestamptz,
  p_report_at timestamptz,
  p_location text,
  p_notes text default null,
  p_status public.service_status default 'draft',
  p_include_assignments boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_target_service_id uuid;
  v_service_type text;
  v_station_map jsonb := '{}'::jsonb;
  v_node_map jsonb := '{}'::jsonb;
  v_assignment_map jsonb := '{}'::jsonb;
  v_new_station_id uuid;
  v_new_node_id text;
  v_new_assignment_id uuid;
  v_station record;
  v_node record;
  v_checklist record;
  v_assignment record;
  v_mapping record;
begin
  if auth.uid() is null or not app_private.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  if p_report_at is not null and p_report_at > p_starts_at then
    raise exception 'Report time must not be later than the service start time'
      using errcode = '23514';
  end if;

  select ws.service_type
  into v_service_type
  from public.worship_services ws
  where ws.id = p_source_service_id;

  if v_service_type is null then
    raise exception 'Source worship service not found' using errcode = 'P0002';
  end if;

  insert into public.worship_services (
    service_date,
    service_type,
    starts_at,
    report_at,
    location,
    status,
    notes,
    created_by,
    updated_by
  ) values (
    p_service_date,
    v_service_type,
    p_starts_at,
    p_report_at,
    nullif(trim(p_location), ''),
    p_status,
    nullif(p_notes, ''),
    auth.uid(),
    auth.uid()
  ) returning id into v_target_service_id;

  for v_station in
    select ss.*
    from public.service_stations ss
    where ss.service_id = p_source_service_id
    order by ss.sort_order, ss.name
  loop
    v_new_station_id := gen_random_uuid();
    insert into public.service_stations (
      id, service_id, name, role_label, qr_tag, sort_order, is_active
    ) values (
      v_new_station_id,
      v_target_service_id,
      v_station.name,
      v_station.role_label,
      v_station.qr_tag,
      v_station.sort_order,
      v_station.is_active
    );
    v_station_map := v_station_map || jsonb_build_object(v_station.id::text, v_new_station_id::text);
  end loop;

  for v_node in
    select resolved.*
    from (
      select tn.*
      from public.timeline_nodes tn
      where tn.service_id = p_source_service_id
      union all
      select tn.*
      from public.timeline_nodes tn
      where tn.service_id is null
        and tn.service_type = v_service_type
        and not exists (
          select 1
          from public.timeline_nodes scoped
          where scoped.service_id = p_source_service_id
            and scoped.source_template_node_id = tn.id
        )
    ) resolved
    where resolved.is_active
    order by resolved.sort_order, resolved.time, resolved.id
  loop
    v_new_node_id := gen_random_uuid()::text;
    insert into public.timeline_nodes (
      id,
      service_id,
      source_template_node_id,
      time,
      title,
      assignee,
      location,
      details,
      service_type,
      voice_reminder_enabled,
      reminder_pre5_enabled,
      reminder_now_enabled,
      sort_order,
      is_active
    ) values (
      v_new_node_id,
      v_target_service_id,
      case
        when v_node.service_id is null then v_node.id
        else v_node.source_template_node_id
      end,
      v_node.time,
      v_node.title,
      v_node.assignee,
      v_node.location,
      v_node.details,
      v_service_type,
      v_node.voice_reminder_enabled,
      v_node.reminder_pre5_enabled,
      v_node.reminder_now_enabled,
      v_node.sort_order,
      true
    );

    v_node_map := v_node_map || jsonb_build_object(v_node.id, v_new_node_id);
    if v_node.source_template_node_id is not null then
      v_node_map := v_node_map || jsonb_build_object(v_node.source_template_node_id, v_new_node_id);
    end if;

    for v_checklist in
      select ci.*
      from public.checklist_items ci
      where ci.node_id = v_node.id
        and ci.is_active
      order by ci.sort_order, ci.id
    loop
      insert into public.checklist_items (
        id,
        node_id,
        source_template_item_id,
        text,
        details,
        sort_order,
        is_completed,
        completed_at,
        is_active
      ) values (
        gen_random_uuid()::text,
        v_new_node_id,
        case
          when v_node.service_id is null then v_checklist.id
          else v_checklist.source_template_item_id
        end,
        v_checklist.text,
        v_checklist.details,
        v_checklist.sort_order,
        false,
        null,
        true
      );
    end loop;
  end loop;

  insert into public.service_required_items (
    service_id,
    name,
    details,
    quantity,
    sort_order,
    is_active,
    created_by,
    updated_by
  )
  select
    v_target_service_id,
    sri.name,
    sri.details,
    sri.quantity,
    sri.sort_order,
    sri.is_active,
    auth.uid(),
    auth.uid()
  from public.service_required_items sri
  where sri.service_id = p_source_service_id
  order by sri.sort_order, sri.name;

  if p_include_assignments then
    for v_assignment in
      select sa.*
      from public.service_assignments sa
      join public.profiles p on p.id = sa.user_id and p.is_active
      where sa.service_id = p_source_service_id
        and sa.status <> 'cancelled'::public.assignment_status
      order by sa.created_at, sa.id
    loop
      v_new_assignment_id := gen_random_uuid();
      insert into public.service_assignments (
        id,
        service_id,
        user_id,
        station_id,
        role_label,
        report_at,
        report_location,
        ministry_group,
        status,
        notes,
        created_by
      ) values (
        v_new_assignment_id,
        v_target_service_id,
        v_assignment.user_id,
        case
          when v_assignment.station_id is null then null
          else (v_station_map ->> v_assignment.station_id::text)::uuid
        end,
        v_assignment.role_label,
        null,
        v_assignment.report_location,
        v_assignment.ministry_group,
        'scheduled'::public.assignment_status,
        v_assignment.notes,
        auth.uid()
      );
      v_assignment_map := v_assignment_map || jsonb_build_object(v_assignment.id::text, v_new_assignment_id::text);
    end loop;

    for v_mapping in
      select sta.*
      from public.service_task_assignments sta
      where sta.service_id = p_source_service_id
      order by sta.created_at, sta.id
    loop
      if (v_assignment_map ? v_mapping.assignment_id::text)
         and (v_node_map ? v_mapping.timeline_node_id) then
        insert into public.service_task_assignments (
          service_id,
          assignment_id,
          timeline_node_id,
          created_by
        ) values (
          v_target_service_id,
          (v_assignment_map ->> v_mapping.assignment_id::text)::uuid,
          v_node_map ->> v_mapping.timeline_node_id,
          auth.uid()
        );
      end if;
    end loop;
  end if;

  return v_target_service_id;
exception
  when unique_violation then
    raise exception 'A worship service already exists for this date and service type'
      using errcode = '23505';
end;
$$;

revoke all on function public.copy_worship_service_schedule(
  uuid, date, timestamptz, timestamptz, text, text, public.service_status, boolean
) from public, anon, authenticated;
grant execute on function public.copy_worship_service_schedule(
  uuid, date, timestamptz, timestamptz, text, text, public.service_status, boolean
) to authenticated;

commit;
