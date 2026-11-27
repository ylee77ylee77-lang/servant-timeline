import { isServiceType, type ServiceType } from "./catalog.ts";
import { isUuid } from "./check-in.ts";

export const MAX_REHEARSAL_MEMBERS = 500;

export type RehearsalAdminAction =
  | { action: "start"; serviceType: ServiceType; userIds: string[] }
  | { action: "enroll"; rehearsalId: string; userIds: string[] }
  | { action: "revoke"; rehearsalId: string; userId: string }
  | { action: "end"; rehearsalId: string };

export type RehearsalUser = { id: string; displayName: string; accountCode: string | null };
export type RehearsalAdminState = {
  rehearsal: { id: string; serviceType: ServiceType; startedAt: string } | null;
  eligibleUsers: RehearsalUser[];
  members: (RehearsalUser & { checkedInAt: string | null; revokedAt: string | null; eligible: boolean })[];
};

function uuid(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && isUuid(value);
}

function users(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REHEARSAL_MEMBERS
    || !value.every(uuid)) return null;
  const ids = value.map(id => id.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
}

export function parseRehearsalAdminAction(value: unknown): RehearsalAdminAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const b = value as Record<string, unknown>;
  if (b.action === "start") {
    const ids = users(b.userIds);
    return ids && typeof b.serviceType === "string" && isServiceType(b.serviceType)
      ? { action: "start", serviceType: b.serviceType, userIds: ids } : null;
  }
  if (!uuid(b.rehearsalId)) return null;
  const rehearsalId = b.rehearsalId.toLowerCase();
  if (b.action === "end") return { action: "end", rehearsalId };
  if (b.action === "revoke" && uuid(b.userId)) return { action: "revoke", rehearsalId, userId: b.userId.toLowerCase() };
  if (b.action === "enroll") {
    const ids = users(b.userIds);
    return ids ? { action: "enroll", rehearsalId, userIds: ids } : null;
  }
  return null;
}
