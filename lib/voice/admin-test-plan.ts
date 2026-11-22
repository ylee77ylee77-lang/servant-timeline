import { formatReminderLeadSpeech, isReminderDue } from "./reminder-timing";

// Test clock is independent of published services, check-in, and live reminder state.
export type AdminTestCue = "advance" | "ontime";
export type AdminTestDetail = "simple" | "standard" | "detailed";

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

  // Schedule whole-second clock times so the same HH:mm:ss matching helper
  // used by the live reminders can be exercised without a fake clock.
  const dueAt = Math.ceil((now.getTime() + (leadSeconds + waitSeconds) * 1000) / 1000) * 1000;
  return { dueAt, taskTime: timeCode(new Date(dueAt)), leadSeconds };
}

export function getAdminVoiceTestDue(
  now: Date,
  plan: AdminVoiceTestPlan,
): { advance: boolean; ontime: boolean } {
  if (now.getTime() < plan.dueAt - (plan.leadSeconds + 3) * 1000
    || now.getTime() > plan.dueAt + 3000) {
    return { advance: false, ontime: false };
  }

  return {
    advance: plan.leadSeconds > 0 && isReminderDue(now, plan.taskTime, plan.leadSeconds, 3),
    ontime: isReminderDue(now, plan.taskTime, 0, 3),
  };
}

function formatTaskTimeForSpeech(date: Date): string {
  const hour = date.getHours();
  const minute = date.getMinutes();
  return minute === 0 ? hour + "點" : hour + "點" + String(minute).padStart(2, "0") + "分";
}

export function buildAdminVoiceTestSpeech(
  cue: AdminTestCue,
  taskTitle: string,
  plan: AdminVoiceTestPlan,
  detail: AdminTestDetail,
): string {
  const title = taskTitle.trim() || "服事任務";
  const hint = detail === "detailed" ? "請確認物品及站位。" : "";

  if (cue === "ontime") return "可以" + title + "了。" + hint;
  if (detail === "simple") return "提醒您，" + title + "。";
  if (plan.leadSeconds === 0) return "提醒您，現在要" + title + "。" + hint;

  const minutes = Math.floor(plan.leadSeconds / 60);
  const seconds = plan.leadSeconds % 60;
  const lead = formatReminderLeadSpeech(minutes, seconds);
  return "提醒您，" + lead + "後，" + formatTaskTimeForSpeech(new Date(plan.dueAt)) + "，要" + title + "。" + hint;
}
