-- Security baseline foundation for the Shekinah welcome-service app.
--
-- This migration is deliberately additive:
--   * existing timeline_nodes and checklist_items rows are not rewritten;
--   * their current access model is not cut over until the authenticated
--     frontend is ready;
--   * every new Data API table starts with RLS and explicit grants.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- Supabase stopped auto-exposing newly-created public objects in 2026. Keep
-- the secure behavior explicit for this existing project as well.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Capture the pre-migration production schema so a clean local database can
-- be rebuilt from version control. IF NOT EXISTS makes this a no-op for the
-- existing production tables and preserves every current row.
create table if not exists public.timeline_nodes (
  id text primary key,
  time varchar,
  title varchar,
  assignee varchar,
  location varchar,
  details text,
  service_type varchar default '主一堂',
  voice_reminder_enabled boolean not null default true,
  reminder_pre5_enabled boolean not null default true,
  reminder_now_enabled boolean not null default true
);

create table if not exists public.checklist_items (
  id text primary key,
  node_id text references public.timeline_nodes(id) on delete cascade,
  text varchar,
  is_completed boolean default false,
  completed_at varchar,
  details text,
  sort_order integer default 0
);

create table if not exists public.tts_usage_monthly (
  month text primary key,
  used_chars integer not null default 0,
  limit_chars integer not null default 4000000,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_voice_settings (
  id text primary key default 'global',
  voice_gender text not null default 'female'
    check (voice_gender = any (array['female'::text, 'male'::text])),
  speaking_rate numeric not null default 0.92,
  pitch numeric not null default 1.5,
  volume_gain_db numeric not null default 0,
  cache_version text not null default 'v1',
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.tts_usage_monthly_by_provider (
  month text not null,
  provider_key text not null
    check (provider_key = any (array['primary'::text, 'backup'::text])),
  used_chars integer not null default 0,
  limit_chars integer not null default 4000000,
  updated_at timestamptz not null default now(),
  primary key (month, provider_key)
);

create table if not exists public.tts_audio_cache (
  cache_key text primary key,
  text_hash text not null,
  cleaned_text text not null,
  voice_name text not null,
  voice_gender text not null,
  speaking_rate numeric not null,
  pitch numeric not null,
  volume_gain_db numeric not null,
  cache_version text not null,
  provider_key text,
  char_count integer not null default 0,
  audio_base64 text not null,
  audio_encoding text not null default 'MP3',
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  hit_count integer not null default 0
);

create index if not exists idx_tts_audio_cache_text_hash
  on public.tts_audio_cache (text_hash);
create index if not exists idx_tts_audio_cache_last_accessed_at
  on public.tts_audio_cache (last_accessed_at);

alter table public.tts_usage_monthly enable row level security;
alter table public.app_voice_settings enable row level security;
alter table public.tts_usage_monthly_by_provider enable row level security;
alter table public.tts_audio_cache enable row level security;

-- Legacy timeline access remains unchanged until the Auth-enabled frontend
-- and strict legacy RLS cutover can be released together.
grant all on table public.timeline_nodes, public.checklist_items
to anon, authenticated, service_role;

grant all on table
  public.tts_usage_monthly,
  public.app_voice_settings,
  public.tts_usage_monthly_by_provider,
  public.tts_audio_cache
to service_role;

create or replace function public.reserve_tts_chars(
  p_month text,
  p_chars integer,
  p_limit integer default 4000000
)
returns table(allowed boolean, used_chars integer, remaining_chars integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_limit integer;
begin
  if p_chars is null or p_chars <= 0 then
    return query select true, 0, p_limit;
    return;
  end if;

  insert into public.tts_usage_monthly(month, used_chars, limit_chars, updated_at)
  values (p_month, 0, p_limit, now())
  on conflict (month) do nothing;

  update public.tts_usage_monthly
  set
    used_chars = public.tts_usage_monthly.used_chars + p_chars,
    limit_chars = p_limit,
    updated_at = now()
  where
    public.tts_usage_monthly.month = p_month
    and public.tts_usage_monthly.used_chars + p_chars <= p_limit
  returning public.tts_usage_monthly.used_chars, public.tts_usage_monthly.limit_chars
  into v_used, v_limit;

  if found then
    return query select true, v_used, greatest(v_limit - v_used, 0);
    return;
  end if;

  select t.used_chars, t.limit_chars
  into v_used, v_limit
  from public.tts_usage_monthly t
  where t.month = p_month;

  return query
  select false,
    coalesce(v_used, 0),
    greatest(coalesce(v_limit, p_limit) - coalesce(v_used, 0), 0);
end;
$$;

create or replace function public.reserve_tts_chars_v2(
  p_month text,
  p_chars integer,
  p_primary_limit integer default 4000000,
  p_backup_limit integer default 4000000
)
returns table(
  allowed boolean,
  provider_key text,
  primary_used_chars integer,
  primary_remaining_chars integer,
  backup_used_chars integer,
  backup_remaining_chars integer,
  total_used_chars integer,
  total_remaining_chars integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_used integer := 0;
  v_backup_used integer := 0;
  v_provider text := '';
begin
  if p_chars is null or p_chars <= 0 then
    return query
    select
      false,
      ''::text,
      0,
      greatest(0, p_primary_limit),
      0,
      greatest(0, p_backup_limit),
      0,
      greatest(0, p_primary_limit + p_backup_limit);
    return;
  end if;

  insert into public.tts_usage_monthly_by_provider(
    month,
    provider_key,
    used_chars,
    limit_chars,
    updated_at
  )
  values
    (p_month, 'primary', 0, p_primary_limit, now()),
    (p_month, 'backup', 0, p_backup_limit, now())
  on conflict on constraint tts_usage_monthly_by_provider_pkey do update
    set limit_chars = excluded.limit_chars,
        updated_at = public.tts_usage_monthly_by_provider.updated_at;

  update public.tts_usage_monthly_by_provider as usage
  set used_chars = usage.used_chars + p_chars,
      limit_chars = p_primary_limit,
      updated_at = now()
  where usage.month = p_month
    and usage.provider_key = 'primary'
    and usage.used_chars + p_chars <= p_primary_limit
  returning usage.used_chars into v_primary_used;

  if found then
    v_provider := 'primary';

    select usage.used_chars into v_backup_used
    from public.tts_usage_monthly_by_provider as usage
    where usage.month = p_month and usage.provider_key = 'backup';

    return query
    select
      true,
      v_provider,
      v_primary_used,
      greatest(0, p_primary_limit - v_primary_used),
      coalesce(v_backup_used, 0),
      greatest(0, p_backup_limit - coalesce(v_backup_used, 0)),
      v_primary_used + coalesce(v_backup_used, 0),
      greatest(0, p_primary_limit + p_backup_limit - v_primary_used - coalesce(v_backup_used, 0));
    return;
  end if;

  update public.tts_usage_monthly_by_provider as usage
  set used_chars = usage.used_chars + p_chars,
      limit_chars = p_backup_limit,
      updated_at = now()
  where usage.month = p_month
    and usage.provider_key = 'backup'
    and usage.used_chars + p_chars <= p_backup_limit
  returning usage.used_chars into v_backup_used;

  if found then
    v_provider := 'backup';

    select usage.used_chars into v_primary_used
    from public.tts_usage_monthly_by_provider as usage
    where usage.month = p_month and usage.provider_key = 'primary';

    return query
    select
      true,
      v_provider,
      coalesce(v_primary_used, 0),
      greatest(0, p_primary_limit - coalesce(v_primary_used, 0)),
      v_backup_used,
      greatest(0, p_backup_limit - v_backup_used),
      coalesce(v_primary_used, 0) + v_backup_used,
      greatest(0, p_primary_limit + p_backup_limit - coalesce(v_primary_used, 0) - v_backup_used);
    return;
  end if;

  select usage.used_chars into v_primary_used
  from public.tts_usage_monthly_by_provider as usage
  where usage.month = p_month and usage.provider_key = 'primary';

  select usage.used_chars into v_backup_used
  from public.tts_usage_monthly_by_provider as usage
  where usage.month = p_month and usage.provider_key = 'backup';

  return query
  select
    false,
    ''::text,
    coalesce(v_primary_used, 0),
    greatest(0, p_primary_limit - coalesce(v_primary_used, 0)),
    coalesce(v_backup_used, 0),
    greatest(0, p_backup_limit - coalesce(v_backup_used, 0)),
    coalesce(v_primary_used, 0) + coalesce(v_backup_used, 0),
    greatest(
      0,
      p_primary_limit + p_backup_limit - coalesce(v_primary_used, 0) - coalesce(v_backup_used, 0)
    );
end;
$$;

grant execute on function public.reserve_tts_chars(text, integer, integer)
to public, anon, authenticated, service_role;
grant execute on function public.reserve_tts_chars_v2(text, integer, integer, integer)
to public, anon, authenticated, service_role;

create type public.app_role as enum ('volunteer', 'coordinator', 'admin');
create type public.service_status as enum ('draft', 'published', 'completed', 'cancelled');
create type public.assignment_status as enum ('scheduled', 'confirmed', 'declined', 'completed', 'cancelled');
create type public.check_in_status as enum ('checked_in', 'station_confirmed', 'cancelled');
create type public.review_status as enum ('draft', 'submitted', 'resolved');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  ministry_group text check (ministry_group is null or char_length(trim(ministry_group)) between 1 and 80),
  -- New accounts are inert until a reviewed server-side enrollment activates
  -- them. Public sign-up alone must not grant volunteer data access.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'volunteer',
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.worship_services (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_type text not null check (char_length(trim(service_type)) between 1 and 40),
  starts_at timestamptz not null,
  report_at timestamptz,
  location text check (location is null or char_length(trim(location)) <= 120),
  status public.service_status not null default 'draft',
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_date, service_type),
  check (report_at is null or report_at <= starts_at)
);

create table public.service_stations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  role_label text check (role_label is null or char_length(trim(role_label)) <= 80),
  qr_tag text check (qr_tag is null or char_length(trim(qr_tag)) <= 100),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, name),
  unique (id, service_id)
);

create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  service_type text not null check (char_length(trim(service_type)) between 1 and 40),
  role_label text not null check (char_length(trim(role_label)) between 1 and 80),
  station_name text check (station_name is null or char_length(trim(station_name)) <= 100),
  report_time time,
  ministry_group text check (ministry_group is null or char_length(trim(ministry_group)) <= 80),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  station_id uuid,
  role_label text not null check (char_length(trim(role_label)) between 1 and 80),
  report_at timestamptz,
  report_location text check (report_location is null or char_length(trim(report_location)) <= 120),
  ministry_group text check (ministry_group is null or char_length(trim(ministry_group)) <= 80),
  status public.assignment_status not null default 'scheduled',
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, user_id, role_label),
  unique (id, service_id, user_id),
  foreign key (station_id, service_id)
    references public.service_stations(id, service_id)
    on delete no action
);

-- Existing rows remain NULL and continue to represent the shared legacy
-- timeline. No production data is copied, renamed, or deleted.
alter table public.timeline_nodes
  add column if not exists service_id uuid
  references public.worship_services(id) on delete restrict;

create table public.service_check_ins (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  assignment_id uuid,
  status public.check_in_status not null default 'checked_in',
  checked_in_at timestamptz not null default now(),
  check_in_source text not null default 'web' check (check_in_source in ('web', 'staff_assisted', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, user_id),
  unique (id, service_id, user_id),
  foreign key (assignment_id, service_id, user_id)
    references public.service_assignments(id, service_id, user_id)
    on delete no action
);

create table public.check_in_station_confirmations (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null,
  service_id uuid not null,
  user_id uuid not null,
  station_id uuid not null,
  station_name_snapshot text not null check (char_length(trim(station_name_snapshot)) between 1 and 100),
  confirmed_at timestamptz not null default now(),
  confirmation_source text not null default 'qr' check (confirmation_source in ('qr', 'manual', 'staff_assisted')),
  created_at timestamptz not null default now(),
  unique (check_in_id, station_id),
  foreign key (check_in_id, service_id, user_id)
    references public.service_check_ins(id, service_id, user_id)
    on delete cascade,
  foreign key (station_id, service_id)
    references public.service_stations(id, service_id)
    on delete restrict
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  service_id uuid references public.worship_services(id) on delete set null,
  event_type text not null check (char_length(trim(event_type)) between 1 and 100),
  subject_type text not null check (char_length(trim(subject_type)) between 1 and 80),
  subject_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create table public.post_service_reviews (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.worship_services(id) on delete restrict,
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  status public.review_status not null default 'draft',
  summary text check (summary is null or char_length(summary) <= 4000),
  issues text check (issues is null or char_length(issues) <= 4000),
  handoff_notes text check (handoff_notes is null or char_length(handoff_notes) <= 4000),
  rating smallint check (rating is null or rating between 1 and 5),
  submitted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, author_user_id),
  check ((status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null)),
  check (status <> 'resolved' or resolved_at is not null)
);

create index profiles_active_idx on public.profiles (is_active) where is_active;
create index user_roles_role_idx on public.user_roles (role, user_id);
create index user_roles_granted_by_idx on public.user_roles (granted_by) where granted_by is not null;
create index worship_services_status_date_idx on public.worship_services (status, service_date, starts_at);
create index worship_services_created_by_idx on public.worship_services (created_by) where created_by is not null;
create index worship_services_updated_by_idx on public.worship_services (updated_by) where updated_by is not null;
create index service_stations_service_idx on public.service_stations (service_id, sort_order);
create index schedule_templates_lookup_idx on public.schedule_templates (is_active, day_of_week, service_type);
create index schedule_templates_created_by_idx on public.schedule_templates (created_by) where created_by is not null;
create index service_assignments_user_idx on public.service_assignments (user_id, service_id);
create index service_assignments_service_idx on public.service_assignments (service_id, status);
create index service_assignments_station_idx on public.service_assignments (station_id, service_id) where station_id is not null;
create index service_assignments_created_by_idx on public.service_assignments (created_by) where created_by is not null;
create index timeline_nodes_service_id_idx on public.timeline_nodes (service_id);
create index if not exists checklist_items_node_id_idx on public.checklist_items (node_id);
create index service_check_ins_user_idx on public.service_check_ins (user_id, service_id);
create index service_check_ins_assignment_idx on public.service_check_ins (assignment_id, service_id, user_id) where assignment_id is not null;
create index station_confirmations_user_idx on public.check_in_station_confirmations (user_id, service_id);
create index station_confirmations_check_in_idx on public.check_in_station_confirmations (check_in_id, service_id, user_id);
create index station_confirmations_station_idx on public.check_in_station_confirmations (station_id, service_id);
create index activity_logs_service_time_idx on public.activity_logs (service_id, occurred_at desc);
create index activity_logs_actor_time_idx on public.activity_logs (actor_user_id, occurred_at desc);
create index post_service_reviews_service_idx on public.post_service_reviews (service_id, status);
create index post_service_reviews_author_idx on public.post_service_reviews (author_user_id, service_id);

create function app_private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
  );
$$;

create function app_private.has_role(variadic required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid()
      and p.is_active
      and ur.role = any(required_roles)
  );
$$;

revoke all on function app_private.is_active_user() from public, anon, authenticated;
revoke all on function app_private.has_role(public.app_role[]) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_active_user() to authenticated;
grant execute on function app_private.has_role(public.app_role[]) to authenticated;

create function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function app_private.set_updated_at() from public, anon, authenticated;

create function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  new_display_name text;
begin
  new_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '同工'
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(new_display_name, 80))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'volunteer')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;
revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

create function app_private.record_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  row_data jsonb;
  resolved_actor_user_id uuid;
  resolved_service_id uuid;
  resolved_subject_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  resolved_subject_id := row_data ->> 'id';
  resolved_actor_user_id := auth.uid();

  -- Network-gated self check-ins are written with the server-only client, so
  -- there is no user JWT inside the database request. Preserve attribution
  -- from the server-validated row owner for these two operational tables.
  if resolved_actor_user_id is null
     and tg_table_name in ('service_check_ins', 'check_in_station_confirmations') then
    resolved_actor_user_id := nullif(row_data ->> 'user_id', '')::uuid;
  end if;

  if tg_table_name = 'worship_services' then
    resolved_service_id := nullif(resolved_subject_id, '')::uuid;
  else
    resolved_service_id := nullif(row_data ->> 'service_id', '')::uuid;
  end if;

  insert into public.activity_logs (
    actor_user_id,
    service_id,
    event_type,
    subject_type,
    subject_id,
    metadata
  ) values (
    resolved_actor_user_id,
    resolved_service_id,
    lower(tg_table_name || '.' || tg_op),
    tg_table_name,
    resolved_subject_id,
    jsonb_build_object('operation', tg_op)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function app_private.record_activity() from public, anon, authenticated;

create function app_private.prepare_check_in()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null
     and not app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role) then
    new.user_id := auth.uid();
    new.status := 'checked_in';
    new.checked_in_at := now();
    new.check_in_source := 'web';
    new.created_at := now();
    new.updated_at := now();
  end if;

  return new;
end;
$$;
revoke all on function app_private.prepare_check_in() from public, anon, authenticated;

create function app_private.prepare_station_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  resolved_station_name text;
begin
  if auth.uid() is not null
     and not app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role) then
    new.user_id := auth.uid();
    new.confirmed_at := now();
    new.created_at := now();
    if new.confirmation_source = 'staff_assisted' then
      raise exception 'Only staff may create a staff-assisted confirmation';
    end if;
  end if;

  select ss.name
  into resolved_station_name
  from public.service_stations ss
  where ss.id = new.station_id
    and ss.service_id = new.service_id
    and ss.is_active;

  if resolved_station_name is null then
    raise exception 'The station is not active for this worship service';
  end if;

  new.station_name_snapshot := resolved_station_name;
  return new;
end;
$$;
revoke all on function app_private.prepare_station_confirmation() from public, anon, authenticated;

create function app_private.mark_station_confirmed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.service_check_ins
  set status = 'station_confirmed'
  where id = new.check_in_id
    and service_id = new.service_id
    and user_id = new.user_id
    and status = 'checked_in';

  return new;
end;
$$;
revoke all on function app_private.mark_station_confirmed() from public, anon, authenticated;

create function app_private.prepare_post_service_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null
     and not app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role) then
    new.author_user_id := auth.uid();
    new.resolved_at := null;
    new.updated_at := now();

    if tg_op = 'INSERT' then
      new.created_at := now();
    end if;

    if new.status = 'resolved' then
      raise exception 'Only staff may resolve a post-service review';
    elsif new.status = 'submitted' then
      new.submitted_at := now();
    else
      new.submitted_at := null;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function app_private.prepare_post_service_review() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function app_private.set_updated_at();
create trigger worship_services_set_updated_at before update on public.worship_services
for each row execute function app_private.set_updated_at();
create trigger service_stations_set_updated_at before update on public.service_stations
for each row execute function app_private.set_updated_at();
create trigger schedule_templates_set_updated_at before update on public.schedule_templates
for each row execute function app_private.set_updated_at();
create trigger service_assignments_set_updated_at before update on public.service_assignments
for each row execute function app_private.set_updated_at();
create trigger service_check_ins_set_updated_at before update on public.service_check_ins
for each row execute function app_private.set_updated_at();
create trigger post_service_reviews_set_updated_at before update on public.post_service_reviews
for each row execute function app_private.set_updated_at();
create trigger service_check_ins_prepare before insert on public.service_check_ins
for each row execute function app_private.prepare_check_in();
create trigger station_confirmations_prepare before insert on public.check_in_station_confirmations
for each row execute function app_private.prepare_station_confirmation();
create trigger station_confirmations_mark_check_in after insert on public.check_in_station_confirmations
for each row execute function app_private.mark_station_confirmed();
create trigger post_service_reviews_prepare before insert or update on public.post_service_reviews
for each row execute function app_private.prepare_post_service_review();

create trigger worship_services_activity after insert or update or delete on public.worship_services
for each row execute function app_private.record_activity();
create trigger service_stations_activity after insert or update or delete on public.service_stations
for each row execute function app_private.record_activity();
create trigger service_assignments_activity after insert or update or delete on public.service_assignments
for each row execute function app_private.record_activity();
create trigger service_check_ins_activity after insert or update or delete on public.service_check_ins
for each row execute function app_private.record_activity();
create trigger station_confirmations_activity after insert or update or delete on public.check_in_station_confirmations
for each row execute function app_private.record_activity();
create trigger post_service_reviews_activity after insert or update or delete on public.post_service_reviews
for each row execute function app_private.record_activity();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.worship_services enable row level security;
alter table public.service_stations enable row level security;
alter table public.schedule_templates enable row level security;
alter table public.service_assignments enable row level security;
alter table public.service_check_ins enable row level security;
alter table public.check_in_station_confirmations enable row level security;
alter table public.activity_logs enable row level security;
alter table public.post_service_reviews enable row level security;

-- No anon access is granted to the new foundation tables.
revoke all on table
  public.profiles,
  public.user_roles,
  public.worship_services,
  public.service_stations,
  public.schedule_templates,
  public.service_assignments,
  public.service_check_ins,
  public.check_in_station_confirmations,
  public.activity_logs,
  public.post_service_reviews
from anon, authenticated, service_role;

grant all on table
  public.profiles,
  public.user_roles,
  public.worship_services,
  public.service_stations,
  public.schedule_templates,
  public.service_assignments,
  public.service_check_ins,
  public.check_in_station_confirmations,
  public.activity_logs,
  public.post_service_reviews
to service_role;
grant usage, select on sequence public.activity_logs_id_seq to service_role;

grant select on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.worship_services to authenticated;
grant select, insert, update, delete on public.service_stations to authenticated;
grant select, insert, update, delete on public.schedule_templates to authenticated;
grant select, insert, update, delete on public.service_assignments to authenticated;
grant select, update, delete on public.service_check_ins to authenticated;
grant select, update, delete on public.check_in_station_confirmations to authenticated;
grant select on public.activity_logs to authenticated;
grant select, insert, update, delete on public.post_service_reviews to authenticated;

create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

create policy user_roles_select on public.user_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select app_private.has_role('admin'::public.app_role))
);

create policy worship_services_select on public.worship_services
for select to authenticated
using (
  ((select app_private.is_active_user()) and status in ('published', 'completed'))
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

create policy worship_services_manage on public.worship_services
for all to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

create policy service_stations_select on public.service_stations
for select to authenticated
using (
  exists (
    select 1 from public.worship_services ws
    where ws.id = service_stations.service_id
  )
);

create policy service_stations_manage on public.service_stations
for all to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

create policy schedule_templates_manage on public.schedule_templates
for all to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

create policy service_assignments_select on public.service_assignments
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

create policy service_assignments_manage on public.service_assignments
for all to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

create policy service_check_ins_select on public.service_check_ins
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

create policy service_check_ins_manage on public.service_check_ins
for update to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

create policy service_check_ins_delete_admin on public.service_check_ins
for delete to authenticated
using ((select app_private.has_role('admin'::public.app_role)));

create policy station_confirmations_select on public.check_in_station_confirmations
for select to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

create policy station_confirmations_manage on public.check_in_station_confirmations
for update to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));

create policy station_confirmations_delete_admin on public.check_in_station_confirmations
for delete to authenticated
using ((select app_private.has_role('admin'::public.app_role)));

create policy activity_logs_select on public.activity_logs
for select to authenticated
using (
  (
    actor_user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

create policy post_service_reviews_select on public.post_service_reviews
for select to authenticated
using (
  (
    author_user_id = (select auth.uid())
    and (select app_private.is_active_user())
  )
  or (select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role))
);

create policy post_service_reviews_insert_own on public.post_service_reviews
for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and (select app_private.is_active_user())
  and status in ('draft', 'submitted')
);

create policy post_service_reviews_update_own_draft on public.post_service_reviews
for update to authenticated
using (
  author_user_id = (select auth.uid())
  and status = 'draft'
  and (select app_private.is_active_user())
)
with check (
  author_user_id = (select auth.uid())
  and status in ('draft', 'submitted')
  and (select app_private.is_active_user())
);

create policy post_service_reviews_manage on public.post_service_reviews
for all to authenticated
using ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)))
with check ((select app_private.has_role('coordinator'::public.app_role, 'admin'::public.app_role)));
