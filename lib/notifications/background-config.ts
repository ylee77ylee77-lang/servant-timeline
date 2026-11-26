import "server-only";
import { validVapidKeys, type PushKeys } from "@/lib/notifications/background-push";

export function backgroundRemindersEnabledEnvironment() {
  // Preview currently shares the production database. Never enable a preview
  // API against that database, even if it receives a misconfigured flag.
  return process.env.VERCEL_ENV === "production";
}

function readProductionPushConfig(): { keys: PushKeys; dispatcherSecret: string } | null {
  if (!backgroundRemindersEnabledEnvironment()) return null;
  const keys = {
    subject: (process.env.WEB_PUSH_VAPID_SUBJECT ?? "").trim(),
    publicKey: (process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim(),
    privateKey: (process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "").trim(),
  };
  const dispatcherSecret = (process.env.BACKGROUND_REMINDER_DISPATCH_SECRET ?? "").trim();
  if (!validVapidKeys(keys) || dispatcherSecret.length < 32 || dispatcherSecret.length > 512) return null;
  return { keys, dispatcherSecret };
}

export function getBackgroundPushConfig() {
  return process.env.ENABLE_BACKGROUND_TASK_REMINDERS === "true" ? readProductionPushConfig() : null;
}

// Independent rollout switch; enabling admin testing never enables formal sends.
export function getAdminTimelinePushConfig() {
  return process.env.ENABLE_ADMIN_TIMELINE_VIBRATION_TEST === "true" ? readProductionPushConfig() : null;
}
