import { isServiceType, type ServiceType } from "./catalog.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EligibleCheckInOption = {
  serviceType: ServiceType;
  assignmentId: string;
};

export const CHECK_IN_NETWORK_MESSAGES = {
  checking: "正在確認是否可進行現場報到…",
  connected: "已確認可進行現場報到。",
  unavailable: "目前無法進行現場報到，請確認網路連線後再試。",
} as const;

export function isUuid(value: unknown): value is string {
  return UUID_PATTERN.test(String(value ?? "").trim());
}

export function normalizeEligibleCheckInOptions(
  value: unknown
): EligibleCheckInOption[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<ServiceType>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const serviceType = String(record.serviceType ?? "").trim();
    const assignmentId = String(record.assignmentId ?? "").trim();
    if (!isServiceType(serviceType) || !isUuid(assignmentId) || seen.has(serviceType)) {
      return [];
    }
    seen.add(serviceType);
    return [{ serviceType, assignmentId }];
  });
}

export function getSelectedCheckInOption(
  options: EligibleCheckInOption[],
  selectedServiceType: unknown
) {
  if (!isServiceType(selectedServiceType)) return null;
  return options.find((option) => option.serviceType === selectedServiceType) ?? null;
}
