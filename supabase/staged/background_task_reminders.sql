-- Executable staging schema. Not a live migration: the isolated CI test includes
-- this file inside a transaction and rolls back. Enable only after review,
-- a real migration, and the authenticated subscription/dispatch integration.
-- No existing table, trigger, voice behavior, or cron job is changed.

create table public.background_reminder_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  check_in_id uuid not null references public.service_check_ins(id) on delete cascade,
  service_id uuid not null,
  assignment_id uuid not null,
  endpoint text not null unique
    check (length(endpoint) <= 2048 and endpoint ~ '^https://web[.]push[.]apple[.]com/[A-Za-z0-9_-]+$'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_-]{22}$'),
  enabled boolean not null default false,
  opted_in_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (expires_at > opted_in_at and expires_at <= opted_in_at + interval '12 hours')
);

-- Device bindings deliberately do not add a composite FK that would prevent
-- the existing service-correction workflow. Every read verifies the binding
-- against the current check-in, assignment and service before dispatch.
create index background_reminder_devices_active_idx
  on public.background_reminder_devices(service_id, expires_at)
  where enabled;

create table public.background_task_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.background_reminder_devices(id) on delete cascade,
  user_id uuid not null,
  check_in_id uuid not null,
  assignment_id uuid not null,
  service_id uuid not null,
  timeline_node_id text not null,
  scheduled_at timestamptz not null,
  state text not null default 'claimed'
    check (state in ('claimed', 'sending', 'accepted', 'rejected', 'uncertain')),
  claimed_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  provider_status integer check (provider_status between 100 and 599),
  constraint background_task_reminder_one_per_block unique (device_id, service_id, scheduled_at),
  check (
    (state = 'claimed' and started_at is null and finished_at is null and provider_status is null)
    or (state = 'sending' and started_at is not null and finished_at is null and provider_status is null)
    or (state = 'accepted' and started_at is not null and finished_at is not null and provider_status is not null and provider_status between 200 and 299)
    or (state = 'rejected' and started_at is not null and finished_at is not null and provider_status is not null and provider_status not between 200 and 299)
    or (state = 'uncertain' and started_at is not null and finished_at is not null and provider_status is null)
  )
);

create index background_task_reminder_pending_idx
  on public.background_task_reminder_deliveries(scheduled_at)
  where state = 'claimed';

alter table public.background_reminder_devices enable row level security;
alter table public.background_task_reminder_deliveries enable row level security;
revoke all on public.background_reminder_devices, public.background_task_reminder_deliveries
  from public, anon, authenticated;
grant select, insert, update, delete on public.background_reminder_devices, public.background_task_reminder_deliveries
  to service_role;

-- This is a vibration/task-block planner, independent of the voice assistant.
-- It reads authoritative database rows; no browser role, task or time is trusted.
-- Exactly one transition per device/service/minute. The first block is the
-- already-selected initial block in the existing UI, so does not vibrate again.
create function public.background_reminder_candidates(p_at timestamptz)
returns table (
  device_id uuid, user_id uuid, check_in_id uuid, assignment_id uuid,
  service_id uuid, timeline_node_id text, scheduled_at timestamptz,
  service_date date, service_type text, task_time text
)
language sql stable security invoker
set search_path = pg_catalog
as $$
  with local_clock as (
    select p_at at time zone 'Asia/Taipei' as local_now
  ),
  scoped as (
    select d.id as device_id, d.user_id, d.check_in_id, d.assignment_id,
      d.service_id, d.opted_in_at, ci.checked_in_at,
      ws.service_date, ws.service_type, a.role_label, lc.local_now,
      (roles.coordinator and not roles.admin
        and a.role_label <> '副總招'
        and (scope.has_lead or not scope.has_deputy)) as lead_scope,
      (a.role_label = '副總招'
        or (roles.coordinator and not roles.admin and scope.has_deputy and not scope.has_lead)) as deputy_scope
    from public.background_reminder_devices d
    join public.profiles p on p.id = d.user_id and p.is_active
    join public.service_check_ins ci on ci.id = d.check_in_id
      and ci.user_id = d.user_id and ci.service_id = d.service_id
      and ci.assignment_id = d.assignment_id
      and ci.status in ('checked_in', 'station_confirmed')
    join public.service_assignments a on a.id = d.assignment_id
      and a.user_id = d.user_id and a.service_id = d.service_id
      and a.status in ('scheduled', 'confirmed')
    join public.worship_services ws on ws.id = d.service_id and ws.status = 'published'
    cross join local_clock lc
    cross join lateral (
      select coalesce(bool_or(ur.role = 'coordinator'), false) as coordinator,
             coalesce(bool_or(ur.role = 'admin'), false) as admin
      from public.user_roles ur where ur.user_id = d.user_id
    ) roles
    cross join lateral (
      select coalesce(bool_or(sa.role_label = '總招'), false) as has_lead,
             coalesce(bool_or(sa.role_label = '副總招'), false) as has_deputy
      from public.service_assignments sa
      join public.worship_services s on s.id = sa.service_id
      where sa.user_id = d.user_id
        and sa.status in ('scheduled', 'confirmed', 'completed')
        and s.service_date = ws.service_date
        and s.status in ('published', 'completed')
        and s.service_type in ('六晚崇', '主一堂', '主二堂')
    ) scope
    where d.enabled and d.opted_in_at <= p_at and d.expires_at > p_at
      and ci.checked_in_at <= p_at
      and ws.service_date = lc.local_now::date
  ),
  open_services as (
    -- Same Taipei service windows as lib/services/service-activation.ts;
    -- the early second-service and earlier first-service cutoff are lead-only.
    select e.* from scoped e
    where (extract(dow from e.local_now) = 6 and e.service_type = '六晚崇'
        and e.local_now::time >= time '17:00' and e.local_now::time < time '21:45')
       or (extract(dow from e.local_now) = 0 and e.service_type = '主一堂'
        and e.local_now::time < case when e.lead_scope then time '10:45' else time '12:45' end)
       or (extract(dow from e.local_now) = 0 and e.service_type = '主二堂'
        and e.local_now::time >= case when e.lead_scope then time '08:00' else time '10:00' end
        and e.local_now::time < time '12:45')
  ),
  timed_nodes as (
    select e.*, n.id as timeline_node_id, n.sort_order,
      case when n.time ~ '^(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        then (e.service_date + make_time(split_part(n.time, ':', 1)::integer,
          split_part(n.time, ':', 2)::integer, 0)) at time zone 'Asia/Taipei'
      end as scheduled_at
    from open_services e
    join public.timeline_nodes n on n.is_active and (
      n.service_id = e.service_id
      or (n.service_id is null and n.service_type = e.service_type
        and not exists (
          select 1 from public.timeline_nodes snapshot
          where snapshot.service_id = e.service_id and snapshot.source_template_node_id = n.id
        ))
    )
    where (
      exists (
        select 1 from public.service_task_assignments m
        where m.service_id = e.service_id and m.assignment_id = e.assignment_id
          and m.timeline_node_id = n.id
      )
      or (
        -- Match the server's shared-timeline exception only for the verified
        -- lead coordinator. Other unresolved placeholder roles fail closed.
        e.lead_scope and e.role_label = '待分派'
        and not exists (
          select 1 from public.service_task_assignments m
          where m.service_id = e.service_id and m.assignment_id = e.assignment_id
        )
      )
    )
    and (not e.deputy_scope or lower(concat_ws(' ', n.title, n.assignee, n.location, n.details))
      ~ '三樓|3樓|3f|三層|副總招|副總召')
  ),
  distinct_blocks as (
    select distinct on (n.device_id, n.service_id, n.scheduled_at) n.*
    from timed_nodes n
    where n.scheduled_at is not null
    order by n.device_id, n.service_id, n.scheduled_at, n.sort_order desc, n.timeline_node_id desc
  ),
  numbered as (
    select b.*, row_number() over (
      partition by b.device_id, b.service_id order by b.scheduled_at
    ) as block_number
    from distinct_blocks b
  )
  select b.device_id, b.user_id, b.check_in_id, b.assignment_id, b.service_id,
    b.timeline_node_id, b.scheduled_at, b.service_date, b.service_type,
    to_char(b.scheduled_at at time zone 'Asia/Taipei', 'HH24:MI') as task_time
  from numbered b
  where b.block_number > 1
    and b.scheduled_at >= greatest(b.checked_in_at, b.opted_in_at)
    and b.scheduled_at <= p_at
    and b.scheduled_at >= p_at - interval '20 seconds';
$$;

-- The unique constraint provides durable, cross-worker deduplication. Existing
-- unstarted claims can be recovered within the grace window; nothing already
-- sending or finalized is reclaimed. No subscription credential is returned.
create function public.claim_background_task_reminders(
  p_at timestamptz default clock_timestamp(), p_limit integer default 50
)
returns table (delivery_id uuid, device_id uuid, scheduled_at timestamptz)
language sql volatile security invoker
set search_path = pg_catalog
as $$
  with due as materialized (
    select c.*
    from public.background_reminder_candidates(p_at) c
    where not exists (
      select 1 from public.background_task_reminder_deliveries old
      where old.device_id = c.device_id and old.service_id = c.service_id
        and old.scheduled_at = c.scheduled_at
        and (old.state <> 'claimed' or old.user_id <> c.user_id
          or old.check_in_id <> c.check_in_id or old.assignment_id <> c.assignment_id
          or old.timeline_node_id <> c.timeline_node_id)
    )
    order by c.scheduled_at, c.device_id
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ),
  inserted as (
    insert into public.background_task_reminder_deliveries (
      device_id, user_id, check_in_id, assignment_id, service_id,
      timeline_node_id, scheduled_at, claimed_at
    )
    select c.device_id, c.user_id, c.check_in_id, c.assignment_id, c.service_id,
      c.timeline_node_id, c.scheduled_at, p_at from due c
    on conflict on constraint background_task_reminder_one_per_block do nothing
    returning id, device_id, scheduled_at
  )
  select i.id, i.device_id, i.scheduled_at from inserted i
  union all
  select l.id, l.device_id, l.scheduled_at
  from public.background_task_reminder_deliveries l join due c
    on l.device_id = c.device_id and l.service_id = c.service_id
    and l.scheduled_at = c.scheduled_at
    and l.user_id = c.user_id and l.check_in_id = c.check_in_id
    and l.assignment_id = c.assignment_id and l.timeline_node_id = c.timeline_node_id
  where l.state = 'claimed';
$$;

-- Just before network dispatch, recheck all authoritative conditions and
-- atomically consume the claim. Parallel workers cannot both take it.
-- Return only minimal notification metadata plus the server-only subscription.
create function public.take_background_task_reminder(
  p_delivery_id uuid, p_at timestamptz default clock_timestamp()
)
returns table (
  delivery_id uuid, endpoint text, p256dh text, auth_secret text,
  service_date date, service_type text, task_time text, scheduled_at timestamptz
)
language sql volatile security invoker
set search_path = pg_catalog
as $$
  with valid as materialized (
    select c.*
    from public.background_reminder_candidates(p_at) c
    join public.background_task_reminder_deliveries l
      on l.device_id = c.device_id and l.service_id = c.service_id
      and l.scheduled_at = c.scheduled_at and l.user_id = c.user_id
      and l.check_in_id = c.check_in_id and l.assignment_id = c.assignment_id
      and l.timeline_node_id = c.timeline_node_id
    where l.id = p_delivery_id and l.state = 'claimed'
  ),
  taken as (
    update public.background_task_reminder_deliveries l
      set state = 'sending', started_at = p_at
    from valid c
    where l.id = p_delivery_id and l.state = 'claimed'
      and l.device_id = c.device_id and l.service_id = c.service_id
      and l.scheduled_at = c.scheduled_at and l.user_id = c.user_id
      and l.check_in_id = c.check_in_id and l.assignment_id = c.assignment_id
      and l.timeline_node_id = c.timeline_node_id
    returning l.id, l.device_id, l.scheduled_at
  )
  select t.id, d.endpoint, d.p256dh, d.auth_secret,
    c.service_date, c.service_type, c.task_time, t.scheduled_at
  from taken t
  join valid c on c.device_id = t.device_id and c.scheduled_at = t.scheduled_at
  join public.background_reminder_devices d on d.id = t.device_id;
$$;

-- Provider acceptance is not proof of device delivery. Never blindly retry a
-- request after an uncertain result: doing so could create duplicate alerts.
create function public.finish_background_task_reminder(
  p_delivery_id uuid, p_state text, p_provider_status integer default null,
  p_at timestamptz default clock_timestamp()
)
returns boolean
language sql volatile security invoker
set search_path = pg_catalog
as $$
  with finished as (
    update public.background_task_reminder_deliveries l
      set state = p_state, provider_status = p_provider_status, finished_at = p_at
    where l.id = p_delivery_id and l.state = 'sending' and p_at >= l.started_at
      and ((p_state = 'accepted' and p_provider_status between 200 and 299)
        or (p_state = 'rejected' and p_provider_status between 100 and 599
          and p_provider_status not between 200 and 299)
        or (p_state = 'uncertain' and p_provider_status is null))
    returning l.id
  )
  select exists(select 1 from finished);
$$;

revoke all on function public.background_reminder_candidates(timestamptz),
  public.claim_background_task_reminders(timestamptz, integer),
  public.take_background_task_reminder(uuid, timestamptz),
  public.finish_background_task_reminder(uuid, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.background_reminder_candidates(timestamptz),
  public.claim_background_task_reminders(timestamptz, integer),
  public.take_background_task_reminder(uuid, timestamptz),
  public.finish_background_task_reminder(uuid, text, integer, timestamptz)
  to service_role;
