import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseRehearsalAdminAction, MAX_REHEARSAL_MEMBERS } from "../lib/services/rehearsal-admin-contract.ts";

const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rehearsal = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("start requires an explicit valid template and nonempty unique roster", () => {
  assert.deepEqual(parseRehearsalAdminAction({ action: "start", serviceType: "主一堂", userIds: [user] }), { action: "start", serviceType: "主一堂", userIds: [user] });
  for (const userIds of [[], [user, user.toUpperCase()], ["invalid"], [null], user, Array(MAX_REHEARSAL_MEMBERS + 1).fill(user)]) {
    assert.equal(parseRehearsalAdminAction({ action: "start", serviceType: "主一堂", userIds }), null);
  }
  assert.equal(parseRehearsalAdminAction({ action: "start", serviceType: "演練", userIds: [user] }), null);
});

test("enrollment, revoke and end are scoped to a rehearsal UUID", () => {
  assert.deepEqual(parseRehearsalAdminAction({ action: "enroll", rehearsalId: rehearsal, userIds: [user] }), { action: "enroll", rehearsalId: rehearsal, userIds: [user] });
  assert.deepEqual(parseRehearsalAdminAction({ action: "revoke", rehearsalId: rehearsal, userId: user }), { action: "revoke", rehearsalId: rehearsal, userId: user });
  assert.deepEqual(parseRehearsalAdminAction({ action: "end", rehearsalId: rehearsal, expiresAt: "irrelevant", actor: user }), { action: "end", rehearsalId: rehearsal });
  for (const action of ["end", "enroll", "revoke", "unknown"]) assert.equal(parseRehearsalAdminAction({ action, rehearsalId: "invalid", userId: user, userIds: [user] }), null);
  assert.equal(parseRehearsalAdminAction({ action: "end" }), null);
});

test("admin route verifies identity, session, origin and rollout flag; no formal writes", () => {
  const source = fs.readFileSync("app/api/admin/rehearsal/route.ts", "utf8");
  assert.match(source, /requireAdmin\(request\)/);
  assert.match(source, /getVerifiedSessionId/);
  assert.match(source, /VERCEL_ENV === "production" && process.env.ENABLE_SERVICE_REHEARSAL === "true"/);
  assert.match(source, /request.headers.get\("origin"\) !== request.nextUrl.origin/);
  assert.match(source, /p_actor: admin.userId, p_session: sessionId/);
  assert.doesNotMatch(source, /from\("(worship_services|service_check_ins|service_assignments|timeline_nodes)"\)/);
});
