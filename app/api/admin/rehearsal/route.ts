import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireAdmin } from "@/lib/auth/require-admin";
import { getVerifiedSessionId } from "@/lib/notifications/background-push";
import { parseRehearsalAdminAction } from "@/lib/services/rehearsal-admin-contract";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Preview currently shares the production database. Keep even read access
// disabled there. The rollout flag must remain off until the complete feature
// and isolated environment have been verified.
function enabled() {
  return process.env.VERCEL_ENV === "production" && process.env.ENABLE_SERVICE_REHEARSAL === "true";
}

async function smallJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("Invalid content type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32_768) throw new Error("Body too large");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function rpcError(error: { code?: string }) {
  if (error.code === "42501") return reply({ error: "演練權限或參與資格已變更，請重新登入。" }, 403);
  if (error.code === "23505") return reply({ error: "已有演練進行中，請重新整理。" }, 409);
  if (error.code === "22023" || error.code === "23502") return reply({ error: "演練資料無效或已結束，請確認演練範本。" }, 409);
  return reply({ error: "尚未確認演練操作，請重新整理後再試。" }, 503);
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!enabled()) return reply({ enabled: false });
    const sessionId = getVerifiedSessionId(request.headers.get("authorization"), admin.userId);
    if (!sessionId) return reply({ error: "登入階段已失效，請重新登入。" }, 401);
    const { data, error } = await getSupabaseAdminClient().rpc("get_service_rehearsal_admin_state", {
      p_actor: admin.userId, p_session: sessionId,
    });
    if (error) return rpcError(error);
    if (!data || typeof data !== "object" || Array.isArray(data)) return reply({ error: "無法讀取演練狀態。" }, 503);
    return reply({ enabled: true, ...data });
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return reply({ error: resolved.message }, resolved.status);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "來源網域無效。" }, 403);
    const admin = await requireAdmin(request);
    if (!enabled()) return reply({ error: "服事演練尚未開放。" }, 503);
    const sessionId = getVerifiedSessionId(request.headers.get("authorization"), admin.userId);
    if (!sessionId) return reply({ error: "登入階段已失效，請重新登入。" }, 401);
    let raw: unknown;
    try { raw = await smallJson(request); } catch { return reply({ error: "請求內容無效。" }, 400); }
    const action = parseRehearsalAdminAction(raw);
    if (!action) return reply({ error: "請確認演練操作及範本。" }, 400);
    const db = getSupabaseAdminClient();
    const actor = { p_actor: admin.userId, p_session: sessionId };
    const result = action.action === "start"
      ? await db.rpc("start_service_rehearsal", { ...actor, p_service_type: action.serviceType })
      : await db.rpc("end_service_rehearsal", { ...actor, p_rehearsal: action.rehearsalId });
    if (result.error) return rpcError(result.error);
    return reply({ ok: true });
  } catch (error) {
    const resolved = getAuthErrorResponse(error);
    return reply({ error: resolved.message }, resolved.status);
  }
}
