-- Auth frontend cutover for the Shekinah welcome-service app.
--
-- IMPORTANT: deploy the Auth-required frontend and apply this migration as one
-- coordinated release. Once applied, anonymous clients can no longer read or
-- write the legacy timeline/checklist tables.

alter table public.profiles
  add column if not exists account_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_account_code_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_code_format_check
      check (
        account_code is null
        or account_code ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
      );
  end if;
end;
$$;

create unique index if not exists profiles_account_code_lower_uidx
  on public.profiles (lower(account_code))
  where account_code is not null;

-- Existing production rows are preserved in place. RLS changes only who can
-- access them after the authenticated frontend is live.
alter table public.timeline_nodes enable row level security;
alter table public.checklist_items enable row level security;

revoke all on table public.timeline_nodes, public.checklist_items from anon;
revoke all on table public.timeline_nodes, public.checklist_items from authenticated;

grant select, insert, update, delete on table
  public.timeline_nodes,
  public.checklist_items
to authenticated;

drop policy if exists timeline_nodes_select_active on public.timeline_nodes;
create policy timeline_nodes_select_active on public.timeline_nodes
for select to authenticated
using ((select app_private.is_active_user()));

drop policy if exists timeline_nodes_manage_staff on public.timeline_nodes;
create policy timeline_nodes_manage_staff on public.timeline_nodes
for all to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

drop policy if exists checklist_items_select_active on public.checklist_items;
create policy checklist_items_select_active on public.checklist_items
for select to authenticated
using ((select app_private.is_active_user()));

drop policy if exists checklist_items_manage_staff on public.checklist_items;
create policy checklist_items_manage_staff on public.checklist_items
for all to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

-- The privileged update stays outside the exposed public schema. The public
-- wrapper is SECURITY INVOKER and only authenticated callers receive EXECUTE.
create or replace function app_private.set_checklist_item_completion(
  p_item_id text,
  p_is_completed boolean
)
returns table(id text, is_completed boolean, completed_at varchar)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not app_private.is_active_user() then
    raise exception 'Active authentication required' using errcode = '42501';
  end if;

  return query
  update public.checklist_items as ci
  set
    is_completed = coalesce(p_is_completed, false),
    completed_at = case
      when coalesce(p_is_completed, false)
        then to_char(current_timestamp at time zone 'Asia/Taipei', 'HH24:MI')
      else null
    end
  where ci.id = p_item_id
  returning ci.id, ci.is_completed, ci.completed_at;

  if not found then
    raise exception 'Checklist item not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function app_private.set_checklist_item_completion(text, boolean)
from public, anon, authenticated;
grant execute on function app_private.set_checklist_item_completion(text, boolean)
to authenticated;

create or replace function public.set_checklist_item_completion(
  p_item_id text,
  p_is_completed boolean
)
returns table(id text, is_completed boolean, completed_at varchar)
language sql
security invoker
set search_path = pg_catalog
as $$
  select *
  from app_private.set_checklist_item_completion(p_item_id, p_is_completed);
$$;

revoke all on function public.set_checklist_item_completion(text, boolean)
from public, anon, authenticated;
grant execute on function public.set_checklist_item_completion(text, boolean)
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.checklist_items'::regclass
      and tgname = 'checklist_items_record_activity'
      and not tgisinternal
  ) then
    create trigger checklist_items_record_activity
    after insert or update or delete on public.checklist_items
    for each row execute function app_private.record_activity();
  end if;
end;
$$;
