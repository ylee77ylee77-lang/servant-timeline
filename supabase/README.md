# Supabase migrations

This directory contains the version-controlled database foundation for the
Shekinah welcome-service app.

## Rollout boundary

The foundation migration is additive and preserves all existing
`timeline_nodes` and `checklist_items` rows. It adds a nullable `service_id` to
`timeline_nodes`; existing rows remain shared legacy timeline rows.

The migration intentionally does **not** enable RLS on `timeline_nodes` or
`checklist_items`. The production frontend still authenticates to PostgREST as
`anon` and performs direct writes. Enabling strict RLS before the Auth-enabled
frontend is deployed would break current production behavior. That cutover
must be a separate reviewed migration released together with the frontend Auth
change.

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

