import { createECDH, ECDH, createHmac, timingSafeEqual } from "node:crypto";
import webpush from "web-push";

export type AppleSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
export type ReminderCue = {
  delivery_id: string;
  service_date: string;
  service_type: string;
  task_time: string;
  scheduled_at: string;
  /** Only the isolated preview planner supplies this marker. */
  previewTest?: boolean;
  /** Real task times for a verified admin, not a formal service assignment. */
  adminTest?: boolean;
  /** Server-owned rehearsal delivery, never a formal notification. */
  rehearsal?: boolean;
};
export type PushKeys = { subject: string; publicKey: string; privateKey: string };

const services = new Set(["六晚崇", "主一堂", "主二堂"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Decode only AFTER the same bearer token has been validated by Auth.getUser.
 * The SQL registration independently verifies that this session belongs to the user.
 */
export function getVerifiedSessionId(authorization: string | null, userId: string): string | null {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.length > 16_384) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims.sub === userId && typeof claims.session_id === "string"
      && uuidPattern.test(claims.session_id) ? claims.session_id : null;
  } catch {
    return null;
  }
}

export function isApplePushEndpoint(endpoint: unknown): endpoint is string {
  return typeof endpoint === "string" && endpoint.length <= 2048
    && /^https:\/\/web\.push\.apple\.com\/[A-Za-z0-9_-]+$/.test(endpoint);
}

function decodeExactKey(value: unknown, bytes: number): Buffer | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === bytes && decoded.toString("base64url") === value ? decoded : null;
}

function validPublicPoint(value: unknown) {
  const bytes = decodeExactKey(value, 65);
  if (!bytes || bytes[0] !== 4) return false;
  try {
    ECDH.convertKey(bytes, "prime256v1", undefined, undefined, "uncompressed");
    return true;
  } catch {
    return false;
  }
}

export function parseAppleSubscription(value: unknown): AppleSubscription | null {
  if (!value || typeof value !== "object") return null;
  const item = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!isApplePushEndpoint(item.endpoint) || !validPublicPoint(item.keys?.p256dh)
      || !decodeExactKey(item.keys?.auth, 16)) return null;
  return { endpoint: item.endpoint, keys: { p256dh: item.keys!.p256dh as string, auth: item.keys!.auth as string } };
}

export function validVapidKeys(keys: PushKeys) {
  if (!validPublicPoint(keys.publicKey)) return false;
  const privateKey = decodeExactKey(keys.privateKey, 32);
  if (!privateKey || keys.subject.length > 256) return false;
  try {
    const url = new URL(keys.subject);
    if (!["https:", "mailto:"].includes(url.protocol) || url.username || url.password || url.hash) return false;
    const ec = createECDH("prime256v1");
    ec.setPrivateKey(privateKey);
    return ec.getPublicKey(undefined, "uncompressed").toString("base64url") === keys.publicKey;
  } catch {
    return false;
  }
}

/** Only minimal, server-derived service and task timing is permitted in a lock-screen payload. */
export function makeReminderPayload(cue: ReminderCue): string {
  if (!uuidPattern.test(cue.delivery_id)
      || !services.has(cue.service_type)
      || !/^\d{4}-\d{2}-\d{2}$/.test(cue.service_date)
      || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cue.task_time)
      || !Number.isFinite(Date.parse(cue.scheduled_at))) {
    throw new Error("Invalid reminder cue");
  }
  return JSON.stringify({
    kind: cue.rehearsal === true ? "service-task-reminder-rehearsal" : cue.previewTest === true ? "service-task-reminder-preview" : cue.adminTest === true ? "service-task-reminder-admin-test" : "service-task-reminder",
    id: cue.delivery_id,
    date: cue.service_date,
    service: cue.service_type,
    time: cue.task_time,
  });
}

/** Verify the short-lived, route-specific token produced in PostgreSQL.
 * The long-lived secret never appears in pg_net's queued headers.
 * A replay during this narrow validity window cannot bypass the database's
 * due-time/recipient checks or atomic delivery deduplication.
 */
export function validDispatcherAuthorization(
  authorization: string | null, secret: string, now: () => number = Date.now,
) {
  if (secret.length < 32 || secret.length > 512 || !authorization || authorization.length > 100) return false;
  const match = /^Bearer v1\.(\d{1,11})\.([0-9a-f]{64})$/.exec(authorization);
  if (!match) return false;
  const timestamp = Number(match[1]);
  const age = Math.floor(now() / 1000) - timestamp;
  if (!Number.isSafeInteger(timestamp) || String(timestamp) !== match[1]
      || !Number.isFinite(age) || age < -5 || age > 30) return false;
  const expected = createHmac("sha256", secret)
    .update("background-reminders:dispatch:v1:" + match[1], "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}

/** Use the pinned Web Push library for RFC 8291 encryption, not custom crypto.
 * Send via fetch so redirects can never forward the VAPID token or payload.
 */
export async function sendBackgroundPush(
  subscription: AppleSubscription,
  cue: ReminderCue,
  keys: PushKeys,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<{ status: number }> {
  const checked = parseAppleSubscription(subscription);
  if (!checked || !validVapidKeys(keys)) throw new Error("Invalid push configuration");
  const due = Date.parse(cue.scheduled_at);
  const age = now() - due;
  if (!Number.isFinite(age) || age < 0 || age > 20_000) throw new Error("Expired reminder");
  const payload = makeReminderPayload(cue);
  const ttl = Math.max(0, Math.min(15, Math.floor((20_000 - age) / 1000)));
  const details = webpush.generateRequestDetails(checked, payload, {
    TTL: ttl, urgency: "high", contentEncoding: "aes128gcm", vapidDetails: keys,
  });
  if (details.endpoint !== checked.endpoint || details.method !== "POST" || !details.body) {
    throw new Error("Unexpected push request");
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(details.headers)) headers.set(key, String(value));
  // No redirects, no automatic retries, and a bounded network timeout.
  const response = await fetcher(checked.endpoint, {
    method: "POST", redirect: "error", headers,
    body: new Uint8Array(details.body), signal: AbortSignal.timeout(8_000),
  });
  await response.body?.cancel().catch(() => {});
  return { status: response.status };
}
