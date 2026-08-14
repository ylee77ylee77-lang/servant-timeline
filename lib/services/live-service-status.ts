import {
  isServiceType,
  STATION_OPTIONS_BY_SERVICE,
} from "./catalog.ts";

export type LiveCoordinationScope = "all" | "third_floor";

export type LiveServiceSummary = {
  totalAssigned: number;
  checkedIn: number;
  stationConfirmed: number;
  notCheckedIn: number;
  unassigned: number;
  stationUnconfirmed: number;
  taskCompleted: number;
  taskTotal: number;
  taskPercent: number;
};

export type LiveVolunteerStatus = {
  assignmentId: string;
  name: string;
  role: string;
  ministryGroup: string;
  station: string;
  checkInState: "not_checked_in" | "checked_in";
  stationState: "unassigned" | "unconfirmed" | "confirmed";
  urgency: number;
};

export type LiveAssignmentValidation = {
  missingStations: string[];
  duplicateStations: Array<{ station: string; count: number }>;
  invalidStations: string[];
};

type ServiceRow = {
  service_date: string;
  service_type: string;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  station_id: string | null;
  role_label: string;
  ministry_group: string | null;
  status: string;
};

type StationRow = {
  id: string;
  name: string;
  is_active: boolean;
};

type ProfileRow = {
  id: string;
  display_name: string;
  ministry_group: string | null;
};

type CheckInRow = {
  id: string;
  assignment_id: string;
  status: string;
};

type ConfirmationRow = {
  check_in_id: string;
  station_id: string;
};

type TaskMappingRow = {
  assignment_id: string;
  timeline_node_id: string;
};

type ChecklistItemRow = {
  id: string;
  node_id: string;
  is_active: boolean;
};

type ChecklistStateRow = {
  assignment_id: string;
  checklist_item_id: string;
  is_completed: boolean;
};

type DeriveLiveServiceStatusInput = {
  actorUserId: string;
  scope: LiveCoordinationScope;
  service: ServiceRow;
  assignments: AssignmentRow[];
  stations: StationRow[];
  profiles: ProfileRow[];
  checkIns: CheckInRow[];
  confirmations: ConfirmationRow[];
  taskMappings: TaskMappingRow[];
  checklistItems: ChecklistItemRow[];
  checklistStates: ChecklistStateRow[];
};

const ACTIVE_ASSIGNMENT_STATUSES = new Set(["scheduled", "confirmed", "completed"]);
const THIRD_FLOOR_BLOCK = /^(?:6|7A|7B|8|9A|9B|10)(?:\s|區|$)/i;

function normalizeLabel(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function isThirdFloorStation(value: string) {
  const station = normalizeLabel(value);
  return station.includes("副總招")
    || station.includes("3樓")
    || THIRD_FLOOR_BLOCK.test(station);
}

export function deriveLiveCoordinationScope({
  isAdmin,
  assignmentRoleLabels,
}: {
  isAdmin: boolean;
  assignmentRoleLabels: string[];
}): LiveCoordinationScope {
  if (isAdmin) return "all";
  const labels = assignmentRoleLabels.map(normalizeLabel);
  const isLead = labels.some((label) => label === "總招");
  const isDeputy = labels.some((label) => label === "副總招");
  return isDeputy && !isLead ? "third_floor" : "all";
}

function isCommunionService(serviceDate: string, serviceType: string) {
  const date = new Date(`${serviceDate}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return false;

  if (serviceType === "六晚崇") {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.getUTCDay() === 0 && date.getUTCDate() <= 7;
}

export function getRequiredStations(serviceDate: string, serviceType: string) {
  if (!isServiceType(serviceType)) return [];
  const communion = isCommunionService(serviceDate, serviceType);
  return STATION_OPTIONS_BY_SERVICE[serviceType].filter(
    (station) => communion || station !== "聖餐助手"
  );
}

function isVisibleAssignment(
  assignment: AssignmentRow,
  stationName: string,
  actorUserId: string,
  scope: LiveCoordinationScope
) {
  if (scope === "all") return true;
  return assignment.user_id === actorUserId
    || isThirdFloorStation(stationName)
    || isThirdFloorStation(assignment.role_label);
}

export function deriveLiveServiceStatus({
  actorUserId,
  scope,
  service,
  assignments,
  stations,
  profiles,
  checkIns,
  confirmations,
  taskMappings,
  checklistItems,
  checklistStates,
}: DeriveLiveServiceStatusInput) {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const activeAssignments = assignments.filter((assignment) => (
    ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
    && isVisibleAssignment(
      assignment,
      assignment.station_id ? stationById.get(assignment.station_id)?.name ?? "" : "",
      actorUserId,
      scope
    )
  ));
  const visibleAssignmentIds = new Set(activeAssignments.map((assignment) => assignment.id));
  const checkInByAssignment = new Map(
    checkIns
      .filter((checkIn) => visibleAssignmentIds.has(checkIn.assignment_id) && checkIn.status !== "cancelled")
      .map((checkIn) => [checkIn.assignment_id, checkIn])
  );
  const confirmedCheckInIds = new Set(confirmations.map((confirmation) => confirmation.check_in_id));

  const volunteers: LiveVolunteerStatus[] = activeAssignments.map((assignment) => {
    const profile = profileById.get(assignment.user_id);
    const station = assignment.station_id ? stationById.get(assignment.station_id)?.name ?? "" : "";
    const checkIn = checkInByAssignment.get(assignment.id);
    const checkedIn = Boolean(checkIn);
    const confirmed = Boolean(
      checkIn && (checkIn.status === "station_confirmed" || confirmedCheckInIds.has(checkIn.id))
    );
    const checkInState: LiveVolunteerStatus["checkInState"] = checkedIn
      ? "checked_in"
      : "not_checked_in";
    const stationState: LiveVolunteerStatus["stationState"] = !station
      ? "unassigned"
      : confirmed
        ? "confirmed"
        : "unconfirmed";
    const urgency = !checkedIn ? 0 : stationState === "unassigned" ? 1 : stationState === "unconfirmed" ? 2 : 3;

    return {
      assignmentId: assignment.id,
      name: profile?.display_name || "未命名同工",
      role: assignment.role_label,
      ministryGroup: assignment.ministry_group || profile?.ministry_group || "未設定",
      station: station || "未分派",
      checkInState,
      stationState,
      urgency,
    };
  }).sort((left, right) => (
    left.urgency - right.urgency || left.name.localeCompare(right.name, "zh-Hant")
  ));

  const expectedStations = getRequiredStations(service.service_date, service.service_type)
    .filter((station) => scope === "all" || isThirdFloorStation(station));
  const expectedStationSet = new Set(expectedStations);
  const scopedActiveStations = stations.filter((station) => (
    station.is_active && (scope === "all" || isThirdFloorStation(station.name))
  ));
  const assignedCounts = new Map<string, number>();

  for (const assignment of activeAssignments) {
    if (!assignment.station_id) continue;
    const stationName = stationById.get(assignment.station_id)?.name;
    if (!stationName) continue;
    assignedCounts.set(stationName, (assignedCounts.get(stationName) ?? 0) + 1);
  }

  const missingStations = expectedStations.filter((station) => !assignedCounts.has(station));
  const duplicateStations = Array.from(assignedCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([station, count]) => ({ station, count }))
    .sort((left, right) => left.station.localeCompare(right.station, "zh-Hant"));
  const invalidStations = Array.from(new Set(
    scopedActiveStations
      .map((station) => station.name)
      .filter((station) => !expectedStationSet.has(station))
  )).sort((left, right) => left.localeCompare(right, "zh-Hant"));

  const visibleMappings = taskMappings.filter((mapping) => visibleAssignmentIds.has(mapping.assignment_id));
  const activeChecklistByNode = new Map<string, ChecklistItemRow[]>();
  for (const item of checklistItems) {
    if (!item.is_active) continue;
    const existing = activeChecklistByNode.get(item.node_id) ?? [];
    existing.push(item);
    activeChecklistByNode.set(item.node_id, existing);
  }
  const completedStateKeys = new Set(
    checklistStates
      .filter((state) => state.is_completed && visibleAssignmentIds.has(state.assignment_id))
      .map((state) => `${state.assignment_id}:${state.checklist_item_id}`)
  );
  let taskTotal = 0;
  let taskCompleted = 0;
  for (const mapping of visibleMappings) {
    for (const item of activeChecklistByNode.get(mapping.timeline_node_id) ?? []) {
      taskTotal += 1;
      if (completedStateKeys.has(`${mapping.assignment_id}:${item.id}`)) taskCompleted += 1;
    }
  }

  const checkedIn = volunteers.filter((volunteer) => volunteer.checkInState === "checked_in").length;
  const stationConfirmed = volunteers.filter((volunteer) => volunteer.stationState === "confirmed").length;
  const summary: LiveServiceSummary = {
    totalAssigned: volunteers.length,
    checkedIn,
    stationConfirmed,
    notCheckedIn: volunteers.length - checkedIn,
    unassigned: volunteers.filter((volunteer) => volunteer.stationState === "unassigned").length,
    stationUnconfirmed: volunteers.filter((volunteer) => volunteer.stationState === "unconfirmed").length,
    taskCompleted,
    taskTotal,
    taskPercent: taskTotal ? Math.round((taskCompleted * 100) / taskTotal) : 0,
  };

  const validation: LiveAssignmentValidation = {
    missingStations,
    duplicateStations,
    invalidStations,
  };

  return { summary, volunteers, validation };
}
