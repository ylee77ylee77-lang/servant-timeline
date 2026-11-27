import { isServiceType, type ServiceType } from "./catalog.ts";
import { isUuid } from "./check-in.ts";

export type RehearsalAdminAction =
  | { action: "start"; serviceType: ServiceType }
  | { action: "end"; rehearsalId: string };

export type RehearsalAdminState = {
  rehearsal: { id: string; serviceType: ServiceType; startedAt: string } | null;
  eligibleCount: number;
  checkedInCount: number;
};

export function parseRehearsalAdminAction(value: unknown): RehearsalAdminAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const b = value as Record<string, unknown>;
  if (b.action === "start") {
    return typeof b.serviceType === "string" && isServiceType(b.serviceType) && !("userIds" in b)
      ? { action: "start", serviceType: b.serviceType } : null;
  }
  if (b.action === "end" && typeof b.rehearsalId === "string"
    && b.rehearsalId === b.rehearsalId.trim() && isUuid(b.rehearsalId)) {
    return { action: "end", rehearsalId: b.rehearsalId.toLowerCase() };
  }
  return null;
}
