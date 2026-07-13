-- Preserve a deletion audit record without referencing a worship service after
-- the parent row has been removed. This forward fix also covers environments
-- that already applied the original foundation migrations.
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
