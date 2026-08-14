import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveLiveCoordinationScope,
  deriveLiveServiceStatus,
  getRequiredStations,
  isThirdFloorStation,
} from "../lib/services/live-service-status.ts";

const SERVICE = { service_date: "2026-08-09", service_type: "主二堂" };
const STATIONS = [
  { id: "lead", name: "總招", is_active: true },
  { id: "deputy", name: "副總招", is_active: true },
  { id: "2a", name: "2A 區塊牧招", is_active: true },
  { id: "7a", name: "7A 區塊牧招", is_active: true },
  { id: "9b", name: "9B 區塊牧招", is_active: true },
];
const ASSIGNMENTS = [
  { id: "a-lead", user_id: "u-lead", station_id: "lead", role_label: "總招", ministry_group: null, status: "scheduled" },
  { id: "a-deputy", user_id: "u-deputy", station_id: "deputy", role_label: "副總招", ministry_group: null, status: "scheduled" },
  { id: "a-2f-1", user_id: "u-2f-1", station_id: "2a", role_label: "牧招", ministry_group: "二樓", status: "scheduled" },
  { id: "a-2f-2", user_id: "u-2f-2", station_id: "2a", role_label: "牧招", ministry_group: "二樓", status: "scheduled" },
  { id: "a-3f", user_id: "u-3f", station_id: "7a", role_label: "牧招", ministry_group: "三樓", status: "scheduled" },
  { id: "a-invalid", user_id: "u-invalid", station_id: "9b", role_label: "牧招", ministry_group: "三樓", status: "scheduled" },
];
const PROFILES = ASSIGNMENTS.map((assignment) => ({
  id: assignment.user_id,
  display_name: assignment.user_id,
  ministry_group: null,
  phone_number: "0900000000",
}));

function derive(scope: "all" | "third_floor", actorUserId = "u-lead") {
  return deriveLiveServiceStatus({
    actorUserId,
    scope,
    service: SERVICE,
    assignments: ASSIGNMENTS,
    stations: STATIONS,
    profiles: PROFILES,
    checkIns: [
      { id: "c-lead", assignment_id: "a-lead", status: "checked_in" },
      { id: "c-deputy", assignment_id: "a-deputy", status: "checked_in" },
      { id: "c-3f", assignment_id: "a-3f", status: "station_confirmed" },
    ],
    confirmations: [{ check_in_id: "c-3f", station_id: "7a" }],
    taskMappings: [
      { assignment_id: "a-2f-1", timeline_node_id: "task-2f" },
      { assignment_id: "a-3f", timeline_node_id: "task-3f" },
    ],
    checklistItems: [
      { id: "item-2f", node_id: "task-2f", is_active: true },
      { id: "item-3f", node_id: "task-3f", is_active: true },
    ],
    checklistStates: [
      { assignment_id: "a-2f-1", checklist_item_id: "item-2f", is_completed: true },
      { assignment_id: "a-3f", checklist_item_id: "item-3f", is_completed: true },
    ],
  });
}

test("coordination scope distinguishes admin, 總招, and 副總招", () => {
  assert.equal(deriveLiveCoordinationScope({ isAdmin: true, assignmentRoleLabels: ["副總招"] }), "all");
  assert.equal(deriveLiveCoordinationScope({ isAdmin: false, assignmentRoleLabels: ["總招"] }), "all");
  assert.equal(deriveLiveCoordinationScope({ isAdmin: false, assignmentRoleLabels: ["副總招"] }), "third_floor");
});

test("three-floor classification includes valid and invalid three-floor station codes", () => {
  assert.equal(isThirdFloorStation("3樓大堂專招"), true);
  assert.equal(isThirdFloorStation("7A 區塊牧招"), true);
  assert.equal(isThirdFloorStation("9B 區塊牧招"), true);
  assert.equal(isThirdFloorStation("3A 區塊牧招"), false);
});

test("full live status surfaces urgent records and assignment validation", () => {
  const result = derive("all");

  assert.equal(result.summary.totalAssigned, 6);
  assert.equal(result.summary.checkedIn, 3);
  assert.equal(result.summary.stationConfirmed, 1);
  assert.deepEqual(result.validation.duplicateStations, [{ station: "2A 區塊牧招", count: 2 }]);
  assert.equal(result.validation.invalidStations.includes("9B 區塊牧招"), true);
  assert.equal(result.volunteers[0].checkInState, "not_checked_in");
  assert.equal(result.summary.taskPercent, 100);
});

test("副總招 receives only self and three-floor assignments and related tasks", () => {
  const result = derive("third_floor", "u-deputy");

  assert.deepEqual(
    result.volunteers.map((volunteer) => volunteer.assignmentId).sort(),
    ["a-3f", "a-deputy", "a-invalid"].sort()
  );
  assert.equal(result.summary.taskTotal, 1);
  assert.equal(result.summary.taskCompleted, 1);
  assert.equal(result.validation.invalidStations.includes("9B 區塊牧招"), true);
  assert.equal(JSON.stringify(result).includes("0900000000"), false);
  assert.equal(JSON.stringify(result).includes("phone"), false);
});

test("聖餐助手 is required only during first-week services", () => {
  assert.equal(getRequiredStations("2026-08-09", "主二堂").includes("聖餐助手"), false);
  assert.equal(getRequiredStations("2026-08-02", "主二堂").includes("聖餐助手"), true);
  assert.equal(getRequiredStations("2026-08-01", "六晚崇").includes("聖餐助手"), true);
});
