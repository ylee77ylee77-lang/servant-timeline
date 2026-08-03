import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECK_IN_NETWORK_MESSAGES,
  getSelectedCheckInOption,
  normalizeEligibleCheckInOptions,
} from "../lib/services/check-in.ts";

const ASSIGNMENT_ID = "11111111-1111-4111-8111-111111111111";

test("eligible service options reject malformed and duplicate records", () => {
  assert.deepEqual(
    normalizeEligibleCheckInOptions([
      { serviceType: "主一堂", assignmentId: ASSIGNMENT_ID },
      { serviceType: "主一堂", assignmentId: "22222222-2222-4222-8222-222222222222" },
      { serviceType: "其他堂", assignmentId: ASSIGNMENT_ID },
      { serviceType: "主二堂", assignmentId: "not-a-uuid" },
    ]),
    [{ serviceType: "主一堂", assignmentId: ASSIGNMENT_ID }]
  );
});

test("check-in selection only resolves a server-provided eligible assignment", () => {
  const options = normalizeEligibleCheckInOptions([
    { serviceType: "六晚崇", assignmentId: ASSIGNMENT_ID },
  ]);

  assert.deepEqual(getSelectedCheckInOption(options, "六晚崇"), options[0]);
  assert.equal(getSelectedCheckInOption(options, "主一堂"), null);
  assert.equal(getSelectedCheckInOption(options, "偽造堂次"), null);
});

test("network failure copy does not expose church network identifiers", () => {
  assert.equal(CHECK_IN_NETWORK_MESSAGES.unavailable.includes("Wi-Fi"), false);
  assert.equal(CHECK_IN_NETWORK_MESSAGES.unavailable.includes("IP"), false);
  assert.equal(CHECK_IN_NETWORK_MESSAGES.unavailable.includes("Slllc"), false);
});
