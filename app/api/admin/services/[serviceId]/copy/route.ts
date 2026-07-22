import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isServiceType, SERVICE_DAY_BY_TYPE } from "@/lib/services/catalog";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const COPY_STATUSES = new Set(["draft", "published"]);
type Context = { params: Promise<{ serviceId: string }> };

function responseError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status) || 500
    : 500;
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "23505") {
    return NextResponse.json({ error: "所選日期已經有相同堂次。" }, { status: 409 });
  }
  return NextResponse.json({
    error: status < 500 && error instanceof Error ? error.message : "無法複製場次。",
  }, { status });
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function realDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return !Number.isNaN(date.getTime())
    && new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) === value;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { serviceId } = await context.params;
    if (!UUID_PATTERN.test(serviceId)) fail("場次識別資料無效。");
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const serviceDate = String(body.serviceDate ?? "").trim();
    const startsAt = String(body.startsAt ?? "").trim();
    const reportAt = String(body.reportAt ?? "").trim();
    const location = String(body.location ?? "").normalize("NFKC").trim();
    const notes = String(body.notes ?? "").trim();
    const status = String(body.status ?? "draft");
    const includeAssignments = body.includeAssignments === true;

    if (!realDate(serviceDate) || !TIME_PATTERN.test(startsAt) || !TIME_PATTERN.test(reportAt)) {
      fail("日期、報到時間或開始時間格式無效。");
    }
    if (!location || location.length > 120 || notes.length > 2000 || !COPY_STATUSES.has(status)) {
      fail("地點、備註或場次狀態無效。");
    }
    const startsAtIso = `${serviceDate}T${startsAt}:00+08:00`;
    const reportAtIso = `${serviceDate}T${reportAt}:00+08:00`;
    if (new Date(reportAtIso).getTime() > new Date(startsAtIso).getTime()) {
      fail("報到時間不得晚於崇拜開始時間。");
    }

    const supabase = getSupabaseUserClient(request);
    const { data: source, error: sourceError } = await supabase
      .from("worship_services")
      .select("service_type")
      .eq("id", serviceId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source || !isServiceType(source.service_type)) fail("找不到來源場次。", 404);
    const serviceDay = new Date(`${serviceDate}T12:00:00+08:00`).getUTCDay();
    if (serviceDay !== SERVICE_DAY_BY_TYPE[source.service_type]) {
      fail(`${source.service_type} 不符合所選日期的星期。`);
    }

    const { data, error } = await supabase.rpc("copy_worship_service_schedule", {
      p_source_service_id: serviceId,
      p_service_date: serviceDate,
      p_starts_at: startsAtIso,
      p_report_at: reportAtIso,
      p_location: location,
      p_notes: notes || null,
      p_status: status,
      p_include_assignments: includeAssignments,
    });
    if (error) throw error;
    const targetServiceId = String(data ?? "");
    if (!UUID_PATTERN.test(targetServiceId)) throw new Error("Copy RPC returned an invalid service id");
    return NextResponse.json({
      ok: true,
      serviceId: targetServiceId,
      message: includeAssignments
        ? "已複製場次、任務、清單、必備物品及排班；同工狀態已重設為待確認。"
        : "已複製場次、任務、清單與必備物品；排班未複製。",
    }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
