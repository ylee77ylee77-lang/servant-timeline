import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_RECOVERY_CODE_COUNT,
  buildAdminRecoveryState,
  consumeAdminRecoveryHash,
  findMatchingAdminRecoveryHash,
  generateAdminRecoveryCodes,
  isValidAdminRecoveryCodeFormat,
  normalizeAdminRecoveryCode,
  readAdminRecoveryState,
} from "../lib/auth/admin-recovery.ts";

test("admin recovery codes are high-entropy formatted one-time codes", () => {
  const codes = generateAdminRecoveryCodes();
  assert.equal(codes.length, ADMIN_RECOVERY_CODE_COUNT);
  assert.equal(new Set(codes).size, ADMIN_RECOVERY_CODE_COUNT);
  for (const code of codes) {
    assert.match(code, /^(?:[0-9A-F]{4}-){5}[0-9A-F]{4}$/);
    assert.equal(isValidAdminRecoveryCodeFormat(code), true);
  }
});

test("recovery state stores hashes rather than raw codes", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const code = "ABCD-EF01-2345-6789-ABCD-EF01";
  const state = buildAdminRecoveryState(userId, [code], "2026-10-16T00:00:00.000Z");

  assert.equal(state.code_hashes.length, 1);
  assert.notEqual(state.code_hashes[0], normalizeAdminRecoveryCode(code));
  assert.equal(state.code_hashes[0].length, 64);
  assert.deepEqual(readAdminRecoveryState({ admin_recovery_codes: state }), state);
});

test("matching a recovery code consumes only that code", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const codes = [
    "1111-2222-3333-4444-5555-6666",
    "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF",
  ];
  const state = buildAdminRecoveryState(userId, codes, "2026-10-16T00:00:00.000Z");
  const matched = findMatchingAdminRecoveryHash(state, userId, codes[0]);

  assert.ok(matched);
  const nextState = consumeAdminRecoveryHash(
    state,
    matched,
    "2026-10-16T01:00:00.000Z"
  );

  assert.equal(nextState.code_hashes.length, 1);
  assert.equal(findMatchingAdminRecoveryHash(nextState, userId, codes[0]), null);
  assert.ok(findMatchingAdminRecoveryHash(nextState, userId, codes[1]));
  assert.equal(nextState.last_used_at, "2026-10-16T01:00:00.000Z");
});
