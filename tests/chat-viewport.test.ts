import assert from "node:assert/strict";
import test from "node:test";
import { getChatKeyboardBounds } from "../lib/communications/chat-viewport.ts";

test("keep the chat entirely within the iPhone visual viewport with keyboard open", () => {
  const area = { focused: true, baseHeight: 844, height: 425, width: 390, top: 45, left: 0 };
  const rect = getChatKeyboardBounds(area);
  assert.ok(rect);
  assert.equal(rect.top, 53);
  assert.equal(rect.left, 12);
  assert.equal(rect.width, 366);
  assert.equal(rect.height, 409);
  assert.ok(rect.top + rect.height <= area.top + area.height - 8);
  assert.ok(rect.left + rect.width <= area.left + area.width - 12);
});

test("does not relocate chat when keyboard is closed or input is not focused", () => {
  assert.equal(getChatKeyboardBounds({
    focused: false, baseHeight: 844, height: 400, width: 390, top: 0, left: 0
  }), null);
  assert.equal(getChatKeyboardBounds({
    focused: true, baseHeight: 844, height: 800, width: 390, top: 44, left: 0
  }), null);
});

test("handle smaller screens and horizontal visual-viewport offsets", () => {
  const area = { focused: true, baseHeight: 680, height: 230, width: 320, top: 60, left: 15 };
  const rect = getChatKeyboardBounds(area);
  assert.deepEqual(rect, { top: 68, left: 27, width: 296, height: 214 });
  assert.ok(rect.top + rect.height <= area.top + area.height);
});

test("invalid viewport geometry never overrides the normal layout", () => {
  assert.equal(getChatKeyboardBounds({
    focused: true, baseHeight: 680, height: 0, width: 320, top: 0, left: 0
  }), null);
  assert.equal(getChatKeyboardBounds({
    focused: true, baseHeight: 680, height: 220, width: Number.NaN, top: 0, left: 0
  }), null);
});
