import { randomUUID } from "node:crypto";
import type { ReminderCue } from "./background-push";

export const PREVIEW_REMINDER_OFFSETS = [15, 30, 45] as const;

export function buildPreviewReminderPlan(start: number): ReminderCue[] {
  if (!Number.isSafeInteger(start) || start < 0) throw new Error("Invalid start");
  return PREVIEW_REMINDER_OFFSETS.map(seconds => {
    const at = new Date(start + seconds * 1000);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at).map(part => [part.type, part.value]));
    return {
      delivery_id: randomUUID(), service_date: parts.year + "-" + parts.month + "-" + parts.day,
      service_type: "主一堂", task_time: parts.hour + ":" + parts.minute,
      scheduled_at: at.toISOString(), previewTest: true,
    };
  });
}

/** Bounded preview experiment only; never the production scheduler. */
export async function runPreviewReminderPlan(
  plan: readonly ReminderCue[],
  send: (cue: ReminderCue) => Promise<{ status: number }>,
  canSend: () => Promise<boolean>,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
) {
  const outcomes: string[] = [];
  for (const cue of plan.slice(0, 3)) {
    const due = Date.parse(cue.scheduled_at);
    const wait = due - now();
    if (wait > 0) await sleep(wait);
    if (!await canSend().catch(() => false)) break;
    const age = now() - due;
    if (age < 0 || age > 5_000) { outcomes.push("expired"); continue; }
    try {
      const { status } = await send(cue);
      outcomes.push(status >= 200 && status < 300 ? "accepted" : "rejected");
      if (status === 404 || status === 410) break;
    } catch { outcomes.push("uncertain"); }
  }
  return outcomes;
}
