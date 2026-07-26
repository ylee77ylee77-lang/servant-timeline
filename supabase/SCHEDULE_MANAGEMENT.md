# Schedule management rollout

Global timeline rows (`timeline_nodes.service_id is null`) remain reusable templates. Editing one from a service page calls `ensure_service_task_snapshot` to atomically create or recover a service-scoped snapshot, copy its checklist, and remap assignments. Therefore **儲存本堂修改** never changes another service or the reusable template.

The admin workflow supports:

- creating draft or published 六晚崇、主一堂、主二堂 services;
- editing date, start/report times, report location, status, and notes;
- creating, editing, ordering, and disabling service-scoped timeline tasks;
- editing voice, five-minute, and at-time reminder flags;
- creating, editing, ordering, and disabling checklist items;
- creating required-item lists;
- assigning active volunteers to roles, stations, and tasks;
- copying a previous service in one database transaction, with assignments optional;
- retaining check-in, checklist-completion, confirmation, activity-log, and review history.

Coordinators keep scoped read access to their authorized services. Schedule definitions, stations, assignments, task mappings, and coordinator grants are admin-write only. Completed services are read-only. Assigned volunteers can read only active required items.

## Preview verification

1. Create a restorable backup and record row counts for `worship_services`, `timeline_nodes`, `checklist_items`, `service_assignments`, `service_task_assignments`, `assignment_checklist_states`, and `service_check_ins`.
2. Use a Supabase preview branch isolated from production. Do not point the Vercel Preview deployment at production Supabase while testing writes.
3. Apply migrations in repository order:
   - `20260722100000_add_service_task_snapshots.sql`
   - `20260724093000_harden_schedule_management.sql`
4. Run the existing security verification scripts, then `service_task_snapshot_verification.sql`.
5. Run repository lint, TypeScript type-check, and production build.
6. Smoke-test:
   - admin creates a draft service and publishes it;
   - admin modifies a template task and confirms only a service snapshot changes;
   - retrying snapshot creation returns the same service-scoped task;
   - completed services reject schedule, checklist, and required-item writes;
   - admin manages checklist, reminders, required items, assignments, and task mappings;
   - copy with assignments off and on;
   - coordinator can read but cannot write;
   - volunteer sees only assigned active tasks, checklist items, and required items;
   - copied service contains no check-ins, confirmations, completion state, logs, or reviews.

## Production order

1. Back up production and record row counts.
2. Apply both database migrations in repository order during a reviewed maintenance window.
3. Run SQL verification and representative role checks.
4. Deploy the application.
5. Smoke-test one admin, one coordinator, and one volunteer before normal use.

The database migrations must be applied before the application because the editor reads the new columns, table, policies, and RPC. Never run migrations during a Vercel build.

## Rollback

Prefer a forward fix. Do not drop `service_required_items`, `source_template_node_id`, `source_template_item_id`, `sort_order`, `is_active`, or the snapshot RPC after data exists. An emergency application rollback may leave the additive schema in place. Restoring the previous RLS policies would reopen coordinator schedule writes and should only be done through an explicitly reviewed forward migration.
