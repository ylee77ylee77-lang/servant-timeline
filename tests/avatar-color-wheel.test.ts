import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarColorSelectionFromHex,
  getAvatarColorHex,
  minAvatarBrightness,
  normalizeAvatarColorSelection,
  rasterizeAvatarColorWheel,
  type AvatarColorHex,
} from "../lib/profile/avatar-color-wheel.ts";

test("hair and frame wheels use full HSV color with exact primary hues", () => {
  for (const part of ["hair", "frame", "lens"] as const) {
    for (const [h, expected] of [[0, "#FF0000"], [60, "#FFFF00"], [120, "#00FF00"], [180, "#00FFFF"], [240, "#0000FF"], [300, "#FF00FF"]] as const) {
      const radians = h * Math.PI / 180;
      assert.equal(getAvatarColorHex(part, { x: Math.sin(radians), y: -Math.cos(radians), brightness: 1 }), expected);
    }
    assert.equal(getAvatarColorHex(part, { x: 0, y: 0, brightness: 1 }), "#FFFFFF");
    assert.equal(getAvatarColorHex(part, { x: 1, y: 0, brightness: 0 }), "#000000");
  }
});

test("wheel draft preserves hue and saturation when brightness changes to zero and back", () => {
  const original = avatarColorSelectionFromHex("hair", "#724E9B");
  const black = normalizeAvatarColorSelection("hair", { ...original, brightness: 0 });
  assert.equal(getAvatarColorHex("hair", black), "#000000");
  assert.equal(black.x, original.x);
  assert.equal(black.y, original.y);
  assert.equal(getAvatarColorHex("hair", { ...black, brightness: original.brightness }), "#724E9B");
});

test("arbitrary six-digit RGB colors round trip in the unrestricted wheel", () => {
  for (const hex of ["#000000", "#FFFFFF", "#ABCDEF", "#FF0066", "#201F1E", "#808080", "#B88E55"] as const) {
    for (const part of ["hair", "frame", "lens"] as const) {
      assert.equal(getAvatarColorHex(part, avatarColorSelectionFromHex(part, hex)), hex);
    }
  }
  for (const invalid of ["#fff", "red", "#12GG00", "#12345678", "url(x)"]) {
    assert.throws(() => avatarColorSelectionFromHex("hair", invalid as AvatarColorHex));
  }
});

test("skin disc samples remain in a provisional natural warm-tone gamut", () => {
  assert.equal(minAvatarBrightness("skin"), 0.30);
  for (const brightness of [-10, 0.3, 0.5, 1, 4]) {
    for (let x = -1; x <= 1; x += 0.125) {
      for (let y = -1; y <= 1; y += 0.125) {
        const value = normalizeAvatarColorSelection("skin", { x, y, brightness });
        assert.ok(Math.hypot(value.x, value.y) <= 1 + 1e-12);
        assert.ok(value.brightness >= 0.30 && value.brightness <= 1);
        const hex = getAvatarColorHex("skin", value);
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        assert.ok(r >= g && g >= b, hex);
        assert.ok(r >= 76, hex);
      }
    }
  }
});

test("pointer coordinates are clamped to the color disc; malformed numbers are bounded", () => {
  const projected = normalizeAvatarColorSelection("hair", { x: 3, y: 4, brightness: 2 });
  assert.ok(Math.abs(projected.x - 0.6) < 1e-12);
  assert.ok(Math.abs(projected.y - 0.8) < 1e-12);
  assert.equal(projected.brightness, 1);
  const invalid = normalizeAvatarColorSelection("skin", { x: NaN, y: Infinity, brightness: NaN });
  assert.deepEqual(invalid, { x: 0, y: 0, brightness: 1 });
});

test("rendered wheel and chosen coordinates use identical RGB math", () => {
  const size = 32;
  for (const part of ["hair", "skin", "frame", "lens"] as const) {
    for (const brightness of [0.35, 0.72, 1]) {
      const pixels = rasterizeAvatarColorWheel(part, brightness, size);
      assert.equal(pixels.length, size * size * 4);
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const x = (col + 0.5) * 2 / size - 1;
          const y = (row + 0.5) * 2 / size - 1;
          const offset = (row * size + col) * 4;
          if (Math.hypot(x, y) > 1) {
            assert.equal(pixels[offset + 3], 0);
          } else {
            const expected = getAvatarColorHex(part, { x, y, brightness });
            const actual = "#" + Array.from(pixels.subarray(offset, offset + 3)).map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
            assert.equal(actual, expected);
            assert.equal(pixels[offset + 3], 255);
          }
        }
      }
    }
  }
  assert.throws(() => rasterizeAvatarColorWheel("hair", 1, 10000));
});
