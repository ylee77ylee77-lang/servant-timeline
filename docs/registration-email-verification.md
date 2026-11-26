# Registration email verification rollout

This branch only changes self-service registration and the server-side contact-email verification boundary. Existing internal Supabase Auth emails and password login are unchanged. Existing administrator-created/legacy accounts remain on the prior reviewed recovery procedure. New self-registered users require a verified recovery address; changing it clears verification and prevents sending recovery credentials until it is verified again. Personal-settings verification of legacy/changed addresses is a follow-up, not part of this registration release.

Before merging:
- Generate the versioned migration with `supabase migration new registration_email_verification`, copy the staged schema into that migration, remove the staged file and temporary CI generation step, and review the final migration path. Never apply to production as part of a build.
- Test migration and SQL authorization on an isolated Supabase database, including lint/build/Node tests. Review security advisors.
- Configure a randomly generated, at least 32-byte server-only secret in `REGISTRATION_VERIFICATION_SECRET` for each target environment. Do not use `NEXT_PUBLIC_` or commit any value. Keep the existing Gmail SMTP settings. Use an isolated Supabase project and sender/recipient for preview email tests; do not create test accounts in production.
- Preview email link in Gmail and Apple Mail on iPhone and Android; test browser continuation, six-digit copy/paste, leading zero, wrong/expired codes, 60-second resend, 5-attempt lock, changing email, scanner/link rewriting, duplicate submits, pending administrator approval, and old login/account recovery.
- Public email-send limits are 30 attempts per rolling day globally, 5 per hour per address, 60 seconds between sends to one address/session, and 15 per ten minutes per trusted client source. Failed sends count toward quota. Review limits before a large volunteer registration event.

Link tokens use a URL fragment and are consumed by a same-origin POST, avoiding normal GET-only scanners. A scanner executing browser JavaScript or an email client rewriting fragments may still interfere; the visible six-digit code and resend path are fallbacks. Link redemption transfers the registration capability to the redeeming browser, rather than giving the unverified requesting browser access. No password is saved before verification. Registration completion is a separate, atomic single-use claim and continues through the existing administrator approval workflow.

Do not merge or deploy until both database and application checks, preview configuration, and real-device mail tests pass.
