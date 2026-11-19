-- Verify the private Broadcast path used for low-latency communication messages.

do $$
declare
  function_oid oid;
begin
  select p.oid
  into function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.proname = 'broadcast_communication_message_insert'
    and pg_get_function_identity_arguments(p.oid) = '';

  if function_oid is null then
    raise exception 'broadcast_communication_message_insert function is missing';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = function_oid
      and prosecdef
  ) then
    raise exception 'broadcast function must remain SECURITY DEFINER';
  end if;

  if has_function_privilege(
    'anon',
    'app_private.broadcast_communication_message_insert()',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute broadcast trigger function';
  end if;

  if has_function_privilege(
    'authenticated',
    'app_private.broadcast_communication_message_insert()',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute broadcast trigger function';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'communication_messages'
      and t.tgname = 'communication_messages_broadcast_insert'
      and not t.tgisinternal
  ) then
    raise exception 'communication message Broadcast trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'communication_receive_own_broadcast'
      and roles @> array['authenticated']::name[]
  ) then
    raise exception 'private Broadcast receive policy is missing';
  end if;
end
$$;
