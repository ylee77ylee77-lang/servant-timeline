-- Rehearsal management foundation. No formal service tables are written.
-- New tables and RPCs are server-only. No participant or push routes yet.
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
grant select on public.service_rehearsal_item_states to service_role;
-- Item state writes will be granted only with the scoped participant RPC.

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
  -- Check-in rows are created only by the future network-gated participant RPC.

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
      where m.checked_in_at is not null)
  ) into v_state;
  return v_state;
end;
$$;
revoke all on function public.get_service_rehearsal_admin_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_service_rehearsal_admin_state(uuid,uuid) to service_role;
