import "server-only";

import type { VerifiedUser } from "@/lib/auth/require-admin";
import { deriveLiveCoordinationScope } from "@/lib/services/live-service-status";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";
import type { NextRequest } from "next/server";

export async function getLeadCheckInScope(
  request: NextRequest,
  user: VerifiedUser,
  serviceIds: string[],
) {
  const assignedServiceIds = new Set<string>();
  if (!user.roles.includes("coordinator") || user.roles.includes("admin") || !serviceIds.length) {
    return { enabled: false, assignedServiceIds };
  }
  const { data, error } = await getSupabaseUserClient(request)
    .from("service_assignments")
    .select("service_id,role_label")
    .eq("user_id", user.userId)
    .in("role_label", ["總招", "副總招"])
    .in("status", ["scheduled", "confirmed", "completed"])
    .in("service_id", serviceIds);
  if (error) throw error;

  for (const assignment of data ?? []) {
    if (assignment.role_label === "總招") assignedServiceIds.add(assignment.service_id);
  }
  // Like live coordination, a coordinator with no formal lead/deputy
  // assignment uses the lead scope for their own check-in.
  return {
    enabled: deriveLiveCoordinationScope({
      isAdmin: false,
      assignmentRoleLabels: (data ?? []).map(({ role_label }) => role_label),
    }) === "all",
    assignedServiceIds,
  };
}
