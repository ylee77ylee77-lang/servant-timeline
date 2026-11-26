import { after, NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthErrorResponse } from "@/lib/auth/require-admin";
import { isApplePushEndpoint, sendEmptyApplePush, type VapidKeys } from "@/lib/notifications/apple-empty-push";
import { createPreviewTaskPushPlan, runPreviewTaskPushPlan, PREVIEW_TASK_TTL_SECONDS } from "@/lib/notifications/preview-task-push-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bounded, preview-only tests never save PushSubscription records or change worship schedules.
const lastTestByUser = new Map<string, number>();

function testCredentials(): VapidKeys | null {
  if (process.env.VERCEL_ENV !== "preview" || process.env.ENABLE_SERVER_PUSH_TEST !== "true") {
    return null;
  }
  const publicKey = String(process.env.WEB_PUSH_TEST_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_TEST_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_TEST_VAPID_SUBJECT || "").trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const keys = testCredentials();
    return NextResponse.json({
      enabled: Boolean(keys),
      publicKey: keys?.publicKey ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin(request);
    const origin = request.headers.get("origin");
    if (origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "來源網域無效。" }, { status: 403 });
    }

    const keys = testCredentials();
    if (!keys) {
      return NextResponse.json({ error: "此預覽環境尚未啟用伺服器推播測試。" }, { status: 503 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4096) {
      return NextResponse.json({ error: "請求內容過長。" }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "請求內容過長。" }, { status: 413 });
    let body: { endpoint?: unknown; mode?: unknown; vibrationEnabled?: unknown } | null = null;
    try { body = JSON.parse(raw); } catch { /* invalid JSON */ }
    if (!body || !isApplePushEndpoint(body.endpoint)) {
      return NextResponse.json({ error: "無效的 iPhone 推播訂閱。" }, { status: 400 });
    }

    const mode = body.mode ?? "single";
    if (mode !== "single" && mode !== "sequence") {
      return NextResponse.json({ error: "無效的測試模式。" }, { status: 400 });
    }
    if (mode === "sequence" && body.vibrationEnabled !== true) {
      return NextResponse.json({ error: "請先開啟本次測試的震動提醒。" }, { status: 400 });
    }

    // One fixed test per user per minute. This is preview-only defense in depth,
    // not a distributed production rate limiter.
    const now = Date.now();
    if (lastTestByUser.size > 1000) lastTestByUser.clear();
    const lastTest = lastTestByUser.get(actor.userId) ?? 0;
    if (now - lastTest < 60_000) {
      return NextResponse.json({ error: "請至少間隔一分鐘再測試。" }, { status: 429 });
    }
    lastTestByUser.set(actor.userId, now);

    const endpoint = body.endpoint;
    if (mode === "sequence") {
      const plan = createPreviewTaskPushPlan(now);
      after(async () => {
        const results = await runPreviewTaskPushPlan(plan, () => sendEmptyApplePush(endpoint, keys, fetch, PREVIEW_TASK_TTL_SECONDS));
        // Only the fixed cue numbers and provider response states are logged.
        console.info("Preview Apple task sequence completed", { results });
      });
      return NextResponse.json({
        accepted: true,
        plan,
        message: "三個模擬任務已交給伺服器，請立即鎖屏。",
      }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    after(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 15_000));
      try {
        const result = await sendEmptyApplePush(endpoint, keys);
        // Never log the secret subscription endpoint, VAPID keys, or user data.
        console.info("Preview Apple Web Push test completed", { ok: result.ok, status: result.status });
      } catch {
        console.warn("Preview Apple Web Push test failed without exposing subscription information");
      }
    });

    return NextResponse.json({
      accepted: true,
      message: "測試請求已交給伺服器，請立即鎖定 iPhone。是否真正收到通知仍須以實機為準。",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
