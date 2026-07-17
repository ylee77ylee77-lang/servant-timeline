-- Assignment-scoped authorization foundation.
--
-- This migration is additive. Existing timeline_nodes and checklist_items are
-- retained as reusable task definitions; no production row is rewritten or
-- deleted here.

alter table public.service_assignments
  add constraint service_assignments_id_service_key unique (id, service_id);

create table public.service_coordinators (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (service_id, user_id)
);

create table public.service_task_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete cascade,
  assignment_id uuid not null,
  timeline_node_id text not null references public.timeline_nodes(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_id, assignment_id, timeline_node_id),
  foreign key (assignment_id, service_id)
    references public.service_assignments(id, service_id)
    on delete cascade
);

create table public.assignment_checklist_states (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete cascade,
  assignment_id uuid not null,
  checklist_item_id text not null references public.checklist_items(id) on delete cascade,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_checklist_states_scope_key
    unique (service_id, assignment_id, checklist_item_id),
  foreign key (assignment_id, service_id)
    references public.service_assignments(id, service_id)
    on delete cascade,
  check (
    (is_completed and completed_at is not null)
    or (not is_completed and completed_at is null)
  )
);

create index service_coordinators_user_idx
  on public.service_coordinators (user_id, service_id);
create index service_coordinators_granted_by_idx
  on public.service_coordinators (granted_by)
  where granted_by is not null;
create index service_task_assignments_node_idx
  on public.service_task_assignments (timeline_node_id, service_id);
create index service_task_assignments_assignment_idx
  on public.service_task_assignments (assignment_id, service_id);
create index service_task_assignments_created_by_idx
  on public.service_task_assignments (created_by)
  where created_by is not null;
create index assignment_checklist_states_assignment_idx
  on public.assignment_checklist_states (assignment_id, service_id);
create index assignment_checklist_states_item_idx
  on public.assignment_checklist_states (checklist_item_id, service_id);
create index assignment_checklist_states_completed_by_idx
  on public.assignment_checklist_states (completed_by)
  where completed_by is not null;

create function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select app_private.has_role('admin'::public.app_role);
$$;

create function app_private.can_coordinate_service(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    app_private.is_admin()
    or (
      p_service_id is not null
      and app_private.has_role('coordinator'::public.app_role)
      and exists (
        select 1
        from public.service_coordinators sc
        where sc.service_id = p_service_id
          and sc.user_id = auth.uid()
      )
    );
$$;

create function app_private.has_service_assignment(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    app_private.is_active_user()
    and p_service_id is not null
    and exists (
      select 1
      from public.service_assignments sa
      where sa.service_id = p_service_id
        and sa.user_id = auth.uid()
        and sa.status in (
          'scheduled'::public.assignment_status,
          'confirmed'::public.assignment_status,
          'completed'::public.assignment_status
        )
    );
$$;

create function app_private.owns_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    app_private.is_active_user()
    and p_assignment_id is not null
    and exists (
      select 1
      from public.service_assignments sa
      where sa.id = p_assignment_id
        and sa.user_id = auth.uid()
        and sa.status in (
          'scheduled'::public.assignment_status,
          'confirmed'::public.assignment_status,
          'completed'::public.assignment_status
        )
    );
$$;

create function app_private.can_access_service(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    app_private.can_coordinate_service(p_service_id)
    or app_private.has_service_assignment(p_service_id);
$$;

revoke all on function app_private.is_admin()
from public, anon, authenticated;
revoke all on function app_private.can_coordinate_service(uuid)
from public, anon, authenticated;
revoke all on function app_private.has_service_assignment(uuid)
from public, anon, authenticated;
revoke all on function app_private.owns_assignment(uuid)
from public, anon, authenticated;
revoke all on function app_private.can_access_service(uuid)
from public, anon, authenticated;

grant execute on function app_private.is_admin() to authenticated;
grant execute on function app_private.can_coordinate_service(uuid) to authenticated;
grant execute on function app_private.has_service_assignment(uuid) to authenticated;
grant execute on function app_private.owns_assignment(uuid) to authenticated;
grant execute on function app_private.can_access_service(uuid) to authenticated;

create function app_private.validate_service_coordinator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null and not app_private.is_admin() then
    raise exception 'Only an administrator may grant service coordination access'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = new.user_id
      and p.is_active
      and ur.role = 'coordinator'::public.app_role
  ) then
    raise exception 'The target user is not an active coordinator'
      using errcode = '23514';
  end if;

  if auth.uid() is not null then
    new.granted_by := auth.uid();
  end if;
  new.granted_at := now();
  return new;
end;
$$;

create function app_private.validate_service_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  node_service_id uuid;
  node_service_type text;
  target_service_type text;
begin
  if auth.uid() is not null
     and not app_private.can_coordinate_service(new.service_id) then
    raise exception 'Service coordination access is required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.service_assignments sa
    where sa.id = new.assignment_id
      and sa.service_id = new.service_id
      and sa.status in (
        'scheduled'::public.assignment_status,
        'confirmed'::public.assignment_status,
        'completed'::public.assignment_status
      )
  ) then
    raise exception 'The assignment is not active for this service'
      using errcode = '23514';
  end if;

  select tn.service_id, tn.service_type, ws.service_type
  into node_service_id, node_service_type, target_service_type
  from public.timeline_nodes tn
  join public.worship_services ws on ws.id = new.service_id
  where tn.id = new.timeline_node_id;

  if not found
     or (node_service_id is not null and node_service_id <> new.service_id)
     or (node_service_id is null and node_service_type is distinct from target_service_type) then
    raise exception 'The task definition does not belong to this service'
      using errcode = '23514';
  end if;

  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  new.created_at := now();
  return new;
end;
$$;

create function app_private.prepare_assignment_checklist_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.service_task_assignments sta
    join public.checklist_items ci
      on ci.node_id = sta.timeline_node_id
    where sta.service_id = new.service_id
      and sta.assignment_id = new.assignment_id
      and ci.id = new.checklist_item_id
  ) then
    raise exception 'The checklist item is not assigned to this service assignment'
      using errcode = '23514';
  end if;

  if auth.uid() is not null
     and not app_private.can_coordinate_service(new.service_id)
     and not app_private.owns_assignment(new.assignment_id) then
    raise exception 'Checklist state access is denied'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;

  if new.is_completed then
    new.completed_at := coalesce(new.completed_at, now());
    if auth.uid() is not null then
      new.completed_by := auth.uid();
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_service_coordinator()
from public, anon, authenticated;
revoke all on function app_private.validate_service_task_assignment()
from public, anon, authenticated;
revoke all on function app_private.prepare_assignment_checklist_state()
from public, anon, authenticated;

create trigger service_coordinators_validate
before insert or update on public.service_coordinators
for each row execute function app_private.validate_service_coordinator();

create trigger service_task_assignments_validate
before insert or update on public.service_task_assignments
for each row execute function app_private.validate_service_task_assignment();

create trigger assignment_checklist_states_prepare
before insert or update on public.assignment_checklist_states
for each row execute function app_private.prepare_assignment_checklist_state();

create trigger service_coordinators_activity
after insert or update or delete on public.service_coordinators
for each row execute function app_private.record_activity();
create trigger service_task_assignments_activity
after insert or update or delete on public.service_task_assignments
for each row execute function app_private.record_activity();
create trigger assignment_checklist_states_activity
after insert or update or delete on public.assignment_checklist_states
for each row execute function app_private.record_activity();

alter table public.service_coordinators enable row level security;
alter table public.service_task_assignments enable row level security;
alter table public.assignment_checklist_states enable row level security;

revoke all on table
  public.service_coordinators,
  public.service_task_assignments,
  public.assignment_checklist_states
from anon, authenticated, service_role;

grant all on table
  public.service_coordinators,
  public.service_task_assignments,
  public.assignment_checklist_states
to service_role;

grant select, insert, update, delete on public.service_coordinators
to authenticated;
grant select, insert, update, delete on public.service_task_assignments
to authenticated;
grant select on public.assignment_checklist_states
to authenticated;

create policy service_coordinators_select
on public.service_coordinators
for select to authenticated
using (
  (select app_private.can_coordinate_service(service_id))
);

create policy service_coordinators_manage_admin
on public.service_coordinators
for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

create policy service_task_assignments_select
on public.service_task_assignments
for select to authenticated
using (
  (select app_private.can_coordinate_service(service_id))
  or (select app_private.owns_assignment(assignment_id))
);

create policy service_task_assignments_manage
on public.service_task_assignments
for all to authenticated
using ((select app_private.can_coordinate_service(service_id)))
with check ((select app_private.can_coordinate_service(service_id)));

create policy assignment_checklist_states_select
on public.assignment_checklist_states
for select to authenticated
using (
  (select app_private.can_coordinate_service(service_id))
  or (select app_private.owns_assignment(assignment_id))
);
