import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AVATAR_LAYER_ORDER,
  AVATAR_CANVAS_SIZE,
  AVATAR_PORTRAIT_BOUNDS,
  AVATAR_COMPANION_THUMBNAIL,
  AVATAR_COMPANIONS,
  AVATAR_PORTRAITS,
  AVATAR_BACKGROUNDS,
  getAvatarScene,
} from "../lib/profile/avatar-scene.ts";
import { AVATAR_ICON_OPTIONS, AVATAR_ICON_TONES, AVATAR_ICON_ARTWORK } from "../lib/profile/avatar-icon.ts";
import type { AvatarIconTone } from "../lib/profile/avatar.ts";

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
    // VP8X exposes the alpha flag and 24-bit canvas dimensions without
    // adding an image decoder dependency to the CI test environment.
    assert.equal(bytes.toString("ascii", 12, 16), "VP8X", `${webPath} must use extended WebP`);
    assert.ok((bytes[20] & 0x10) !== 0, `${webPath} must have an alpha channel`);
    assert.equal(bytes.readUIntLE(24, 3) + 1, AVATAR_CANVAS_SIZE, `${webPath} width must match artboard`);
    assert.equal(bytes.readUIntLE(27, 3) + 1, AVATAR_CANVAS_SIZE, `${webPath} height must match artboard`);
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
  assert.equal(getAvatarScene({ style: "neutral" }).portrait, null);
  assert.equal(getAvatarScene({}).portrait, null);
  assert.equal(getAvatarScene({ style: "neutral", glasses: true }).portrait, null);
});


test("the removed paw/talon foreground assets are not required", () => {
  for (const kind of ["sheep", "doe", "lion", "eagle"]) {
    const file = path.join(process.cwd(), "public", "avatar", "scenes", "v2", `${kind}-front.webp`);
    assert.equal(fs.existsSync(file), false, `${kind} should not include a foreground feet overlay`);
  }
});

test("all 3D portraits use one safe artboard with added headroom", () => {
  const { x, y, size } = AVATAR_PORTRAIT_BOUNDS;
  assert.ok(x > 0 && y > 0 && y >= x);
  assert.ok(size < AVATAR_CANVAS_SIZE);
  assert.ok(x + size <= AVATAR_CANVAS_SIZE);
  assert.ok(y + size <= AVATAR_CANVAS_SIZE);
  const { x: tx, y: ty, width: tw, height: th } = AVATAR_COMPANION_THUMBNAIL;
  assert.ok(tx >= 0 && ty >= 0 && tx + tw <= AVATAR_CANVAS_SIZE && ty + th <= AVATAR_CANVAS_SIZE);
});

test("editor keeps only user-facing copy, text options and the live preview", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarEditor.tsx"), "utf8");
  assert.ok(!source.includes("所有選項共用同一套 3D 頭像。動物只露頭部"));
  assert.ok(!source.includes("可以不選。動物僅露頭部與上半身"));
  const sharedControls = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarControls.tsx"), "utf8");
  assert.match(sharedControls, /sticky top-0/);
  assert.match(sharedControls, /size=\{104\}/);
  assert.match(source, /AvatarLivePreview/);
  assert.doesNotMatch(source, /AvatarCompanionThumbnail|AvatarRenderer/);
});


test("display mode is enforced by the canonical scene, not by page-specific CSS", () => {
  const saved = {
    style: "feminine", glasses: true, background: "mint", pet: "eagle",
  };
  const original = getAvatarScene({ ...saved, displayMode: "custom" });
  const neutral = getAvatarScene({ ...saved, displayMode: "default" });
  const name = getAvatarScene({ ...saved, displayMode: "name" });
  assert.ok(original.portrait);
  assert.ok(original.companion);
  assert.equal(neutral.portrait, null);
  assert.equal(neutral.companion, null);
  assert.equal(name.portrait, null);
  assert.equal(name.companion, null);
  assert.equal(neutral.avatar.pet, "eagle");
  assert.equal(name.avatar.style, "feminine");
  assert.deepEqual(neutral.gradient, AVATAR_ICON_TONES.lavender.gradient);
  assert.deepEqual(name.gradient, AVATAR_BACKGROUNDS.lavender);
});


test("registration and profile share settings controls and a single live heading", () => {
  const auth = fs.readFileSync(path.join(process.cwd(), "components/auth/AuthProvider.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarSettingsCard.tsx"), "utf8");
  assert.match(auth, /<SettingsAccordionCard/);
  assert.match(settings, /<SettingsAccordionCard/);
  assert.match(auth, /title="大頭貼"/);
  assert.match(settings, /title="大頭貼"/);
  assert.match(auth, /showPreview={false}/);
  assert.match(settings, /showPreview={false}/);
  assert.match(auth, /<AvatarDisplayModeSelector/);
  assert.match(settings, /<AvatarDisplayModeSelector/);
  assert.match(auth, /registrationAvatarOpen, setRegistrationAvatarOpen\] = useState\(false\)/);
  assert.doesNotMatch(auth, /AvatarLivePreview/);
  assert.doesNotMatch(settings, /AvatarLivePreview/);
});

test("default avatar fallback has a clearly visible high-contrast silhouette", () => {
  const renderer = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarRenderer.tsx"), "utf8");
  assert.match(renderer, /aria-hidden="true" fill="#6D55A3"/);
  assert.doesNotMatch(renderer, /fill="#FFFFFF" opacity="0.72"/);
});


test("six symbol choices and six gray-based tonal palettes use one scene contract", () => {
  assert.deepEqual(AVATAR_ICON_OPTIONS.map((item) => item.label), ["十字架", "聖經", "禱告", "天使", "棕樹枝", "教會"]);
  assert.deepEqual(Object.values(AVATAR_ICON_TONES).map((tone) => tone.label), ["暖灰", "冷灰", "炭灰", "米灰", "藍灰", "薰衣草灰"]);
  for (const item of AVATAR_ICON_OPTIONS) {
    for (const iconTone of Object.keys(AVATAR_ICON_TONES) as AvatarIconTone[]) {
      const scene = getAvatarScene({ displayMode: "default", iconType: item.value, iconTone, style: "feminine", pet: "eagle" });
      assert.equal(scene.portrait, null);
      assert.equal(scene.companion, null);
      assert.deepEqual(scene.gradient, AVATAR_ICON_TONES[iconTone].gradient);
      assert.equal(scene.avatar.iconType, item.value);
      assert.equal(scene.avatar.iconTone, iconTone);
      assert.equal(scene.avatar.pet, "eagle");
      assert.equal(scene.avatar.style, "feminine");
    }
  }
});

test("church mask is an RGBA PNG created from the user-supplied Shekinah building", () => {
  const file = path.join(process.cwd(), "public", "avatar", "icons", "shekinah-silhouette-mask.png");
  assert.ok(fs.existsSync(file), "the reference building image must exist");
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(bytes.readUInt32BE(20), 512);
  assert.equal(bytes[25], 6, "church mask should preserve transparency");
  const renderer = fs.readFileSync(path.join(process.cwd(), "components/profile/SystemIconArtwork.tsx"), "utf8");
  assert.match(renderer, /shekinah-silhouette-mask.png/);
  assert.match(renderer, /maskType: "alpha"/);
});

test("registration and profile share the final short display labels and icon picker", () => {
  const controls = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarControls.tsx"), "utf8");
  const registration = fs.readFileSync(path.join(process.cwd(), "components/auth/AuthProvider.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarSettingsCard.tsx"), "utf8");
  const picker = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarIconPicker.tsx"), "utf8");
  assert.match(controls, /AvatarDisplayModeSelector/);
  assert.match(registration, /AvatarIconPicker/);
  assert.match(settings, /AvatarIconPicker/);
  assert.match(picker, /選擇圖示/);
  assert.match(picker, /色調/);
  assert.match(registration, /title="大頭貼"/);
  assert.match(registration, /summary=\{\["選填"/);
  assert.doesNotMatch(registration, /系統預設圖示|自訂3D大頭貼/);
});


test("five revised 3D icons use real transparent, aligned illustrations", () => {
  assert.deepEqual(Object.keys(AVATAR_ICON_ARTWORK).sort(), ["angel", "bible", "cross", "palm", "prayer"]);
  for (const [icon, assetPath] of Object.entries(AVATAR_ICON_ARTWORK)) {
    assert.match(assetPath, /^\/avatar\/icons\/v3\/[a-z]+\.webp$/);
    const file = path.join(process.cwd(), "public", assetPath.replace(/^\//, ""));
    assert.ok(fs.existsSync(file), `${icon} artwork missing`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", `${icon} must be WebP`);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `${icon} must be WebP`);
    assert.equal(bytes.toString("ascii", 12, 16), "VP8X", `${icon} must be extended WebP`);
    assert.ok((bytes[20] & 0x10) !== 0, `${icon} must preserve alpha`);
    assert.equal(bytes.readUIntLE(24, 3) + 1, 512, `${icon} width`);
    assert.equal(bytes.readUIntLE(27, 3) + 1, 512, `${icon} height`);
    assert.ok(bytes.length < 180 * 1024, `${icon} should remain mobile-friendly`);
  }
  const source = fs.readFileSync(path.join(process.cwd(), "components/profile/SystemIconArtwork.tsx"), "utf8");
  assert.match(source, /AVATAR_ICON_ARTWORK\[icon\]/);
  assert.match(source, /feColorMatrix/);
  assert.match(source, /shekinah-silhouette-mask.png/);
  assert.doesNotMatch(source, /icon === "cross" &&/);
  assert.doesNotMatch(source, /icon === "prayer" &&/);
});


test("profile icon and tone selection updates a local draft without a network request per tap", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarSettingsCard.tsx"), "utf8");
  const modeHandler = source.match(/const changeDisplayMode = \(mode: AvatarDisplayMode\) => \{([\s\S]*?)\n  \};/);
  const iconHandler = source.match(/const changeSystemIcon = \(next: AvatarConfig\) => \{([\s\S]*?)\n  \};/);
  assert.ok(modeHandler, "display-mode handler is defined");
  assert.ok(iconHandler, "icon and color handler is defined");
  assert.match(modeHandler[1], /setAvatar/);
  assert.match(iconHandler[1], /setAvatar\(next\)/);
  assert.doesNotMatch(modeHandler[1], /save\(|fetch\(/);
  assert.doesNotMatch(iconHandler[1], /save\(|fetch\(/);
  assert.doesNotMatch(source, /pendingAvatar|setPendingAvatar/);
  assert.match(source, /visibleAvatar = avatar/);
  assert.match(source, /displayDirty/);
  assert.match(source, /儲存顯示設定/);
  assert.match(source, /取消變更/);
  assert.match(source, /onClick=\{\(\) => void save\(avatar\)\}/);
});


test("avatar creation leads directly to manual male/female choice", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarSettingsCard.tsx"), "utf8");
  assert.doesNotMatch(source, /選擇建立方式|使用照片建立|setView\("choose"\)|view === "choose"/);
  assert.doesNotMatch(source, /view === "photo"|handlePhoto|photoPreview|photoName/);
  assert.match(source, /setView\(personalized \? "manual-edit" : "manual-base"\)/);
  assert.match(source, /setView\("manual-base"\)/);
  assert.match(source, /onClick=\{\(\) => setView\("summary"\)\}/);
  assert.match(source, /iconType: current.iconType/);
  assert.match(source, /iconTone: current.iconTone/);
});

test("profile live heading stays sticky in the page scroll viewport without a second preview", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
  const card = fs.readFileSync(path.join(process.cwd(), "components/profile/AvatarSettingsCard.tsx"), "utf8");
  const shared = fs.readFileSync(path.join(process.cwd(), "components/profile/SettingsAccordionCard.tsx"), "utf8");
  // Sticky remains constrained to the actual settings scroll region and expanded card.
  assert.match(page, /activeTab === "settings" \? "h-dvh" : "min-h-screen"/);
  assert.match(page, /className="min-h-0 flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-\[#FFF9F3\]"/);
  assert.match(card, /stickyHeader/);
  assert.match(card, /headingAvatar/);
  assert.match(card, /size=\{expanded \? 80 : 52\}/);
  assert.match(shared, /sticky top-0 z-30/);
  assert.doesNotMatch(card, /createPortal\(|previewHost|AvatarLivePreview/);
  assert.doesNotMatch(page, /setAvatarPreviewHost|avatarPreviewHost/);
});
