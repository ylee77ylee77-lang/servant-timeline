begin;

-- Assigned volunteers should only see active required items. Admins and authorized
-- coordinators may still inspect inactive rows for audit and recovery.
drop policy if exists service_required_items_select on public.service_required_items;
create policy service_required_items_select
on public.service_required_items for select to authenticated
using (
  (select app_private.can_coordinate_service(service_id))
  or (
    is_active
    and (select app_private.has_service_assignment(service_id))
  )
);

-- Atomically create or recover a service-scoped timeline snapshot. This avoids a
-- partially copied node/checklist/mapping when one statement in the sequence fails.
create or replace function public.ensure_service_task_snapshot(
  p_service_id uuid,
  p_source_node_id text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_service_type text;
  v_service_status public.service_status;
  v_source public.timeline_nodes%rowtype;
  v_target_id text;
  v_active_checklist_ids text[];
begin
  if auth.uid() is null or not app_private.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  select ws.service_type, ws.status
  into v_service_type, v_service_status
  from public.worship_services ws
  where ws.id = p_service_id;

  if not found then
    raise exception 'Worship service not found' using errcode = 'P0002';
  end if;

  if v_service_status = 'completed'::public.service_status then
    raise exception 'Completed worship service is immutable' using errcode = '23514';
  end if;

  select tn.*
  into v_source
  from public.timeline_nodes tn
  where tn.id = p_source_node_id
  for update;

  if not found then
    raise exception 'Timeline node not found' using errcode = 'P0002';
  end if;

  if v_source.service_id is not null then
    if v_source.service_id <> p_service_id then
      raise exception 'Timeline node does not belong to worship service' using errcode = '23514';
    end if;
    return v_source.id;
  end if;

  if v_source.service_type::text <> v_service_type then
    raise exception 'Template service type mismatch' using errcode = '23514';
  end if;

  select tn.id
  into v_target_id
  from public.timeline_nodes tn
  where tn.service_id = p_service_id
    and tn.source_template_node_id = v_source.id;

  if v_target_id is null then
    select array_agg(ci.id order by ci.id)
    into v_active_checklist_ids
    from public.checklist_items ci
    where ci.node_id = v_source.id
      and ci.is_active;

    if coalesce(array_length(v_active_checklist_ids, 1), 0) > 0
       and exists (
         select 1
         from public.assignment_checklist_states acs
         where acs.service_id = p_service_id
           and acs.checklist_item_id = any(v_active_checklist_ids)
       ) then
      raise exception 'Template checklist already has service progress' using errcode = '23514';
    end if;

    v_target_id := gen_random_uuid()::text;
    insert into public.timeline_nodes (
      id,
      service_id,
      source_template_node_id,
      service_type,
      time,
      title,
      assignee,
      location,
      details,
      voice_reminder_enabled,
      reminder_pre5_enabled,
      reminder_now_enabled,
      sort_order,
      is_active
    ) values (
      v_target_id,
      p_service_id,
      v_source.id,
      v_service_type,
      v_source.time,
      v_source.title,
      v_source.assignee,
      v_source.location,
      v_source.details,
      v_source.voice_reminder_enabled,
      v_source.reminder_pre5_enabled,
      v_source.reminder_now_enabled,
      v_source.sort_order,
      v_source.is_active
    );
  end if;

  -- Also repairs a previously interrupted snapshot by inserting any missing rows.
  insert into public.checklist_items (
    id,
    node_id,
    source_template_item_id,
    text,
    details,
    sort_order,
    is_active,
    is_completed,
    completed_at
  )
  select
    gen_random_uuid()::text,
    v_target_id,
    ci.id,
    ci.text,
    ci.details,
    ci.sort_order,
    ci.is_active,
    false,
    null
  from public.checklist_items ci
  where ci.node_id = v_source.id
    and not exists (
      select 1
      from public.checklist_items copied
      where copied.node_id = v_target_id
        and copied.source_template_item_id = ci.id
    )
  on conflict do nothing;

  update public.service_task_assignments
  set timeline_node_id = v_target_id,
      created_by = auth.uid()
  where service_id = p_service_id
    and timeline_node_id = v_source.id;

  return v_target_id;
end;
$$;

revoke all on function public.ensure_service_task_snapshot(uuid, text)
from public, anon, authenticated;
grant execute on function public.ensure_service_task_snapshot(uuid, text)
to authenticated;

commit;
