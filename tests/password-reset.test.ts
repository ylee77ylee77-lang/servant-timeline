import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePendingPasswordResets,
  isValidResetPassword,
  PASSWORD_RESET_COMPLETED_EVENT,
  PASSWORD_RESET_REQUESTED_EVENT,
} from "../lib/auth/password-reset.ts";

test("latest reset request remains pending until completed", () => {
  const pending = derivePendingPasswordResets([
    {
      id: 4,
      subject_id: "user-a",
      event_type: PASSWORD_RESET_REQUESTED_EVENT,
      occurred_at: "2026-10-16T04:00:00Z",
    },
    {
      id: 3,
      subject_id: "user-a",
      event_type: PASSWORD_RESET_COMPLETED_EVENT,
      occurred_at: "2026-10-15T04:00:00Z",
    },
  ]);

  assert.deepEqual(pending, [{
    subjectId: "user-a",
    requestLogId: 4,
    requestedAt: "2026-10-16T04:00:00Z",
  }]);
});

test("completed reset is not pending", () => {
  const pending = derivePendingPasswordResets([
    {
      id: 6,
      subject_id: "user-a",
      event_type: PASSWORD_RESET_COMPLETED_EVENT,
      occurred_at: "2026-10-16T05:00:00Z",
    },
    {
      id: 5,
      subject_id: "user-a",
      event_type: PASSWORD_RESET_REQUESTED_EVENT,
      occurred_at: "2026-10-16T04:00:00Z",
    },
  ]);

  assert.deepEqual(pending, []);
});

test("password reset length matches app rule", () => {
  assert.equal(isValidResetPassword("1234567"), false);
  assert.equal(isValidResetPassword("12345678"), true);
  assert.equal(isValidResetPassword("x".repeat(72)), true);
  assert.equal(isValidResetPassword("x".repeat(73)), false);
});
