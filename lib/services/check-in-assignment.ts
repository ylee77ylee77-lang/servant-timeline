import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const AUTO_ASSIGNMENT_ROLE = "待分派";

type ServiceForAutoAssignment = {
  id: string;
  report_at: string | null;
  location: string | null;
};

type AutoAssignmentInput = {
  service: ServiceForAutoAssignment;
  userId: string;
  ministryGroup?: string | null;
};

type AssignmentRow = {
  id: string;
  service_id: string;
  user_id: string;
  station_id: string | null;
  role_label: string;
  status: string;
};

function assignmentError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export async function ensureCheckInAssignment({
  service,
  userId,
  ministryGroup,
}: AutoAssignmentInput): Promise<AssignmentRow> {
  const supabase = getSupabaseAdminClient();

  const { data: existingRows, error: existingError } = await supabase
    .from("service_assignments")
    .select("id,service_id,user_id,station_id,role_label,status,created_at")
    .eq("service_id", service.id)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (existingError) throw existingError;

  const activeRows = (existingRows ?? []).filter((row) =>
    ["scheduled", "confirmed"].includes(String(row.status))
  );
  const formalAssignment = activeRows.find(
    (row) => row.role_label !== AUTO_ASSIGNMENT_ROLE
  );
  if (formalAssignment) return formalAssignment as AssignmentRow;

  const autoAssignment = activeRows.find(
    (row) => row.role_label === AUTO_ASSIGNMENT_ROLE
  );
  if (autoAssignment) return autoAssignment as AssignmentRow;

  const blocked = (existingRows ?? []).find((row) =>
    ["declined", "cancelled"].includes(String(row.status))
  );
  if (blocked) {
    throw assignmentError(
      "此堂服事狀態已取消或婉拒；如需現場報到，請洽總招協助。",
      409
    );
  }

  const payload = {
    service_id: service.id,
    user_id: userId,
    station_id: null,
    role_label: AUTO_ASSIGNMENT_ROLE,
    report_at: service.report_at,
    report_location: service.location,
    ministry_group: ministryGroup || null,
    status: "scheduled",
    notes: "系統於報到時建立（免人工排班模式）",
    created_by: null,
  };

  const { data, error } = await supabase
    .from("service_assignments")
    .insert(payload)
    .select("id,service_id,user_id,station_id,role_label,status")
    .single();

  if (error?.code === "23505") {
    const { data: racedRows, error: racedError } = await supabase
      .from("service_assignments")
      .select("id,service_id,user_id,station_id,role_label,status,created_at")
      .eq("service_id", service.id)
      .eq("user_id", userId)
      .in("status", ["scheduled", "confirmed"])
      .order("created_at", { ascending: true });
    if (racedError) throw racedError;

    const racedAssignment = (racedRows ?? []).find(
      (row) => row.role_label !== AUTO_ASSIGNMENT_ROLE
    ) ?? racedRows?.[0];

    if (racedAssignment) return racedAssignment as AssignmentRow;
  }

  if (error || !data) throw error || new Error("無法建立現場報到資料。");
  return data as AssignmentRow;
}
