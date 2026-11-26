import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

export const REGISTRATION_CODE_VALID_MINUTES = 10;
export const REGISTRATION_COOKIE = "shekinah_registration";
export const REGISTRATION_MAX_ATTEMPTS = 5;

export function createRegistrationToken() {
  return randomBytes(32).toString("base64url");
}

export function isRegistrationToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function registrationDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createRegistrationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function isRegistrationCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

export function registrationCodeDigest(secret: string, sessionDigest: string, code: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("Registration verification secret not configured");
  return createHmac("sha256", secret).update("registration-email-v1:").update(sessionDigest).update(":").update(code).digest("hex");
}

export function registrationLink(origin: string, mode: "verify" | "copy", value: string) {
  const url = new URL("/", origin);
  url.searchParams.set("registration", mode);
  url.hash = new URLSearchParams({ [mode === "verify" ? "token" : "code"]: value }).toString();
  return url.toString();
}
