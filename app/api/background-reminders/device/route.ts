import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireActiveUser } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { isServiceType } from "@/lib/services/catalog";
import { getBackgroundPushConfig, backgroundRemindersEnabledEnvironment } from "@/lib/notifications/background-config";
import { getVerifiedSessionId, isApplePushEndpoint, parseAppleSubscription } from "@/lib/notifications/background-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

async function readSmallJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("Invalid content type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) throw new Error("Body too large");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireActiveUser(request);
    const config = getBackgroundPushConfig();
    return reply({ enabled: !!config, publicKey: config?.keys.publicKey ?? null });
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return reply({ error: resolved.message }, resolved.status);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "來源網域無效。" }, 403);
    // Preview cannot access the formal reminder tables.
    if (!backgroundRemindersEnabledEnvironment()) return reply({ error: "背景震動尚未啟用。" }, 503);
    const user = await requireActiveUser(request);
    let raw: unknown;
    try { raw = await readSmallJson(request); }
    catch { return reply({ error: "請求內容無效。" }, 400); }
    if (!raw || typeof raw !== "object") return reply({ error: "請求內容無效。" }, 400);
    const body = raw as { action?: unknown; subscription?: unknown; endpoint?: unknown; serviceType?: unknown };
    const db = getSupabaseAdminClient();
    if (body.action === "disable") {
      if (!isApplePushEndpoint(body.endpoint)) return reply({ error: "訂閱資料無效。" }, 400);
      // Allow revocation even after a production feature flag is turned off.
      const { error } = await db.rpc("disable_background_reminder_device", {
        p_user_id: user.userId, p_endpoint: body.endpoint,
      });
      if (error) return reply({ error: "尚未確認停止背景提醒，請重試。" }, 503);
      // Same response if no matching device exists, so no ownership oracle.
      return reply({ enabled: false });
    }
    if (body.action !== "register") return reply({ error: "操作無效。" }, 400);
    if (!getBackgroundPushConfig()) return reply({ error: "背景震動尚未啟用。" }, 503);
    const sub = parseAppleSubscription(body.subscription);
    if (!sub || typeof body.serviceType !== "string" || !isServiceType(body.serviceType)) {
      return reply({ error: "訂閱或堂次無效。" }, 400);
    }
    const sessionId = getVerifiedSessionId(request.headers.get("authorization"), user.userId);
    if (!sessionId) return reply({ error: "登入階段已失效，請重新登入。" }, 401);
    const { data, error } = await db.rpc("register_background_reminder_device", {
      p_user_id: user.userId, p_session_id: sessionId, p_service_type: body.serviceType, p_endpoint: sub.endpoint,
      p_p256dh: sub.keys.p256dh, p_auth_secret: sub.keys.auth,
    });
    if (error) return reply({ error: "尚未完成背景提醒註冊，請重試。" }, 503);
    const binding = Array.isArray(data) ? data[0] : null;
    if (!binding) return reply({ error: "無法綁定有效報到及此裝置，請確認堂次或重新訂閱。" }, 409);
    return reply({ enabled: true, expiresAt: binding.expires_at });
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return reply({ error: resolved.message }, resolved.status);
  }
}
