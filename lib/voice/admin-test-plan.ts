import { isReminderDue } from "./reminder-timing.ts";

/** A private, local test clock. Never shared with live schedule state. */
export type AdminVoiceTestCue = "advance" | "ontime";

export type AdminVoiceTestPlan = {
  taskTime: string;
  dueAt: number;
  leadSeconds: number;
};

export const ADMIN_TEST_START_WAIT_SECONDS = 20;
export const ADMIN_TEST_QUICK_LEAD_SECONDS = 15;

function timeCode(date: Date): string {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join(":");
}

export function createAdminVoiceTestPlan(
  now: Date,
  leadSeconds: number,
  waitSeconds = ADMIN_TEST_START_WAIT_SECONDS,
): AdminVoiceTestPlan {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(leadSeconds)
    || leadSeconds < 0 || leadSeconds > 3645
    || !Number.isInteger(waitSeconds) || waitSeconds < 5 || waitSeconds > 60) {
    throw new Error("測試排程參數無效。");
  }

  // Match the same HH:mm:ss timing helper used for live announcements.
  // Store the absolute due time as well to avoid unrelated daily matches.
  const dueAt = Math.ceil((now.getTime() + (leadSeconds + waitSeconds) * 1000) / 1000) * 1000;
  return { dueAt, taskTime: timeCode(new Date(dueAt)), leadSeconds };
}

export function getAdminVoiceTestDue(
  now: Date,
  plan: AdminVoiceTestPlan,
): { advance: boolean; ontime: boolean } {
  if (!Number.isFinite(now.getTime()) || now.getTime() < plan.dueAt - (plan.leadSeconds + 3) * 1000
    || now.getTime() > plan.dueAt + 3000) {
    return { advance: false, ontime: false };
  }

  return {
    advance: isReminderDue(now, plan.taskTime, plan.leadSeconds, 3),
    ontime: isReminderDue(now, plan.taskTime, 0, 3),
  };
}
