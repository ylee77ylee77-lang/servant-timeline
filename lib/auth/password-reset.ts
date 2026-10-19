export const PASSWORD_RESET_REQUESTED_EVENT = "password_reset_requested";
export const PASSWORD_RESET_COMPLETED_EVENT = "password_reset_completed";

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
