-- Rehearsal management foundation. No formal service tables are written.
-- New tables and RPCs are server-only. No scheduler or push secrets are created.
create table public.service_rehearsals (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('六晚崇','主一堂','主二堂')),
  started_at timestamptz not null,
  started_by uuid references public.profiles(id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is not null or ended_by is null)
);
-- One training session at a time. Ending never deletes an existing session.
create unique index service_rehearsals_one_open on public.service_rehearsals ((true))
  where ended_at is null;

create table public.service_rehearsal_members (
  rehearsal_id uuid not null references public.service_rehearsals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- A row records actual participation, not permission or pre-enrollment.
  -- Null check-in means no current rehearsal check-in.
  checked_in_at timestamptz,
  primary key (rehearsal_id,user_id)
);
create index service_rehearsal_members_by_user on public.service_rehearsal_members(user_id,rehearsal_id);

create table public.service_rehearsal_nodes (
  id uuid primary key default gen_random_uuid(),
  rehearsal_id uuid not null references public.service_rehearsals(id) on delete cascade,
  source_node_id text not null,
  source_time time not null,
  due_at timestamptz not null,
  sort_order integer not null,
  content jsonb not null check (jsonb_typeof(content)='object'),
  unique (rehearsal_id,id),
  unique (rehearsal_id,source_node_id)
);
create index service_rehearsal_nodes_by_time on public.service_rehearsal_nodes(rehearsal_id,due_at,sort_order);

create table public.service_rehearsal_items (
  id uuid primary key default gen_random_uuid(),
  rehearsal_id uuid not null,
  node_id uuid not null,
  source_item_id text not null,
  text text,
  details text,
  sort_order integer not null,
  foreign key (rehearsal_id,node_id) references public.service_rehearsal_nodes(rehearsal_id,id) on delete cascade,
  unique (rehearsal_id,id),
  unique (rehearsal_id,source_item_id)
);
create index service_rehearsal_items_by_node on public.service_rehearsal_items(rehearsal_id,node_id,sort_order);

create table public.service_rehearsal_item_states (
  rehearsal_id uuid not null,
  user_id uuid not null,
  item_id uuid not null,
  is_completed boolean not null,
  completed_at timestamptz,
  primary key (rehearsal_id,user_id,item_id),
  foreign key (rehearsal_id,user_id) references public.service_rehearsal_members(rehearsal_id,user_id) on delete cascade,
  foreign key (rehearsal_id,item_id) references public.service_rehearsal_items(rehearsal_id,id) on delete cascade,
  check (is_completed = (completed_at is not null))
);

alter table public.service_rehearsals enable row level security;
alter table public.service_rehearsal_members enable row level security;
alter table public.service_rehearsal_nodes enable row level security;
alter table public.service_rehearsal_items enable row level security;
alter table public.service_rehearsal_item_states enable row level security;
revoke all on public.service_rehearsals,public.service_rehearsal_members,
  public.service_rehearsal_nodes,public.service_rehearsal_items,public.service_rehearsal_item_states
  from public,anon,authenticated,service_role;
grant select,insert,update on public.service_rehearsals,public.service_rehearsal_members to service_role;
grant select,insert on public.service_rehearsal_nodes,public.service_rehearsal_items to service_role;
grant select,insert,update on public.service_rehearsal_item_states to service_role;

create schema service_rehearsal_private;
revoke all on schema service_rehearsal_private from public,anon,authenticated;
grant usage on schema service_rehearsal_private to service_role;

create function service_rehearsal_private.assert_admin(p_actor uuid,p_session uuid)
returns void language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  if not background_reminder_private.session_is_live(p_actor,p_session,clock_timestamp())
    or not exists (
      select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
      where p.id=p_actor and p.is_active and r.role='admin'
    ) then
    raise exception using errcode='42501',message='Rehearsal administrator required';
  end if;
end;
$$;
revoke all on function service_rehearsal_private.assert_admin(uuid,uuid) from public,anon,authenticated;
grant execute on function service_rehearsal_private.assert_admin(uuid,uuid) to service_role;

-- Eligibility is evaluated from current account data, not a roster snapshot.
-- A newly approved coordinator is eligible even after the rehearsal starts.
create function service_rehearsal_private.is_eligible_user(p_user uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
    where p.id=p_user and p.is_active and r.role in ('coordinator','admin')
  );
$$;
revoke all on function service_rehearsal_private.is_eligible_user(uuid) from public,anon,authenticated;
grant execute on function service_rehearsal_private.is_eligible_user(uuid) to service_role;

create function public.start_service_rehearsal(p_actor uuid,p_session uuid,p_service_type text)
returns uuid language plpgsql security invoker set search_path = pg_catalog
as $$
declare
  v_id uuid;
  v_start timestamptz;
  v_anchor timestamptz;
  v_node_count bigint;
begin
  perform service_rehearsal_private.assert_admin(p_actor,p_session);
  if p_service_type is null or p_service_type not in ('六晚崇','主一堂','主二堂') then
    raise exception using errcode='22023',message='Invalid rehearsal template';
  end if;
  v_start := clock_timestamp();
  v_anchor := date_trunc('minute',v_start);
  if v_start>v_anchor then v_anchor := v_anchor+interval '1 minute'; end if;
  insert into public.service_rehearsals(service_type,started_at,started_by)
    values(p_service_type,v_start,p_actor) returning id into v_id;
  -- Check-in rows are created only by the network-gated participant RPC.

  -- All nodes/items are copied using a single SQL statement snapshot.
  -- Invalid template times fail the NOT NULL constraint, rolling back the
  -- entire start. Source IDs are plain references, not foreign keys.
  with source_nodes as (
    select n.*,
      case when n.time ~ '^(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        then n.time::time end as normalized_time
    from public.timeline_nodes n
    where n.service_id is null and n.is_active and n.service_type=p_service_type
  ), copied_nodes as (
    insert into public.service_rehearsal_nodes(rehearsal_id,source_node_id,source_time,due_at,sort_order,content)
    select v_id,n.id,n.normalized_time,
      v_anchor + (6+2*(dense_rank() over(order by n.normalized_time)-1))*interval '1 minute',
      n.sort_order,
      jsonb_build_object('title',n.title,'assignee',n.assignee,'location',n.location,'details',n.details,
        'voice_reminder_enabled',n.voice_reminder_enabled,
        'reminder_pre5_enabled',n.reminder_pre5_enabled,'reminder_now_enabled',n.reminder_now_enabled,
        'voice_pre5_simple',n.voice_pre5_simple,'voice_pre5_standard',n.voice_pre5_standard,
        'voice_pre5_detailed',n.voice_pre5_detailed,'voice_now_simple',n.voice_now_simple,
        'voice_now_standard',n.voice_now_standard,'voice_now_detailed',n.voice_now_detailed)
    from source_nodes n
    returning id,rehearsal_id,source_node_id
  ), copied_items as (
    insert into public.service_rehearsal_items(rehearsal_id,node_id,source_item_id,text,details,sort_order)
    select n.rehearsal_id,n.id,i.id,i.text,i.details,coalesce(i.sort_order,0)
    from copied_nodes n join public.checklist_items i on i.node_id=n.source_node_id and i.is_active
    returning id
  )
  select count(*) into v_node_count from copied_nodes;
  if v_node_count=0 then
    raise exception using errcode='22023',message='Empty rehearsal template';
  end if;
  return v_id;
end;
$$;
revoke all on function public.start_service_rehearsal(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.start_service_rehearsal(uuid,uuid,text) to service_role;

create function public.end_service_rehearsal(p_actor uuid,p_session uuid,p_rehearsal uuid)
returns timestamptz language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_started timestamptz; v_ended timestamptz;
begin
  perform service_rehearsal_private.assert_admin(p_actor,p_session);
  select r.started_at,r.ended_at into v_started,v_ended
    from public.service_rehearsals r where r.id=p_rehearsal for update;
  if not found then raise exception using errcode='22023',message='Rehearsal does not exist'; end if;
  -- A repeated request is idempotent and cannot end a newer rehearsal.
  if v_ended is not null then return v_ended; end if;
  v_ended := greatest(clock_timestamp(),v_started);
  update public.service_rehearsals set ended_at=v_ended,ended_by=p_actor where id=p_rehearsal;
  update public.service_rehearsal_members set checked_in_at=null where rehearsal_id=p_rehearsal and checked_in_at is not null;
  return v_ended;
end;
$$;
revoke all on function public.end_service_rehearsal(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.end_service_rehearsal(uuid,uuid,uuid) to service_role;

-- Return the current session and aggregate counts only. No participant roster
-- is required. Counts follow current eligibility, including late activations.
create function public.get_service_rehearsal_admin_state(p_actor uuid,p_session uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_state jsonb;
begin
  perform service_rehearsal_private.assert_admin(p_actor,p_session);
  with current_rehearsal as (
    select r.id,r.service_type,r.started_at from public.service_rehearsals r
    where r.ended_at is null
  ), eligible as (
    select p.id from public.profiles p
    where service_rehearsal_private.is_eligible_user(p.id)
  )
  select jsonb_build_object(
    'rehearsal',(select jsonb_build_object('id',r.id,'serviceType',r.service_type,'startedAt',r.started_at) from current_rehearsal r),
    'eligibleCount',(select count(*) from eligible),
    'checkedInCount',(select count(*) from public.service_rehearsal_members m
      join current_rehearsal r on r.id=m.rehearsal_id
      join eligible e on e.id=m.user_id
      where m.checked_in_at is not null and not service_rehearsal_private.has_formal_check_in(m.user_id,clock_timestamp()))
  ) into v_state;
  return v_state;
end;
$$;
revoke all on function public.get_service_rehearsal_admin_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_service_rehearsal_admin_state(uuid,uuid) to service_role;

-- Use the same formal service windows as service-activation.ts and lead-check-in.ts.
-- Deliberately do not require a push-device binding or a scheduled assignment:
-- a formal report visible to the app must also suppress rehearsal access.
create function service_rehearsal_private.has_formal_check_in(p_user uuid,p_at timestamptz)
returns boolean language sql stable security invoker set search_path = pg_catalog
as $$
  with local_clock as (select p_at at time zone 'Asia/Taipei' as t),
  lead_scope as (
    select exists(select 1 from public.user_roles where user_id=p_user and role='coordinator')
      and not exists(select 1 from public.user_roles where user_id=p_user and role='admin')
      and (
        coalesce(bool_or(a.role_label='總招'),false)
        or not coalesce(bool_or(a.role_label='副總招'),false)
      ) as is_lead
    from public.service_assignments a
    join public.worship_services s on s.id=a.service_id
    cross join local_clock lc
    where a.user_id=p_user and a.status in ('scheduled','confirmed','completed')
      and s.service_date=lc.t::date and s.status in ('published','completed')
  )
  select exists(
    select 1 from public.service_check_ins ci
    join public.worship_services s on s.id=ci.service_id
    cross join local_clock lc cross join lead_scope ls
    where ci.user_id=p_user and ci.status in ('checked_in','station_confirmed')
      and s.status='published' and s.service_date=lc.t::date
      and (
        (extract(dow from lc.t)=6 and s.service_type='六晚崇' and lc.t::time>=time '17:00' and lc.t::time<time '21:45')
        or (extract(dow from lc.t)=0 and s.service_type='主一堂' and lc.t::time<case when ls.is_lead then time '10:45' else time '12:45' end)
        or (extract(dow from lc.t)=0 and s.service_type='主二堂' and lc.t::time>=case when ls.is_lead then time '08:00' else time '10:00' end and lc.t::time<time '12:45')
      )
  );
$$;
revoke all on function service_rehearsal_private.has_formal_check_in(uuid,timestamptz) from public,anon,authenticated;
grant execute on function service_rehearsal_private.has_formal_check_in(uuid,timestamptz) to service_role;

create function service_rehearsal_private.lock_participant(p_user uuid)
returns void language sql volatile security invoker set search_path = pg_catalog
as $$
  select pg_advisory_xact_lock(hashtextextended('service-rehearsal:'||p_user::text,0));
$$;
revoke all on function service_rehearsal_private.lock_participant(uuid) from public,anon,authenticated;
grant execute on function service_rehearsal_private.lock_participant(uuid) to service_role;

create function service_rehearsal_private.assert_participant(p_actor uuid,p_session uuid)
returns void language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  if not service_rehearsal_private.is_eligible_user(p_actor)
    or not background_reminder_private.session_is_live(p_actor,p_session,clock_timestamp()) then
    raise exception using errcode='42501',message='Rehearsal participant required';
  end if;
end;
$$;
revoke all on function service_rehearsal_private.assert_participant(uuid,uuid) from public,anon,authenticated;
grant execute on function service_rehearsal_private.assert_participant(uuid,uuid) to service_role;

-- Check after acquiring the shared participant lock, then lock the active
-- rehearsal row against manual end. Never lock a formal check-in row here.
create function service_rehearsal_private.assert_open_for_write(
  p_actor uuid,p_session uuid,p_rehearsal uuid,p_require_checkin boolean
)
returns void language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  perform service_rehearsal_private.lock_participant(p_actor);
  perform 1 from public.service_rehearsals r
    where r.id=p_rehearsal and r.ended_at is null and r.started_at<=clock_timestamp() for share;
  if not found then
    raise exception using errcode='22023',message='Rehearsal closed';
  end if;
  perform service_rehearsal_private.assert_participant(p_actor,p_session);
  if service_rehearsal_private.has_formal_check_in(p_actor,clock_timestamp()) then
    raise exception using errcode='55000',message='Formal check-in takes precedence';
  end if;
  if p_require_checkin and not exists(
    select 1 from public.service_rehearsal_members m where m.rehearsal_id=p_rehearsal
      and m.user_id=p_actor and m.checked_in_at is not null
  ) then
    raise exception using errcode='55000',message='Rehearsal check-in required';
  end if;
end;
$$;
revoke all on function service_rehearsal_private.assert_open_for_write(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function service_rehearsal_private.assert_open_for_write(uuid,uuid,uuid,boolean) to service_role;

-- Server-only RPC: the network boolean is derived from isChurchNetworkRequest,
-- never from the JSON body. Repeated check-in preserves the first timestamp.
create function public.check_in_service_rehearsal(p_actor uuid,p_session uuid,p_rehearsal uuid,p_on_church_network boolean)
returns timestamptz language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_checked timestamptz;
begin
  if p_on_church_network is distinct from true then
    raise exception using errcode='42501',message='Church network required';
  end if;
  perform service_rehearsal_private.assert_open_for_write(p_actor,p_session,p_rehearsal,false);
  insert into public.service_rehearsal_members as m(rehearsal_id,user_id,checked_in_at)
    values(p_rehearsal,p_actor,clock_timestamp())
    on conflict(rehearsal_id,user_id) do update
      set checked_in_at=coalesce(m.checked_in_at,excluded.checked_in_at)
    returning checked_in_at into v_checked;
  return v_checked;
end;
$$;
revoke all on function public.check_in_service_rehearsal(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.check_in_service_rehearsal(uuid,uuid,uuid,boolean) to service_role;

create function public.set_service_rehearsal_item(p_actor uuid,p_session uuid,p_rehearsal uuid,p_item uuid,p_completed boolean)
returns boolean language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  perform service_rehearsal_private.assert_open_for_write(p_actor,p_session,p_rehearsal,true);
  if p_completed is null or not exists(select 1 from public.service_rehearsal_items i where i.rehearsal_id=p_rehearsal and i.id=p_item) then
    raise exception using errcode='22023',message='Invalid rehearsal item';
  end if;
  insert into public.service_rehearsal_item_states as s(rehearsal_id,user_id,item_id,is_completed,completed_at)
    values(p_rehearsal,p_actor,p_item,p_completed,case when p_completed then clock_timestamp() end)
    on conflict(rehearsal_id,user_id,item_id) do update
      set is_completed=excluded.is_completed,completed_at=excluded.completed_at
    where s.is_completed is distinct from excluded.is_completed;
  return p_completed;
end;
$$;
revoke all on function public.set_service_rehearsal_item(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_service_rehearsal_item(uuid,uuid,uuid,uuid,boolean) to service_role;

-- All clients receive only their own rehearsal state. The snapshot is exposed
-- only after successful check-in; never expose formal node IDs or other users.
create function public.get_service_rehearsal_participant_state(p_actor uuid,p_session uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog
as $$
declare v_state jsonb; v_formal boolean;
begin
  perform service_rehearsal_private.assert_participant(p_actor,p_session);
  v_formal := service_rehearsal_private.has_formal_check_in(p_actor,clock_timestamp());
  if v_formal then
    return jsonb_build_object('rehearsal',null,'checkedInAt',null,'formalCheckIn',true,'nodes','[]'::jsonb);
  end if;
  with active_rehearsal as (
    select r.id,r.service_type,r.started_at,m.checked_in_at
    from public.service_rehearsals r
    left join public.service_rehearsal_members m on m.rehearsal_id=r.id and m.user_id=p_actor
    where r.ended_at is null and r.started_at<=clock_timestamp()
  )
  select jsonb_build_object(
    'rehearsal',(select jsonb_build_object('id',r.id,'serviceType',r.service_type,'startedAt',r.started_at) from active_rehearsal r),
    'checkedInAt',(select r.checked_in_at from active_rehearsal r),
    'formalCheckIn',false,
    'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'dueAt',n.due_at,'sortOrder',n.sort_order,'content',n.content,
      'checklist',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'text',i.text,'details',i.details,
        'sortOrder',i.sort_order,'isCompleted',coalesce(s.is_completed,false),'completedAt',s.completed_at) order by i.sort_order,i.id)
        from public.service_rehearsal_items i
        left join public.service_rehearsal_item_states s on s.rehearsal_id=i.rehearsal_id and s.item_id=i.id and s.user_id=p_actor
        where i.rehearsal_id=n.rehearsal_id and i.node_id=n.id),'[]'::jsonb))
      order by n.due_at,n.sort_order,n.id)
      from public.service_rehearsal_nodes n join active_rehearsal r on r.id=n.rehearsal_id and r.checked_in_at is not null),'[]'::jsonb)
  ) into v_state;
  return v_state;
end;
$$;
revoke all on function public.get_service_rehearsal_participant_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_service_rehearsal_participant_state(uuid,uuid) to service_role;

-- Formal reporting always wins, including staff-assisted writes and a
-- reopened/corrected report. This narrow non-exposed trigger is SECURITY
-- DEFINER because existing authorized staff writes need not have rehearsal
-- table grants. It derives the user/service from the already-authorized NEW
-- row, never a caller argument. It writes ONLY rehearsal rows.
-- A new current-day formal report clears the rehearsal binding even if
-- entered by staff just outside the normal formal service window.
create function service_rehearsal_private.release_on_formal_report()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if new.status not in ('checked_in','station_confirmed') then return new; end if;
  if not exists(select 1 from public.worship_services s where s.id=new.service_id
    and s.status='published' and s.service_type in ('六晚崇','主一堂','主二堂')
    and s.service_date=(clock_timestamp() at time zone 'Asia/Taipei')::date) then return new; end if;
  perform service_rehearsal_private.lock_participant(new.user_id);
  update public.service_rehearsal_members m set checked_in_at=null
    where m.user_id=new.user_id and m.checked_in_at is not null
    and exists(select 1 from public.service_rehearsals r where r.id=m.rehearsal_id and r.ended_at is null);
  return new;
end;
$$;
revoke all on function service_rehearsal_private.release_on_formal_report() from public,anon,authenticated,service_role;
create trigger service_rehearsal_release_on_formal_report
after insert or update of status,service_id,user_id,checked_in_at on public.service_check_ins
for each row execute function service_rehearsal_private.release_on_formal_report();


-- Rehearsal push bindings use the existing signed dispatcher and Apple
-- subscription. Session lifetime is controlled only by the administrator.
create table service_rehearsal_private.devices (
 id uuid primary key default gen_random_uuid(),
 rehearsal_id uuid not null,
 user_id uuid not null,
 session_id uuid not null,
 checked_in_at timestamptz not null,
 endpoint text not null unique check(length(endpoint)<=2048 and endpoint ~ '^https://web[.]push[.]apple[.]com/[A-Za-z0-9_-]+$'),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
 auth_secret text not null check(auth_secret ~ '^[A-Za-z0-9_-]{22}$'),
 enabled boolean not null,
 opted_in_at timestamptz not null,
 updated_at timestamptz not null,
 foreign key(rehearsal_id,user_id) references public.service_rehearsal_members(rehearsal_id,user_id) on delete cascade
);
create index service_rehearsal_devices_active on service_rehearsal_private.devices(rehearsal_id,user_id) where enabled;
create table service_rehearsal_private.deliveries (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references service_rehearsal_private.devices(id) on delete cascade,
 rehearsal_id uuid not null references public.service_rehearsals(id) on delete cascade,
 scheduled_at timestamptz not null,
 state text not null default 'claimed' check(state in ('claimed','sending','accepted','rejected','uncertain')),
 started_at timestamptz,
 finished_at timestamptz,
 provider_status integer check(provider_status between 100 and 599),
 unique(device_id,rehearsal_id,scheduled_at)
);
alter table service_rehearsal_private.devices enable row level security;
alter table service_rehearsal_private.deliveries enable row level security;
revoke all on service_rehearsal_private.devices,service_rehearsal_private.deliveries from public,anon,authenticated,service_role;
grant select,insert,update on service_rehearsal_private.devices,service_rehearsal_private.deliveries to service_role;

create function service_rehearsal_private.push_allowed(p_rehearsal uuid,p_user uuid,p_session uuid,p_report timestamptz,p_at timestamptz)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select p_at is not null and p_report is not null and p_report<=p_at
  and service_rehearsal_private.is_eligible_user(p_user)
  and background_reminder_private.session_is_live(p_user,p_session,p_at)
  and not service_rehearsal_private.has_formal_check_in(p_user,p_at)
  and exists(select 1 from public.service_rehearsals r join public.service_rehearsal_members m on m.rehearsal_id=r.id
    where r.id=p_rehearsal and r.ended_at is null and r.started_at<=p_report
      and m.user_id=p_user and m.checked_in_at=p_report);
$$;

create function service_rehearsal_private.release_push_on_report_clear()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if old.checked_in_at is distinct from new.checked_in_at then
   update service_rehearsal_private.devices set enabled=false,updated_at=clock_timestamp()
     where rehearsal_id=new.rehearsal_id and user_id=new.user_id and enabled;
 end if;
 return new;
end;
$$;
create trigger service_rehearsal_release_push after update of checked_in_at on public.service_rehearsal_members
for each row execute function service_rehearsal_private.release_push_on_report_clear();

create function public.register_rehearsal_reminder_device(
 p_user_id uuid,p_session_id uuid,p_rehearsal_id uuid,p_endpoint text,p_p256dh text,p_auth_secret text
) returns table(device_id uuid)
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare v_now timestamptz; v_report timestamptz;
begin
 if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint !~ '^https://web[.]push[.]apple[.]com/[A-Za-z0-9_-]+$'
  or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$'
  or p_auth_secret is null or p_auth_secret !~ '^[A-Za-z0-9_-]{22}$' then return; end if;
 perform service_rehearsal_private.assert_open_for_write(p_user_id,p_session_id,p_rehearsal_id,true);
 v_now := clock_timestamp();
 select m.checked_in_at into v_report from public.service_rehearsal_members m
    where m.rehearsal_id=p_rehearsal_id and m.user_id=p_user_id;
 if not service_rehearsal_private.push_allowed(p_rehearsal_id,p_user_id,p_session_id,v_report,v_now) then return; end if;
 if exists(select 1 from public.background_reminder_devices d where d.endpoint=p_endpoint
       and (d.user_id<>p_user_id or d.p256dh<>p_p256dh or d.auth_secret<>p_auth_secret))
    or exists(select 1 from background_reminder_private.admin_test_devices d where d.endpoint=p_endpoint
       and (d.user_id<>p_user_id or d.p256dh<>p_p256dh or d.auth_secret<>p_auth_secret)) then return; end if;
 return query insert into service_rehearsal_private.devices as d
    (rehearsal_id,user_id,session_id,checked_in_at,endpoint,p256dh,auth_secret,enabled,opted_in_at,updated_at)
 values(p_rehearsal_id,p_user_id,p_session_id,v_report,p_endpoint,p_p256dh,p_auth_secret,true,v_now,v_now)
 on conflict(endpoint) do update set rehearsal_id=excluded.rehearsal_id,session_id=excluded.session_id,
   checked_in_at=excluded.checked_in_at,enabled=true,
   opted_in_at=case when d.enabled and d.rehearsal_id=excluded.rehearsal_id and d.session_id=excluded.session_id
      and d.checked_in_at=excluded.checked_in_at then d.opted_in_at else excluded.opted_in_at end,
   updated_at=excluded.updated_at
 where d.user_id=excluded.user_id and d.p256dh=excluded.p256dh and d.auth_secret=excluded.auth_secret
   and d.updated_at<=excluded.updated_at
 returning d.id;
end;
$$;

create function public.disable_rehearsal_reminder_device(p_user_id uuid,p_endpoint text)
returns boolean language plpgsql volatile security invoker set search_path=pg_catalog as $
begin
 perform service_rehearsal_private.lock_participant(p_user_id);
 update service_rehearsal_private.devices set enabled=false,updated_at=clock_timestamp()
   where user_id=p_user_id and endpoint=p_endpoint and enabled;
 return found;
end;
$;

create function service_rehearsal_private.push_candidates(p_at timestamptz)
returns table(device_id uuid,rehearsal_id uuid,service_type text,scheduled_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
 select distinct d.id,d.rehearsal_id,r.service_type,n.due_at
 from service_rehearsal_private.devices d
 join public.service_rehearsals r on r.id=d.rehearsal_id and r.ended_at is null
 join public.service_rehearsal_nodes n on n.rehearsal_id=r.id
 where d.enabled and n.due_at>=d.opted_in_at and n.due_at>=d.checked_in_at
   and n.due_at between p_at-interval '20 seconds' and p_at
   and service_rehearsal_private.push_allowed(r.id,d.user_id,d.session_id,d.checked_in_at,p_at)
   and not exists(select 1 from public.background_reminder_devices f where f.endpoint=d.endpoint
        and (f.user_id<>d.user_id or f.p256dh<>d.p256dh or f.auth_secret<>d.auth_secret))
   and not exists(select 1 from background_reminder_private.admin_test_devices f where f.endpoint=d.endpoint
        and (f.user_id<>d.user_id or f.p256dh<>d.p256dh or f.auth_secret<>d.auth_secret));
$$;
create function public.claim_rehearsal_reminders(p_at timestamptz default clock_timestamp(),p_limit integer default 50)
returns table(delivery_id uuid)
language sql volatile security invoker set search_path=pg_catalog as $$
 with due as materialized (
   select c.* from service_rehearsal_private.push_candidates(p_at) c
   where not exists(select 1 from service_rehearsal_private.deliveries l
     where l.device_id=c.device_id and l.rehearsal_id=c.rehearsal_id and l.scheduled_at=c.scheduled_at and l.state<>'claimed')
   order by c.scheduled_at,c.device_id limit greatest(1,least(coalesce(p_limit,50),50))
 ), inserted as (
   insert into service_rehearsal_private.deliveries(device_id,rehearsal_id,scheduled_at)
   select c.device_id,c.rehearsal_id,c.scheduled_at from due c
   on conflict(device_id,rehearsal_id,scheduled_at) do nothing returning id
 )
 select i.id from inserted i union all
 select l.id from service_rehearsal_private.deliveries l join due c
   on l.device_id=c.device_id and l.rehearsal_id=c.rehearsal_id and l.scheduled_at=c.scheduled_at
 where l.state='claimed';
$$;
-- Serialize take against formal report, registration/revocation and end.
-- Use the same lock order as participant writes: user, rehearsal, device.
-- Never hold a lock while sending HTTP. A network send may be in flight
-- after take commits, and cannot be recalled.
create function public.take_rehearsal_reminder(p_delivery_id uuid,p_at timestamptz default clock_timestamp())
returns table(delivery_id uuid,endpoint text,p256dh text,auth_secret text,service_date date,service_type text,task_time text,scheduled_at timestamptz)
language plpgsql volatile security invoker set search_path=pg_catalog as $
declare v_user uuid; v_rehearsal uuid; v_device uuid;
begin
 select d.user_id,l.rehearsal_id,d.id into v_user,v_rehearsal,v_device
 from service_rehearsal_private.deliveries l join service_rehearsal_private.devices d on d.id=l.device_id
 where l.id=p_delivery_id and l.state='claimed' and d.rehearsal_id=l.rehearsal_id;
 if not found then return; end if;
 perform service_rehearsal_private.lock_participant(v_user);
 perform 1 from public.service_rehearsals r where r.id=v_rehearsal and r.ended_at is null for share;
 if not found then return; end if;
 perform 1 from service_rehearsal_private.devices d
 where d.id=v_device and d.user_id=v_user and d.rehearsal_id=v_rehearsal and d.enabled for update;
 if not found then return; end if;
 -- Fresh statement snapshot after all locks, with full authorization check.
 return query
 with valid as materialized (
   select c.* from service_rehearsal_private.push_candidates(p_at) c
   join service_rehearsal_private.deliveries l on l.device_id=c.device_id and l.rehearsal_id=c.rehearsal_id and l.scheduled_at=c.scheduled_at
   where l.id=p_delivery_id and l.state='claimed'
 ), taken as (
   update service_rehearsal_private.deliveries l set state='sending',started_at=p_at
   from valid c where l.id=p_delivery_id and l.state='claimed'
    and l.device_id=c.device_id and l.rehearsal_id=c.rehearsal_id and l.scheduled_at=c.scheduled_at
   returning l.id,l.device_id,l.rehearsal_id,l.scheduled_at
 )
 select t.id,d.endpoint,d.p256dh,d.auth_secret,(t.scheduled_at at time zone 'Asia/Taipei')::date,c.service_type,
   to_char(t.scheduled_at at time zone 'Asia/Taipei','HH24:MI'),t.scheduled_at
 from taken t join valid c on c.device_id=t.device_id and c.rehearsal_id=t.rehearsal_id and c.scheduled_at=t.scheduled_at
 join service_rehearsal_private.devices d on d.id=t.device_id;
end;
$$;
create function public.finish_rehearsal_reminder(p_delivery_id uuid,p_state text,p_provider_status integer default null,p_at timestamptz default clock_timestamp())
returns boolean language sql volatile security invoker set search_path=pg_catalog as $$
 with finished as (
   update service_rehearsal_private.deliveries l set state=p_state,provider_status=p_provider_status,finished_at=p_at
   where l.id=p_delivery_id and l.state='sending' and p_at>=l.started_at and
      ((p_state='accepted' and p_provider_status between 200 and 299)
      or (p_state='rejected' and p_provider_status between 100 and 599 and p_provider_status not between 200 and 299)
      or (p_state='uncertain' and p_provider_status is null))
   returning l.device_id,l.rehearsal_id,l.started_at,l.provider_status
 ), expired as (
   update service_rehearsal_private.devices d set enabled=false,updated_at=p_at
   from finished f where f.provider_status in(404,410) and d.id=f.device_id
     and d.rehearsal_id=f.rehearsal_id and d.updated_at<=f.started_at returning d.id
 ) select exists(select 1 from finished);
$$;

revoke all on function service_rehearsal_private.push_allowed(uuid,uuid,uuid,timestamptz,timestamptz),
 service_rehearsal_private.push_candidates(timestamptz),service_rehearsal_private.release_push_on_report_clear()
 from public,anon,authenticated,service_role;
grant execute on function service_rehearsal_private.push_allowed(uuid,uuid,uuid,timestamptz,timestamptz),
 service_rehearsal_private.push_candidates(timestamptz) to service_role;
revoke all on function public.register_rehearsal_reminder_device(uuid,uuid,uuid,text,text,text),
 public.disable_rehearsal_reminder_device(uuid,text),public.claim_rehearsal_reminders(timestamptz,integer),
 public.take_rehearsal_reminder(uuid,timestamptz),public.finish_rehearsal_reminder(uuid,text,integer,timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.register_rehearsal_reminder_device(uuid,uuid,uuid,text,text,text),
 public.disable_rehearsal_reminder_device(uuid,text),public.claim_rehearsal_reminders(timestamptz,integer),
 public.take_rehearsal_reminder(uuid,timestamptz),public.finish_rehearsal_reminder(uuid,text,integer,timestamptz)
 to service_role;

-- Existing admin testing is suppressed only while a valid rehearsal binding
-- is active; formal reminder behavior is otherwise untouched.
create or replace function background_reminder_private.admin_test_allowed(p_user uuid,p_session uuid,p_at timestamptz)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select p_at is not null
  and exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
     where p.id=p_user and p.is_active and r.role='admin')
  and background_reminder_private.session_is_live(p_user,p_session,p_at)
  and not exists(select 1 from public.background_reminder_open_bindings(p_at,p_user,null))
  and not exists(select 1 from service_rehearsal_private.devices d
    where d.user_id=p_user and d.enabled
     and service_rehearsal_private.push_allowed(d.rehearsal_id,d.user_id,d.session_id,d.checked_in_at,p_at));
$$;
create or replace function background_reminder_private.should_dispatch(p_at timestamptz)
returns boolean
language sql stable security invoker
set search_path = pg_catalog
as $$
  select case
    when p_at is null then false
    when extract(second from p_at at time zone 'Asia/Taipei') > 20 then false
    when exists (
      select 1 from service_rehearsal_private.push_candidates(p_at) c
      where not exists(select 1 from service_rehearsal_private.deliveries l
        where l.device_id=c.device_id and l.rehearsal_id=c.rehearsal_id and l.scheduled_at=c.scheduled_at and l.state<>'claimed')
    ) then true
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
