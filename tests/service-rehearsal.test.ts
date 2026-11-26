import assert from "node:assert/strict";
import test from "node:test";
import { buildRehearsalPlan, isRehearsalOpen, rehearsalReminderDueAt } from "../lib/services/rehearsal-plan.ts";
import { rehearsalDenial, type RehearsalAction, type RehearsalAdmission } from "../lib/services/rehearsal-access.ts";

const serviceType = "\u4e3b\u4e00\u5802";
const start = Date.parse("2026-11-27T13:00:00+08:00"); // Friday, not a worship-service day.
const minute = 60_000;
const nodes = [
  { id: "c", time: "09:00", sort_order: 3 },
  { id: "b", time: "8:00:00", sort_order: 2 },
  { id: "a", time: "08:00", sort_order: 1 },
  { id: "d", time: "10:30", sort_order: 4 },
];
const plan = () => buildRehearsalPlan({ serviceType, startsAt: start, nodes });
const admission = (): RehearsalAdmission => ({
  actor: { userId: "user-a", roles: ["coordinator"], active: true, sessionLive: true },
  rehearsal: { id: "rehearsal-a", startsAt: start, endedAt: null },
  membership: { rehearsalId: "rehearsal-a", userId: "user-a", revokedAt: null, checkedInAt: start + minute },
  now: start + 2 * minute, onChurchNetwork: true, hasFormalCheckIn: false,
});

test("manual start determines a copied timeline without imposing a session deadline", () => {
  const original = JSON.stringify(nodes);
  const p = plan();
  assert.equal(p.startsAt, start);
  assert.equal("expiresAt" in p, false);
  assert.deepEqual(p.blocks.map(b => b.sourceNodeIds), [["a", "b"], ["c"], ["d"]]);
  assert.deepEqual(p.blocks.map(b => b.dueAt), [start + 6 * minute, start + 8 * minute, start + 10 * minute]);
  assert.equal(JSON.stringify(nodes), original);
});

test("long timelines retain every block without a 15-60 minute session limit", () => {
  const dense = Array.from({ length: 80 }, (_, i) => ({ id: String(i), time: String(8 + Math.floor(i / 60)).padStart(2, "0") + ":" + String(i % 60).padStart(2, "0"), sort_order: i }));
  const p = buildRehearsalPlan({ serviceType, startsAt: start, nodes: dense });
  assert.equal(p.blocks.length, dense.length);
  assert.deepEqual(p.blocks.map(b => b.dueAt), dense.map((_, i) => start + (6 + i * 2) * minute));
  assert.ok(p.blocks.at(-1)!.dueAt > start + 60 * minute);
});

test("invalid starts, templates, duplicate nodes and invalid task times fail closed", () => {
  assert.throws(() => buildRehearsalPlan({ serviceType: "training", startsAt: start, nodes }));
  for (const startsAt of [NaN, -1, Infinity, 1.5, 8.64e15]) {
    assert.throws(() => buildRehearsalPlan({ serviceType, startsAt, nodes }));
  }
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes: [] }));
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes: [nodes[0], nodes[0]] }));
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes: [{ ...nodes[0], time: "24:00" }] }));
});

test("absolute time crosses midnight; only the manual end closes the session", () => {
  const p = buildRehearsalPlan({ serviceType, startsAt: Date.parse("2026-11-27T23:55:00+08:00"), nodes });
  const w = { startsAt: p.startsAt, endedAt: null };
  assert.equal(rehearsalReminderDueAt(w, p.blocks[0].dueAt, 420), null);
  assert.equal(rehearsalReminderDueAt(w, p.blocks[1].dueAt, 315), p.blocks[1].dueAt - 315_000);
  assert.equal(rehearsalReminderDueAt(w, p.blocks[2].dueAt, 0), p.blocks[2].dueAt);
  assert.equal(rehearsalReminderDueAt({ ...w, endedAt: p.startsAt + 2 * minute }, p.blocks[2].dueAt, 0), null);
  assert.equal(isRehearsalOpen(w, p.startsAt - 1), false);
  assert.equal(isRehearsalOpen(w, p.startsAt), true);
  assert.equal(isRehearsalOpen(w, p.blocks[2].dueAt + 120 * minute), true);
  assert.equal(isRehearsalOpen({ ...w, endedAt: p.startsAt }, p.startsAt), false);
});

test("only an active, explicitly enrolled coordinator/admin with a live session is eligible", () => {
  const f = admission();
  assert.equal(rehearsalDenial(f, "check-in"), null);
  assert.equal(rehearsalDenial(f, "operate"), null);
  assert.equal(rehearsalDenial({ ...f, membership: null }, "view"), "membership");
  assert.equal(rehearsalDenial({ ...f, actor: { ...f.actor, roles: ["admin"] }, membership: null }, "operate"), "membership");
  assert.equal(rehearsalDenial({ ...f, actor: { ...f.actor, roles: ["volunteer"] } }, "view"), "role");
  assert.equal(rehearsalDenial({ ...f, actor: { ...f.actor, active: false } }, "view"), "account");
  assert.equal(rehearsalDenial({ ...f, actor: { ...f.actor, sessionLive: false } }, "operate"), "account");
});

test("cross-user/cross-rehearsal access, revocation and manual termination are denied", () => {
  const f = admission();
  const m = f.membership!;
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, userId: "user-b" } }, "operate"), "membership");
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, rehearsalId: "rehearsal-b" } }, "operate"), "membership");
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, revokedAt: f.now } }, "operate"), "membership");
  assert.equal(rehearsalDenial({ ...f, now: start - 1 }, "view"), "closed");
  assert.equal(rehearsalDenial({ ...f, rehearsal: { ...f.rehearsal, endedAt: f.now } }, "operate"), "closed");
});

test("formal check-in wins; rehearsal check-in requires network and operation requires check-in", () => {
  const f = admission();
  const m = f.membership!;
  assert.equal(rehearsalDenial({ ...f, hasFormalCheckIn: true }, "check-in"), "formal-check-in");
  assert.equal(rehearsalDenial({ ...f, hasFormalCheckIn: true }, "operate"), "formal-check-in");
  assert.equal(rehearsalDenial({ ...f, onChurchNetwork: false }, "check-in"), "network");
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, checkedInAt: null } }, "operate"), "check-in-required");
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, checkedInAt: f.now + 1 } }, "operate"), "check-in-required");
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, checkedInAt: start - 1 } }, "operate"), "check-in-required");
  assert.equal(rehearsalDenial({ ...f, onChurchNetwork: false }, "operate"), null);
});

test("unknown action is denied; the start timestamp is exact and tasks align to minutes", () => {
  const f = admission();
  assert.equal(rehearsalDenial(f, "unknown" as RehearsalAction), "action");
  const p = buildRehearsalPlan({ serviceType, startsAt: start + 25, nodes: [nodes[0]] });
  assert.equal(p.startsAt, start + 25);
  assert.equal(p.blocks[0].dueAt, start + 7 * minute);
  assert.equal(rehearsalReminderDueAt({ startsAt: p.startsAt, endedAt: null }, p.blocks[0].dueAt, 300), start + 2 * minute);
});

test("participants stay eligible after the final block and beyond 60 minutes until manual end", () => {
  const f = admission();
  const now = plan().blocks.at(-1)!.dueAt + 90 * minute;
  for (const action of ["view", "check-in", "operate"] as const) {
    assert.equal(rehearsalDenial({ ...f, now }, action), null);
    assert.equal(rehearsalDenial({ ...f, now, rehearsal: { ...f.rehearsal, endedAt: now } }, action), "closed");
  }
  assert.equal(rehearsalDenial({ ...f, now, hasFormalCheckIn: true }, "operate"), "formal-check-in");
});

test("invalid or unstarted windows are closed and an old membership cannot operate in a new session", () => {
  const f = admission();
  assert.equal(isRehearsalOpen({ startsAt: NaN, endedAt: null }, f.now), false);
  assert.equal(isRehearsalOpen({ startsAt: start, endedAt: null }, NaN), false);
  assert.equal(rehearsalDenial({ ...f, rehearsal: { ...f.rehearsal, id: "new-rehearsal" } }, "operate"), "membership");
});
