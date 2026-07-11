# Supabase migrations

This directory contains the version-controlled database foundation for the
Shekinah welcome-service app.

The first migration also captures the existing production table and TTS
function definitions with non-destructive `IF NOT EXISTS` / `CREATE OR REPLACE`
statements. This allows a clean local Supabase database to rebuild the current
schema before applying the new foundation, while leaving existing production
rows untouched.

## Rollout boundary

The foundation migration is additive and preserves all existing
`timeline_nodes` and `checklist_items` rows. It adds a nullable `service_id` to
`timeline_nodes`; existing rows remain shared legacy timeline rows.

The first migration intentionally leaves RLS off on `timeline_nodes` and
`checklist_items`. The Auth cutover migration enables their RLS, removes all
`anon` grants, permits active users to read, permits coordinators/admins to
manage definitions, and exposes one narrow completion RPC for active users.
Apply that migration only as part of the coordinated Auth frontend release.

New foundation tables have RLS enabled immediately, have no `anon` access, and
use explicit grants for `authenticated` and `service_role`.

## Before applying

1. Confirm a restorable production backup exists.
2. Record exact row counts for `timeline_nodes` and `checklist_items`.
3. Apply to a Supabase preview branch or local database first.
4. Run the verification queries in `tests/security_baseline_verification.sql`.
5. Create the first Auth user, then grant `admin` only through a reviewed,
   server-side administrative operation. Never bootstrap an admin from
   user-editable metadata.

## Auth cutover configuration

The browser requires these public environment variable names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred), or the legacy
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only account administration requires `SUPABASE_SERVICE_ROLE_KEY`. Never
prefix that value with `NEXT_PUBLIC_`.

After applying both migrations, create the first administrator once from a
trusted terminal with temporary `BOOTSTRAP_ACCOUNT_CODE`, `BOOTSTRAP_PASSWORD`,
and `BOOTSTRAP_DISPLAY_NAME` environment variables:

```bash
npm run bootstrap:admin
```

The script refuses to run when an administrator already exists and never logs
credentials. Remove the temporary bootstrap values immediately afterward.

Because the cutover migration also removes anonymous legacy access, use a
reviewed maintenance window: prepare the frontend and environment variables,
record/backup production row counts, apply the migrations, run the bootstrap
once, release the Auth frontend, then immediately run the verification SQL and
login smoke tests. Do not leave the migrated database serving the old anonymous
frontend.

Do not apply these migrations to production as part of a Vercel preview or
application build.

## Rollback notes

Prefer a forward-fix migration. The new schema may contain Auth-linked or
operational data after rollout, so dropping it is destructive.

Before any new foundation data exists, rollback may remove the new triggers,
tables, helper functions, types, indexes, and the nullable
`timeline_nodes.service_id` column in reverse dependency order. Do not remove
that column after it contains service links.

The TTS permission rollback, if explicitly approved for an emergency, is:

```sql
grant execute on function public.reserve_tts_chars(text, integer, integer)
  to anon, authenticated;
grant execute on function public.reserve_tts_chars_v2(text, integer, integer, integer)
  to anon, authenticated;
```

That rollback reopens a known quota-abuse vulnerability and must not be the
normal recovery path. Server-side calls using `service_role` continue to work
after the restrictive migration.

For an Auth-cutover emergency rollback, restore the previously deployed
anonymous frontend first, then disable RLS and restore the legacy grants in one
reviewed transaction. This temporarily reopens the known anonymous CRUD risk:

```sql
alter table public.timeline_nodes disable row level security;
alter table public.checklist_items disable row level security;
grant all on public.timeline_nodes, public.checklist_items to anon, authenticated;
```

Do not delete `profiles.account_code`, Auth users, or operational records during
rollback. Prefer a forward fix whenever the authenticated frontend can still
reach the database.
