-- CLI-generated migration filename from isolated CI run 45827475464.

-- Isolated admin-only task-time testing; never create a formal check-in.
-- No job, secret, device or notification is created by this migration.
create table background_reminder_private.admin_test_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null,
 endpoint text not null unique check (length(endpoint)<=2048 and endpoint ~ '^https://web[.]push[.]apple[.]com/[A-Za-z0-9_-]+$'),
 p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
 auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_-]{22}$'),
 service_type text not null check (service_type in ('六晚崇','主一堂','主二堂')),
 test_date date not null,
 enabled boolean not null default true,
 opted_in_at timestamptz not null,
 expires_at timestamptz not null,
 updated_at timestamptz not null,
 check (expires_at > opted_in_at and expires_at <= opted_in_at + interval '12 hours')
);
create index admin_test_devices_active on background_reminder_private.admin_test_devices(expires_at) where enabled;
create table background_reminder_private.admin_test_deliveries (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references background_reminder_private.admin_test_devices(id) on delete cascade,
 service_type text not null,
 scheduled_at timestamptz not null,
 state text not null default 'claimed' check (state in ('claimed','sending','accepted','rejected','uncertain')),
 started_at timestamptz,
 finished_at timestamptz,
 provider_status integer check (provider_status between 100 and 599),
 unique(device_id,service_type,scheduled_at)
);
alter table background_reminder_private.admin_test_devices enable row level security;
alter table background_reminder_private.admin_test_deliveries enable row level security;
revoke all on background_reminder_private.admin_test_devices,background_reminder_private.admin_test_deliveries from public,anon,authenticated;
grant select,insert,update,delete on background_reminder_private.admin_test_devices,background_reminder_private.admin_test_deliveries to service_role;

create function background_reminder_private.admin_test_allowed(p_user uuid,p_session uuid,p_at timestamptz)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select p_at is not null
  and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
     where p.id=p_user and p.is_active and r.role='admin')
  and background_reminder_private.session_is_live(p_user,p_session,p_at)
  -- Real check-in always takes precedence; no double reminder.
  and not exists(select 1 from public.background_reminder_open_bindings(p_at,p_user,null));
$$;
create function background_reminder_private.admin_test_blocks(p_service text,p_date date)
returns table(scheduled_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
 select b.scheduled_at from (
  select distinct case when n.time ~ '^(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    then (p_date+make_time(split_part(n.time,':',1)::integer,
      split_part(n.time,':',2)::integer,0)) at time zone 'Asia/Taipei' end as scheduled_at
  from public.timeline_nodes n
  where n.service_id is null and n.is_active and n.service_type=p_service
 ) b where b.scheduled_at is not null order by b.scheduled_at offset 1;
$$;

create function public.register_admin_timeline_reminder_device(
 p_user_id uuid,p_session_id uuid,p_service_type text,p_endpoint text,
 p_p256dh text,p_auth_secret text,p_at timestamptz default clock_timestamp()
) returns table(device_id uuid,expires_at timestamptz)
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare
 local_date date := (p_at at time zone 'Asia/Taipei')::date;
 cutoff timestamptz;
begin
 if p_service_type is null or p_service_type not in ('六晚崇','主一堂','主二堂')
    or p_endpoint is null or length(p_endpoint)>2048 or p_endpoint !~ '^https://web[.]push[.]apple[.]com/[A-Za-z0-9_-]+$'
    or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$'
    or p_auth_secret is null or p_auth_secret !~ '^[A-Za-z0-9_-]{22}$'
    or not background_reminder_private.admin_test_allowed(p_user_id,p_session_id,p_at) then return; end if;
 if exists(select 1 from public.background_reminder_devices d where d.endpoint=p_endpoint
     and (d.user_id<>p_user_id or d.p256dh<>p_p256dh or d.auth_secret<>p_auth_secret)) then return; end if;
 cutoff := least(p_at+interval '12 hours',((local_date+1)::timestamp at time zone 'Asia/Taipei'));
 return query insert into background_reminder_private.admin_test_devices as d
    (user_id,session_id,endpoint,p256dh,auth_secret,service_type,test_date,enabled,opted_in_at,expires_at,updated_at)
 values(p_user_id,p_session_id,p_endpoint,p_p256dh,p_auth_secret,p_service_type,local_date,true,p_at,cutoff,p_at)
 on conflict(endpoint) do update set session_id=excluded.session_id, service_type=excluded.service_type,
   test_date=excluded.test_date,enabled=true,
   opted_in_at=case when d.enabled and d.expires_at>p_at and d.session_id=excluded.session_id
     and d.service_type=excluded.service_type and d.test_date=excluded.test_date then d.opted_in_at else p_at end,
   expires_at=case when d.enabled and d.expires_at>p_at and d.session_id=excluded.session_id
     and d.service_type=excluded.service_type and d.test_date=excluded.test_date then least(d.expires_at,excluded.expires_at) else excluded.expires_at end,
   updated_at=p_at
 where d.user_id=p_user_id and d.p256dh=p_p256dh and d.auth_secret=p_auth_secret and d.updated_at<=p_at
 returning d.id,d.expires_at;
end;
$$;

create function public.disable_admin_timeline_reminder_device(p_user_id uuid,p_endpoint text,p_at timestamptz default clock_timestamp())
returns boolean language sql volatile security invoker set search_path=pg_catalog as $$
 with stopped as (
  update background_reminder_private.admin_test_devices d set enabled=false,updated_at=p_at
  where d.user_id=p_user_id and d.endpoint=p_endpoint and d.updated_at<=p_at returning d.id
 ) select exists(select 1 from stopped);
$$;

create function background_reminder_private.admin_test_candidates(p_at timestamptz)
returns table(device_id uuid,service_date date,service_type text,scheduled_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
 select d.id,d.test_date,d.service_type,b.scheduled_at
 from background_reminder_private.admin_test_devices d
 cross join lateral background_reminder_private.admin_test_blocks(d.service_type,d.test_date) b
 where d.enabled and d.opted_in_at<=p_at and d.expires_at>p_at
  and d.test_date=(p_at at time zone 'Asia/Taipei')::date
  and b.scheduled_at>=d.opted_in_at and b.scheduled_at between p_at-interval '20 seconds' and p_at
  and background_reminder_private.admin_test_allowed(d.user_id,d.session_id,p_at)
  and not exists(select 1 from public.background_reminder_devices f where f.endpoint=d.endpoint
   and (f.user_id<>d.user_id or f.p256dh<>d.p256dh or f.auth_secret<>d.auth_secret));
$$;
create function public.claim_admin_timeline_reminders(p_at timestamptz default clock_timestamp(),p_limit integer default 50)
returns table(delivery_id uuid)
language sql volatile security invoker set search_path=pg_catalog as $$
 with due as materialized (
  select c.* from background_reminder_private.admin_test_candidates(p_at) c
  where not exists(select 1 from background_reminder_private.admin_test_deliveries l
    where l.device_id=c.device_id and l.service_type=c.service_type and l.scheduled_at=c.scheduled_at and l.state<>'claimed')
  order by c.scheduled_at,c.device_id limit greatest(1,least(coalesce(p_limit,50),50))
 ), inserted as (
  insert into background_reminder_private.admin_test_deliveries(device_id,service_type,scheduled_at)
  select c.device_id,c.service_type,c.scheduled_at from due c
  on conflict(device_id,service_type,scheduled_at) do nothing returning id
 )
 select i.id from inserted i union all
 select l.id from background_reminder_private.admin_test_deliveries l join due c
 on l.device_id=c.device_id and l.service_type=c.service_type and l.scheduled_at=c.scheduled_at
 where l.state='claimed';
$$;
create function public.take_admin_timeline_reminder(p_delivery_id uuid,p_at timestamptz default clock_timestamp())
returns table(delivery_id uuid,endpoint text,p256dh text,auth_secret text,service_date date,service_type text,task_time text,scheduled_at timestamptz)
language sql volatile security invoker set search_path=pg_catalog as $$
 with valid as materialized (
  select c.* from background_reminder_private.admin_test_candidates(p_at) c
  join background_reminder_private.admin_test_deliveries l on l.device_id=c.device_id
    and l.service_type=c.service_type and l.scheduled_at=c.scheduled_at
  where l.id=p_delivery_id and l.state='claimed'
 ), taken as (
  update background_reminder_private.admin_test_deliveries l set state='sending',started_at=p_at
  from valid c where l.id=p_delivery_id and l.state='claimed'
    and l.device_id=c.device_id and l.service_type=c.service_type and l.scheduled_at=c.scheduled_at
  returning l.id,l.device_id,l.scheduled_at,l.service_type
 )
 select t.id,d.endpoint,d.p256dh,d.auth_secret,c.service_date,c.service_type,
  to_char(t.scheduled_at at time zone 'Asia/Taipei','HH24:MI'),t.scheduled_at
 from taken t join valid c on c.device_id=t.device_id and c.service_type=t.service_type and c.scheduled_at=t.scheduled_at
 join background_reminder_private.admin_test_devices d on d.id=t.device_id;
$$;
create function public.finish_admin_timeline_reminder(p_delivery_id uuid,p_state text,p_provider_status integer default null,p_at timestamptz default clock_timestamp())
returns boolean language sql volatile security invoker set search_path=pg_catalog as $$
 with finished as (
  update background_reminder_private.admin_test_deliveries l
  set state=p_state,provider_status=p_provider_status,finished_at=p_at
  where l.id=p_delivery_id and l.state='sending' and p_at>=l.started_at
   and ((p_state='accepted' and p_provider_status between 200 and 299)
   or (p_state='rejected' and p_provider_status between 100 and 599 and p_provider_status not between 200 and 299)
   or (p_state='uncertain' and p_provider_status is null))
  returning l.device_id,l.started_at,l.provider_status
 ), expired as (
  update background_reminder_private.admin_test_devices d set enabled=false,updated_at=p_at
  from finished f where f.provider_status in (404,410) and d.id=f.device_id and d.updated_at<=f.started_at returning d.id
 ) select exists(select 1 from finished);
$$;

revoke all on function background_reminder_private.admin_test_allowed(uuid,uuid,timestamptz),
 background_reminder_private.admin_test_blocks(text,date),background_reminder_private.admin_test_candidates(timestamptz)
 from public,anon,authenticated;
grant execute on function background_reminder_private.admin_test_allowed(uuid,uuid,timestamptz),
 background_reminder_private.admin_test_blocks(text,date),background_reminder_private.admin_test_candidates(timestamptz)
 to service_role;
revoke all on function public.register_admin_timeline_reminder_device(uuid,uuid,text,text,text,text,timestamptz),
 public.disable_admin_timeline_reminder_device(uuid,text,timestamptz),
 public.claim_admin_timeline_reminders(timestamptz,integer),public.take_admin_timeline_reminder(uuid,timestamptz),
 public.finish_admin_timeline_reminder(uuid,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.register_admin_timeline_reminder_device(uuid,uuid,text,text,text,text,timestamptz),
 public.disable_admin_timeline_reminder_device(uuid,text,timestamptz),
 public.claim_admin_timeline_reminders(timestamptz,integer),public.take_admin_timeline_reminder(uuid,timestamptz),
 public.finish_admin_timeline_reminder(uuid,text,integer,timestamptz) to service_role;

create or replace function background_reminder_private.should_dispatch(p_at timestamptz)
returns boolean
language sql stable security invoker
set search_path = pg_catalog
as $$
  select case
    when p_at is null then false
    when extract(second from p_at at time zone 'Asia/Taipei') > 20 then false
    when exists (
      select 1 from background_reminder_private.admin_test_devices d
      where d.enabled and d.expires_at > p_at
    ) and exists (
      select 1 from background_reminder_private.admin_test_candidates(p_at) c
      where not exists (
        select 1 from background_reminder_private.admin_test_deliveries l
        where l.device_id=c.device_id and l.service_type=c.service_type
          and l.scheduled_at=c.scheduled_at and l.state<>'claimed'
      )
    ) then true
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
