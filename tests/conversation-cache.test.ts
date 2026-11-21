import test from "node:test";
import assert from "node:assert/strict";
import { createConversationCache } from "../lib/communications/conversation-cache.ts";

test("conversation cache isolates peers, including empty histories", () => {
  const cache = createConversationCache<{ id: string }>(3);
  assert.equal(cache.get("alice"), undefined);
  cache.set("alice", [{ id: "a" }]);
  cache.set("bob", []);
  assert.deepEqual(cache.get("alice"), [{ id: "a" }]);
  assert.deepEqual(cache.get("bob"), []);
  assert.equal(cache.has("charlie"), false);
  const copy = cache.get("alice")!;
  copy.push({ id: "mutated" });
  assert.deepEqual(cache.get("alice"), [{ id: "a" }]);
});

test("bounded session cache evicts older conversations", () => {
  const cache = createConversationCache<number>(2);
  cache.set("a", [1]);
  cache.set("b", [2]);
  cache.set("a", [3]);
  cache.set("c", [4]);
  assert.equal(cache.has("b"), false);
  assert.deepEqual(cache.get("a"), [3]);
  cache.clear();
  assert.equal(cache.has("a"), false);
  assert.equal(cache.has("c"), false);
});
