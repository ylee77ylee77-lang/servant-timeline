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

After applying the Auth and authorization migrations, create the first administrator once from a
trusted terminal with temporary `BOOTSTRAP_ACCOUNT_CODE`, `BOOTSTRAP_PASSWORD`,
and `BOOTSTRAP_DISPLAY_NAME` environment variables:

```bash
npm run bootstrap:admin
```

The script refuses to run when an administrator already exists and never logs
credentials. Its final profile-and-role claim is serialized by a database
transaction lock, so concurrent bootstrap attempts cannot both grant admin.
Remove the temporary bootstrap values immediately afterward.

Because the cutover migration also removes anonymous legacy access, use a
reviewed maintenance window: prepare the frontend and environment variables,
record/backup production row counts, apply the migrations, run the bootstrap
once, release the Auth frontend, then immediately run the verification SQL and
login smoke tests. Do not leave the migrated database serving the old anonymous
frontend.

Do not apply these migrations to production as part of a Vercel preview or
application build.

## Persistent check-in rollout

Coordinators and administrators open a dated worship service from
`/admin/services`, entering the real report and worship start times. This
publishes the service and provisions its standard stations. Active users may
then check in and confirm a station only for that published service and only
when the request comes from the configured church network.

The frontend restores the user's latest same-day record from
`service_check_ins` and `check_in_station_confirmations`, so an Auth refresh or
page reload no longer discards operational status. The remembered phone suffix
remains local-only contact metadata and is not used for authorization.

Rolling back only the persistent check-in policy should restore the prior
`station_confirmations_insert_own` condition that accepts `checked_in` but not
`station_confirmed`. This stops volunteer station corrections without deleting
existing check-ins or confirmation history. Prefer a forward fix after any
operational records have been created.

## Operational authorization hardening

The hardening migration makes station visibility explicitly follow the parent
service status. Active volunteers can read stations for published/completed
services; coordinators and administrators retain access to drafts for planning.

Checklist completion is authorized inside the privileged function: a volunteer
must have their own same-day check-in for the published linked service.
Coordinators and administrators may manage every service. Preserved production
timeline rows whose nullable `service_id` is still unset temporarily keep the
active-user completion behavior so the existing site remains usable. Backfill
those links before removing this compatibility condition in a later migration.

Regular TTS requests do not trust browser date state. The server requires a
same-day published service and the caller's persistent check-in; TTS preview is
admin-only. The in-memory request limiter remains best-effort in serverless
environments, while the database-backed monthly character reservation remains
the hard cost boundary.

## Rollback notes

Prefer a forward-fix migration. The new schema may contain Auth-linked or
operational data after rollout, so dropping it is destructive.

Before any new foundation data exists, rollback may remove the new triggers,
tables, helper functions, types, indexes, and the nullable
`timeline_nodes.service_id` column in reverse dependency order. Do not remove
that column after it contains service links.

For an authorization-hardening emergency, restore the preceding station policy
and checklist function definitions with a reviewed forward migration. Do not
drop `claim_first_admin` while the bootstrap script still depends on it. Any
rollback that reopens volunteer access to draft stations or arbitrary checklist
items weakens the approved security boundary and should be time-limited.

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
