-- Station corrections remain append-only audit records, but browser clients
-- must create them through the network-gated server API instead of PostgREST.
revoke insert on public.check_in_station_confirmations from authenticated;

drop policy if exists station_confirmations_insert_own
on public.check_in_station_confirmations;

drop policy if exists station_confirmations_insert_staff
on public.check_in_station_confirmations;
