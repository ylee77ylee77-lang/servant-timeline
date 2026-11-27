import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireCoordinator } from "@/lib/auth/require-admin";
import { isChurchNetworkRequest } from "@/lib/network/church-wifi";
import { getVerifiedSessionId } from "@/lib/notifications/background-push";
import { serviceRehearsalEnabled } from "@/lib/services/rehearsal-config";
import { parseRehearsalParticipantAction } from "@/lib/services/rehearsal-participant-contract";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function readBody(request: NextRequest): Promise<unknown> {
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
      if (size > 4096) throw new Error("Body too large");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function rpcError(error: { code?: string }) {
  if (error.code === "42501") return reply({ error: "演練資格或登入狀態已變更，請重新登入。" }, 403);
  if (error.code === "22023") return reply({ error: "演練已結束或任務無效，請重新整理。" }, 409);
  if (error.code === "55000") return reply({ error: "目前無法進行演練，請確認報到狀態（正式服事優先）。" }, 409);
  return reply({ error: "尚未確認演練狀態，請重新整理後再試。" }, 503);
}

export async function GET(request: NextRequest) {
  try {
    if (!serviceRehearsalEnabled()) return reply({ enabled: false });
    const user = await requireCoordinator(request);
    const sessionId = getVerifiedSessionId(request.headers.get("authorization"), user.userId);
    if (!sessionId) return reply({ error: "登入階段已失效，請重新登入。" }, 401);
    const { data, error } = await getSupabaseAdminClient().rpc("get_service_rehearsal_participant_state", {
      p_actor: user.userId, p_session: sessionId,
    });
    if (error) return rpcError(error);
    if (!data || typeof data !== "object" || Array.isArray(data)) return reply({ error: "無法讀取演練狀態。" }, 503);
    return reply({ ...data, enabled: true, onChurchNetwork: isChurchNetworkRequest(request) });
  } catch (error) {
    const auth = getAuthErrorResponse(error);
    return reply({ error: auth.message }, auth.status);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "來源網域無效。" }, 403);
    if (!serviceRehearsalEnabled()) return reply({ error: "服事演練尚未開放。" }, 503);
    const user = await requireCoordinator(request);
    const sessionId = getVerifiedSessionId(request.headers.get("authorization"), user.userId);
    if (!sessionId) return reply({ error: "登入階段已失效，請重新登入。" }, 401);
    let raw: unknown;
    try { raw = await readBody(request); } catch { return reply({ error: "請求內容無效。" }, 400); }
    const action = parseRehearsalParticipantAction(raw);
    if (!action) return reply({ error: "演練操作無效。" }, 400);
    const actor = { p_actor: user.userId, p_session: sessionId, p_rehearsal: action.rehearsalId };
    const db = getSupabaseAdminClient();
    if (action.action === "check-in") {
      const onChurchNetwork = isChurchNetworkRequest(request);
      if (!onChurchNetwork) return reply({ error: "請先確認網路連線後再試。" }, 403);
      const { data, error } = await db.rpc("check_in_service_rehearsal", { ...actor, p_on_church_network: onChurchNetwork });
      if (error) return rpcError(error);
      if (typeof data !== "string") return reply({ error: "尚未確認報到，請重新整理。" }, 503);
      return reply({ ok: true, checkedInAt: data });
    }
    const { data, error } = await db.rpc("set_service_rehearsal_item", { ...actor, p_item: action.itemId, p_completed: action.completed });
    if (error) return rpcError(error);
    if (typeof data !== "boolean") return reply({ error: "尚未確認任務狀態，請重新整理。" }, 503);
    return reply({ ok: true, completed: data });
  } catch (error) {
    const auth = getAuthErrorResponse(error);
    return reply({ error: auth.message }, auth.status);
  }
}
