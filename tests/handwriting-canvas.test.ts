import test from "node:test";
import assert from "node:assert/strict";
import { canvasPointFromClient } from "../lib/communications/handwriting-canvas.ts";

test("project mobile pointer position onto fixed canvas dimensions", () => {
  const bounds = { left: 12, top: 200, width: 300, height: 180 };
  assert.deepEqual(canvasPointFromClient(12, 200, bounds, 900, 540), { x: 0, y: 0 });
  assert.deepEqual(canvasPointFromClient(162, 290, bounds, 900, 540), { x: 450, y: 270 });
  assert.deepEqual(canvasPointFromClient(312, 380, bounds, 900, 540), { x: 900, y: 540 });
});

test("clamp pointer outside canvas bounds during captured strokes", () => {
  const bounds = { left: 12, top: 200, width: 300, height: 180 };
  assert.deepEqual(canvasPointFromClient(-100, 500, bounds, 900, 540), { x: 0, y: 540 });
  assert.deepEqual(canvasPointFromClient(400, 40, bounds, 900, 540), { x: 900, y: 0 });
  assert.deepEqual(canvasPointFromClient(10, 10, { ...bounds, width: 0 }, 900, 540), { x: 0, y: 0 });
});
