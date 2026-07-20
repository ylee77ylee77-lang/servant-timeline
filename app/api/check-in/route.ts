import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireActiveUser } from "@/lib/auth/require-admin";
import { isChurchNetworkRequest } from "@/lib/network/church-wifi";
import { isServiceType, STATION_OPTIONS_BY_SERVICE } from "@/lib/services/catalog";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function taipeiDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function findPublishedService(request: NextRequest, serviceType: string) {
  const { data, error } = await getSupabaseUserClient(request)
    .from("worship_services")
    .select("id,service_date,service_type,status")
    .eq("service_date", taipeiDateKey())
    .eq("service_type", serviceType)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    const supabase = getSupabaseUserClient(request);
    const { data: services, error: serviceError } = await supabase
      .from("worship_services")
      .select("id,service_date,service_type,status")
      .eq("service_date", taipeiDateKey())
      .in("status", ["published", "completed"]);
    if (serviceError) throw serviceError;
    if (!services?.length) return NextResponse.json({ checkIn: null });

    const { data: checkIn, error: checkInError } = await supabase
      .from("service_check_ins")
      .select("id,service_id,assignment_id,status,checked_in_at")
      .eq("user_id", user.userId)
      .in("service_id", services.map((service) => service.id))
      .in("status", ["checked_in", "station_confirmed"])
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (checkInError) throw checkInError;
    if (!checkIn) return NextResponse.json({ checkIn: null });

    const service = services.find((item) => item.id === checkIn.service_id);
    const { data: confirmation, error: confirmationError } = await supabase
      .from("check_in_station_confirmations")
      .select("station_name_snapshot,confirmed_at,confirmation_source")
      .eq("check_in_id", checkIn.id)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (confirmationError) throw confirmationError;

    return NextResponse.json({
      checkIn: {
        id: checkIn.id,
        assignmentId: checkIn.assignment_id,
        status: checkIn.status,
        checkedInAt: checkIn.checked_in_at,
        serviceDate: service?.service_date ?? taipeiDateKey(),
        serviceType: service?.service_type ?? "",
        stationName: confirmation?.station_name_snapshot ?? "",
        confirmedAt: confirmation?.confirmed_at ?? null,
      },
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    if (!isChurchNetworkRequest(request)) {
      return NextResponse.json({ error: "請連接教會網路後再進行報到或崗位確認。" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const serviceType = String(body.serviceType ?? "").trim();
    const assignmentId = String(body.assignmentId ?? "").trim();
    if (!isServiceType(serviceType)) {
      return NextResponse.json({ error: "堂次無效。" }, { status: 400 });
    }
    if (!UUID_PATTERN.test(assignmentId)) {
      return NextResponse.json({ error: "請先確認本次服事分派。" }, { status: 400 });
    }

    const service = await findPublishedService(request, serviceType);
    if (!service) {
      return NextResponse.json({ error: "今日場次尚未由總招開放，請聯絡總招。" }, { status: 409 });
    }

    // Authenticated clients have no direct INSERT grant on operational check-in
    // tables. Only this network-gated server route may perform these writes.
    const supabase = getSupabaseAdminClient();
    const { data: assignment, error: assignmentError } = await supabase
      .from("service_assignments")
      .select("id,service_id,user_id,station_id,status")
      .eq("id", assignmentId)
      .eq("service_id", service.id)
      .eq("user_id", user.userId)
      .in("status", ["scheduled", "confirmed"])
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return NextResponse.json({ error: "你沒有此場次的有效服事分派。" }, { status: 403 });
    }

    const { data: existingCheckIn, error: lookupError } = await supabase
      .from("service_check_ins")
      .select("id,service_id,assignment_id,status,checked_in_at")
      .eq("service_id", service.id)
      .eq("user_id", user.userId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existingCheckIn?.status === "cancelled") {
      return NextResponse.json(
        { error: "此報到已取消，請聯絡總招重新啟用。" },
        { status: 409 }
      );
    }
    if (existingCheckIn && existingCheckIn.assignment_id !== assignment.id) {
      return NextResponse.json(
        { error: "此場次已使用另一個服事分派完成報到，請聯絡帶領者／協調員。" },
        { status: 409 }
      );
    }

    if (action === "check_in") {
      if (existingCheckIn) return NextResponse.json({ ok: true, checkIn: existingCheckIn });
      const { data, error } = await supabase
        .from("service_check_ins")
        .insert({ service_id: service.id, user_id: user.userId, assignment_id: assignment.id, status: "checked_in", check_in_source: "web" })
        .select("id,service_id,assignment_id,status,checked_in_at")
        .single();
      if (error?.code === "23505") {
        // Concurrent retries can both pass the lookup. Resolve the unique-key
        // race by returning the row that won instead of surfacing a 500.
        const { data: racedCheckIn, error: raceLookupError } = await supabase
          .from("service_check_ins")
          .select("id,service_id,assignment_id,status,checked_in_at")
          .eq("service_id", service.id)
          .eq("user_id", user.userId)
          .maybeSingle();
        if (raceLookupError) throw raceLookupError;
        if (racedCheckIn?.status === "cancelled") {
          return NextResponse.json(
            { error: "此報到已取消，請聯絡總招重新啟用。" },
            { status: 409 }
          );
        }
        if (racedCheckIn && racedCheckIn.assignment_id !== assignment.id) {
          return NextResponse.json(
            { error: "此場次已使用另一個服事分派完成報到，請聯絡帶領者／協調員。" },
            { status: 409 }
          );
        }
        if (racedCheckIn) return NextResponse.json({ ok: true, checkIn: racedCheckIn });
      }
      if (error) throw error;
      return NextResponse.json({ ok: true, checkIn: data }, { status: 201 });
    }

    if (action === "confirm_station") {
      if (!existingCheckIn) {
        return NextResponse.json({ error: "請先完成報到，再確認崗位。" }, { status: 409 });
      }
      const stationName = String(body.stationName ?? "").normalize("NFKC").trim();
      if (!STATION_OPTIONS_BY_SERVICE[serviceType].includes(stationName)) {
        return NextResponse.json({ error: "崗位不在此堂次的有效清單中。" }, { status: 400 });
      }
      const source = body.source === "manual" ? "manual" : "qr";
      if (!assignment.station_id) {
        return NextResponse.json({ error: "帶領者／協調員尚未分派崗位。" }, { status: 409 });
      }
      const { data: station, error: stationError } = await supabase
        .from("service_stations")
        .select("id,name")
        .eq("service_id", service.id)
        .eq("name", stationName)
        .eq("is_active", true)
        .maybeSingle();
      if (stationError) throw stationError;
      if (!station) return NextResponse.json({ error: "此崗位尚未開放。" }, { status: 409 });
      if (station.id !== assignment.station_id) {
        return NextResponse.json({ error: "這不是分派給你的崗位，請確認名牌。" }, { status: 403 });
      }

      const { data: existingConfirmation, error: existingError } = await supabase
        .from("check_in_station_confirmations")
        .select("id,station_name_snapshot,confirmed_at")
        .eq("check_in_id", existingCheckIn.id)
        .eq("station_id", station.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingConfirmation) {
        return NextResponse.json({ ok: true, confirmation: existingConfirmation });
      }

      const { data, error } = await supabase
        .from("check_in_station_confirmations")
        .insert({
          check_in_id: existingCheckIn.id,
          service_id: service.id,
          user_id: user.userId,
          station_id: station.id,
          station_name_snapshot: station.name,
          confirmation_source: source,
        })
        .select("id,station_name_snapshot,confirmed_at")
        .single();
      if (error?.code === "23505") {
        const { data: racedConfirmation, error: raceLookupError } = await supabase
          .from("check_in_station_confirmations")
          .select("id,station_name_snapshot,confirmed_at")
          .eq("check_in_id", existingCheckIn.id)
          .eq("station_id", station.id)
          .maybeSingle();
        if (raceLookupError) throw raceLookupError;
        if (racedConfirmation) {
          return NextResponse.json({ ok: true, confirmation: racedConfirmation });
        }
      }
      if (error) throw error;
      return NextResponse.json({ ok: true, confirmation: data }, { status: 201 });
    }

    return NextResponse.json({ error: "不支援的報到動作。" }, { status: 400 });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
