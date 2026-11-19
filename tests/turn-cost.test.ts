import test from "node:test";
import assert from "node:assert/strict";
import {
  TURN_BLOCK_BYTES,
  TURN_BLOCK_PERCENT,
  TURN_FREE_TIER_BYTES,
  TURN_WARNING_PERCENT,
  evaluateTurnCost,
  previousMonthlyBillingDate,
} from "../lib/communications/turn-cost.ts";

test("TURN cost guard warns at 90% and blocks at 95%", () => {
  const below = evaluateTurnCost(TURN_FREE_TIER_BYTES * 0.899);
  assert.equal(below.warning, false);
  assert.equal(below.blocked, false);

  const warning = evaluateTurnCost(TURN_FREE_TIER_BYTES * 0.9);
  assert.equal(warning.warning, true);
  assert.equal(warning.blocked, false);
  assert.equal(Math.round(warning.usagePercent), TURN_WARNING_PERCENT);

  const blocked = evaluateTurnCost(TURN_BLOCK_BYTES);
  assert.equal(blocked.warning, true);
  assert.equal(blocked.blocked, true);
  assert.equal(Math.round(blocked.usagePercent), TURN_BLOCK_PERCENT);
});

test("monthly billing window follows the next bill date and handles short months", () => {
  assert.equal(
    previousMonthlyBillingDate(new Date("2026-04-30T00:00:00Z")).toISOString(),
    "2026-03-30T00:00:00.000Z"
  );
  assert.equal(
    previousMonthlyBillingDate(new Date("2026-03-31T00:00:00Z")).toISOString(),
    "2026-02-28T00:00:00.000Z"
  );
});

test("TURN cost guard treats invalid usage as zero", () => {
  const invalid = evaluateTurnCost(Number.NaN);
  assert.equal(invalid.egressBytes, 0);
  assert.equal(invalid.usagePercent, 0);
  assert.equal(invalid.blocked, false);
});
