import test from "node:test";
import assert from "node:assert/strict";
import { makeCommunicationStorageKey } from "../lib/communications/storage-key.ts";

const sender = "8bf1a34d-6696-4ba5-bdd1-20b7418bc7b0";
const recipient = "09dfef5f-44e5-4ed1-ae81-fc2d0f765dc7";
const upload = "8e6f485a-73ad-4a0c-8c03-ed3ba01d6d96";

test("handwriting and voice notes use safe ASCII-only object keys", () => {
  assert.equal(
    makeCommunicationStorageKey(sender, recipient, upload, "image/png"),
    `${sender}/${recipient}/${upload}.png`
  );
  assert.equal(
    makeCommunicationStorageKey(sender, recipient, upload, "audio/mp4"),
    `${sender}/${recipient}/${upload}.m4a`
  );
  assert.match(makeCommunicationStorageKey(sender, recipient, upload, "audio/webm"), /^[a-z0-9/.\-]+$/i);
});

test("all supported attachments have safe extensions", () => {
  const mimes = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "audio/mp4", "audio/webm", "audio/ogg", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ];
  for (const mime of mimes) {
    assert.match(makeCommunicationStorageKey(sender, recipient, upload, mime), /^[a-z0-9/._\-]+$/i);
  }
});

test("reject unsafe ID segments and unsupported MIME types", () => {
  assert.throws(() => makeCommunicationStorageKey("手寫留言", recipient, upload, "image/png"));
  assert.throws(() => makeCommunicationStorageKey(sender, "../admin", upload, "image/png"));
  assert.throws(() => makeCommunicationStorageKey(sender, recipient, upload, "text/html"));
  assert.throws(() => makeCommunicationStorageKey(sender, recipient, "../test", "image/png"));
});
