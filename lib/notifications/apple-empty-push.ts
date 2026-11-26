import { createECDH, createPrivateKey, sign } from "node:crypto";

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/** Preview test restricts outbound requests to Apple's Web Push origin only. */
export function isApplePushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "web.push.apple.com"
      && url.port === ""
      && url.username === ""
      && url.password === ""
      && !url.search && !url.hash
      && /^\/[A-Za-z0-9_-]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function signingKey(keys: VapidKeys) {
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(keys.publicKey) ||
      !/^[A-Za-z0-9_-]{40,50}$/.test(keys.privateKey)) {
    throw new Error("VAPID key format is invalid");
  }
  const publicBytes = Buffer.from(keys.publicKey, "base64url");
  const privateBytes = Buffer.from(keys.privateKey, "base64url");
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("VAPID key length is invalid");
  }
  const ec = createECDH("prime256v1");
  ec.setPrivateKey(privateBytes);
  if (!ec.getPublicKey(undefined, "uncompressed").equals(publicBytes)) {
    throw new Error("VAPID key pair mismatch");
  }
  return createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: privateBytes.toString("base64url"),
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
    },
  });
}

/** RFC 8292 VAPID signing for an empty (unencrypted) Web Push request. */
export function buildVapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  nowMs: number = Date.now(),
): string {
  if (!isApplePushEndpoint(endpoint)) throw new Error("Unsupported push endpoint");
  if (!keys.subject.startsWith("https://") && !keys.subject.startsWith("mailto:")) {
    throw new Error("VAPID contact must be HTTPS or mailto");
  }
  const privateKey = signingKey(keys);
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + 60 * 60,
    sub: keys.subject,
  })).toString("base64url");
  const input = header + "." + claims;
  const signature = sign("sha256", Buffer.from(input), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return "vapid t=" + input + "." + signature + ", k=" + keys.publicKey;
}

/**
 * No payload means no custom encryption and no volunteer details in transit.
 * The service worker immediately displays a fixed, non-sensitive notification.
 */
export async function sendEmptyApplePush(
  endpoint: string,
  keys: VapidKeys,
  fetcher: typeof fetch = fetch,
  ttlSeconds = 120,
): Promise<{ ok: boolean; status: number }> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 0 || ttlSeconds > 120) throw new Error("Invalid test push TTL");
  const authorization = buildVapidAuthorization(endpoint, keys);
  const response = await fetcher(endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: authorization,
      TTL: String(ttlSeconds),
      Urgency: "high",
    },
    signal: AbortSignal.timeout(10000),
  });
  return { ok: response.ok, status: response.status };
}
