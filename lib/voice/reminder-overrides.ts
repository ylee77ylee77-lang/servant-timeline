// The same six variants are used by live reminders and admin previews.
export type ReminderTiming = "pre5" | "now";
export type ReminderDetailLevel = "simple" | "standard" | "detailed";

export const REMINDER_TEXT_FIELDS = {
  pre5: {
    simple: "voice_pre5_simple",
    standard: "voice_pre5_standard",
    detailed: "voice_pre5_detailed",
  },
  now: {
    simple: "voice_now_simple",
    standard: "voice_now_standard",
    detailed: "voice_now_detailed",
  },
} as const;

export function isReminderTiming(value: unknown): value is ReminderTiming {
  return value === "pre5" || value === "now";
}

export function isReminderDetailLevel(value: unknown): value is ReminderDetailLevel {
  return value === "simple" || value === "standard" || value === "detailed";
}

export function getReminderTextField(timing: ReminderTiming, detail: ReminderDetailLevel) {
  return REMINDER_TEXT_FIELDS[timing][detail];
}

export function getCustomReminderText(
  node: Record<string, unknown>,
  timing: ReminderTiming,
  detail: ReminderDetailLevel,
): string | null {
  const value = node[getReminderTextField(timing, detail)];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeReminderText(value: string) {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}
