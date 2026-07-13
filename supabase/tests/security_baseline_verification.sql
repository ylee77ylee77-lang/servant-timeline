-- Run after applying the migrations to a local or preview database.
-- The script raises an exception when an invariant fails and rolls back its
-- temporary TTS reservation before returning.

do $$
declare
  missing_rls text;
  public_tts_execute boolean;
  checklist_completion_definition text;
  activity_log_definition text;
  active_guarded_policy_count integer;
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
     or has_table_privilege('anon', 'public.timeline_nodes', 'INSERT')
     or has_table_privilege('anon', 'public.timeline_nodes', 'UPDATE')
     or has_table_privilege('anon', 'public.timeline_nodes', 'DELETE')
     or has_table_privilege('anon', 'public.checklist_items', 'INSERT')
     or has_table_privilege('anon', 'public.checklist_items', 'UPDATE')
     or has_table_privilege('anon', 'public.checklist_items', 'DELETE') then
    raise exception 'anon still has legacy timeline/checklist access';
  end if;

  if has_table_privilege('authenticated', 'public.service_check_ins', 'INSERT')
     or has_table_privilege('authenticated', 'public.check_in_station_confirmations', 'INSERT')
     or not has_table_privilege('service_role', 'public.service_check_ins', 'INSERT')
     or not has_table_privilege('service_role', 'public.check_in_station_confirmations', 'INSERT')
     or exists (
       select 1
       from pg_policies
       where schemaname = 'public'
         and policyname in (
           'service_check_ins_insert_own',
           'service_check_ins_insert_staff',
           'station_confirmations_insert_own',
           'station_confirmations_insert_staff'
         )
     ) then
    raise exception 'Authenticated clients can bypass the network-gated check-in API';
  end if;

  select count(*)
  into active_guarded_policy_count
  from pg_policies
  where schemaname = 'public'
    and (tablename, policyname) in (
      ('service_assignments', 'service_assignments_select'),
      ('service_check_ins', 'service_check_ins_select'),
      ('check_in_station_confirmations', 'station_confirmations_select'),
      ('activity_logs', 'activity_logs_select'),
      ('post_service_reviews', 'post_service_reviews_select')
    )
    and coalesce(qual, '') like '%is_active_user%';

  if active_guarded_policy_count <> 5 then
    raise exception 'An operational self-read policy is missing its active-user guard';
  end if;

  select pg_get_functiondef(
    'app_private.record_activity()'::regprocedure
  ) into activity_log_definition;

  if activity_log_definition not like '%row_data ->> ''user_id''%' then
    raise exception 'Server-side check-ins lose their activity-log actor attribution';
  end if;

  if has_column_privilege(
       'authenticated',
       'public.profiles',
       'display_name',
       'UPDATE'
     )
     or exists (
       select 1
       from pg_policies
       where schemaname = 'public'
         and tablename = 'profiles'
         and policyname = 'profiles_update_own_display_name'
     ) then
    raise exception 'Authenticated users can still change admin-controlled display names';
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

  select pg_get_functiondef(
    'app_private.set_checklist_item_completion(text,boolean)'::regprocedure
  ) into checklist_completion_definition;

  if checklist_completion_definition not like '%service_check_ins%'
     or checklist_completion_definition not like '%tn.service_id is null%'
     or checklist_completion_definition not like '%Asia/Taipei%' then
    raise exception 'Checklist completion RPC is missing its service authorization boundary';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'service_stations'
      and policyname = 'service_stations_select'
      and coalesce(qual, '') like '%published%'
      and coalesce(qual, '') like '%completed%'
  ) then
    raise exception 'Station visibility policy is missing service status restrictions';
  end if;

  if has_function_privilege(
       'anon',
       'public.claim_first_admin(uuid,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.claim_first_admin(uuid,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.claim_first_admin(uuid,text,text)',
       'EXECUTE'
     ) then
    raise exception 'First-admin claim RPC privileges are incorrect';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'claim_first_admin'
      and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog']
  ) then
    raise exception 'First-admin claim RPC is not hardened';
  end if;

end;
$$;

begin;
set local role service_role;

do $$
declare
  reservation record;
begin
  select *
  into reservation
  from public.reserve_tts_chars_v2(
    '__security_baseline_verification__',
    1,
    10,
    10
  );

  if not reservation.allowed
     or reservation.provider_key <> 'primary'
     or reservation.primary_used_chars <> 1 then
    raise exception 'TTS reservation RPC returned an unexpected result';
  end if;
end;
$$;

rollback;

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
