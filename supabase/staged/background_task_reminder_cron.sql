-- Staged only. No extension is installed, no cron job is created, and no
-- HTTP request is made by applying this definition. The release runbook
-- requires separate approval and verification before any scheduler is enabled.

create function background_reminder_private.should_dispatch(p_at timestamptz)
returns boolean
language sql stable security invoker
set search_path = pg_catalog
as $$
  select case
    when p_at is null then false
    when extract(second from p_at at time zone 'Asia/Taipei') > 20 then false
    when not (
      (extract(dow from p_at at time zone 'Asia/Taipei') = 6
        and (p_at at time zone 'Asia/Taipei')::time >= time '17:00'
        and (p_at at time zone 'Asia/Taipei')::time < time '21:45')
      or (extract(dow from p_at at time zone 'Asia/Taipei') = 0
        and (p_at at time zone 'Asia/Taipei')::time < time '12:45')
    ) then false
    when not exists (
      select 1 from public.background_reminder_devices d
      where d.enabled and d.expires_at > p_at
    ) then false
    else exists (
      select 1 from public.background_reminder_candidates(p_at) c
      where not exists (
        select 1 from public.background_task_reminder_deliveries old
        where old.device_id = c.device_id
          and old.service_id = c.service_id
          and old.scheduled_at = c.scheduled_at
          and (old.state <> 'claimed' or old.user_id <> c.user_id
            or old.check_in_id <> c.check_in_id
            or old.assignment_id <> c.assignment_id
            or old.timeline_node_id <> c.timeline_node_id)
      )
    )
  end;
$$;

-- Owner-run pg_cron job only. The secret is read from Vault at execution,
-- never embedded in a migration, source file, cron command, or return value.
-- pg_net and Vault must be separately reviewed and enabled before activation.
create function background_reminder_private.queue_due_dispatch()
returns boolean
language plpgsql volatile security invoker
set search_path = pg_catalog
as $$
declare
  dispatch_at timestamptz := clock_timestamp();
  dispatch_secret text;
begin
  if not background_reminder_private.should_dispatch(dispatch_at) then return false; end if;
  select s.decrypted_secret into dispatch_secret
  from vault.decrypted_secrets s
  where s.name = 'background_reminder_dispatch_secret';
  if dispatch_secret is null or length(dispatch_secret) < 32 or length(dispatch_secret) > 512 then
    return false;
  end if;
  -- Hardcoded trusted production origin. No client-supplied URLs.
  perform net.http_post(
    url := 'https://servant-timeline.vercel.app/api/background-reminders/dispatch',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_secret
    ),
    timeout_milliseconds := 60000
  );
  return true;
end;
$$;

revoke all on function background_reminder_private.should_dispatch(timestamptz),
  background_reminder_private.queue_due_dispatch() from public, anon, authenticated, service_role;
