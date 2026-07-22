begin;

alter table public.timeline_nodes add column if not exists sort_order integer not null default 0;
alter table public.timeline_nodes add column if not exists source_template_node_id text references public.timeline_nodes(id) on delete restrict;
create unique index if not exists timeline_nodes_service_template_snapshot_key on public.timeline_nodes(service_id, source_template_node_id) where service_id is not null and source_template_node_id is not null;
create index if not exists timeline_nodes_service_sort_idx on public.timeline_nodes(service_id, sort_order, time);

-- Schedule definitions are admin-owned. Coordinators retain scoped read access.
drop policy if exists timeline_nodes_manage_staff on public.timeline_nodes;
create policy timeline_nodes_manage_admin on public.timeline_nodes for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

drop policy if exists checklist_items_manage_staff on public.checklist_items;
create policy checklist_items_manage_admin on public.checklist_items for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

drop policy if exists service_stations_manage on public.service_stations;
create policy service_stations_manage_admin on public.service_stations for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

drop policy if exists service_assignments_manage on public.service_assignments;
create policy service_assignments_manage_admin on public.service_assignments for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

drop policy if exists service_task_assignments_manage on public.service_task_assignments;
create policy service_task_assignments_manage_admin on public.service_task_assignments for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

commit;
