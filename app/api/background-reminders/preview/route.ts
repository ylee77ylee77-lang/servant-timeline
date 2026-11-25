import { NextRequest, NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import { requireAdmin, getAuthErrorResponse } from "@/lib/auth/require-admin";
import { parseAppleSubscription, sendBackgroundPush, validVapidKeys } from "@/lib/notifications/background-push";
import { buildPreviewReminderPlan, runPreviewReminderPlan } from "@/lib/notifications/preview-reminder-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function previewKeys() {
  if (process.env.VERCEL_ENV !== "preview"
    || process.env.VERCEL_GIT_COMMIT_REF !== "feature/background-task-reminder-scheduler"
    || process.env.ENABLE_BACKGROUND_REMINDER_PREVIEW !== "true") return null;
  const keys = {
    subject: (process.env.BACKGROUND_PREVIEW_VAPID_SUBJECT ?? "").trim(),
    publicKey: (process.env.BACKGROUND_PREVIEW_VAPID_PUBLIC_KEY ?? "").trim(),
    privateKey: (process.env.BACKGROUND_PREVIEW_VAPID_PRIVATE_KEY ?? "").trim(),
  };
  return validVapidKeys(keys) ? keys : null;
}

async function readBoundedBody(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("Invalid type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) throw new Error("Too large");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Process-local preview defense in depth; no production database mutations.
const recent = new Map<string, number>();
function reserve(userId: string, endpoint: string, now: number) {
  for (const [key, until] of recent) if (until <= now) recent.delete(key);
  const device = "device:" + createHash("sha256").update(endpoint).digest("hex");
  const account = "user:" + userId;
  if (recent.size >= 128 || recent.has(device) || recent.has(account)) return false;
  recent.set(device, now + 60_000);
  recent.set(account, now + 60_000);
  return true;
}

export async function GET(request: NextRequest) {
  const keys = previewKeys();
  if (!keys) return reply({ enabled: false }, 404);
  try {
    await requireAdmin(request);
    return reply({ enabled: true, publicKey: keys.publicKey });
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return reply({ error: resolved.message }, resolved.status);
  }
}

export async function POST(request: NextRequest) {
  const keys = previewKeys();
  if (!keys) return reply({ error: "測試未開放。" }, 404);
  if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "來源網域無效。" }, 403);
  try {
    const admin = await requireAdmin(request);
    let raw: unknown;
    try { raw = await readBoundedBody(request); }
    catch { return reply({ error: "測試資料無效。" }, 400); }
    const body = raw && typeof raw === "object" ? raw as { subscription?: unknown; vibrationEnabled?: unknown } : null;
    const subscription = parseAppleSubscription(body?.subscription);
    if (!subscription || body?.vibrationEnabled !== true) return reply({ error: "請先開啟震動提醒及允許系統通知。" }, 400);
    const now = Date.now();
    if (!reserve(admin.userId, subscription.endpoint, now)) return reply({ error: "本輪測試尚未結束，請稍後再試。" }, 429);
    const plan = buildPreviewReminderPlan(now);
    after(async () => {
      const results = await runPreviewReminderPlan(plan, cue => sendBackgroundPush(subscription, cue, keys), async () => {
        const current = await requireAdmin(request);
        return current.userId === admin.userId && !!previewKeys();
      });
      console.info("Background reminder preview result", { results });
    });
    return reply({ accepted: true, offsets: [15, 30, 45] }, 202);
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return reply({ error: resolved.message }, resolved.status);
  }
}
