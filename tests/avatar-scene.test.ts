import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AVATAR_LAYER_ORDER,
  AVATAR_CANVAS_SIZE,
  AVATAR_COMPANIONS,
  AVATAR_PORTRAITS,
  AVATAR_BACKGROUNDS,
  getAvatarScene,
} from "../lib/profile/avatar-scene.ts";

test("avatar uses a single canonical four-layer head-only composition", () => {
  assert.deepEqual(AVATAR_LAYER_ORDER, [
    "background", "portrait", "companion-behind-frame", "white-frame",
  ]);
  assert.equal(AVATAR_CANVAS_SIZE, 512);
});

test("head-only artwork reuses eight existing transparent WebP assets", () => {
  const all = [
    ...Object.values(AVATAR_PORTRAITS).flatMap((item) => [item.plain, item.glasses]),
    ...Object.values(AVATAR_COMPANIONS).flatMap((item) => [item.behind]),
  ];
  assert.equal(all.length, 8);
  assert.equal(new Set(all).size, all.length);
  for (const webPath of all) {
    const file = path.join(process.cwd(), "public", webPath.replace(/^\//, ""));
    assert.equal(fs.existsSync(file), true, `${webPath} missing`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", `${webPath} must be WebP`);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `${webPath} must be WebP`);
  }
});

test("all companion options use existing head/upper-body images without feet overlays", () => {
  for (const kind of ["sheep", "doe", "lion", "eagle"] as const) {
    const scene = getAvatarScene({ style: "feminine", pet: kind, background: "mint", glasses: true });
    assert.equal(scene.companion?.name, AVATAR_COMPANIONS[kind].name);
    assert.equal(scene.companion?.behind, AVATAR_COMPANIONS[kind].behind);
    assert.equal(Object.hasOwn(scene.companion || {}, "inFront"), false);
    assert.equal(scene.portrait, AVATAR_PORTRAITS.feminine.glasses);
    assert.deepEqual(scene.gradient, AVATAR_BACKGROUNDS.mint);
  }
});

test("background and glasses change without replacing companion artwork", () => {
  const sceneA = getAvatarScene({ style: "masculine", glasses: false, pet: "eagle", background: "lavender" });
  const sceneB = getAvatarScene({ style: "masculine", glasses: true, pet: "eagle", background: "sand" });
  assert.notEqual(sceneA.portrait, sceneB.portrait);
  assert.deepEqual(sceneA.companion, sceneB.companion);
  assert.notDeepEqual(sceneA.gradient, sceneB.gradient);
});

test("old avatar values preserve established safe fallbacks", () => {
  assert.equal(getAvatarScene({ pet: "dog" }).companion, null);
  assert.equal(getAvatarScene({ style: "neutral" }).portrait, AVATAR_PORTRAITS.masculine.plain);
});


test("the removed paw/talon foreground assets are not required", () => {
  for (const kind of ["sheep", "doe", "lion", "eagle"]) {
    const file = path.join(process.cwd(), "public", "avatar", "scenes", "v2", `${kind}-front.webp`);
    assert.equal(fs.existsSync(file), false, `${kind} should not include a foreground feet overlay`);
  }
});