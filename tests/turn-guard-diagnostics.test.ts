import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTurnCost, TURN_BLOCK_BYTES, TURN_WARNING_PERCENT, TURN_FREE_TIER_BYTES } from "../lib/communications/turn-cost.ts";

test("TURN is still blocked at the 95% free-tier threshold", () => {
  const previous = evaluateTurnCost(TURN_FREE_TIER_BYTES * 0.899);
  const warning = evaluateTurnCost(TURN_FREE_TIER_BYTES * TURN_WARNING_PERCENT / 100);
  const blocked = evaluateTurnCost(TURN_BLOCK_BYTES);
  assert.equal(previous.blocked, false);
  assert.equal(warning.warning, true);
  assert.equal(warning.blocked, false);
  assert.equal(blocked.blocked, true);
});
