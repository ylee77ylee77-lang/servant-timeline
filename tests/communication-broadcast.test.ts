import test from "node:test";
import assert from "node:assert/strict";
import { deriveCommunicationBroadcastTopic } from "../lib/communications/broadcast-topic.ts";

const secret = "0123456789abcdef0123456789abcdef";

test("communication Broadcast topics are deterministic and opaque", () => {
  const first = deriveCommunicationBroadcastTopic(
    "11111111-1111-4111-8111-111111111111",
    secret
  );
  const repeat = deriveCommunicationBroadcastTopic(
    "11111111-1111-4111-8111-111111111111",
    secret
  );
  const other = deriveCommunicationBroadcastTopic(
    "22222222-2222-4222-8222-222222222222",
    secret
  );

  assert.equal(first, repeat);
  assert.notEqual(first, other);
  assert.match(first, /^communication-[0-9a-f]{64}$/);
  assert.equal(first.includes("11111111"), false);
});

test("communication Broadcast topics reject invalid inputs", () => {
  assert.throws(
    () => deriveCommunicationBroadcastTopic("not-a-uuid", secret),
    /Invalid communication user ID/
  );
  assert.throws(
    () => deriveCommunicationBroadcastTopic(
      "11111111-1111-4111-8111-111111111111",
      "short"
    ),
    /secret is not configured/i
  );
});
