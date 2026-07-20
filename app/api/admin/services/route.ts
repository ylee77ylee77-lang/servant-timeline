import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireAdmin, requireCoordinator } from "@/lib/auth/require-admin";
import {
  inferStationRole,
  isServiceType,
  SERVICE_DAY_BY_TYPE,
  STATION_OPTIONS_BY_SERVICE,
} from "@/lib/services/catalog";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(value: string) {
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

export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);
    const { data, error } = await getSupabaseUserClient(request)
      .from("worship_services")
      .select("id,service_date,service_type,starts_at,report_at,location,status")
      .order("service_date", { ascending: false })
      .order("starts_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    return NextResponse.json({ services: data ?? [] });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const serviceDate = String(body.serviceDate ?? "").trim();
    const serviceType = String(body.serviceType ?? "").trim();
    const startsAt = String(body.startsAt ?? "").trim();
    const reportAt = String(body.reportAt ?? "").trim();
    const location = String(body.location ?? "夏凱納靈糧堂").normalize("NFKC").trim();

    if (!isRealDate(serviceDate) || !isServiceType(serviceType)) {
      return NextResponse.json({ error: "場次日期或堂次無效。" }, { status: 400 });
    }
    const serviceDay = new Date(`${serviceDate}T12:00:00+08:00`).getUTCDay();
    if (serviceDay !== SERVICE_DAY_BY_TYPE[serviceType]) {
      return NextResponse.json({ error: `${serviceType} 不符合所選日期的星期。` }, { status: 400 });
    }
    if (!TIME_PATTERN.test(startsAt) || !TIME_PATTERN.test(reportAt)) {
      return NextResponse.json({ error: "報到及開始時間格式無效。" }, { status: 400 });
    }
    if (!location || location.length > 120) {
      return NextResponse.json({ error: "地點需為 1–120 字元。" }, { status: 400 });
    }

    const startsAtIso = `${serviceDate}T${startsAt}:00+08:00`;
    const reportAtIso = `${serviceDate}T${reportAt}:00+08:00`;
    if (new Date(reportAtIso).getTime() > new Date(startsAtIso).getTime()) {
      return NextResponse.json({ error: "報到時間不得晚於崇拜開始時間。" }, { status: 400 });
    }

    const supabase = getSupabaseUserClient(request);
    const { data: existing, error: lookupError } = await supabase
      .from("worship_services")
      .select("id,status")
      .eq("service_date", serviceDate)
      .eq("service_type", serviceType)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && ["completed", "cancelled"].includes(String(existing.status))) {
      return NextResponse.json({ error: "已完成或取消的場次不能重新開放。" }, { status: 409 });
    }

    const servicePayload = {
      service_date: serviceDate,
      service_type: serviceType,
      starts_at: startsAtIso,
      report_at: reportAtIso,
      location,
      status: "published",
      updated_by: admin.userId,
      ...(existing ? {} : { created_by: admin.userId }),
    };

    const serviceQuery = existing
      ? supabase.from("worship_services").update(servicePayload).eq("id", existing.id)
      : supabase.from("worship_services").insert(servicePayload);
    const { data: serviceRows, error: serviceError } = await serviceQuery
      .select("id,service_date,service_type,starts_at,report_at,location,status");
    if (serviceError || !serviceRows?.[0]) throw serviceError || new Error("Service write failed");

    const service = serviceRows[0];
    const stations = STATION_OPTIONS_BY_SERVICE[serviceType].map((name, index) => ({
      service_id: service.id,
      name,
      role_label: inferStationRole(name),
      sort_order: index,
      is_active: true,
    }));
    const { error: stationError } = await supabase
      .from("service_stations")
      .upsert(stations, { onConflict: "service_id,name" });
    if (stationError) throw stationError;

    return NextResponse.json({ ok: true, service, stationCount: stations.length });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
