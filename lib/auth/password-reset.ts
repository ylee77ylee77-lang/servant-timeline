export const PASSWORD_RESET_REQUESTED_EVENT = "password_reset_requested";
export const PASSWORD_RESET_COMPLETED_EVENT = "password_reset_completed";
export const PASSWORD_CHANGED_BY_USER_EVENT = "password_changed_by_user";
export const ACCOUNT_RECOVERY_REQUESTED_EVENT = "account_recovery_requested";
export const ACCOUNT_RECOVERY_COMPLETED_EVENT = "account_recovery_completed";
export const ACCOUNT_RECOVERY_SUBJECT_TYPE = "account_recovery";
export const MUST_CHANGE_PASSWORD_APP_METADATA_KEY = "must_change_password";

export type PasswordResetAuditRow = {
  id: number | string;
  subject_id: string | null;
  event_type: string;
  occurred_at: string;
};

export type PendingPasswordReset = {
  subjectId: string;
  requestLogId: number | string;
  requestedAt: string;
};

export function derivePendingPasswordResets(
  rows: PasswordResetAuditRow[]
): PendingPasswordReset[] {
  const latestBySubject = new Map<string, PasswordResetAuditRow>();

  for (const row of rows) {
    const subjectId = String(row.subject_id ?? "").trim();
    if (!subjectId || latestBySubject.has(subjectId)) continue;
    if (
      row.event_type !== PASSWORD_RESET_REQUESTED_EVENT
      && row.event_type !== PASSWORD_RESET_COMPLETED_EVENT
    ) {
      continue;
    }
    latestBySubject.set(subjectId, row);
  }

  return Array.from(latestBySubject.entries())
    .filter(([, row]) => row.event_type === PASSWORD_RESET_REQUESTED_EVENT)
    .map(([subjectId, row]) => ({
      subjectId,
      requestLogId: row.id,
      requestedAt: row.occurred_at,
    }));
}

export function isValidResetPassword(password: unknown) {
  const value = String(password ?? "");
  return value.length >= 8 && value.length <= 72;
}

export function requiresPasswordChange(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== "object" || Array.isArray(appMetadata)) {
    return false;
  }

  return (appMetadata as Record<string, unknown>)[MUST_CHANGE_PASSWORD_APP_METADATA_KEY] === true;
}

export function withPasswordChangeRequired(
  appMetadata: unknown,
  required: boolean
): Record<string, unknown> {
  const current =
    appMetadata && typeof appMetadata === "object" && !Array.isArray(appMetadata)
      ? (appMetadata as Record<string, unknown>)
      : {};

  return {
    ...current,
    [MUST_CHANGE_PASSWORD_APP_METADATA_KEY]: required,
  };
}


export type AccountRecoveryAuditRow = {
  id: number | string;
  event_type: string;
  occurred_at: string;
  metadata?: unknown;
};

export type PendingAccountRecovery = {
  requestLogId: number | string;
  requestedName: string;
  requestedAt: string;
};

export function normalizeRecoveryName(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function isValidRecoveryName(value: unknown) {
  const normalized = normalizeRecoveryName(value);
  return normalized.length >= 1 && normalized.length <= 80;
}

export function normalizeContactEmail(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

export function isValidContactEmail(value: unknown) {
  const email = normalizeContactEmail(value);
  return email.length >= 3
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function maskContactEmail(value: unknown) {
  const email = normalizeContactEmail(value);
  const [local, domain] = email.split("@");
  if (!local || !domain) return "未設定";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function recoveryMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function derivePendingAccountRecoveries(
  rows: AccountRecoveryAuditRow[]
): PendingAccountRecovery[] {
  const completedRequestIds = new Set<string>();

  for (const row of rows) {
    if (row.event_type !== ACCOUNT_RECOVERY_COMPLETED_EVENT) continue;
    const requestLogId = String(recoveryMetadata(row.metadata).request_log_id ?? "").trim();
    if (requestLogId) completedRequestIds.add(requestLogId);
  }

  return rows
    .filter((row) => row.event_type === ACCOUNT_RECOVERY_REQUESTED_EVENT)
    .filter((row) => !completedRequestIds.has(String(row.id)))
    .flatMap((row) => {
      const requestedName = normalizeRecoveryName(
        recoveryMetadata(row.metadata).requested_name
      );
      if (!isValidRecoveryName(requestedName)) return [];
      return [{
        requestLogId: row.id,
        requestedName,
        requestedAt: row.occurred_at,
      }];
    });
}
