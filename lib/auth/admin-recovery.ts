import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_RECOVERY_METADATA_KEY = "admin_recovery_codes";
export const ADMIN_RECOVERY_CODE_COUNT = 5;
const ADMIN_RECOVERY_CODE_BYTES = 12;
const NORMALIZED_CODE_LENGTH = ADMIN_RECOVERY_CODE_BYTES * 2;

export type AdminRecoveryState = {
  version: 1;
  generated_at: string;
  code_hashes: string[];
  last_used_at?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAdminRecoveryCode(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");
}

export function isValidAdminRecoveryCodeFormat(value: unknown) {
  const normalized = normalizeAdminRecoveryCode(value);
  return normalized.length === NORMALIZED_CODE_LENGTH && /^[0-9A-F]+$/.test(normalized);
}

export function formatAdminRecoveryCode(value: string) {
  return normalizeAdminRecoveryCode(value).match(/.{1,4}/g)?.join("-") ?? "";
}

export function hashAdminRecoveryCode(userId: string, code: unknown) {
  return createHash("sha256")
    .update(`admin-recovery:v1:${userId}:${normalizeAdminRecoveryCode(code)}`)
    .digest("hex");
}

export function generateAdminRecoveryCodes(count = ADMIN_RECOVERY_CODE_COUNT) {
  return Array.from({ length: count }, () =>
    formatAdminRecoveryCode(randomBytes(ADMIN_RECOVERY_CODE_BYTES).toString("hex"))
  );
}

export function buildAdminRecoveryState(
  userId: string,
  codes: string[],
  generatedAt = new Date().toISOString()
): AdminRecoveryState {
  return {
    version: 1,
    generated_at: generatedAt,
    code_hashes: codes.map((code) => hashAdminRecoveryCode(userId, code)),
  };
}

export function readAdminRecoveryState(appMetadata: unknown): AdminRecoveryState | null {
  if (!isRecord(appMetadata)) return null;
  const raw = appMetadata[ADMIN_RECOVERY_METADATA_KEY];
  if (!isRecord(raw)) return null;

  const version = Number(raw.version);
  const generatedAt = String(raw.generated_at ?? "");
  const hashes = Array.isArray(raw.code_hashes)
    ? raw.code_hashes.map((hash) => String(hash))
    : [];
  const lastUsedAt = raw.last_used_at ? String(raw.last_used_at) : undefined;

  if (
    version !== 1
    || !generatedAt
    || hashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))
  ) {
    return null;
  }

  return {
    version: 1,
    generated_at: generatedAt,
    code_hashes: hashes,
    ...(lastUsedAt ? { last_used_at: lastUsedAt } : {}),
  };
}

function safeHashEqual(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function findMatchingAdminRecoveryHash(
  state: AdminRecoveryState,
  userId: string,
  code: unknown
) {
  if (!isValidAdminRecoveryCodeFormat(code)) return null;
  const candidate = hashAdminRecoveryCode(userId, code);
  return state.code_hashes.find((stored) => safeHashEqual(stored, candidate)) ?? null;
}

export function consumeAdminRecoveryHash(
  state: AdminRecoveryState,
  matchedHash: string,
  usedAt = new Date().toISOString()
): AdminRecoveryState {
  return {
    ...state,
    code_hashes: state.code_hashes.filter((hash) => hash !== matchedHash),
    last_used_at: usedAt,
  };
}
