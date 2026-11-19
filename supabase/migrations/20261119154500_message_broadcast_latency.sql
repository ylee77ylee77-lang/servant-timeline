-- Route new communication-message notifications through private Realtime Broadcast.
-- Message persistence and server-side write authorization remain unchanged.

alter table realtime.messages enable row level security;

drop policy if exists communication_receive_own_broadcast
  on realtime.messages;
create policy communication_receive_own_broadcast
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) =
    ('communication:user:' || (select auth.uid())::text)
);

create or replace function app_private.broadcast_communication_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'sender_id', new.sender_id,
      'recipient_id', new.recipient_id,
      'message_type', new.message_type,
      'body', new.body,
      'attachment_name', new.attachment_name,
      'attachment_mime', new.attachment_mime,
      'attachment_size', new.attachment_size,
      'edited_at', new.edited_at,
      'retracted_at', new.retracted_at,
      'read_at', new.read_at,
      'created_at', new.created_at
    ),
    'message-insert',
    'communication:user:' || new.recipient_id::text,
    true
  );
  return new;
end;
$$;

revoke all on function app_private.broadcast_communication_message_insert()
  from public, anon, authenticated;

drop trigger if exists communication_messages_broadcast_insert
  on public.communication_messages;
create trigger communication_messages_broadcast_insert
after insert on public.communication_messages
for each row
execute function app_private.broadcast_communication_message_insert();
