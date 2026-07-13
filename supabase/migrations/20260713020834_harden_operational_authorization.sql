-- Make station visibility explicit even though the referenced worship service
-- is also protected by RLS. This keeps the boundary local to this policy.
drop policy if exists service_stations_select on public.service_stations;
create policy service_stations_select on public.service_stations
for select to authenticated
using (
  exists (
    select 1
    from public.worship_services ws
    where ws.id = service_stations.service_id
      and (
        (
          ws.status in ('published', 'completed')
          and (select app_private.is_active_user())
        )
        or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
      )
  )
);

-- The public wrapper remains SECURITY INVOKER. This private implementation is
-- privileged only so it can update the two completion columns while applying
-- the complete authorization boundary itself.
create or replace function app_private.set_checklist_item_completion(
  p_item_id text,
  p_is_completed boolean
)
returns table(id text, is_completed boolean, completed_at varchar)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authorized boolean;
begin
  if auth.uid() is null or not app_private.is_active_user() then
    raise exception 'Active authentication required' using errcode = '42501';
  end if;

  authorized := app_private.has_role(
    'coordinator'::public.app_role,
    'admin'::public.app_role
  );

  if not authorized then
    select exists (
      select 1
      from public.checklist_items ci
      join public.timeline_nodes tn on tn.id = ci.node_id
      where ci.id = p_item_id
        and (
          -- Temporary compatibility path for preserved production timeline
          -- rows. Remove after every legacy node is linked to a service.
          tn.service_id is null
          or exists (
            select 1
            from public.worship_services ws
            join public.service_check_ins sci
              on sci.service_id = ws.id
             and sci.user_id = auth.uid()
             and sci.status in ('checked_in', 'station_confirmed')
            where ws.id = tn.service_id
              and ws.status = 'published'
              and ws.service_date = (current_timestamp at time zone 'Asia/Taipei')::date
          )
        )
    ) into authorized;
  end if;

  if not authorized then
    raise exception 'Checklist item is not available for this user or service'
      using errcode = '42501';
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

revoke all on function app_private.set_checklist_item_completion(text, boolean)
from public, anon, authenticated;
grant execute on function app_private.set_checklist_item_completion(text, boolean)
to authenticated;

-- Claiming the first administrator is serialized inside one database
-- transaction. If two bootstrap processes race, only one can grant admin; the
-- losing script deletes the Auth user it created as compensation.
create or replace function public.claim_first_admin(
  p_user_id uuid,
  p_account_code text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(807117731);

  if p_user_id is null
     or p_account_code is null
     or p_account_code !~ '^[a-z0-9][a-z0-9._-]{2,31}$'
     or p_display_name is null
     or char_length(trim(p_display_name)) not between 1 and 80 then
    raise exception 'Invalid first administrator profile' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Auth user does not exist' using errcode = '23503';
  end if;

  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'An administrator already exists' using errcode = '23505';
  end if;

  insert into public.profiles (id, account_code, display_name, is_active)
  values (p_user_id, p_account_code, trim(p_display_name), true)
  on conflict (id) do update
    set account_code = excluded.account_code,
        display_name = excluded.display_name,
        is_active = true;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role, granted_by)
  values (p_user_id, 'admin', p_user_id);
end;
$$;

revoke all on function public.claim_first_admin(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.claim_first_admin(uuid, text, text)
to service_role;
