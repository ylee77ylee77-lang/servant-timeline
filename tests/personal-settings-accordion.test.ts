import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("all three personal-setting sections reuse one accessible card", () => {
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

test("profile settings have a single expanded card rather than independent states", () => {
  const page = read("app/page.tsx");
  const preferences = read("components/profile/PersonalPreferencesCards.tsx");
  assert.match(page, /useState<SettingsPanel \| null>\(null\)/);
  assert.match(page, /setExpandedSettingsPanel\(\(current\) => current === panel \? null : panel\)/);
  assert.match(page, /expanded=\{expandedSettingsPanel === "avatar"\}/);
  assert.match(page, /onToggle=\{\(\) => toggleSettingsPanel\("avatar"\)\}/);
  assert.match(page, /expandedPanel=\{expandedSettingsPanel\}/);
  assert.match(page, /onToggle=\{toggleSettingsPanel\}/);
  assert.match(preferences, /expanded=\{expandedPanel === "voice"\}/);
  assert.match(preferences, /expanded=\{expandedPanel === "reminder"\}/);
  assert.match(preferences, /onToggle=\{\(\) => onToggle\("voice"\)\}/);
  assert.match(preferences, /onToggle=\{\(\) => onToggle\("reminder"\)\}/);
  // Top-level cards share one accordion, while voice/advance options follow their switches.
  assert.doesNotMatch(preferences, /voiceExpanded|reminderExpanded|leadTimeExpanded|openReminderSection/);
  assert.match(preferences, /const \[contentExpanded, setContentExpanded\] = useState\(false\)/);
  for (const key of [
    "voiceProfile", "voiceReminderEnabled", "vibrationReminderEnabled",
    "reminderPre5Enabled", "reminderNowEnabled", "voiceDetailLevel",
  ]) assert.match(preferences, new RegExp(key));
  assert.doesNotMatch(preferences, /fetch\(|localStorage|\bsetInterval\(/);
});

test("registration and profile share the same titled sticky live avatar header", () => {
  const registration = read("components/auth/AuthProvider.tsx");
  const settings = read("components/profile/AvatarSettingsCard.tsx");
  const shared = read("components/profile/SettingsAccordionCard.tsx");

  assert.match(registration, /title="大頭貼"/);
  assert.match(settings, /title="大頭貼"/);
  assert.match(registration, /summary=\{\["選填"/);
  assert.match(registration, /icon=\{<SystemAvatar config=\{registrationAvatar\}/);
  assert.match(settings, /icon=\{<SystemAvatar config=\{headingAvatar\}/);
  assert.match(registration, /size=\{registrationAvatarOpen \? 80 : 52\}/);
  assert.match(settings, /size=\{expanded \? 80 : 52\}/);
  assert.match(registration, /stickyHeader/);
  assert.match(settings, /stickyHeader/);
  assert.match(shared, /stickyHeader && expanded/);
  assert.match(shared, /sticky top-0 z-30/);
  assert.doesNotMatch(registration, /AvatarLivePreview/);
  assert.doesNotMatch(settings, /AvatarLivePreview|createPortal|previewHost/);
  assert.doesNotMatch(read("app/page.tsx"), /setAvatarPreviewHost|avatarPreviewHost/);
});

test("personal settings retain local persistence and the avatar save API", () => {
  const page = read("app/page.tsx");
  const avatar = read("components/profile/AvatarSettingsCard.tsx");
  assert.match(page, /const PERSONAL_REMINDER_STORAGE_KEY = "shekinah_personal_reminder_settings_v1"/);
  assert.match(page, /window\.localStorage\.getItem\(PERSONAL_REMINDER_STORAGE_KEY\)/);
  assert.match(page, /if \(!personalSettingsLoaded \|\| typeof window === "undefined"\) return;/);
  assert.match(page, /window\.localStorage\.setItem\(PERSONAL_REMINDER_STORAGE_KEY, JSON\.stringify\(personalSettings\)\)/);
  assert.match(page, /onChange=\{updatePersonalSettings\}/);
  assert.match(avatar, /displayDirty/);
  assert.match(avatar, /onClick=\{\(\) => void save\(avatar\)\}/);
  assert.match(avatar, /<AvatarEditor/);
  assert.match(avatar, /fetch\("\/api\/profile\/avatar"/);
});


test("vibration preference offers a direct native iOS switch tap without simulated clicks", () => {
  const ui = read("components/profile/PersonalPreferencesCards.tsx");
  const page = read("app/page.tsx");

  assert.match(ui, /nativeHaptics\?: boolean/);
  assert.match(ui, /<input\s+type="checkbox"\s+\{\.\.\.\{ switch: "" \}\}/);
  assert.match(ui, /onChange=\{\(event\) => \{/);
  assert.match(ui, /event\.currentTarget\.checked/);
  assert.match(ui, /navigator\.vibrate\(150\)/);
  assert.match(ui, /label="震動提醒"\s+nativeHaptics\s+checked=\{settings\.vibrationReminderEnabled\}/);
  assert.match(ui, /onToggle=\{\(\) => onChange\(\{ vibrationReminderEnabled: !settings\.vibrationReminderEnabled \}\)\}/);
  assert.match(ui, /checked=\{checked\}/);
  assert.doesNotMatch(ui, /document\.createElement|\.click\(\)|dispatchEvent\(/);

  // The original actual task-block vibration and the saved settings remain unchanged.
  assert.match(page, /if \(!personalSettings\.vibrationReminderEnabled\) return;/);
  assert.match(page, /triggerVibration\(getTaskBlockVibrationPattern\(currentNode\)\)/);
  assert.match(page, /window\.localStorage\.setItem\(PERSONAL_REMINDER_STORAGE_KEY, JSON\.stringify\(personalSettings\)\)/);
});

test("iOS switch feedback is not represented as background task vibration", () => {
  const ui = read("components/profile/PersonalPreferencesCards.tsx");
  assert.match(ui, /vibrationCapability === "ios-switch"/);
  assert.match(ui, /任務到點自動震動需使用系統通知或原生 App/);
  assert.match(ui, /此瀏覽器不支援任務到點的網頁震動/);
  assert.match(ui, /typeof navigator\.vibrate === "function"/);
  assert.doesNotMatch(ui, /setInterval\(|setTimeout\(/);
});
