import "server-only";

// Preview currently shares the production database. Do not allow access
// until a separate environment has been explicitly established and verified.
export function serviceRehearsalEnabled() {
  return process.env.VERCEL_ENV === "production" && process.env.ENABLE_SERVICE_REHEARSAL === "true";
}
