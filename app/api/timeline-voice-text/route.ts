import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  getReminderTextField,
  isReminderDetailLevel,
  isReminderTiming,
  normalizeReminderText,
} from "@/lib/voice/reminder-overrides";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Administrator-only persistent overrides. Live reminder scheduling is unchanged.
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "缺少有效的語音提醒資料。" }, { status: 400 });
    }

    const value = body as Record<string, unknown>;
    const nodeId = value.nodeId;
    if (typeof nodeId !== "string" || !nodeId.trim() || nodeId.length > 150) {
      return NextResponse.json({ error: "流程節點不正確。" }, { status: 400 });
    }
    if (!isReminderTiming(value.timing) || !isReminderDetailLevel(value.detailLevel)) {
      return NextResponse.json({ error: "提醒時機或播報方式不正確。" }, { status: 400 });
    }

    // All values must be explicit. A null text resets to the generated default;
    // an empty string is never silently treated as a successful save.
    if (!Object.hasOwn(value, "text") || (value.text !== null && typeof value.text !== "string")) {
      return NextResponse.json({ error: "播報文字格式不正確。" }, { status: 400 });
    }
    if (!Object.hasOwn(value, "expectedText") ||
        (value.expectedText !== null && typeof value.expectedText !== "string")) {
      return NextResponse.json({ error: "請重新載入最新的播報內容後再儲存。" }, { status: 400 });
    }
    const text = value.text === null ? null : normalizeReminderText(value.text as string);
    if (text !== null && (Array.from(text).length < 1 || Array.from(text).length > 600)) {
      return NextResponse.json({ error: "播報文字需為 1 至 600 字。" }, { status: 400 });
    }
    const expectedText = value.expectedText === null ? null : normalizeReminderText(value.expectedText as string);
    const field = getReminderTextField(value.timing, value.detailLevel);
    const db = getSupabaseAdminClient();

    // Database-side compare-and-update avoids silently overwriting another
    // administrator's concurrent edits. No broader timeline edits are allowed.
    let update = db.from("timeline_nodes")
      .update({ [field]: text })
      .eq("id", nodeId)
      .eq("is_active", true);
    update = expectedText === null ? update.is(field, null) : update.eq(field, expectedText);

    const { data, error } = await update.select(`id,${field}`).maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "此流程或播報文字已被其他管理員變更，請重新開啟試聽並確認最新內容。" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, nodeId: data.id, field, text: data[field] ?? null });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({
      error: authError.status === 500 ? "無法儲存播報文字，請稍後重試。" : authError.message,
    }, { status: authError.status });
  }
}
