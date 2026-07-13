-- Browser sessions may read their own operational records while active, but
-- check-in writes must pass through the server route that enforces the church
-- network and same-day published-service boundaries.
revoke insert on table
  public.service_check_ins,
  public.check_in_station_confirmations
from authenticated;

drop policy if exists service_check_ins_insert_own
on public.service_check_ins;
drop policy if exists service_check_ins_insert_staff
on public.service_check_ins;
drop policy if exists station_confirmations_insert_own
on public.check_in_station_confirmations;
drop policy if exists station_confirmations_insert_staff
on public.check_in_station_confirmations;

-- Preserve actor attribution when the trusted server client performs the
-- network-gated self-service insert without forwarding a user JWT to PostgREST.
create or replace function app_private.record_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  row_data jsonb;
  resolved_actor_user_id uuid;
  resolved_service_id uuid;
  resolved_subject_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  resolved_subject_id := row_data ->> 'id';
  resolved_actor_user_id := auth.uid();

  if resolved_actor_user_id is null
     and tg_table_name in ('service_check_ins', 'check_in_station_confirmations') then
    resolved_actor_user_id := nullif(row_data ->> 'user_id', '')::uuid;
  end if;

  if tg_table_name = 'worship_services' and tg_op = 'DELETE' then
    resolved_service_id := null;
  elsif tg_table_name = 'worship_services' then
    resolved_service_id := nullif(resolved_subject_id, '')::uuid;
  else
    resolved_service_id := nullif(row_data ->> 'service_id', '')::uuid;
  end if;

  insert into public.activity_logs (
    actor_user_id,
    service_id,
    event_type,
    subject_type,
    subject_id,
    metadata
  ) values (
    resolved_actor_user_id,
    resolved_service_id,
    lower(tg_table_name || '.' || tg_op),
    tg_table_name,
    resolved_subject_id,
    jsonb_build_object('operation', tg_op)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.record_activity()
from public, anon, authenticated;

drop policy if exists service_assignments_select
on public.service_assignments;
create policy service_assignments_select on public.service_assignments
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

drop policy if exists service_check_ins_select
on public.service_check_ins;
create policy service_check_ins_select on public.service_check_ins
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

drop policy if exists station_confirmations_select
on public.check_in_station_confirmations;
create policy station_confirmations_select on public.check_in_station_confirmations
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

drop policy if exists activity_logs_select
on public.activity_logs;
create policy activity_logs_select on public.activity_logs
for select to authenticated
using (
  (
    actor_user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

drop policy if exists post_service_reviews_select
on public.post_service_reviews;
create policy post_service_reviews_select on public.post_service_reviews
for select to authenticated
using (
  (
    author_user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);
