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
  rehearsal: { id: "rehearsal-a", startsAt: start, expiresAt: start + 20 * minute, endedAt: null },
  membership: { rehearsalId: "rehearsal-a", userId: "user-a", revokedAt: null, checkedInAt: start + minute },
  now: start + 2 * minute, onChurchNetwork: true, hasFormalCheckIn: false,
});

test("weekday rehearsal compresses a copy, groups equal times and retains check-in/wrap-up margins", () => {
  const original = JSON.stringify(nodes);
  const p = plan();
  assert.equal(p.startsAt, start);
  assert.equal(p.expiresAt, start + 20 * minute);
  assert.deepEqual(p.blocks.map(b => b.sourceNodeIds), [["a", "b"], ["c"], ["d"]]);
  assert.deepEqual(p.blocks.map(b => b.dueAt), [start + minute, start + 8 * minute, start + 19 * minute]);
  assert.equal(JSON.stringify(nodes), original);
});

test("dense source blocks never collapse into the same rehearsal minute", () => {
  const dense = Array.from({ length: 14 }, (_, i) => ({ id: String(i), time: "08:" + String(i).padStart(2, "0"), sort_order: i }));
  const p = buildRehearsalPlan({ serviceType, startsAt: start, nodes: dense, durationMinutes: 15 });
  assert.deepEqual(p.blocks.map(b => b.dueAt), dense.map((_, i) => start + (i + 1) * minute));
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes: [...dense, { id: "last", time: "09:00", sort_order: 99 }], durationMinutes: 15 }));
});

test("invalid templates, duplicate nodes and unsupported durations fail closed", () => {
  assert.throws(() => buildRehearsalPlan({ serviceType: "training", startsAt: start, nodes }));
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: NaN, nodes }));
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes: [] }));
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes: [nodes[0], nodes[0]] }));
  assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes: [{ ...nodes[0], time: "24:00" }] }));
  for (const durationMinutes of [14, 61, 20.5, NaN]) assert.throws(() => buildRehearsalPlan({ serviceType, startsAt: start, nodes, durationMinutes }));
});

test("absolute time works across midnight; no early or post-expiry reminder", () => {
  const p = buildRehearsalPlan({ serviceType, startsAt: Date.parse("2026-11-27T23:55:00+08:00"), nodes });
  const w = { ...p, endedAt: null };
  assert.equal(rehearsalReminderDueAt(w, p.blocks[0].dueAt, 300), null);
  assert.equal(rehearsalReminderDueAt(w, p.blocks[1].dueAt, 315), p.blocks[1].dueAt - 315_000);
  assert.equal(rehearsalReminderDueAt(w, p.blocks[2].dueAt, 0), p.blocks[2].dueAt);
  assert.equal(rehearsalReminderDueAt(w, p.expiresAt, 0), null);
  assert.equal(rehearsalReminderDueAt({ ...w, endedAt: p.startsAt }, p.blocks[2].dueAt, 0), null);
  assert.equal(isRehearsalOpen(w, p.startsAt - 1), false);
  assert.equal(isRehearsalOpen(w, p.startsAt), true);
  assert.equal(isRehearsalOpen(w, p.expiresAt), false);
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

test("cross-user/cross-rehearsal access, revocation, expiry and early termination are denied", () => {
  const f = admission();
  const m = f.membership!;
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, userId: "user-b" } }, "operate"), "membership");
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, rehearsalId: "rehearsal-b" } }, "operate"), "membership");
  assert.equal(rehearsalDenial({ ...f, membership: { ...m, revokedAt: f.now } }, "operate"), "membership");
  assert.equal(rehearsalDenial({ ...f, now: f.rehearsal.expiresAt }, "operate"), "closed");
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

test("unknown action is denied; one task leaves time for the default five-minute advance", () => {
  const f = admission();
  assert.equal(rehearsalDenial(f, "unknown" as RehearsalAction), "action");
  const p = buildRehearsalPlan({ serviceType, startsAt: start + 25, nodes: [nodes[0]] });
  assert.equal(p.startsAt, start + 1000);
  assert.equal(p.blocks[0].dueAt, p.startsAt + 6 * minute);
  assert.equal(rehearsalReminderDueAt({ ...p, endedAt: null }, p.blocks[0].dueAt, 300), p.startsAt + minute);
});
