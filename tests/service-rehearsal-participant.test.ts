import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseRehearsalParticipantAction } from "../lib/services/rehearsal-participant-contract.ts";
const rehearsalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("participant action only accepts rehearsal and item UUIDs, never identity or network claims", () => {
  assert.deepEqual(parseRehearsalParticipantAction({ action:"check-in", rehearsalId, onChurchNetwork:true, userId:itemId }), { action:"check-in", rehearsalId });
  assert.deepEqual(parseRehearsalParticipantAction({ action:"set-item", rehearsalId, itemId, completed:false }), { action:"set-item", rehearsalId,itemId,completed:false });
  for (const value of [null,[],{action:"check-in"},{action:"check-in",rehearsalId:"主一堂"},{action:"end",rehearsalId},{action:"set-item",rehearsalId,itemId:"__formal__",completed:true},{action:"set-item",rehearsalId,itemId,completed:"true"}]) {
    assert.equal(parseRehearsalParticipantAction(value),null);
  }
});

test("participant route uses verified identity and server network check, not formal writes", () => {
  const source=fs.readFileSync("app/api/rehearsal/route.ts","utf8");
  assert.match(source,/requireCoordinator\(request\)/);
  assert.match(source,/getVerifiedSessionId\(request.headers.get\("authorization"\), user.userId\)/);
  assert.match(source,/!serviceRehearsalEnabled\(\)/);
  assert.match(source,/request.headers.get\("origin"\) !== request.nextUrl.origin/);
  assert.match(source,/const onChurchNetwork = isChurchNetworkRequest\(request\)/);
  assert.match(source,/p_actor: user.userId, p_session: sessionId, p_rehearsal: action.rehearsalId/);
  assert.match(source,/p_on_church_network: onChurchNetwork/);
  assert.doesNotMatch(source,/from\("(worship_services|service_check_ins|service_assignments|timeline_nodes|assignment_checklist_states)"\)/);
});
