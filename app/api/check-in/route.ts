import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth/require-admin";
import { isChurchNetworkRequest } from "@/lib/network/church-wifi";
import { isServiceType, STATION_OPTIONS_BY_SERVICE } from "@/lib/services/catalog";
import { ensureCheckInAssignment } from "@/lib/services/check-in-assignment";
import { isUuid } from "@/lib/services/check-in";
import { getLeadCheckInScope } from "@/lib/services/lead-check-in";
import { isLeadServiceOpen } from "@/lib/services/service-activation";
import { ensureCurrentServices } from "@/lib/services/ensure-current-services";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
  const message =
    status < 500 && error instanceof Error
      ? error.message
      : "伺服器無法完成報到操作。";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    const current = await ensureCurrentServices();
    const supabase = getSupabaseUserClient(request);
    const services = current.services.filter((service) =>
      ["published", "completed"].includes(String(service.status))
    );
    const leadScope = await getLeadCheckInScope(request, user, services.map(({ id }) => id));
    const isLead = leadScope.enabled;
    const openServices = services.filter((service) =>
      service.status === "published" && isServiceType(service.service_type)
      && (isLead ? isLeadServiceOpen(service.service_type, current)
        : current.activeServiceTypes.includes(service.service_type))
    );
    const leadServiceTypes = openServices.filter(({ id }) => leadScope.assignedServiceIds.has(id))
      .map(({ service_type }) => service_type);
    if (!services.length) {
      return NextResponse.json({
        checkIn: null,
        eligibleServices: [],
        activeServiceTypes: current.activeServiceTypes,
      });
    }

    const { data: assignments, error: assignmentError } = openServices.length
      ? await supabase
          .from("service_assignments")
          .select("id,service_id,role_label,status,created_at")
          .eq("user_id", user.userId)
          .in("service_id", openServices.map((service) => service.id))
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (assignmentError) throw assignmentError;

    const eligibleServices = openServices.flatMap((service) => {
      if (!isServiceType(service.service_type)) return [];

      const serviceAssignments = (assignments ?? []).filter(
        (assignment) => assignment.service_id === service.id
      );
      const activeAssignments = serviceAssignments.filter((assignment) =>
        ["scheduled", "confirmed"].includes(String(assignment.status))
      );
      const activeAssignment = (isLead
        ? activeAssignments.find((assignment) => assignment.role_label === "總招")
        : undefined) ?? activeAssignments[0];
      const blocked = !activeAssignment && serviceAssignments.some((assignment) =>
        ["declined", "cancelled"].includes(String(assignment.status))
      );

      if (blocked) return [];
      return [{
        serviceType: service.service_type,
        assignmentId: activeAssignment?.id ?? null,
      }];
    });

    const { data: checkIns, error: checkInError } = await supabase
      .from("service_check_ins")
      .select("id,service_id,assignment_id,status,checked_in_at")
      .eq("user_id", user.userId)
      .in("service_id", services.map((service) => service.id))
      .in("status", ["checked_in", "station_confirmed"])
      .order("checked_in_at", { ascending: false });
    if (checkInError) throw checkInError;
    const activeIds = new Set(openServices.map(({ id }) => id));
    const activeCheckIns = (checkIns ?? []).filter((row) => activeIds.has(row.service_id));
    const checkIn = (isLead ? activeCheckIns : checkIns ?? [])[0];
    const responseContext = {
      eligibleServices,
      activeServiceTypes: current.activeServiceTypes,
      isLead,
      leadServiceTypes,
      leadReportOpensAt: services.some((service) => service.service_type === "主二堂"
        && leadScope.assignedServiceIds.has(service.id)) && current.minuteOfDay < 8 * 60 ? "08:00" : null,
      activeCheckInTypes: openServices.filter(({ id }) =>
        activeCheckIns.some((row) => row.service_id === id)
      ).map(({ service_type }) => service_type),
      endedServiceType: isLead
        ? services.find(({ id }) => id === checkIns?.find((row) => !activeIds.has(row.service_id))?.service_id)
          ?.service_type ?? null
        : null,
    };
    if (!checkIn) return NextResponse.json({ ...responseContext, checkIn: null });

    const service = services.find((item) => item.id === checkIn.service_id);
    const { data: taskStates, error: taskError } = isLead && checkIn.assignment_id
      ? await supabase.from("assignment_checklist_states").select("id")
        .eq("assignment_id", checkIn.assignment_id).limit(1)
      : { data: [], error: null };
    if (taskError) throw taskError;
    const { data: confirmation, error: confirmationError } = await supabase
      .from("check_in_station_confirmations")
      .select("station_name_snapshot,confirmed_at,confirmation_source")
      .eq("check_in_id", checkIn.id)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (confirmationError) throw confirmationError;

    return NextResponse.json({
      ...responseContext,
      canCorrect: isLead && checkIn.status === "checked_in" && !confirmation && !taskStates?.length,
      checkIn: {
        id: checkIn.id,
        assignmentId: checkIn.assignment_id,
        status: checkIn.status,
        checkedInAt: checkIn.checked_in_at,
        serviceDate: service?.service_date ?? current.dateKey,
        serviceType: service?.service_type ?? "",
        stationName: confirmation?.station_name_snapshot ?? "",
        confirmedAt: confirmation?.confirmed_at ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
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
    if (!isServiceType(serviceType)) {
      return NextResponse.json({ error: "堂次無效。" }, { status: 400 });
    }

    const current = await ensureCurrentServices();
    const published = current.services.filter((item) => item.status === "published");
    const leadScope = await getLeadCheckInScope(request, user, current.services
      .filter(({ status }) => status === "published" || status === "completed").map(({ id }) => id));
    const service = published.find((item) => item.service_type === serviceType);
    if (!(leadScope.enabled ? isLeadServiceOpen(serviceType, current) : current.activeServiceTypes.includes(serviceType))) {
      return NextResponse.json({ error: "目前不在此堂次的開放時間內。" }, { status: 409 });
    }
    if (!service) {
      return NextResponse.json({ error: "今日場次目前未開放，請聯絡總招。" }, { status: 409 });
    }

    if (action === "correct_service") {
      if (!leadScope.enabled) {
        return NextResponse.json({ error: "僅總招可更正自己的堂次。" }, { status: 403 });
      }
      const sourceId = body.checkInId;
      if (typeof sourceId !== "string" || !isUuid(sourceId)) {
        return NextResponse.json({ error: "找不到原堂報到紀錄，請重新整理。" }, { status: 400 });
      }
      const db = getSupabaseAdminClient();
      const { data: source, error: sourceError } = await db
        .from("service_check_ins").select("service_id").eq("id", sourceId)
        .eq("user_id", user.userId).maybeSingle();
      if (sourceError) throw sourceError;
      const sourceService = published.find(({ id }) => id === source?.service_id);
      if (!sourceService || sourceService.id === service.id || !isServiceType(sourceService.service_type)
        || !isLeadServiceOpen(sourceService.service_type, current)) {
        return NextResponse.json({ error: "原堂已結束或無法更正，請確認目前報到狀態。" }, { status: 409 });
      }
      const { data, error } = await db.rpc("correct_lead_check_in", {
        p_user_id: user.userId,
        p_check_in_id: sourceId,
        p_target_service_id: service.id,
        p_ministry_group: user.ministryGroup || null,
      });
      if (error?.code === "P0001" || error?.code === "23505") {
        return NextResponse.json({ error: "無法更正堂次。請確認原堂尚無崗位或任務紀錄，且目標堂次可以報到。" }, { status: 409 });
      }
      if (error) throw error;
      const checkIn = Array.isArray(data) ? data[0] : data;
      if (!checkIn?.id) throw new Error("Missing corrected check-in");
      return NextResponse.json({ serviceType, assignmentId: checkIn.assignment_id, checkIn });
    }

    // Authenticated clients have no direct INSERT grant on operational check-in
    // tables. Only this network-gated server route may create a placeholder
    // assignment and write operational check-in state.
    const supabase = getSupabaseAdminClient();
    const { data: existingCheckIn, error: lookupError } = await supabase
      .from("service_check_ins")
      .select("id,service_id,assignment_id,status,checked_in_at")
      .eq("service_id", service.id)
      .eq("user_id", user.userId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existingCheckIn?.status === "cancelled") {
      if (leadScope.enabled && action === "check_in") {
        const { data, error } = await supabase.rpc("reopen_corrected_lead_check_in", {
          p_user_id: user.userId,
          p_check_in_id: existingCheckIn.id,
        });
        if (error) throw error;
        const checkIn = Array.isArray(data) ? data[0] : data;
        if (checkIn?.id) {
          return NextResponse.json({ ok: true, serviceType, assignmentId: checkIn.assignment_id, checkIn });
        }
      }
      return NextResponse.json(
        { error: "此報到已取消，請聯絡管理員重新啟用。" },
        { status: 409 }
      );
    }

    let assignment = null;
    if (existingCheckIn?.assignment_id) {
      const { data: existingAssignment, error: assignmentError } = await supabase
        .from("service_assignments")
        .select("id,service_id,user_id,station_id,role_label,status")
        .eq("id", existingCheckIn.assignment_id)
        .eq("service_id", service.id)
        .eq("user_id", user.userId)
        .in("status", ["scheduled", "confirmed", "completed"])
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      assignment = existingAssignment;
    }

    if (action === "check_in") {
      if (existingCheckIn) {
        return NextResponse.json({
          ok: true,
          serviceType: service.service_type,
          assignmentId: existingCheckIn.assignment_id,
          checkIn: existingCheckIn,
        });
      }

      assignment = await ensureCheckInAssignment({
        service,
        userId: user.userId,
        ministryGroup: user.ministryGroup,
        preferredRole: leadScope.assignedServiceIds.has(service.id) ? "總招" : undefined,
      });
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
        if (racedCheckIn) {
          return NextResponse.json({
            ok: true,
            serviceType: service.service_type,
            assignmentId: racedCheckIn.assignment_id,
            checkIn: racedCheckIn,
          });
        }
      }
      if (error) throw error;
      return NextResponse.json(
        { ok: true, serviceType: service.service_type, assignmentId: assignment.id, checkIn: data },
        { status: 201 }
      );
    }

    if (action === "confirm_station") {
      if (!existingCheckIn) {
        return NextResponse.json({ error: "請先完成報到，再確認崗位。" }, { status: 409 });
      }
      if (!assignment) {
        return NextResponse.json(
          { error: "找不到這次報到的服事資料，請聯絡總招。" },
          { status: 409 }
        );
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
    return errorResponse(error);
  }
}
