import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseRehearsalAdminAction } from "../lib/services/rehearsal-admin-contract.ts";

const rehearsal = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("start needs only the selected service template, not a participant roster", () => {
  assert.deepEqual(parseRehearsalAdminAction({ action: "start", serviceType: "主一堂" }), { action: "start", serviceType: "主一堂" });
  assert.equal(parseRehearsalAdminAction({ action: "start", serviceType: "演練" }), null);
  assert.equal(parseRehearsalAdminAction({ action: "start", serviceType: "主一堂", userIds: [] }), null);
});

test("end is scoped to a rehearsal UUID; old manual enrollment actions are rejected", () => {
  assert.deepEqual(parseRehearsalAdminAction({ action: "end", rehearsalId: rehearsal, expiresAt: "irrelevant" }), { action: "end", rehearsalId: rehearsal });
  for (const action of ["enroll", "revoke", "unknown"]) assert.equal(parseRehearsalAdminAction({ action, rehearsalId: rehearsal }), null);
  assert.equal(parseRehearsalAdminAction({ action: "end", rehearsalId: "invalid" }), null);
  assert.equal(parseRehearsalAdminAction({ action: "end" }), null);
});

test("admin route verifies identity, session, origin and rollout flag; no formal writes or manual roster", () => {
  const source = fs.readFileSync("app/api/admin/rehearsal/route.ts", "utf8");
  assert.match(source, /requireAdmin\(request\)/);
  assert.match(source, /getVerifiedSessionId/);
  assert.match(source, /VERCEL_ENV === "production" && process.env.ENABLE_SERVICE_REHEARSAL === "true"/);
  assert.match(source, /request.headers.get\("origin"\) !== request.nextUrl.origin/);
  assert.match(source, /p_actor: admin.userId, p_session: sessionId/);
  assert.doesNotMatch(source, /from\("(worship_services|service_check_ins|service_assignments|timeline_nodes)"\)/);
  assert.doesNotMatch(source, /p_users|enroll_service_rehearsal_members|revoke_service_rehearsal_member/);
});

test("admin card only requires a template and start/end, displays counts but no selection", () => {
  const source = fs.readFileSync("components/service/RehearsalAdminCard.tsx", "utf8");
  assert.match(source, /action: "start", serviceType/);
  assert.match(source, /action: "end", rehearsalId: rehearsal.id/);
  assert.match(source, /state.eligibleCount/);
  assert.match(source, /state.checkedInCount/);
  assert.doesNotMatch(source, /type="checkbox"|selectedIds|指定總招|加入選取總招|撤銷/);
});
