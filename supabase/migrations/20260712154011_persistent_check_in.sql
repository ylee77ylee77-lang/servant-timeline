-- Preserve each station scan as an audit record while allowing an active user
-- to correct their station after the first confirmation. Ownership and active
-- station checks remain mandatory.
drop policy if exists station_confirmations_insert_own
on public.check_in_station_confirmations;

create policy station_confirmations_insert_own
on public.check_in_station_confirmations
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select app_private.is_active_user())
  and exists (
    select 1
    from public.service_check_ins sci
    where sci.id = check_in_station_confirmations.check_in_id
      and sci.user_id = (select auth.uid())
      and sci.service_id = check_in_station_confirmations.service_id
      and sci.status in ('checked_in', 'station_confirmed')
  )
  and exists (
    select 1
    from public.service_stations ss
    where ss.id = check_in_station_confirmations.station_id
      and ss.service_id = check_in_station_confirmations.service_id
      and ss.is_active
  )
);
