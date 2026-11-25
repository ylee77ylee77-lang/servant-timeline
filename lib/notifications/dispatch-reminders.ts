import type { AppleSubscription, ReminderCue } from "./background-push";

export type Claim = { delivery_id: string };
export type Taken = ReminderCue & { endpoint: string; p256dh: string; auth_secret: string };
export type Outcome = "accepted" | "rejected" | "uncertain";
export type DispatcherStore = {
  claim: (limit: number) => Promise<Claim[]>;
  take: (id: string) => Promise<Taken | null>;
  finish: (id: string, state: Outcome, status: number | null) => Promise<boolean>;
};

/** The database owns deduplication and rechecks the current binding at take.
 * A taken event is never retried, even if transport or finalization is uncertain.
 * No endpoint, user data, or key is returned or logged.
 */
export async function dispatchBackgroundReminders(
  store: DispatcherStore,
  send: (subscription: AppleSubscription, cue: ReminderCue) => Promise<{ status: number }>,
  limit = 50,
) {
  const counts = { claimed: 0, skipped: 0, accepted: 0, rejected: 0, uncertain: 0, errors: 0 };
  const claims = await store.claim(Math.max(1, Math.min(50, Math.trunc(limit))));
  counts.claimed = claims.length;
  const seen = new Set<string>();
  // Bounded parallelism. Each take uses fresh database time (no supplied p_at).
  const unique = claims.filter(claim => {
    if (seen.has(claim.delivery_id)) { counts.skipped++; return false; }
    seen.add(claim.delivery_id);
    return true;
  });
  for (let index = 0; index < unique.length; index += 10) {
    await Promise.all(unique.slice(index, index + 10).map(async claim => {
      let taken: Taken | null;
      try { taken = await store.take(claim.delivery_id); }
      catch { counts.errors++; return; }
      if (!taken) { counts.skipped++; return; }
      let state: Outcome = "uncertain";
      let status: number | null = null;
      try {
        const result = await send({
          endpoint: taken.endpoint,
          keys: { p256dh: taken.p256dh, auth: taken.auth_secret },
        }, taken);
        if (Number.isInteger(result.status) && result.status >= 100 && result.status <= 599) {
          status = result.status;
          state = status >= 200 && status < 300 ? "accepted" : "rejected";
        }
      } catch { /* A timeout might have been accepted by Apple. Never retry. */ }
      counts[state]++;
      try {
        if (!await store.finish(claim.delivery_id, state, status)) counts.errors++;
      } catch { counts.errors++; }
    }));
  }
  return counts;
}
