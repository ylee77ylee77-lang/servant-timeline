import assert from "node:assert/strict";
import test from "node:test";
import { getServiceActivationState } from "../lib/services/service-activation.ts";

test("Saturday service is provisioned but only active during the service window", () => {
  const before = getServiceActivationState(new Date("2026-09-12T08:59:00.000Z"));
  assert.deepEqual(before.provisionServiceTypes, ["六晚崇"]);
  assert.deepEqual(before.activeServiceTypes, []);
  assert.equal(before.defaultServiceType, null);

  const active = getServiceActivationState(new Date("2026-09-12T09:00:00.000Z"));
  assert.deepEqual(active.activeServiceTypes, ["六晚崇"]);
  assert.equal(active.defaultServiceType, "六晚崇");
});

test("Sunday switches the default at 10:00 while keeping both services active", () => {
  const beforeTen = getServiceActivationState(new Date("2026-09-13T01:59:00.000Z"));
  assert.deepEqual(beforeTen.provisionServiceTypes, ["主一堂", "主二堂"]);
  assert.deepEqual(beforeTen.activeServiceTypes, ["主一堂"]);
  assert.equal(beforeTen.defaultServiceType, "主一堂");

  const afterTen = getServiceActivationState(new Date("2026-09-13T02:00:00.000Z"));
  assert.deepEqual(afterTen.activeServiceTypes, ["主一堂", "主二堂"]);
  assert.equal(afterTen.defaultServiceType, "主二堂");
});

test("Sunday services close together at 12:45", () => {
  const beforeClose = getServiceActivationState(new Date("2026-09-13T04:44:00.000Z"));
  assert.deepEqual(beforeClose.activeServiceTypes, ["主一堂", "主二堂"]);

  const closed = getServiceActivationState(new Date("2026-09-13T04:45:00.000Z"));
  assert.deepEqual(closed.activeServiceTypes, []);
  assert.equal(closed.defaultServiceType, null);
});

test("Weekdays do not auto-provision worship services", () => {
  const weekday = getServiceActivationState(new Date("2026-09-10T07:00:00.000Z"));
  assert.deepEqual(weekday.provisionServiceTypes, []);
  assert.deepEqual(weekday.activeServiceTypes, []);
  assert.equal(weekday.defaultServiceType, null);
});
