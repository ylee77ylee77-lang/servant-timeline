-- Phase 1 communication center and system avatar foundation.
-- Additive only: existing worship-service data and authorization remain unchanged.

alter table public.profiles
  add column if not exists avatar_config jsonb not null default
    '{"style":"neutral","skinTone":"warm","hair":"short","hairColor":"dark","outfit":"shirt","background":"lavender","glasses":false}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_avatar_config_check;
alter table public.profiles
  add constraint profiles_avatar_config_check
  check (jsonb_typeof(avatar_config) = 'object');

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'file')),
  body text check (body is null or char_length(body) <= 4000),
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 1000),
  attachment_name text check (attachment_name is null or char_length(attachment_name) <= 255),
  attachment_mime text check (attachment_mime is null or char_length(attachment_mime) <= 150),
  attachment_size bigint check (attachment_size is null or attachment_size between 0 and 10485760),
  edited_at timestamptz,
  retracted_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (
    (message_type = 'text' and body is not null and char_length(trim(body)) >= 1 and attachment_path is null)
    or
    (message_type in ('image', 'file') and attachment_path is not null)
  )
);

create table if not exists public.communication_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete restrict,
  callee_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'declined', 'ended', 'missed')),
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (caller_id <> callee_id)
);

create table if not exists public.communication_call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.communication_calls(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer', 'answer', 'ice')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists communication_messages_sender_created_idx
  on public.communication_messages(sender_id, created_at desc);
create index if not exists communication_messages_recipient_created_idx
  on public.communication_messages(recipient_id, created_at desc);
create index if not exists communication_messages_unread_idx
  on public.communication_messages(recipient_id, created_at desc)
  where read_at is null and retracted_at is null;
create index if not exists communication_calls_caller_created_idx
  on public.communication_calls(caller_id, created_at desc);
create index if not exists communication_calls_callee_created_idx
  on public.communication_calls(callee_id, created_at desc);
create index if not exists communication_call_signals_call_idx
  on public.communication_call_signals(call_id, id);

alter table public.communication_messages enable row level security;
alter table public.communication_calls enable row level security;
alter table public.communication_call_signals enable row level security;

revoke all on table public.communication_messages from anon, authenticated;
revoke all on table public.communication_calls from anon, authenticated;
revoke all on table public.communication_call_signals from anon, authenticated;
grant select on table public.communication_messages to authenticated;
grant select on table public.communication_calls to authenticated;
grant select on table public.communication_call_signals to authenticated;
grant all on table public.communication_messages to service_role;
grant all on table public.communication_calls to service_role;
grant all on table public.communication_call_signals to service_role;
grant all on sequence public.communication_call_signals_id_seq to service_role;

drop policy if exists communication_messages_participant_select on public.communication_messages;
create policy communication_messages_participant_select
on public.communication_messages
for select
to authenticated
using (
  app_private.is_active_user()
  and ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id)
);

drop policy if exists communication_calls_participant_select on public.communication_calls;
create policy communication_calls_participant_select
on public.communication_calls
for select
to authenticated
using (
  app_private.is_active_user()
  and ((select auth.uid()) = caller_id or (select auth.uid()) = callee_id)
);

drop policy if exists communication_call_signals_participant_select on public.communication_call_signals;
create policy communication_call_signals_participant_select
on public.communication_call_signals
for select
to authenticated
using (
  app_private.is_active_user()
  and exists (
    select 1
    from public.communication_calls c
    where c.id = communication_call_signals.call_id
      and ((select auth.uid()) = c.caller_id or (select auth.uid()) = c.callee_id)
  )
);

drop trigger if exists communication_messages_set_updated_at on public.communication_messages;
create trigger communication_messages_set_updated_at
before update on public.communication_messages
for each row execute function app_private.set_updated_at();

drop trigger if exists communication_calls_set_updated_at on public.communication_calls;
create trigger communication_calls_set_updated_at
before update on public.communication_calls
for each row execute function app_private.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'communication_messages'
  ) then
    alter publication supabase_realtime add table public.communication_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'communication_calls'
  ) then
    alter publication supabase_realtime add table public.communication_calls;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'communication_call_signals'
  ) then
    alter publication supabase_realtime add table public.communication_call_signals;
  end if;
end
$$;
