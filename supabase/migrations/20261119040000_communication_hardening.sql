-- Harden communication reads so only active Admin/Coordinator participants can subscribe.
-- Server-side write authorization remains the primary control.

drop policy if exists communication_messages_participant_select
  on public.communication_messages;
create policy communication_messages_participant_select
on public.communication_messages
for select
to authenticated
using (
  (select app_private.has_role(
    'admin'::public.app_role,
    'coordinator'::public.app_role
  ))
  and (
    (select auth.uid()) = sender_id
    or (select auth.uid()) = recipient_id
  )
);

drop policy if exists communication_calls_participant_select
  on public.communication_calls;
create policy communication_calls_participant_select
on public.communication_calls
for select
to authenticated
using (
  (select app_private.has_role(
    'admin'::public.app_role,
    'coordinator'::public.app_role
  ))
  and (
    (select auth.uid()) = caller_id
    or (select auth.uid()) = callee_id
  )
);

drop policy if exists communication_call_signals_participant_select
  on public.communication_call_signals;
create policy communication_call_signals_participant_select
on public.communication_call_signals
for select
to authenticated
using (
  (select app_private.has_role(
    'admin'::public.app_role,
    'coordinator'::public.app_role
  ))
  and exists (
    select 1
    from public.communication_calls c
    where c.id = communication_call_signals.call_id
      and (
        (select auth.uid()) = c.caller_id
        or (select auth.uid()) = c.callee_id
      )
  )
);
