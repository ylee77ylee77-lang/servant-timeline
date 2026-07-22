# Schedule management rollout

Global timeline rows (`timeline_nodes.service_id is null`) remain reusable templates. Editing one from a service page first creates a service-scoped snapshot and copies its checklist. Therefore **儲存本堂修改** never changes another service or the reusable template.

## Preview verification

1. Back up and record row counts for `worship_services`, `timeline_nodes`, `checklist_items`, `service_assignments`, `service_task_assignments`, and `assignment_checklist_states`.
2. Apply `20260722100000_add_service_task_snapshots.sql` on a Supabase preview branch.
3. Run the existing security verification scripts, then `service_task_snapshot_verification.sql`.
4. Smoke-test an admin, an authorized coordinator, and a volunteer.
5. Deploy the application to Vercel Preview and verify the mobile editor before review and merge.

## Production order

Apply the database migration before deploying the application because the editor reads the new timeline columns. Do not run migrations during a Vercel build. Coordinators become read-only for schedule definitions; admins remain the only writers.

## Rollback

Prefer a forward fix. Do not drop the new columns after snapshot data exists. An emergency application rollback may leave the additive schema in place. Restoring the previous policies would reopen coordinator schedule writes and should only be done through a reviewed forward migration.
