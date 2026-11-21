// Per-device advance reminder timing. All scheduling uses whole seconds so
// 15-second steps are honored even though timeline tasks are stored as HH:MM.
export const DEFAULT_REMINDER_LEAD_MINUTES = 5;
export const DEFAULT_REMINDER_LEAD_SECONDS = 0;
export const MAX_REMINDER_LEAD_MINUTES = 60;
export const REMINDER_SECOND_OPTIONS = [0, 15, 30, 45] as const;

export type ReminderLeadTime = {
  minutes: number;
  seconds: number;
};

export function normalizeReminderLeadTime(minutes: unknown, seconds: unknown): ReminderLeadTime {
  const safeMinutes = typeof minutes === "number" && Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_REMINDER_LEAD_MINUTES
    ? minutes : DEFAULT_REMINDER_LEAD_MINUTES;
  const safeSeconds = typeof seconds === "number" && (REMINDER_SECOND_OPTIONS as readonly number[]).includes(seconds)
    ? seconds : DEFAULT_REMINDER_LEAD_SECONDS;
  // Zero would duplicate the separate on-time reminder. The minimum advance is 15 seconds.
  if (safeMinutes === 0 && safeSeconds === 0) return { minutes: 0, seconds: 15 };
  return { minutes: safeMinutes, seconds: safeSeconds };
}

export function getReminderLeadSeconds(minutes: unknown, seconds: unknown): number {
  const safe = normalizeReminderLeadTime(minutes, seconds);
  return safe.minutes * 60 + safe.seconds;
}

export function formatReminderLeadLabel(minutes: unknown, seconds: unknown): string {
  const safe = normalizeReminderLeadTime(minutes, seconds);
  const minutePart = safe.minutes > 0 ? `${safe.minutes} 分鐘` : "";
  const secondPart = safe.seconds > 0 ? `${safe.seconds} 秒` : "";
  return [minutePart, secondPart].filter(Boolean).join(" ");
}

function chineseNumber(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value] || "";
  const tens = Math.floor(value / 10);
  const units = value % 10;
  return `${tens === 1 ? "" : digits[tens]}十${units === 0 ? "" : digits[units]}`;
}

export function formatReminderLeadSpeech(minutes: unknown, seconds: unknown): string {
  const safe = normalizeReminderLeadTime(minutes, seconds);
  const minutePart = safe.minutes > 0 ? `${chineseNumber(safe.minutes)}分鐘` : "";
  const secondPart = safe.seconds > 0 ? `${chineseNumber(safe.seconds)}秒` : "";
  return minutePart + secondPart;
}

// A small grace window handles timer jitter without replaying late reminders
// after the browser has been suspended. Arithmetic wraps for tasks near midnight.
export function isReminderDue(
  now: Date,
  taskTime: string,
  secondsBeforeTask: number,
  graceSeconds = 15,
): boolean {
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(taskTime);
  if (!match || !Number.isFinite(now.getTime()) || !Number.isInteger(secondsBeforeTask)
      || secondsBeforeTask < 0 || secondsBeforeTask > 24 * 60 * 60) return false;
  const taskHour = Number(match[1]);
  if (taskHour >= 24) return false;
  const daySeconds = 24 * 60 * 60;
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const taskSeconds = taskHour * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
  const dueSeconds = (taskSeconds - secondsBeforeTask + daySeconds) % daySeconds;
  const elapsed = (nowSeconds - dueSeconds + daySeconds) % daySeconds;
  return elapsed >= 0 && elapsed < graceSeconds;
}
