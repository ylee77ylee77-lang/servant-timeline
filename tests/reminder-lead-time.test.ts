import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_REMINDER_LEAD_MINUTES,
  DEFAULT_REMINDER_LEAD_SECONDS,
  MAX_REMINDER_LEAD_MINUTES,
  REMINDER_SECOND_OPTIONS,
  normalizeReminderLeadTime,
  stepReminderLeadTime,
  getReminderLeadSeconds,
  formatReminderLeadLabel,
  formatReminderLeadSpeech,
  isReminderDue,
} from "../lib/voice/reminder-timing.ts";

const read = (path: string) => fs.readFileSync(path, "utf8");
const time = (hour: number, minute: number, second: number) =>
  new Date(2026, 10, 21, hour, minute, second);

test("existing local settings retain the five-minute default", () => {
  assert.equal(DEFAULT_REMINDER_LEAD_MINUTES, 5);
  assert.equal(DEFAULT_REMINDER_LEAD_SECONDS, 0);
  assert.deepEqual(normalizeReminderLeadTime(undefined, undefined), { minutes: 5, seconds: 0 });
  assert.deepEqual(normalizeReminderLeadTime("8", "30"), { minutes: 5, seconds: 0 });
  assert.equal(getReminderLeadSeconds(undefined, undefined), 300);
  assert.equal(read("app/page.tsx").includes('shekinah_personal_reminder_settings_v1'), true);
});

test("minute increments are 1, seconds advance in 15-second steps and support zero", () => {
  assert.equal(MAX_REMINDER_LEAD_MINUTES, 60);
  assert.deepEqual(REMINDER_SECOND_OPTIONS, [0, 15, 30, 45]);
  assert.deepEqual(normalizeReminderLeadTime(0, 0), { minutes: 0, seconds: 0 });
  assert.deepEqual(normalizeReminderLeadTime(0, 15), { minutes: 0, seconds: 15 });
  assert.deepEqual(normalizeReminderLeadTime(1, 30), { minutes: 1, seconds: 30 });
  assert.deepEqual(normalizeReminderLeadTime(60, 45), { minutes: 60, seconds: 45 });
  assert.deepEqual(normalizeReminderLeadTime(61, 45), { minutes: 5, seconds: 45 });
  assert.deepEqual(normalizeReminderLeadTime(1, 14), { minutes: 1, seconds: 0 });
  assert.equal(getReminderLeadSeconds(1, 30), 90);
  assert.equal(formatReminderLeadLabel(1, 30), "1 分鐘 30 秒");
  assert.equal(formatReminderLeadLabel(0, 15), "15 秒");
  assert.equal(formatReminderLeadSpeech(5, 0), "五分鐘");
  assert.equal(formatReminderLeadSpeech(1, 15), "一分鐘十五秒");
  assert.equal(formatReminderLeadSpeech(0, 45), "四十五秒");
});

test("seconds cycle independently at 00/15/30/45 without carrying into minutes", () => {
  assert.deepEqual(stepReminderLeadTime(5, 0, "seconds", 1), { minutes: 5, seconds: 15 });
  assert.deepEqual(stepReminderLeadTime(5, 15, "seconds", 1), { minutes: 5, seconds: 30 });
  assert.deepEqual(stepReminderLeadTime(5, 30, "seconds", 1), { minutes: 5, seconds: 45 });
  assert.deepEqual(stepReminderLeadTime(5, 45, "seconds", 1), { minutes: 5, seconds: 0 });
  assert.deepEqual(stepReminderLeadTime(5, 0, "seconds", -1), { minutes: 5, seconds: 45 });
  assert.deepEqual(stepReminderLeadTime(5, 15, "seconds", -1), { minutes: 5, seconds: 0 });
  assert.deepEqual(stepReminderLeadTime(0, 45, "seconds", 1), { minutes: 0, seconds: 0 });
  assert.deepEqual(stepReminderLeadTime(60, 0, "seconds", -1), { minutes: 60, seconds: 45 });
  assert.deepEqual(stepReminderLeadTime(5, 45, "minutes", 1), { minutes: 6, seconds: 45 });
  assert.deepEqual(stepReminderLeadTime(5, 45, "minutes", -1), { minutes: 4, seconds: 45 });
  assert.deepEqual(stepReminderLeadTime(0, 45, "minutes", -1), { minutes: 0, seconds: 45 });
  assert.deepEqual(stepReminderLeadTime(60, 45, "minutes", 1), { minutes: 60, seconds: 45 });
  assert.equal(getReminderLeadSeconds(0, 0), 0);
  assert.equal(formatReminderLeadLabel(0, 0), "0 秒");
});

test("live second-level reminder fires near the expected time but not early", () => {
  assert.equal(isReminderDue(time(12, 4, 44), "12:05", 15), false);
  assert.equal(isReminderDue(time(12, 4, 45), "12:05", 15), true);
  assert.equal(isReminderDue(time(12, 4, 59), "12:05", 15), true);
  assert.equal(isReminderDue(time(12, 5, 0), "12:05", 15), false);
  assert.equal(isReminderDue(time(12, 5, 0), "12:05", 0), true);
  assert.equal(isReminderDue(time(12, 5, 14), "12:05", 0), true);
  assert.equal(isReminderDue(time(12, 5, 15), "12:05", 0), false);
  assert.equal(isReminderDue(time(12, 4, 45), "12:05", 90), false);
  assert.equal(isReminderDue(time(12, 3, 30), "12:05", 90), true);
});

test("advanced cues wrap midnight without changing on-time alerts", () => {
  assert.equal(isReminderDue(time(23, 59, 44), "00:00", 15), false);
  assert.equal(isReminderDue(time(23, 59, 45), "00:00", 15), true);
  assert.equal(isReminderDue(time(0, 0, 0), "00:00", 0), true);
  assert.equal(isReminderDue(time(23, 59, 45), "00:00", 0), false);
  assert.equal(isReminderDue(time(22, 59, 0), "00:00", 60 * 60 + 60), true);
  assert.equal(isReminderDue(time(12, 0, 30), "12:01:00", 30), true);
  assert.equal(isReminderDue(time(12, 0, 30), "xx:00", 30), false);
  assert.equal(isReminderDue(time(12, 0, 30), "25:00", 30), false);
  assert.equal(isReminderDue(time(12, 0, 30), "12:01", -1), false);
});

test("profile controls, saved preferences, speech, and upcoming cue share the same lead time", () => {
  const ui = read("components/profile/PersonalPreferencesCards.tsx");
  const page = read("app/page.tsx");
  assert.match(ui, /data-reminder-lead-stepper/);
  assert.match(ui, /settings\.reminderPre5Enabled && \(/);
  assert.match(ui, /aria-label="增加提前提醒分鐘"/);
  assert.match(ui, /aria-label="減少提前提醒分鐘"/);
  assert.match(ui, /aria-label="增加提前提醒秒數"/);
  assert.match(ui, /aria-label="減少提前提醒秒數"/);
  assert.match(ui, /stepReminderLeadTime\(lead\.minutes, lead\.seconds, unit, direction\)/);
  assert.match(ui, /padStart\(2, "0"\)/);
  assert.match(ui, /<h3 className="mb-3 text-xs font-black tracking-widest text-\[#7B7B74\]">提醒<\/h3>/);
  assert.match(ui, /label: "準點提醒"/);
  assert.match(ui, /description: "任務開始前先提醒一次。"/);
  assert.doesNotMatch(ui, /<select|每次 1 分鐘|每次 15 秒|提醒開關|可設 0–60 分鐘/);
  assert.match(ui, /reminderLeadMinutes: number;/);
  assert.match(ui, /reminderLeadSeconds: number;/);
  assert.match(page, /reminderLeadMinutes: DEFAULT_REMINDER_LEAD_MINUTES/);
  assert.match(page, /reminderLeadSeconds: DEFAULT_REMINDER_LEAD_SECONDS/);
  assert.match(page, /normalizeReminderLeadTime\(parsed\.reminderLeadMinutes, parsed\.reminderLeadSeconds\)/);
  assert.match(page, /getReminderLeadSeconds\(personalSettings\.reminderLeadMinutes, personalSettings\.reminderLeadSeconds\)/);
  assert.match(page, /isReminderDue\(currentDate, node\.time, leadSeconds\)/);
  assert.match(page, /isReminderDue\(currentDate, node\.time, 0\)/);
  assert.match(page, /leadSeconds > 0 \|\| !personalSettings\.reminderNowEnabled/);
  assert.match(page, /currentDate,\s*isVoiceEnabled/);
  assert.match(page, /lastReminderDayRef\.current !== dayKey/);
  assert.doesNotMatch(page, /minutesBeforeTask === 5|nodeMinutes - 5/);
  assert.match(page, /formatReminderLeadSpeech\(personalSettings\.reminderLeadMinutes, personalSettings\.reminderLeadSeconds\)/);
  assert.match(page, /提前 \{formatReminderLeadLabel\(personalSettings\.reminderLeadMinutes, personalSettings\.reminderLeadSeconds\)\}/);
});
