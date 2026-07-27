import assert from "node:assert/strict";
import test from "node:test";
import { deriveMyServiceDashboardState } from "../lib/services/my-service-dashboard.ts";

const BASE_INPUT = {
  today: "2026-07-27",
  serviceDate: "2026-08-01",
  serviceStatus: "published",
  assignmentStatus: "scheduled",
  checkInStatus: null,
};

test("future assignment shows one upcoming state and wait action", () => {
  const result = deriveMyServiceDashboardState(BASE_INPUT);

  assert.equal(result.status, "upcoming");
  assert.equal(result.nextAction.kind, "wait");
  assert.equal(result.nextAction.label, "等待開始");
});

test("same-day assignment directs a volunteer to check in", () => {
  const result = deriveMyServiceDashboardState({
    ...BASE_INPUT,
    serviceDate: BASE_INPUT.today,
  });

  assert.equal(result.status, "today");
  assert.deepEqual(result.nextAction, {
    kind: "check_in",
    label: "前往報到",
    targetTab: "checkin",
  });
});

test("checked-in volunteer is directed to the report location", () => {
  const result = deriveMyServiceDashboardState({
    ...BASE_INPUT,
    serviceDate: BASE_INPUT.today,
    checkInStatus: "checked_in",
  });

  assert.equal(result.status, "checked_in");
  assert.equal(result.nextAction.kind, "go_to_report_location");
  assert.equal(result.nextAction.label, "前往集合地點");
});

test("station-confirmed volunteer is directed to today's timeline", () => {
  const result = deriveMyServiceDashboardState({
    ...BASE_INPUT,
    serviceDate: BASE_INPUT.today,
    checkInStatus: "station_confirmed",
  });

  assert.equal(result.status, "checked_in");
  assert.deepEqual(result.nextAction, {
    kind: "view_timeline",
    label: "查看今日時間軸",
    targetTab: "timeline",
  });
});

test("completed service takes precedence over check-in state", () => {
  const result = deriveMyServiceDashboardState({
    ...BASE_INPUT,
    serviceStatus: "completed",
    checkInStatus: "station_confirmed",
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.nextAction, {
    kind: "completed",
    label: "已完成今日服事",
    targetTab: null,
  });
});
