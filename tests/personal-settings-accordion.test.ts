import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("all three personal-setting sections use the same accessible accordion component", () => {
  const card = read("components/profile/SettingsAccordionCard.tsx");
  const avatar = read("components/profile/AvatarSettingsCard.tsx");
  const preferences = read("components/profile/PersonalPreferencesCards.tsx");

  assert.match(card, /aria-expanded=\{expanded\}/);
  assert.match(card, /aria-controls=\{panelId\}/);
  assert.match(card, /hidden=\{!expanded\}/);
  assert.match(card, /\{expanded \? children : null\}/);
  assert.match(card, /focus-visible:ring-2/);
  assert.match(avatar, /<SettingsAccordionCard/);
  assert.match(avatar, /panelId="avatar-settings-panel"/);
  assert.match(preferences, /panelId="personal-voice-settings-panel"/);
  assert.match(preferences, /panelId="personal-reminder-settings-panel"/);
});

test("voice and reminder cards can expand independently and start collapsed", () => {
  const source = read("components/profile/PersonalPreferencesCards.tsx");
  assert.match(source, /const \[voiceExpanded, setVoiceExpanded\] = useState\(false\)/);
  assert.match(source, /const \[reminderExpanded, setReminderExpanded\] = useState\(false\)/);
  assert.match(source, /expanded=\{voiceExpanded\}/);
  assert.match(source, /expanded=\{reminderExpanded\}/);
  assert.match(source, /setVoiceExpanded\(\(previous\) => !previous\)/);
  assert.match(source, /setReminderExpanded\(\(previous\) => !previous\)/);
  for (const key of [
    "voiceProfile", "voiceReminderEnabled", "vibrationReminderEnabled",
    "reminderPre5Enabled", "reminderNowEnabled", "voiceDetailLevel",
  ]) assert.match(source, new RegExp(key));
  assert.doesNotMatch(source, /fetch\(|localStorage|\bsetInterval\(/);
});

test("personal preferences hydrate before persisting, using the existing local storage key", () => {
  const page = read("app/page.tsx");
  assert.match(page, /const PERSONAL_REMINDER_STORAGE_KEY = "shekinah_personal_reminder_settings_v1"/);
  assert.match(page, /window\.localStorage\.getItem\(PERSONAL_REMINDER_STORAGE_KEY\)/);
  assert.match(page, /if \(!personalSettingsLoaded \|\| typeof window === "undefined"\) return;/);
  assert.match(page, /window\.localStorage\.setItem\(PERSONAL_REMINDER_STORAGE_KEY, JSON\.stringify\(personalSettings\)\)/);
  assert.match(page, /<PersonalPreferencesCards/);
  assert.match(page, /onChange=\{updatePersonalSettings\}/);
});

test("avatar keeps the existing persistent editor and scroll-level live preview", () => {
  const avatar = read("components/profile/AvatarSettingsCard.tsx");
  const page = read("app/page.tsx");
  assert.match(avatar, /expanded && previewHost && createPortal/);
  assert.match(avatar, /displayDirty/);
  assert.match(avatar, /onClick=\{\(\) => void save\(avatar\)\}/);
  assert.match(avatar, /<AvatarEditor/);
  assert.match(page, /ref=\{setAvatarPreviewHost\}/);
  assert.match(page, /previewHost=\{avatarPreviewHost\}/);
});
