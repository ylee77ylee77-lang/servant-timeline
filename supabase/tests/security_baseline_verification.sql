-- Run after applying the migrations to a local or preview database.
-- The script is read-only and raises an exception when an invariant fails.

do $$
declare
  missing_rls text;
  public_tts_execute boolean;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'profiles',
      'user_roles',
      'worship_services',
      'service_stations',
      'schedule_templates',
      'service_assignments',
      'service_check_ins',
      'check_in_station_confirmations',
      'activity_logs',
      'post_service_reviews',
      'timeline_nodes',
      'checklist_items'
    )
    and not c.relrowsecurity;

  if missing_rls is not null then
    raise exception 'RLS is disabled on: %', missing_rls;
  end if;

  select
    has_function_privilege('anon', 'public.reserve_tts_chars(text,integer,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.reserve_tts_chars(text,integer,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.reserve_tts_chars_v2(text,integer,integer,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.reserve_tts_chars_v2(text,integer,integer,integer)', 'EXECUTE')
  into public_tts_execute;

  if public_tts_execute then
    raise exception 'A client role can still execute a TTS reservation RPC';
  end if;

  if not has_function_privilege('service_role', 'public.reserve_tts_chars(text,integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reserve_tts_chars_v2(text,integer,integer,integer)', 'EXECUTE') then
    raise exception 'service_role lost required TTS RPC execution';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'profiles',
        'user_roles',
        'worship_services',
        'service_stations',
        'schedule_templates',
        'service_assignments',
        'service_check_ins',
        'check_in_station_confirmations',
        'activity_logs',
        'post_service_reviews'
      )
      and grantee = 'anon'
  ) then
    raise exception 'anon has a grant on a protected foundation table';
  end if;

  if has_table_privilege('anon', 'public.timeline_nodes', 'SELECT')
     or has_table_privilege('anon', 'public.checklist_items', 'SELECT')
     or has_table_privilege('anon', 'public.timeline_nodes', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.checklist_items', 'INSERT,UPDATE,DELETE') then
    raise exception 'anon still has legacy timeline/checklist access';
  end if;

  if has_function_privilege(
       'anon',
       'public.set_checklist_item_completion(text,boolean)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.set_checklist_item_completion(text,boolean)',
       'EXECUTE'
     ) then
    raise exception 'Checklist completion RPC privileges are incorrect';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'check_in_station_confirmations'
      and policyname = 'station_confirmations_insert_own'
      and coalesce(with_check, '') like '%station_confirmed%'
  ) then
    raise exception 'station correction policy is missing station_confirmed support';
  end if;
end;
$$;

select
  (select count(*) from public.timeline_nodes) as timeline_node_count,
  (select count(*) from public.checklist_items) as checklist_item_count,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'timeline_nodes'
      and column_name = 'service_id'
      and is_nullable = 'YES'
  ) as legacy_service_link_is_nullable;
